import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { seedDemoData, DEFAULT_ADMIN_PASSWORD } from "./seedData.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSeed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const schemaPath = path.resolve(__dirname, "../sql/schema.sql");
    const schemaSql = readFileSync(schemaPath, "utf8");
    await client.query(schemaSql);

    await seedDemoData(client);

    await client.query("COMMIT");
    console.log(`Seed completed successfully. Demo password: ${DEFAULT_ADMIN_PASSWORD}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
