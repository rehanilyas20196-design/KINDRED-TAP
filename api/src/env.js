import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config({ path: path.resolve(here, "../../../.env") });

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  /**
   * Whether the cold start applies pending migrations.
   *
   * Deployments apply them at build time instead (see scripts/migrate-if-configured.js),
   * so production request handling stays free of migration work. Local development
   * keeps boot-time migrations because there is no build step there.
   */
  migrateOnBoot: process.env.MIGRATE_ON_BOOT
    ? process.env.MIGRATE_ON_BOOT === "true"
    : (process.env.NODE_ENV || "development") !== "production",
  webOrigin: (process.env.WEB_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL?.trim() || null,
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  dbStrict: process.env.DB_STRICT === "true",
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
  /**
   * Admin panel credentials (see api/src/lib/admin.js).
   *
   * ADMIN_PASSWORD_HASH is a bcrypt hash and is what production should use;
   * ADMIN_PASSWORD is a plain value for local development only, hashed once at
   * boot so the comparison is still bcrypt. Neither is ever sent to the web
   * app, and neither lives in the users table - there is no admin row to list,
   * approve or hijack.
   */
  adminEmail: process.env.ADMIN_EMAIL?.trim() || null,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH?.trim() || null,
  adminPassword: process.env.ADMIN_PASSWORD?.trim() || null,
};

if (env.nodeEnv === "production" && env.jwtSecret === "dev-only-change-me") {
  throw new Error("JWT_SECRET must be set to a real secret in production.");
}

if (env.nodeEnv === "production" && !env.adminPasswordHash && env.adminPassword) {
  console.warn(
    "[env] ADMIN_PASSWORD is plain text. Prefer ADMIN_PASSWORD_HASH (a bcrypt hash) in production."
  );
}

// A Supabase project URL (https://...supabase.co) is a REST endpoint, not a
// database: passing it here produces a connection timeout that looks like a
// network fault. Fail with the actual mistake instead.
if (env.databaseUrl && /^https?:\/\//i.test(env.databaseUrl)) {
  throw new Error(
    "DATABASE_URL must be a postgres:// connection string (Supabase pooler), " +
      "not an https:// project URL."
  );
}
