import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import { env } from "./env.js";
import { closeDb, getDriver } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { loadColumnMap } from "./lib/schemas.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import authRouter from "./routes/auth.routes.js";
import personalityRouter from "./routes/personality.routes.js";
import profileRouter from "./routes/profile.routes.js";
import supportRouter from "./routes/support.routes.js";
import supportTicketsRouter from "./routes/supportTickets.routes.js";
import sessionsRouter from "./routes/sessions.routes.js";
import clinicalRouter from "./routes/clinicalAssessment.routes.js";
import matchingRouter from "./routes/matching.routes.js";
import meRouter, { metaRouter } from "./routes/me.routes.js";
import supporterRouter from "./routes/supporter.routes.js";
import therapistRouter from "./routes/therapist.routes.js";
import advisorRouter from "./routes/advisor.routes.js";
import oversightRouter from "./routes/advisorOversight.routes.js";
import supervisorRouter from "./routes/supervisor.routes.js";
import supervisorOpsRouter from "./routes/supervisorOps.routes.js";
import clinicRouter from "./routes/clinic.routes.js";
import clinicOpsRouter from "./routes/clinicOps.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser callers such as curl and tests.
        if (!origin || env.webOrigin.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    })
  );

  if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/api/health", async (req, res) => {
    const driver = await getDriver();
    res.json({ ok: true, env: env.nodeEnv, database: driver.kind, uptime: process.uptime() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/personality", personalityRouter);
  app.use("/api/profiles", profileRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/support", supportTicketsRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/supporter", supporterRouter);
  app.use("/api/therapist", therapistRouter);
  app.use("/api/clinical", clinicalRouter);
  app.use("/api/matching", matchingRouter);
  // One base path, two routers: clinic operations first, clinical oversight
  // second. Neither shares a path with the other, so the order only matters
  // for readability.
  app.use("/api/advisor", advisorRouter);
  app.use("/api/advisor", oversightRouter);
  // The Clinic Supervisor portal: day-to-day supervision in supervisorRouter,
  // and the supporting sections (workload, calendar, oversight, reports) in
  // supervisorOpsRouter. Same base path, no overlapping routes.
  app.use("/api/supervisor", supervisorRouter);
  app.use("/api/supervisor", supervisorOpsRouter);
  // The Collaborative Clinic Portal: referrals and the dashboard in
  // clinicRouter, and the supporting sections (clients, services, commission,
  // payouts, partnerships, appointments, messages, reports) in clinicOpsRouter.
  // Same base path, no overlapping routes.
  app.use("/api/clinic", clinicRouter);
  app.use("/api/clinic", clinicOpsRouter);
  app.use("/api/meta", metaRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function start() {
  await runMigrations();
  await loadColumnMap(await getDriver());

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] Kindred Tap API listening on http://localhost:${env.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await closeDb().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  start().catch((err) => {
    console.error("[api] failed to start:", err);
    process.exit(1);
  });
}
