const Fastify = require("fastify");
const WebSocket = require("ws");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const fastify = Fastify({ logger: true });
const PORT = process.env.PORT || 4000;
fastify.register(require('@fastify/cors'), { origin: true });

// Cấu hình API Key
const API_KEY = "tinh592007pq"; // Thay đổi key này nếu cần

// Khởi tạo cơ sở dữ liệu
const dbPath = path.resolve(__dirname, 'sun.sql');
const db = new sqlite3.Database(dbPath);

// Kết nối WebSocket tới Sunwin
let ws = null;
const TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjB9.p56b5g73I9wyoVu4db679bOvVeFJWVjGDg_ulBXyav8";

function connectWebSocket() {
  ws = new WebSocket(`wss://websocket.azhkthg1.net/websocket?token=${TOKEN}`);

  ws.on("open", () => {
    console.log("Đã kết nối WebSocket Sunwin");
    
    const authPayload = [
      1, "MiniGame", "SC_xigtupou", "conga999",
      {
        info: JSON.stringify({
          ipAddress: "171.246.10.199",
          userId: "7c54ec3f-ee1a-428c-a56e-1bc14fd27e57",
          username: "SC_xigtupou"
        }),
        signature: "0EC9E9B2311CD352561D9556F88F6AB4167502EAC5F9767D07D43E521FE1BA05..."
      }
    ];
    ws.send(JSON.stringify(authPayload));
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        for (const newItem of json[1].htr) {
          if (newItem.d1 && newItem.d2 && newItem.d3) {
            const total = newItem.d1 + newItem.d2 + newItem.d3;
            const result = total >= 11 ? "Tài" : "Xỉu";
            
            db.run(
              `INSERT OR IGNORE INTO sessions (sid, d1, d2, d3, total, result, timestamp) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [newItem.sid, newItem.d1, newItem.d2, newItem.d3, total, result, Date.now()]
            );
          }
        }
      }
    } catch (e) {
      console.error("Lỗi xử lý dữ liệu WebSocket:", e);
    }
  });

  ws.on("close", () => {
    console.log("Mất kết nối WebSocket, đang thử kết nối lại...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => {
    console.error("Lỗi WebSocket:", err);
  });
}

// API endpoints đơn giản
fastify.get("/api/latest", async (request, reply) => {
  const key = request.query.key;
  if (key !== API_KEY) {
    return reply.code(403).send({ error: "Invalid API key" });
  }

  return new Promise((resolve, reject) => {
    db.get(
      "SELECT sid, d1, d2, d3, total, result, timestamp FROM sessions ORDER BY sid DESC LIMIT 1",
      (err, row) => {
        if (err) return reject(err);
        resolve(row || { message: "Chưa có dữ liệu" });
      }
    );
  });
});

fastify.get("/api/history", async (request, reply) => {
  const key = request.query.key;
  if (key !== API_KEY) {
    return reply.code(403).send({ error: "Invalid API key" });
  }

  const limit = parseInt(request.query.limit) || 50;
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT sid, d1, d2, d3, total, result, timestamp 
       FROM sessions ORDER BY sid DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
});

// Khởi động server
const start = async () => {
  try {
    // Tạo bảng nếu chưa tồn tại
    await new Promise((resolve, reject) => {
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
      `, (err) => err ? reject(err) : resolve());
    });

    connectWebSocket();
    
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
  } catch (err) {
    console.error("Lỗi khởi động server:", err);
    process.exit(1);
  }
};

start();