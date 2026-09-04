import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const localUser = encodeURIComponent(process.env.USER || "postgres");
const connectionString = process.env.DATABASE_URL || `postgresql://${localUser}@127.0.0.1:5432/avalon_dm`;

export const pool = new Pool({ connectionString });

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error", error);
});

export async function initDb() {
  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
