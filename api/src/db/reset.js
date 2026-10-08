import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deletes the embedded database so the next migrate run starts clean.
 * A no-op when you are pointing at a real PostgreSQL server, because losing
 * that data is never the intent.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../../.pglite");

if (process.env.DATABASE_URL) {
  console.log("[reset] DATABASE_URL is set, refusing to delete a real server's data.");
  console.log("[reset] Drop your PostgreSQL schema manually if that is what you want.");
} else {
  await fs.rm(dataDir, { recursive: true, force: true });
  console.log("[reset] removed embedded database at api/.pglite");
}
