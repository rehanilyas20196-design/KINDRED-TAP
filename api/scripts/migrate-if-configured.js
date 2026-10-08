/**
 * Applies pending migrations as part of `npm run build` (the Vercel build step).
 *
 * Running them here keeps migration work out of the request path: a deployed
 * instance only reads the schema, it never writes to it. Skipped when no
 * DATABASE_URL is present (local builds) or when SKIP_BUILD_MIGRATIONS=true.
 *
 * A failure exits non-zero so a broken schema change cannot ship silently.
 */
const skip = process.env.SKIP_BUILD_MIGRATIONS === "true";
const url = process.env.DATABASE_URL?.trim();

if (skip) {
  console.log("[migrate] SKIP_BUILD_MIGRATIONS=true - schema left untouched");
  process.exit(0);
}

if (!url) {
  console.log("[migrate] DATABASE_URL not set - nothing to migrate at build time");
  process.exit(0);
}

if (/^https?:\/\//i.test(url)) {
  console.error(
    "[migrate] DATABASE_URL is an https:// project URL. " +
      "Set it to a postgres:// pooler connection string instead."
  );
  process.exit(1);
}

const { runMigrations } = await import("../src/db/migrate.js");
const { closeDb } = await import("../src/db/index.js");

try {
  await runMigrations();
  await closeDb();
  process.exit(0);
} catch (err) {
  console.error("[migrate] build-time migration failed:", err.message);
  await closeDb().catch(() => {});
  process.exit(1);
}
