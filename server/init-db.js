import { initDb, pool } from "./db.js";

try {
  await initDb();
  console.log("Avalon DM database schema is ready.");
} finally {
  await pool.end();
}
