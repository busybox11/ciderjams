import type { ClientWireMessage, WireErrorMessage } from "@ciderjams/proto";
import { roomParticipant } from "@ciderjams/proto";
import {
  applyInRoom,
  createRoomOp,
  joinBroadcastToExisting,
  joinRoomOp,
  type ServerMessage,
} from "./dispatch";
import { log } from "./logger";
import type { RoomRegistry } from "./registry";
import type { Room } from "./room";

export interface HubSocket {
  send(data: string): void;
  readonly readyState: number;
}

const WS_OPEN = 1;

type Ctx = { user: roomParticipant; room: Room | null };

export class RoomSocketHub {
  private readonly ctx = new WeakMap<HubSocket, Ctx>();
  private readonly byRoomId = new Map<string, Set<HubSocket>>();

  init(ws: HubSocket, user: roomParticipant): void {
    this.ctx.set(ws, { user, room: null });
    log.log("ws connected", user.handle);
  }

  error(ws: HubSocket, message: string): void {
    log.warn("ws → client error", message);
    if (ws.readyState === WS_OPEN) {
      const body: WireErrorMessage = { type: "error", message };
      ws.send(JSON.stringify(body));
    }
  }

  send(ws: HubSocket, messages: ServerMessage[]): void {
    if (ws.readyState !== WS_OPEN) return;

    for (const m of messages) ws.send(JSON.stringify(m));
  }

  onDisconnect(ws: HubSocket, registry: RoomRegistry): void {
    const c = this.ctx.get(ws);
    log.log("ws disconnected", c?.user.handle ?? "(unknown)");
    if (!c?.room) return;

    const room = c.room;

    try {
      const r = applyInRoom(registry, room, "room.leave", {}, c.user.userId);
      if (r.roomClosed) this.clearRoom(room);
      else {
        this.unlink(ws, room);
        this.broadcast(room, r.messages);
      }
    } catch {
      this.unlink(ws, room);
    }
  }

  onMessage(
    ws: HubSocket,
    registry: RoomRegistry,
    msg: ClientWireMessage,
  ): void {
    const c = this.ctx.get(ws);
    if (!c) {
      this.error(ws, "internal: missing socket context");
      return;
    }

    if (msg.event === "ping") {
      this.send(ws, [{ event: "ping", payload: msg.payload }]);
      return;
    }

    if (msg.event === "room.create") {
      const { room, toHost } = createRoomOp(registry, msg.payload);
      log.log("room created", room.meta.roomCode, "by", c.user.handle);
      this.link(ws, room);
      this.send(ws, toHost);
      return;
    }

    if (msg.event === "room.join") {
      const res = joinRoomOp(registry, msg.payload, c.user);
      if (!res.ok) {
        log.warn("room join failed", res.reason);
        this.error(
          ws,
          res.reason === "not_found"
            ? "room not found"
            : "invalid join payload",
        );
        return;
      }

      log.log("room joined", res.room.meta.roomCode, c.user.handle);
      this.broadcast(res.room, joinBroadcastToExisting(res.room));
      this.link(ws, res.room);
      this.send(ws, res.toJoiner);

      return;
    }

    const room = c.room;
    if (!room) {
      this.error(ws, "join or create a room first");
      return;
    }

    try {
      const r = applyInRoom(
        registry,
        room,
        msg.event,
        msg.payload,
        c.user.userId,
      );
      if (r.roomClosed) {
        log.log("room closed (empty)", room.meta.roomCode);
        this.clearRoom(room);
        return;
      }

      if (msg.event === "room.leave") this.unlink(ws, room);
      this.broadcast(room, r.messages);
    } catch (e) {
      this.error(ws, e instanceof Error ? e.message : "server error");
    }
  }

  private link(ws: HubSocket, room: Room): void {
    const c = this.ctx.get(ws);
    if (!c) return;

    c.room = room;
    let set = this.byRoomId.get(room.meta.roomId);
    if (!set) {
      set = new Set();
      this.byRoomId.set(room.meta.roomId, set);
    }
    set.add(ws);
  }

  private unlink(ws: HubSocket, room: Room): void {
    this.byRoomId.get(room.meta.roomId)?.delete(ws);

    const s = this.byRoomId.get(room.meta.roomId);
    if (s?.size === 0) this.byRoomId.delete(room.meta.roomId);

    const c = this.ctx.get(ws);
    if (c) c.room = null;
  }

  private broadcast(room: Room, messages: ServerMessage[]): void {
    const set = this.byRoomId.get(room.meta.roomId);
    if (!set) return;

    for (const ws of set) this.send(ws, messages);
  }

  private clearRoom(room: Room): void {
    const id = room.meta.roomId;

    this.byRoomId.get(id)?.forEach((ws) => {
      const c = this.ctx.get(ws);
      if (c) c.room = null;
    });

    this.byRoomId.delete(id);
  }
}
