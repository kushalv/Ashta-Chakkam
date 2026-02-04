import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const rooms = new Map();
const MAX_PLAYERS = 4;
const metrics = {
  startedAt: Date.now(),
  connections: 0,
  activeSockets: 0,
  roomsCreated: 0,
  gamesStarted: 0,
  rolls: 0,
  moves: 0,
  joinErrors: 0,
  clientErrors: 0
};

function makeRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function createRoom(hostSocketId, hostName) {
  let roomId = makeRoomId();
  while (rooms.has(roomId)) roomId = makeRoomId();
  const room = {
    id: roomId,
    hostId: hostSocketId,
    players: [],
    started: false,
    currentIndex: 0
  };
  room.players.push({ id: hostSocketId, name: hostName });
  rooms.set(roomId, room);
  metrics.roomsCreated += 1;
  return room;
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx !== -1) return { room, idx };
  }
  return null;
}

io.on("connection", socket => {
  metrics.connections += 1;
  metrics.activeSockets += 1;
  console.log(`[connect] ${socket.id}`);

  socket.on("create-room", ({ name }) => {
    if (!name) return;
    const room = createRoom(socket.id, name);
    socket.join(room.id);
    socket.emit("room-created", { roomId: room.id, hostId: room.hostId });
    io.to(room.id).emit("lobby-update", {
      roomId: room.id,
      players: room.players,
      hostId: room.hostId,
      started: room.started
    });
  });

  socket.on("join-room", ({ roomId, name }) => {
    const room = rooms.get(roomId);
    if (!room) {
      metrics.joinErrors += 1;
      socket.emit("join-error", { message: "Room not found." });
      return;
    }
    if (room.started) {
      metrics.joinErrors += 1;
      socket.emit("join-error", { message: "Game already started." });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      metrics.joinErrors += 1;
      socket.emit("join-error", { message: "Game is full." });
      return;
    }
    if (room.players.some(p => p.id === socket.id)) return;
    room.players.push({ id: socket.id, name });
    socket.join(room.id);
    socket.emit("room-joined", { roomId: room.id, hostId: room.hostId });
    io.to(room.id).emit("lobby-update", {
      roomId: room.id,
      players: room.players,
      hostId: room.hostId,
      started: room.started
    });
  });

  socket.on("start-game", () => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room } = found;
    if (socket.id !== room.hostId) return;
    room.started = true;
    room.currentIndex = 0;
    metrics.gamesStarted += 1;
    io.to(room.id).emit("game-started", {
      roomId: room.id,
      players: room.players,
      hostId: room.hostId,
      currentIndex: room.currentIndex
    });
  });

  socket.on("roll-request", () => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room, idx } = found;
    if (!room.started) return;
    if (idx !== room.currentIndex) {
      room.currentIndex = idx;
      io.to(room.id).emit("turn-advanced", { currentIndex: room.currentIndex });
    }

    const shells = Array.from({ length: 4 }, () => Math.random() < 0.5);
    const downCount = shells.filter(Boolean).length;
    const roll = downCount === 0 ? 8 : (downCount === 4 ? 4 : downCount);

    metrics.rolls += 1;
    io.to(room.id).emit("roll-result", { roll, playerId: socket.id });
  });

  socket.on("move-made", ({ move }) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room, idx } = found;
    if (!room.started) return;
    if (idx !== room.currentIndex) return;

    metrics.moves += 1;
    io.to(room.id).emit("move-made", { move, playerId: socket.id });
  });

  socket.on("turn-advance", ({ nextIndex }) => {
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room, idx } = found;
    if (idx !== room.currentIndex) return;
    room.currentIndex = nextIndex;
    io.to(room.id).emit("turn-advanced", { currentIndex: room.currentIndex });
  });

  socket.on("client-error", ({ message, stack, context }) => {
    metrics.clientErrors += 1;
    console.log(`[client-error] ${socket.id} ${message || "unknown"}`);
    if (stack) console.log(stack);
    if (context) console.log(`[client-context] ${JSON.stringify(context)}`);
  });

  socket.on("disconnect", () => {
    metrics.activeSockets = Math.max(0, metrics.activeSockets - 1);
    console.log(`[disconnect] ${socket.id}`);
    const found = findRoomBySocket(socket.id);
    if (!found) return;
    const { room } = found;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(room.id);
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
    }
    if (room.currentIndex >= room.players.length) {
      room.currentIndex = 0;
    }
    io.to(room.id).emit("lobby-update", {
      roomId: room.id,
      players: room.players,
      hostId: room.hostId,
      started: room.started
    });
    io.to(room.id).emit("turn-advanced", { currentIndex: room.currentIndex });
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: Math.floor((Date.now() - metrics.startedAt) / 1000) });
});

app.get("/metrics", (_req, res) => {
  res.json({
    ...metrics,
    roomsActive: rooms.size,
    playersActive: Array.from(rooms.values()).reduce((sum, r) => sum + r.players.length, 0),
    uptimeSeconds: Math.floor((Date.now() - metrics.startedAt) / 1000)
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
