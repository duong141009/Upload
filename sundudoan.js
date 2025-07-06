const Fastify = require("fastify");
const WebSocket = require("ws");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const fastifyWebsocket = require('@fastify/websocket');

// Cấu hình cố định
const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjB9.p56b5g73I9wyoVu4db679bOvVeFJWVjGDg_ulBXyav8";
const API_KEY = "tinh592007pq";
const PORT = 4000;

// Khởi tạo Fastify
const fastify = Fastify({ logger: true });
fastify.register(require('@fastify/cors'), { origin: true });
fastify.register(fastifyWebsocket);

// Kết nối database
const dbPath = path.resolve(__dirname, 'sun.sql');
const db = new sqlite3.Database(dbPath);

// Route chính
fastify.get("/", async (request, reply) => {
  return {
    status: "Sunwin API đang hoạt động",
    endpoints: [
      "/api/sunwin?key=API_KEY",
      "/api/history?key=API_KEY&limit=10",
      "/api/sunwin/taixiu/ws (WebSocket)"
    ],
    note: "Thay API_KEY bằng key thực tế"
  };
});

// Xử lý favicon
fastify.get("/favicon.ico", async (request, reply) => {
  reply.code(204).send();
});

// Kết nối WebSocket Sunwin
let ws = null;
function connectWebSocket() {
  ws = new WebSocket(`wss://websocket.azhkthg1.net/websocket?token=${TOKEN}`);

  ws.on("open", () => {
    console.log("Đã kết nối WebSocket Sunwin");
    const authPayload = [/* payload xác thực */];
    ws.send(JSON.stringify(authPayload));
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        json[1].htr.forEach(item => {
          if (item.d1 && item.d2 && item.d3) {
            const total = item.d1 + item.d2 + item.d3;
            db.run(
              `INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [item.sid, item.d1, item.d2, item.d3, total, total >= 11 ? "Tài" : "Xỉu", Date.now()]
            );
          }
        });
      }
    } catch (e) {
      console.error("Lỗi xử lý WebSocket:", e);
    }
  });

  ws.on("close", () => {
    console.log("Mất kết nối, đang kết nối lại...");
    setTimeout(connectWebSocket, 5000);
  });
}

// API endpoints
fastify.get("/api/sunwin", async (request, reply) => {
  if (request.query.key !== API_KEY) {
    return reply.code(403).send({ error: "Invalid API key" });
  }

  const row = await new Promise((resolve) => {
    db.get("SELECT * FROM sessions ORDER BY sid DESC LIMIT 1", (err, row) => {
      resolve(row || { error: "No data" });
    });
  });
  return row;
});

fastify.get("/api/history", async (request, reply) => {
  if (request.query.key !== API_KEY) {
    return reply.code(403).send({ error: "Invalid API key" });
  }

  const limit = Math.min(parseInt(request.query.limit) || 50, 100);
  const rows = await new Promise((resolve) => {
    db.all(`SELECT * FROM sessions ORDER BY sid DESC LIMIT ?`, [limit], (err, rows) => {
      resolve(rows || []);
    });
  });
  return rows;
});

// WebSocket endpoint
fastify.get('/api/sunwin/taixiu/ws', { websocket: true }, (connection) => {
  connection.socket.on('message', message => {
    console.log('Received message:', message.toString());
  });
});

// Khởi động server
const start = async () => {
  try {
    // Tạo bảng nếu chưa tồn tại
    await new Promise((resolve) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid INTEGER PRIMARY KEY,
          d1 INTEGER NOT NULL,
          d2 INTEGER NOT NULL,
          d3 INTEGER NOT NULL,
          total INTEGER NOT NULL,
          result TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )
      `, resolve);
    });

    connectWebSocket();
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
  } catch (err) {
    console.error("Lỗi khởi động server:", err);
    process.exit(1);
  }
};

start();