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
import { Server, Socket } from "socket.io";
import type { JwtPayload } from "../auth/decorators/current-user.decorator.js";

@Injectable()
@WebSocketGateway({ namespace: "/ws/emulator", cors: { origin: "*" } })
export class EmulatorGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EmulatorGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth as Record<string, string>)["token"] ??
        (client.handshake.headers["authorization"] ?? "").replace(
          "Bearer ",
          "",
        );

      if (!token) {
        this.logger.warn(
          `WS connection rejected — no token (socket: ${client.id})`,
        );
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      // join room ตาม userId เพื่อให้ emit ได้เจาะจง
      await client.join(payload.sub);
      this.logger.log(
        `WS connected: userId=${payload.sub} socket=${client.id}`,
      );
    } catch {
      this.logger.warn(
        `WS connection rejected — invalid token (socket: ${client.id})`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`WS disconnected: socket=${client.id}`);
  }

  /**
   * Emit เมื่อ status ของ emulator เปลี่ยน
   */
  emitStatusUpdate(
    userId: string,
    emulatorId: string,
    status: string,
    expiresAt: Date,
  ): void {
    this.server.to(userId).emit("emulator.status", {
      emulatorId,
      status,
      expiresAt: expiresAt.toISOString(),
    });
  }

  /**
   * Emit เตือนใกล้หมดอายุ
   */
  emitExpiring(
    userId: string,
    emulatorId: string,
    minutesLeft: number,
  ): void {
    this.server.to(userId).emit("emulator.expiring", {
      emulatorId,
      minutesLeft,
    });
  }

  @SubscribeMessage("ping")
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() _data: unknown,
  ): { event: string; data: string } {
    this.logger.debug(`ping from socket=${client.id}`);
    return { event: "pong", data: "pong" };
  }
}
