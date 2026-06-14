const { Server: SocketIOServer } = require("socket.io");

let io;

const initSocket = (httpServer) => {
  if (io) {
    console.log("Socket.io already initialized");
    return io;
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id} | Transport: ${socket.conn.transport.name}`);
    
    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} | Reason: ${reason}`);
    });

    socket.on("error", (err) => {
      console.error(`[Socket] Error on socket ${socket.id}:`, err);
    });
  });

  // Gán vào global để các API route có thể truy cập
  global.io = io;
  console.log("Socket.io initialized successfully");
  return io;
};

const emitRevenueUpdate = (excludeSocketId) => {
  if (global.io) {
    if (excludeSocketId) {
      console.log(`Emitting revenue-updated event, excluding socket: ${excludeSocketId}...`);
      global.io.except(excludeSocketId).emit("revenue-updated");
    } else {
      console.log("Emitting revenue-updated event...");
      global.io.emit("revenue-updated");
    }
  } else {
    console.warn("Socket.io not initialized, cannot emit event");
  }
};

module.exports = { initSocket, emitRevenueUpdate };
