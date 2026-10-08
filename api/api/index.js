import { createApp } from "../src/index.js";
import { getDriver } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrate.js";
import { loadColumnMap } from "../src/lib/schemas.js";

const app = createApp();

let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      await runMigrations();
      await loadColumnMap(await getDriver());
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export default async function handler(req, res) {
  await init();
  return app(req, res);
}
