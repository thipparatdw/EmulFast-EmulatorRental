import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { JwtPayload } from "../auth/decorators/current-user.decorator.js";

@Injectable()
@WebSocketGateway({ namespace: "/ws/emulator", cors: { origin: "*" } })
export class EmulatorGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EmulatorGateway.name);

  @WebSocketServer()
  server!: Server;

  // viewer tracking: emulatorId → Set of socketIds actively watching
  private readonly viewersByEmulator = new Map<string, Set<string>>();
  // reverse map: socketId → emulatorId
  private readonly socketToEmulator = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get orchestratorUrl(): string {
    return this.configService.get<string>("ORCHESTRATOR_URL") ?? "http://localhost:5000";
  }

  private get orchestratorToken(): string {
    return this.configService.get<string>("ORCHESTRATOR_TOKEN") ?? "";
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth as Record<string, string>)["token"] ??
        (client.handshake.headers["authorization"] ?? "").replace("Bearer ", "");

      if (!token) {
        this.logger.warn(`WS connection rejected — no token (socket: ${client.id})`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      await client.join(payload.sub);
      this.logger.log(`WS connected: userId=${payload.sub} socket=${client.id}`);
    } catch {
      this.logger.warn(`WS connection rejected — invalid token (socket: ${client.id})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`WS disconnected: socket=${client.id}`);
    this.removeViewer(client.id);
  }

  // ─── Viewer tracking ───────────────────────────────────────────────────────

  private addViewer(socketId: string, emulatorId: string): void {
    if (!this.viewersByEmulator.has(emulatorId)) {
      this.viewersByEmulator.set(emulatorId, new Set());
    }
    this.viewersByEmulator.get(emulatorId)!.add(socketId);
    this.socketToEmulator.set(socketId, emulatorId);
    this.logger.debug(`viewer.watch: socket=${socketId} emulator=${emulatorId} viewers=${this.viewersByEmulator.get(emulatorId)!.size}`);
  }

  private removeViewer(socketId: string): void {
    const emulatorId = this.socketToEmulator.get(socketId);
    if (!emulatorId) return;

    const viewers = this.viewersByEmulator.get(emulatorId);
    if (viewers) {
      viewers.delete(socketId);
      if (viewers.size === 0) {
        this.viewersByEmulator.delete(emulatorId);
        this.logger.log(`No viewers left for emulator=${emulatorId} — pausing stream`);
        void this.pauseStreamForEmulator(emulatorId);
      }
    }
    this.socketToEmulator.delete(socketId);
  }

  private async pauseStreamForEmulator(emulatorId: string): Promise<void> {
    try {
      const emulator = await this.prisma.emulator.findFirst({
        where: { id: emulatorId, status: "running", deletedAt: null },
      });
      if (!emulator?.containerId) return;

      await firstValueFrom(
        this.httpService.post(
          `${this.orchestratorUrl}/containers/${emulator.containerId}/kill-scrcpy`,
          {},
          { headers: { Authorization: `Bearer ${this.orchestratorToken}` } },
        ),
      );
      this.logger.log(`Stream paused for emulator=${emulatorId}`);
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      // 404 = container gone (already terminated), 422 = no scrcpy running — both OK
      if (status !== 404 && status !== 422) {
        this.logger.warn(`pauseStream failed for emulator=${emulatorId}: ${String(err)}`);
      }
    }
  }

  // ─── WS message handlers ───────────────────────────────────────────────────

  @SubscribeMessage("viewer.watch")
  handleViewerWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { emulatorId: string },
  ): void {
    if (data?.emulatorId) {
      // Remove old mapping if client was watching something else
      const prev = this.socketToEmulator.get(client.id);
      if (prev && prev !== data.emulatorId) this.removeViewer(client.id);
      this.addViewer(client.id, data.emulatorId);
    }
  }

  @SubscribeMessage("viewer.unwatch")
  handleViewerUnwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() _data: unknown,
  ): void {
    this.removeViewer(client.id);
  }

  @SubscribeMessage("ping")
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() _data: unknown,
  ): { event: string; data: string } {
    this.logger.debug(`ping from socket=${client.id}`);
    return { event: "pong", data: "pong" };
  }

  // ─── Emit helpers ──────────────────────────────────────────────────────────

  emitStatusUpdate(userId: string, emulatorId: string, status: string, expiresAt: Date): void {
    this.server.to(userId).emit("emulator.status", {
      emulatorId,
      status,
      expiresAt: expiresAt.toISOString(),
    });
  }

  emitExpiring(userId: string, emulatorId: string, minutesLeft: number): void {
    this.server.to(userId).emit("emulator.expiring", { emulatorId, minutesLeft });
  }
}
