import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../env.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A tiny query interface that hides whether we are talking to a real
 * PostgreSQL server (node-postgres) or to the embedded PGlite build.
 *
 * Both return `{ rows }` so nothing above this layer cares about the driver.
 */
let driver = null;
let initPromise = null;

function pgOptions(connectionString) {
  const mode = /[?&]sslmode=([^&]+)/i.exec(connectionString)?.[1]?.toLowerCase();

  if (mode === "disable") return { connectionString, ssl: false };
  if (mode === "verify-ca" || mode === "verify-full") {
    return { connectionString, ssl: { rejectUnauthorized: true } };
  }

  // pg turns sslmode=require into ssl:{} (verify-full), which fails against the
  // pooler certs. Drop the param and apply libpq's real require semantics.
  const cleaned = mode
    ? connectionString
        .replace(/\?sslmode=[^&]+&?/i, "?")
        .replace(/[?&]sslmode=[^&]+/i, "")
        .replace(/\?$/, "")
    : connectionString;

  const host = /@([^/:?[]+)/.exec(cleaned)?.[1] ?? "";
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/i.test(host);

  return { connectionString: cleaned, ssl: isLocal ? false : { rejectUnauthorized: false } };
}

async function createPgDriver() {
  const { default: pg } = await import("pg");

  const { connectionString, ssl } = pgOptions(env.databaseUrl);

  const pool = new pg.Pool({
    connectionString,
    ssl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });

  // Fail fast on a bad/missing database rather than on the first request.
  const probe = await pool.connect();
  probe.release();

  return {
    kind: "postgres",
    async query(text, params = []) {
      const result = await pool.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
    /** Multi-statement DDL. Uses the simple protocol, so no parameters allowed. */
    async exec(sql) {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const wrapped = {
          async query(text, params = []) {
            const result = await client.query(text, params);
            return { rows: result.rows, rowCount: result.rowCount };
          },
          async exec(sql) {
            await client.query(sql);
          },
        };
        const out = await fn(wrapped);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function createPgliteDriver() {
  const { PGlite } = await import("@electric-sql/pglite");

  // The data directory is configurable so tests can run against their own
  // database instead of the one the dev server holds open.
  const dataDir = path.resolve(here, "../../", process.env.PGLITE_DIR || ".pglite");

  // PGlite has no inter-process locking of its own: a second writer (a second
  // `npm run dev`, or `npm run seed` while the server is up) corrupts the WAL
  // of the first. Claim the directory before touching it.
  const releaseLock = await acquireDataDirLock(dataDir);

  let db;
  try {
    db = await openDataDir(dataDir, () => PGlite.create({ dataDir }));
  } catch (err) {
    releaseLock();
    throw err;
  }

  let queue = Promise.resolve();
  const serialise = (fn) => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  let closed = false;

  return {
    kind: "pglite",
    async query(text, params = []) {
      return serialise(async () => {
        const result = await db.query(text, params);
        return { rows: result.rows ?? [], rowCount: result.affectedRows ?? 0 };
      });
    },
    /** Multi-statement DDL. PGlite's extended protocol only allows one statement. */
    async exec(sql) {
      return serialise(() => db.exec(sql));
    },
    async transaction(fn) {
      return serialise(async () => {
        await db.exec("BEGIN");
        try {
          const out = await fn({
            async query(text, params = []) {
              const result = await db.query(text, params);
              return { rows: result.rows ?? [], rowCount: result.affectedRows ?? 0 };
            },
            async exec(sql) {
              await db.exec(sql);
            },
          });
          await db.exec("COMMIT");
          return out;
        } catch (err) {
          await db.exec("ROLLBACK").catch(() => {});
          throw err;
        }
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await db.close();
      await releaseLock();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Opening the embedded database safely                               */
/* ------------------------------------------------------------------ */

const lockWaitMs = Number(process.env.PGLITE_LOCK_WAIT_MS || 20_000);

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function firstLine(err) {
  return String(err?.message ?? err).split("\n")[0];
}

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14)
    .replace(/^(\d{8})(\d{6})$/, "$1-$2");
}

/**
 * Holds `<dataDir>.lock` for as long as this process has the database open.
 * The pid inside lets the next run tell "still in use" from "the last process
 * was killed before it could clean up" - `node --watch` restarts do that.
 */
async function acquireDataDirLock(dataDir) {
  const lockPath = `${dataDir}.lock`;
  const deadline = Date.now() + lockWaitMs;

  const release = async () => {
    try {
      const holder = (await fs.readFile(lockPath, "utf8")).trim();
      if (holder === String(process.pid)) await fs.rm(lockPath, { force: true });
    } catch {
      /* already gone */
    }
  };

  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`);
      await handle.close();
      return release;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;

      const raw = await fs.readFile(lockPath, "utf8").catch(() => "");
      const holder = Number.parseInt(raw.trim(), 10);

      if (Number.isInteger(holder) && holder > 0 && isPidAlive(holder)) {
        if (Date.now() >= deadline) {
          throw new Error(
            `database ${dataDir} is locked by another process (pid ${holder}); ` +
              `stop it before running this command`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }

      // The holder died without releasing the lock; take it over.
      await fs.rm(lockPath, { force: true });
    }
  }
}

/**
 * Opens `dataDir`, recovering from the two states a hard kill leaves behind:
 * a stale `postmaster.pid`, and a data directory whose WAL can no longer be
 * replayed. The first keeps its data; the second is moved aside untouched so
 * the server can start instead of crash-looping on `Aborted()`.
 */
async function openDataDir(dataDir, create) {
  try {
    return await create();
  } catch (err) {
    const pidFile = path.join(dataDir, "postmaster.pid");
    const hasStalePid = await fs
      .stat(pidFile)
      .then(() => true)
      .catch(() => false);

    if (!hasStalePid) return rebuildDataDir(dataDir, err, create);

    console.warn(`[db] ${dataDir} still has postmaster.pid from an interrupted shutdown; removing it`);
    await fs.rm(pidFile, { force: true }).catch(() => {});

    try {
      return await create();
    } catch (retryErr) {
      return rebuildDataDir(dataDir, retryErr, create);
    }
  }
}

async function rebuildDataDir(dataDir, err, create) {
  const quarantine = `${dataDir}.corrupt-${stamp()}`;
  console.warn(`[db] cannot open ${dataDir}: ${firstLine(err)}`);
  console.warn(`[db] moving it to ${path.basename(quarantine)} and creating a fresh database`);
  console.warn(`[db] run "npm run seed" if you need the demo data back`);

  try {
    await fs.rename(dataDir, quarantine);
  } catch (renameErr) {
    throw new Error(
      `cannot open ${dataDir} (${firstLine(err)}) and cannot move it aside (${firstLine(renameErr)})`
    );
  }

  return create();
}

async function initDriver() {
  if (env.databaseUrl) {
    try {
      driver = await createPgDriver();
      console.log("[db] connected to PostgreSQL");
      return driver;
    } catch (err) {
      if (env.dbStrict) throw err;
      console.warn(
        `[db] could not reach PostgreSQL (${err.message}). Falling back to embedded PGlite.`
      );
    }
  }

  driver = await createPgliteDriver();
  console.log("[db] using embedded PGlite database at api/.pglite");
  return driver;
}

export function getDriver() {
  if (!initPromise) initPromise = initDriver();
  return initPromise;
}

export async function query(text, params) {
  const d = await getDriver();
  try {
    return await d.query(text, params);
  } catch (err) {
    // Log the statement and the param count only - values carry client content.
    const statement = text.replace(/\s+/g, " ").trim().slice(0, 400);
    console.error("[sql]", err.code ?? "", statement, `(${(params ?? []).length} params)`);
    throw err;
  }
}

export async function queryOne(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

export async function transaction(fn) {
  const d = await getDriver();
  return d.transaction(fn);
}

export async function closeDb() {
  if (!driver) return;
  await driver.close();
  driver = null;
  initPromise = null;
}
