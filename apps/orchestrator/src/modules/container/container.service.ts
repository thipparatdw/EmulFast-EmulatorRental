import * as crypto from 'crypto';

import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Dockerode from 'dockerode';

import type { CreateContainerDto } from './dto/create-container.dto';

interface PackageDockerConfig {
  memory: number;
  nanoCpus: number;
}

const PACKAGE_DOCKER_CONFIG: Record<string, PackageDockerConfig> = {
  SFAST: { memory: 3 * 1024 * 1024 * 1024, nanoCpus: 3e9 },
  MFAST: { memory: 4 * 1024 * 1024 * 1024, nanoCpus: 3e9 },
};

const REDROID_IMAGE = 'redroid/redroid:10.0.0_latest';

export interface CreateContainerResult {
  containerId: string;
  containerName: string;
  adbPort: number;
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

  onModuleInit(): void {
    this.docker = new Dockerode({
      socketPath: process.env['DOCKER_HOST']?.startsWith('unix://')
        ? process.env['DOCKER_HOST'].replace('unix://', '')
        : '/var/run/docker.sock',
    });

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

  async createContainer(dto: CreateContainerDto): Promise<CreateContainerResult> {
    const config = PACKAGE_DOCKER_CONFIG[dto.packageCode];
    if (!config) {
      throw new HttpException(
        `Unknown packageCode: ${dto.packageCode}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const adbPort = await this.allocatePort();
    const suffix = crypto.randomBytes(3).toString('hex');
    const containerName = `emulfast-emu-${dto.userId.slice(-6)}-${suffix}`;
    const redroidNetwork = process.env['REDROID_NETWORK'] ?? 'emulfast-redroid';

    try {
      const container = await this.docker.createContainer({
        Image: REDROID_IMAGE,
        name: containerName,
        Env: [
          'ro.product.cpu.abilist=x86_64',
          'androidboot.hardware=redroid',
          'ro.hardware.egl=mesa',
          'androidboot.use_memfd=1',
        ],
        HostConfig: {
          Memory: config.memory,
          NanoCpus: config.nanoCpus,
          Privileged: true,
          Devices: [
            {
              PathOnHost: '/dev/kvm',
              PathInContainer: '/dev/kvm',
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

      return {
        containerId: container.id,
        containerName,
        adbPort,
        websocketPath: `/ws/scrcpy/${shortId}`,
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

  async deleteContainer(id: string): Promise<void> {
    try {
      const container = this.docker.getContainer(id);
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
