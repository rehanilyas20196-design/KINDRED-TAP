#!/usr/bin/env node
/**
 * Writes the website-derived knowledge into `api/src/knowledge/website/`.
 *
 * The API is deployed on its own, with no `web/` beside it, so at runtime it
 * reads this committed snapshot instead of the live workspace. Running this
 * after changing the landing page or portal metadata keeps the deployed
 * corpus one commit away from the code it describes - no manual editing of
 * prose, and no drift that only shows up as a wrong answer.
 *
 *   npm run sync:knowledge --workspace=api
 */

import fs from "node:fs/promises";
import path from "node:path";

import {
  WEB_DIR,
  WEBSITE_SNAPSHOT_DIR,
  collectWebsiteSources,
} from "../src/services/knowledge-sources.js";

const { docs, warnings } = await collectWebsiteSources(WEB_DIR);

if (docs.length === 0) {
  console.error(`[sync] no website sources found in ${WEB_DIR}`);
  for (const warning of warnings) console.error(`[sync]   ${warning}`);
  process.exit(1);
}

await fs.mkdir(WEBSITE_SNAPSHOT_DIR, { recursive: true });

const keep = new Set();
for (const doc of docs) {
  const key = doc.source.replace(/^website:/, "");
  const file = `${key}.md`;
  keep.add(file);
  await fs.writeFile(path.join(WEBSITE_SNAPSHOT_DIR, file), doc.content, "utf8");
}

let removed = 0;
for (const name of await fs.readdir(WEBSITE_SNAPSHOT_DIR)) {
  if (name.endsWith(".md") && !keep.has(name)) {
    await fs.rm(path.join(WEBSITE_SNAPSHOT_DIR, name));
    removed += 1;
  }
}

console.log(`[sync] wrote ${keep.size} file(s) to ${path.relative(process.cwd(), WEBSITE_SNAPSHOT_DIR)}`);
if (removed > 0) console.log(`[sync] removed ${removed} stale file(s)`);
for (const warning of warnings) console.warn(`[sync] warning: ${warning}`);
