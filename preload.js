// preload.js
const Database = require("better-sqlite3");
const fs = require("fs");

const devices = ["device-a", "device-b"];

if (!fs.existsSync("./db")) fs.mkdirSync("./db");

for (const uuid of devices) {
  const dbPath = `./db/${uuid}.sqlite`;
  if (fs.existsSync(dbPath)) continue;

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      room_id INTEGER NOT NULL,
      device_uuid TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  console.log(`✔ DB created: ${dbPath}`);
  db.close();
}
