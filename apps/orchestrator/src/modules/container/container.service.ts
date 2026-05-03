import * as crypto from 'crypto';

import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';

import type { CreateContainerDto } from './dto/create-container.dto';

interface PackageDockerConfig {
  memory: number;
  nanoCpus: number;
  cpuShares: number;
}

// Tuned for 4 vCPU / 16 GB host — supports up to 5 SFAST or 3 MFAST concurrently.
// cpuShares 512 (< system default 1024) keeps emulators lower-priority than host services.
const PACKAGE_DOCKER_CONFIG: Record<string, PackageDockerConfig> = {
  SFAST: { memory: 2.5 * 1024 * 1024 * 1024, nanoCpus: 1e9, cpuShares: 512 },
  MFAST: { memory: 3.0 * 1024 * 1024 * 1024, nanoCpus: 1.5e9, cpuShares: 512 },
};

const REDROID_IMAGE_ANDROID_10 = 'redroid/redroid:10.0.0-latest';
const REDROID_IMAGE_ANDROID_12 = 'redroid/redroid:12.0.0-latest';

export interface CreateContainerResult {
  containerId: string;
  containerName: string;
  adbPort: number;
  adbSerial: string;
  websocketPath: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  state: string;
  image: string;
  created: number;
}

@Injectable()
export class ContainerService implements OnModuleInit {
  private readonly logger = new Logger(ContainerService.name);
  private docker!: Dockerode;
  private portMin!: number;
  private portMax!: number;

  constructor(private readonly config: ConfigService) {}

  private resolveDockerOptions(): Dockerode.DockerOptions {
    const host = process.env['DOCKER_HOST'];
    if (host?.startsWith('unix://')) return { socketPath: host.replace('unix://', '') };
    if (host?.startsWith('npipe://')) return { socketPath: host.replace('npipe://', '') };
    // auto-detect: Windows Docker Desktop uses named pipe, Linux uses unix socket
    return process.platform === 'win32'
      ? { socketPath: '//./pipe/docker_engine' }
      : { socketPath: '/var/run/docker.sock' };
  }

  onModuleInit(): void {
    const opts = this.resolveDockerOptions();
    this.docker = new Dockerode(opts);
    this.logger.log(`Docker connected via ${'socketPath' in opts ? opts.socketPath : 'tcp'}`);

    const portRange = this.config.get<string>('ADB_PORT_RANGE') ?? '5555-5655';
    const [minStr, maxStr] = portRange.split('-');
    this.portMin = parseInt(minStr ?? '5555', 10);
    this.portMax = parseInt(maxStr ?? '5655', 10);
  }

  private async allocatePort(): Promise<number> {
    let usedPorts: number[] = [];
    try {
      const containers = await this.docker.listContainers({
        all: false,
        filters: JSON.stringify({ name: ['emulfast-emu-'] }),
      });
      usedPorts = containers.flatMap((c) =>
        (c.Ports ?? [])
          .filter((p) => p.PublicPort !== undefined)
          .map((p) => p.PublicPort as number),
      );
    } catch (err) {
      this.logger.warn(`Failed to list containers for port allocation: ${String(err)}`);
    }

    for (let port = this.portMin; port <= this.portMax; port++) {
      if (!usedPorts.includes(port)) {
        return port;
      }
    }

    throw new HttpException(
      'No available ADB ports in range',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private async getContainerIpOnNetwork(containerId: string, networkName: string): Promise<string | null> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();
      return info.NetworkSettings.Networks[networkName]?.IPAddress ?? null;
    } catch {
      return null;
    }
  }

