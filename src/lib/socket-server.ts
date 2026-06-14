import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";

// Định nghĩa kiểu cho global để TypeScript không báo lỗi
declare global {
  // eslint-disable-next-line no-var
  var io: SocketIOServer | undefined;
}

export const initSocket = (httpServer: HTTPServer) => {
  if (global.io) {
    console.log("Socket.io already initialized");
    return global.io;
  }

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*", // Cần điều chỉnh nếu deploy thực tế để bảo mật
      methods: ["GET", "POST"],
    },
    // Đảm bảo hoạt động tốt trong Docker/Proxy
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

  global.io = io;
  console.log("Socket.io initialized successfully");
  return io;
};

// Hàm tiện ích để broadcast sự kiện từ API
export const emitRevenueUpdate = (excludeSocketId?: string) => {
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
