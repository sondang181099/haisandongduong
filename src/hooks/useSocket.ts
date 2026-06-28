"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Xác định URL của socket server (ưu tiên từ env PORT=3000)
    // Tự động xác định URL: ưu tiên window.location.origin nếu đang chạy local 
    // để tránh sai lệch IP giữa các máy/môi trường phát triển.
    // Luôn sử dụng origin hiện tại của trình duyệt để tránh sai lệch IP/Domain khi kết nối Socket.io
    let socketUrl = "";
    if (typeof window !== "undefined") {
      socketUrl = window.location.origin;
    }

    const socketInstance = io(socketUrl, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      transports: ["websocket", "polling"],
      timeout: 10000,
      // Đảm bảo cleanup tốt
      closeOnBeforeunload: true,
    });


    socketInstance.on("connect", () => {
      console.log(`[Socket] Đã kết nối thành công tới: ${socketUrl || "Origin hiện tại"}`);
      setIsConnected(true);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log(`[Socket] Đã ngắt kết nối: ${reason}`);
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (err) => {
      console.error("[Socket] Lỗi kết nối WebSocket:", err.message);
      // Nếu lỗi timeout trên port 4000, log cảnh báo về việc chưa chạy server socket
      if (err.message === "timeout" || err.message === "xhr poll error") {
        console.warn("[Socket] Tip: Hãy đảm bảo bạn đã chạy 'npm run dev:socket' hoặc 'khoi-dong.bat'");
      }
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        console.log("[Socket] Đang đóng kết nối...");
        socketInstance.disconnect();
      }
    };
  }, []);

  return { socket, isConnected };
};