  private async execInWsScrcpy(wsContainer: string, cmd: string[]): Promise<void> {
    const exec = await this.docker.getContainer(wsContainer).exec({
      Cmd: cmd,
      AttachStdout: false,
      AttachStderr: false,
    });
    await exec.start({ Detach: true });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      this.logger.log(`Pulling image ${image}...`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) { reject(err); return; }
          this.docker.modem.followProgress(stream, (pullErr: Error | null) => {
            if (pullErr) reject(pullErr);
            else { this.logger.log(`Image pulled: ${image}`); resolve(); }
          });
        });
      });
    }
  }

  private scheduleAdbConnect(adbSerial: string): void {
    const wsContainer = this.config.get<string>('WS_SCRCPY_CONTAINER') ?? 'emulfast-ws-scrcpy';
    // Android needs ~30s to fully boot (zygote64 + system_server + launcher3)
    setTimeout(() => {
      void (async () => {
        try {
          // Step 1: initial connect so we can reach adb shell
          await this.execInWsScrcpy(wsContainer, ['adb', 'connect', adbSerial]);
          await this.sleep(3_000);

          // Step 2: kill zombie app_process left from prior scrcpy attempts (best-effort)
          await this.execInWsScrcpy(wsContainer, [
            'adb', '-s', adbSerial, 'shell',
            "for p in $(ps | grep app_proc | grep shell | awk '{print $2}'); do kill -9 $p 2>/dev/null; done",
          ]).catch(() => { /* best-effort */ });
          await this.sleep(1_000);

          // Step 3: disconnect then reconnect — triggers ws-scrcpy device-add event on a clean slate
          await this.execInWsScrcpy(wsContainer, ['adb', 'disconnect', adbSerial]);
          await this.sleep(1_000);
          await this.execInWsScrcpy(wsContainer, ['adb', 'connect', adbSerial]);

          this.logger.log(`ADB connected: ${adbSerial}`);
        } catch (err) {
          this.logger.warn(`scheduleAdbConnect(${adbSerial}) failed: ${String(err)}`);
        }
      })();
    }, 30_000);
  }

  private async adbDisconnect(adbSerial: string): Promise<void> {
    const wsContainer = this.config.get<string>('WS_SCRCPY_CONTAINER') ?? 'emulfast-ws-scrcpy';
    try {
      const exec = await this.docker.getContainer(wsContainer).exec({
        Cmd: ['adb', 'disconnect', adbSerial],
        AttachStdout: false,
        AttachStderr: false,
      });
      await exec.start({ Detach: true });
      this.logger.log(`ADB disconnected: ${adbSerial}`);
    } catch (err) {
      this.logger.warn(`adbDisconnect(${adbSerial}) failed: ${String(err)}`);
    }
  }

  async createContainer(dto: CreateContainerDto): Promise<CreateContainerResult> {
    const config = PACKAGE_DOCKER_CONFIG[dto.packageCode];
    if (!config) {
      throw new HttpException(
        `Unknown packageCode: ${dto.packageCode}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // DEV_MOCK=true → ข้ามการสร้าง container จริง (Windows / CI env ที่ไม่มี /dev/binder)
    if (this.config.get<string>('DEV_MOCK') === 'true') {
      const suffix = crypto.randomBytes(3).toString('hex');
      const fakeId = `mock${suffix}${'0'.repeat(52)}`.slice(0, 64);
      const containerName = `emulfast-emu-mock-${suffix}`;
      this.logger.warn(`DEV_MOCK: skipping real container — returning mock ${containerName}`);
      return {
        containerId: fakeId,
        containerName,
        adbPort: this.portMin,
        adbSerial: `127.0.0.1:${this.portMin}`,
        websocketPath: `/?action=stream&udid=${encodeURIComponent(`127.0.0.1:${this.portMin}`)}`,
      };
    }

    const adbPort = await this.allocatePort();
    const suffix = crypto.randomBytes(3).toString('hex');
    const containerName = `emulfast-emu-${dto.userId.slice(-6)}-${suffix}`;
    const redroidNetwork = this.config.get<string>('REDROID_NETWORK') ?? 'emulfast-redroid';
    const image = dto.androidVersion === '12' ? REDROID_IMAGE_ANDROID_12 : REDROID_IMAGE_ANDROID_10;

    // Pull image if not present locally
    await this.ensureImage(image);

    try {
      const container = await this.docker.createContainer({
        Image: image,
        name: containerName,
        Env: [
          'ro.product.cpu.abilist=x86_64',
          'androidboot.hardware=redroid',
          'ro.hardware.egl=mesa',
          'androidboot.use_memfd=1',
        ],
        HostConfig: {
          Memory: config.memory,
          MemorySwap: config.memory,
          NanoCpus: config.nanoCpus,
          CpuShares: config.cpuShares,
          Privileged: true,
          Devices: [
            {
              PathOnHost: '/dev/kvm',
              PathInContainer: '/dev/kvm',
              CgroupPermissions: 'rwm',
            },
            {
              PathOnHost: '/dev/binder',
              PathInContainer: '/dev/binder',
              CgroupPermissions: 'rwm',
            },
          ],
          NetworkMode: redroidNetwork,
          PortBindings: {
            '5555/tcp': [{ HostPort: String(adbPort) }],
          },
          Binds: [`${containerName}-data:/data`],
        },
      });

      await container.start();

      const shortId = container.id.slice(0, 12);
      this.logger.log(`Created container ${containerName} (${shortId}) on port ${adbPort}`);

      const containerIp = await this.getContainerIpOnNetwork(container.id, redroidNetwork);
      const adbSerial = containerIp ? `${containerIp}:5555` : `127.0.0.1:${adbPort}`;
      if (containerIp) {
        this.scheduleAdbConnect(adbSerial);
      }

      return {
        containerId: container.id,
        containerName,
        adbPort,
        adbSerial,
        websocketPath: `/?action=stream&udid=${encodeURIComponent(adbSerial)}`,
      };
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`createContainer failed: ${message}`);
      throw new HttpException(
        `Failed to create container: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getContainer(id: string): Promise<ContainerInfo> {
    if (id.startsWith('mock')) {
      return { id, name: `emulfast-emu-mock-${id.slice(4, 10)}`, status: 'running', state: 'running', image: 'mock', created: Date.now() };
    }
    try {
      const container = this.docker.getContainer(id);
      const info = await container.inspect();
      return {
        id: info.Id,
        name: info.Name.replace(/^\//, ''),
        status: info.State.Status,
        state: info.State.Running ? 'running' : 'stopped',
        image: info.Config.Image,
        created: new Date(info.Created).getTime(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // dockerode throws statusCode 404 for not found
      const statusCode =
        typeof err === 'object' && err !== null && 'statusCode' in err
          ? (err as { statusCode: number }).statusCode
          : 500;
      if (statusCode === 404) {
        throw new HttpException('Container not found', HttpStatus.NOT_FOUND);
      }
      this.logger.error(`getContainer(${id}) failed: ${message}`);
      throw new HttpException(
        `Failed to inspect container: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async killScrcpy(containerId: string): Promise<void> {
    const wsContainer = this.config.get<string>('WS_SCRCPY_CONTAINER') ?? 'emulfast-ws-scrcpy';

    // Find the container's IP on the redroid network
    const redroidNetwork = process.env['REDROID_NETWORK'] ?? 'emulfast-redroid';
    const ip = await this.getContainerIpOnNetwork(containerId, redroidNetwork);
    if (!ip) {
      throw new HttpException('Container IP not found', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const adbSerial = `${ip}:5555`;
    // Kill scrcpy-server process on the Android device (best-effort)
    await this.execInWsScrcpy(wsContainer, [
      'adb', '-s', adbSerial, 'shell',
      "ps -A | grep scrcpy | awk '{print $2}' | xargs kill -9 2>/dev/null || true",
    ]).catch(() => { /* best-effort */ });

    this.logger.log(`killScrcpy: adbSerial=${adbSerial}`);
  }

  async deleteContainer(id: string): Promise<void> {
    try {
      const container = this.docker.getContainer(id);

      // Disconnect ADB from ws-scrcpy before removing (best-effort)
      let info: Awaited<ReturnType<typeof container.inspect>> | null = null;
      try {
        info = await container.inspect();
      } catch {
        // container may not be inspectable — skip ADB disconnect
      }
      if (info) {
        const networkName = Object.keys(info.NetworkSettings.Networks)[0];
        const ip = networkName ? (info.NetworkSettings.Networks[networkName]?.IPAddress ?? null) : null;
        if (ip) {
          await this.adbDisconnect(`${ip}:5555`);
        }
      }

      try {
        await container.stop({ t: 5 });
      } catch (stopErr: unknown) {
        const statusCode =
          typeof stopErr === 'object' && stopErr !== null && 'statusCode' in stopErr
            ? (stopErr as { statusCode: number }).statusCode
            : 0;
        // 304 = already stopped, 404 = not found — both are acceptable
        if (statusCode !== 304 && statusCode !== 404) {
          throw stopErr;
        }
      }
      await container.remove({ v: true, force: true });
      this.logger.log(`Deleted container ${id}`);
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      const statusCode =
        typeof err === 'object' && err !== null && 'statusCode' in err
          ? (err as { statusCode: number }).statusCode
          : 500;
      if (statusCode === 404) {
        // container already gone — treat as success
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`deleteContainer(${id}) failed: ${message}`);
      throw new HttpException(
        `Failed to delete container: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
