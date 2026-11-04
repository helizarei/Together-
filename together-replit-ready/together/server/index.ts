import { createServer } from "node:http";
import next from "next";
import { randomUUID } from "node:crypto";
import { Server, Socket } from "socket.io";
import { z } from "zod";

type ChatMessage = { id: string; user: string; text: string; time: string };
type PlaybackState = { url: string; type: "youtube" | "video"; playing: boolean; position: number; updatedAt: number; revision: number };
type Room = { roomId: string; playback: PlaybackState; messages: ChatMessage[]; participants: Map<string, string> };

const PORT = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, service: "together", rooms: rooms.size }));
    return;
  }
  nextHandler(req, res);
});

const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e6,
});

const rooms = new Map<string, Room>();
const joinSchema = z.object({ roomId: z.string().min(1).max(32), name: z.string().trim().min(1).max(32) });
const commandSchema = z.object({
  roomId: z.string().min(1).max(32),
  url: z.string().url().max(2048).optional(),
  type: z.enum(["youtube", "video"]).optional(),
  playing: z.boolean().optional(),
  position: z.number().finite().min(0).max(60 * 60 * 24).optional(),
  updatedAt: z.number().finite().optional(),
});

function emptyPlayback(): PlaybackState {
  return { url: "", type: "video", playing: false, position: 0, updatedAt: Date.now(), revision: 0 };
}
function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { roomId, playback: emptyPlayback(), messages: [], participants: new Map() };
    rooms.set(roomId, room);
  }
  return room;
}
function snapshot(room: Room) {
  return { roomId: room.roomId, participants: [...room.participants.values()], playback: room.playback, messages: room.messages };
}
function broadcastParticipants(room: Room) {
  io.to(room.roomId).emit("room:participants", [...room.participants.values()]);
}

io.on("connection", (socket: Socket) => {
  socket.on("room:join", (raw: unknown, ack?: (value: unknown) => void) => {
    const parsed = joinSchema.safeParse(raw);
    if (!parsed.success) {
      ack?.({ ok: false, error: "Invalid room code or display name." });
      return;
    }
    const { roomId, name } = parsed.data;
    // This in-memory starter does not provide authenticated or private rooms.
    // Add real auth, invitation tokens, rate limits, and durable storage before public deployment.
    const room = getRoom(roomId);
    for (const oldRoom of socket.rooms) {
      if (oldRoom !== socket.id && rooms.has(oldRoom)) {
        const previous = rooms.get(oldRoom)!;
        previous.participants.delete(socket.id);
        socket.leave(oldRoom);
        broadcastParticipants(previous);
      }
    }
    socket.data.roomId = roomId;
    socket.data.name = name;
    room.participants.set(socket.id, name);
    socket.join(roomId);
    ack?.({ ok: true, snapshot: snapshot(room) });
    socket.to(roomId).emit("room:participant-joined", { name });
    broadcastParticipants(room);
    io.to(roomId).emit("room:snapshot", snapshot(room));
  });

  socket.on("room:leave", (raw: unknown) => {
    const roomId = typeof (raw as { roomId?: unknown })?.roomId === "string" ? (raw as { roomId: string }).roomId : socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
      room.participants.delete(socket.id);
      socket.leave(roomId);
      broadcastParticipants(room);
      if (room.participants.size === 0 && room.messages.length === 0 && !room.playback.url) rooms.delete(roomId);
    }
  });

  socket.on("chat:send", (raw: unknown) => {
    const input = z.object({ roomId: z.string().min(1).max(32), text: z.string().trim().min(1).max(1000) }).safeParse(raw);
    if (!input.success || socket.data.roomId !== input.data.roomId) return;
    const room = rooms.get(input.data.roomId);
    if (!room) return;
    const message: ChatMessage = {
      id: randomUUID(),
      user: String(socket.data.name || "Guest").slice(0, 32),
      text: input.data.text,
      time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }),
    };
    room.messages.push(message);
    room.messages = room.messages.slice(-100);
    io.to(room.roomId).emit("chat:message", message);
  });

  socket.on("playback:command", (raw: unknown) => {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success || socket.data.roomId !== parsed.data.roomId) return;
    const room = rooms.get(parsed.data.roomId);
    if (!room) return;
    const data = parsed.data;
    const nextUrl = data.url ?? room.playback.url;
    if (nextUrl) {
      try {
        const url = new URL(nextUrl);
        if (!["http:", "https:"].includes(url.protocol)) return;
      } catch { return; }
    }
    room.playback = {
      url: nextUrl,
      type: data.type ?? room.playback.type,
      playing: data.playing ?? room.playback.playing,
      position: data.position ?? room.playback.position,
      updatedAt: data.updatedAt ?? Date.now(),
      revision: room.playback.revision + 1,
    };
    io.to(room.roomId).emit("playback:state", room.playback);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | undefined;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.participants.delete(socket.id);
    broadcastParticipants(room);
    if (room.participants.size === 0 && room.messages.length === 0 && !room.playback.url) rooms.delete(roomId);
  });
});

nextApp.prepare().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Together is listening on port ${PORT}`);
  });
}).catch((error) => {
  console.error("Failed to start Together:", error);
  process.exit(1);
});
