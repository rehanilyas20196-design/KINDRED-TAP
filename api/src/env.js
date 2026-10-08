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
  webOrigin: (process.env.WEB_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL?.trim() || null,
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  dbStrict: process.env.DB_STRICT === "true",
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
};

if (env.nodeEnv === "production" && env.jwtSecret === "dev-only-change-me") {
  throw new Error("JWT_SECRET must be set to a real secret in production.");
}
