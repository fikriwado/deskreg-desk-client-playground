const express = require("express");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 4000;
const LOCAL_NODE_URL = "http://localhost:3000";

app.use(bodyParser.json());
app.use(express.static("public"));

// List UUID aktif yang sudah register ke socket
const connectedUUIDs = new Set();

app.get("/checkins", (req, res) => {
  const uuid = req.query.uuid;
  if (!uuid) return res.status(400).json({ error: "UUID is required" });

  try {
    const db = new Database(`./db/${uuid}.sqlite`);
    const rows = db
      .prepare(`SELECT * FROM checkins ORDER BY created_at ASC`)
      .all();
    db.close();

    res.json(rows);
  } catch (err) {
    console.error("Failed read local DB:", err);
    res.status(500).json({ error: "DB read failed" });
  }
});

app.post("/checkin", async (req, res) => {
  const uuid = req.header("X-Device-UUID");
  const dbPath = `./db/${uuid}.sqlite`;

  try {
    const { name, room_id } = req.body;
    const created_at = new Date().toISOString();
    const type = "checkin";

    const db = new Database(dbPath);
    db.prepare(
      `
      INSERT INTO checkins (name, type, room_id, device_uuid, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(name, type, room_id, uuid, created_at);
    db.close();

    // Push ke local-node
    await axios.post(
      `${LOCAL_NODE_URL}/checkin`,
      {
        name,
        type,
        room_id,
        created_at,
      },
      {
        headers: {
          "X-Device-UUID": uuid,
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Checkin failed:", err);
    res.status(500).json({ success: false });
  }
});

// Terima broadcast dari local-node dan masukkan ke semua db device
const localNodeSocket = require("socket.io-client")(LOCAL_NODE_URL);
localNodeSocket.on("checkin:new", (data) => {
  const dbs = ["device-a", "device-b"].filter(
    (uuid) => uuid !== data.device_uuid
  );
  for (const uuid of dbs) {
    try {
      const db = new Database(`./db/${uuid}.sqlite`);
      const stmt = db.prepare(
        `INSERT INTO checkins (name, type, room_id, device_uuid, created_at) VALUES (?, ?, ?, ?, ?)`
      );
      stmt.run(
        data.name,
        data.type ?? "checkin",
        data.room_id,
        data.device_uuid,
        data.created_at
      );
      db.close();
      io.to(uuid).emit("checkin:new", data);
    } catch (err) {
      console.error(`Failed write to ${uuid}.sqlite:`, err);
    }
  }

  // Emit juga ke device asal untuk update log tampilannya (tanpa insert ulang ke DB)
  io.to(data.device_uuid).emit("checkin:new", data);
});

// Socket UI
io.on("connection", (socket) => {
  socket.on("register-device", (uuid) => {
    socket.join(uuid);
    connectedUUIDs.add(uuid);
    console.log(`📶 Device ${uuid} connected`);
  });
});

server.listen(PORT, () => {
  console.log(`✔ desk-client running on http://localhost:${PORT}`);
});
