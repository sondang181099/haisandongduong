const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { loadEnvConfig } = require("@next/env");
const { initSocket } = require("./socket-server");

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "4000", 10);

// Khởi tạo ứng dụng Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  // Tích hợp Socket.io
  initSocket(httpServer);

  // --- Tự động đồng bộ KiotViet theo chu kỳ ---
  // Lưu ý: sync thực tế dùng Python script (xem triggerSync bên dưới)
  

  const startAutoSync = async () => {
    // Tránh chạy trùng lặp khi chạy PM2 Cluster Mode
    if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== "0") {
      console.log(`[Server] PM2 Instance ${process.env.NODE_APP_INSTANCE} detected. Auto-sync disabled on this instance.`);
      return;
    }

    const mongoose = require("mongoose");
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      console.error("[Server] MONGODB_URI not set, auto-sync disabled.");
      return;
    }

    console.log("[Server] Initializing auto-sync with dynamic interval...");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    const getInterval = async () => {
      try {
        const db = mongoose.connection.db;
        const setting = await db.collection("systemsettings").findOne({ key: "sync_interval_seconds" });
        const intervalValue = setting?.value || 10;
        const safeInterval = Math.max(intervalValue, 10);
        return safeInterval * 1000;
      } catch (err) {
        console.error("[Server] Error fetching sync interval, defaulting to 10s:", err);
        return 10 * 1000;
      }
    };

    const { exec } = require("child_process");
    const path = require("path");

    const triggerSync = async () => {
      console.log(`[Server] Running scheduled PYTHON sync at ${new Date().toLocaleTimeString()}...`);
      
      const runSyncProcess = () => {
        return new Promise((resolve) => {
          try {
            const pythonScript = path.join(projectDir, "kiotviet-sync-python", "sync_kiotviet.py");
            const { emitRevenueUpdate } = require("./socket-server");
            
            exec(`python3 "${pythonScript}" auto`, (error, stdout, stderr) => {
              if (error) {
                console.error(`[Server] Python sync error: ${error.message}`);
              } else {
                if (stderr) {
                  console.warn(`[Server] Python sync warning: ${stderr}`);
                }
                console.log(`[Server] Python sync completed:\n${stdout.split('\n').filter(l => l.startsWith('->')).join('\n')}`);
                
                // Phát tín hiệu cập nhật qua WebSocket
                emitRevenueUpdate();
              }
              resolve();
            });
          } catch (err) {
            console.error("[Server] Failed to trigger Python sync:", err);
            resolve();
          }
        });
      };

      // Chờ tiến trình python hoàn thành
      await runSyncProcess();
      
      const nextInterval = await getInterval();
      console.log(`[Server] Next sync in ${nextInterval / 1000} seconds.`);
      setTimeout(triggerSync, nextInterval);
    };

    // Bắt đầu chu kỳ đồng bộ đầu tiên sau khi server đã sẵn sàng
    console.log("[Server] Starting first Python sync cycle...");
    triggerSync(); 
  };



  httpServer.once("error", (err) => {
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Node Environment: ${process.env.NODE_ENV}`);
    
    // Bắt đầu đồng bộ sau khi server đã lắng nghe
    startAutoSync();
  });
});
