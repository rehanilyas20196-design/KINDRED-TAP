import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDriver, query } from "./index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "migrations");

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedNames() {
  const { rows } = await query("SELECT name FROM schema_migrations");
  return new Set(rows.map((r) => r.name));
}

export async function runMigrations({ log = console.log } = {}) {
  const driver = await getDriver();
  await ensureMigrationsTable();

  const done = await appliedNames();
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (done.has(file)) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    log(`[migrate] applying ${file}`);
    await driver.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    count += 1;
  }

  log(count ? `[migrate] applied ${count} migration(s)` : "[migrate] already up to date");
  return count;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  runMigrations()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[migrate] failed:", err);
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
