import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds the documents Ask Cube answers from.
 *
 * The corpus is deliberately not a folder of files somebody has to remember
 * to update. It is assembled from the things that are already the truth about
 * this product:
 *
 *   * `src/knowledge/*.md`  - admin-curated documentation, shipped with the API.
 *   * the web workspace     - portal metadata, the landing page's own copy and
 *                             an enumeration of every route Next.js can serve.
 *   * the database          - the concern vocabulary, approved partner
 *                             services, active clinical standards, ethics
 *                             guidelines and the assessment question banks.
 *
 * Website sources are read from the live web workspace when it is present
 * (development, CI, tests) and from a committed snapshot when it is not (the
 * API is deployed on its own, with no `web/` beside it). `npm run
 * sync:knowledge` refreshes the snapshot, so the deployed corpus is one
 * committed file away from the code it describes rather than a manual edit
 * that drifts.
 *
 * Every builder is failure-tolerant: a source that cannot be computed is
 * reported as a warning and left alone, never silently emptied. Sync only
 * deletes documents whose source it successfully computed and no longer
 * produces.
 */

/**
 * The database is imported on first use rather than at module load, so this
 * file can be imported by a script that only wants the filesystem sources
 * without first having to satisfy `env.js`.
 */
let dbModule = null;
async function dbQuery(sql) {
  if (!dbModule) dbModule = import("../db/index.js");
  const { query } = await dbModule;
  return query(sql);
}

const here = path.dirname(fileURLToPath(import.meta.url));

export const KNOWLEDGE_DIR = path.join(here, "..", "knowledge");
export const WEBSITE_SNAPSHOT_DIR = path.join(KNOWLEDGE_DIR, "website");

/** The Next.js workspace, when this checkout has one. */
export const WEB_DIR =
  process.env.WEB_DIR || path.resolve(here, "..", "..", "..", "web");

/** Sources built from this repository. Only these are ever removed by sync. */
export const MANAGED_PREFIXES = ["knowledge:", "website:", "dataset:"];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * TypeScript literal helpers
 * ------------------------------------------------------------------ */

function unescapeString(value) {
  return String(value ?? "").replace(/\\(.)/g, (match, char) =>
    char === "n" ? "\n" : char === "t" ? "\t" : char
  );
}

/** Reads `name: "value"` out of an object literal block. */
function readQuoted(block, name) {
  const match = new RegExp(`\\b${name}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(block);
  return match ? unescapeString(match[1]) : null;
}

/** Reads `name: [ "a", "b" ]` out of an object literal block. */
function readStringArray(block, name) {
  const match = new RegExp(`\\b${name}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m").exec(block);
  if (!match) return [];
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescapeString(m[1]));
}

/** Returns the balanced `[…]` or `{…}` span that starts at `openIndex`. */
function balancedSlice(text, openIndex) {
  const open = text[openIndex];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      // Skip the string so a bracket in copy cannot confuse the count.
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return null;
}

/** Splits an array literal's body into its top-level element literals. */
function splitElements(body) {
  const elements = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === '"') {
      i += 1;
      while (i < body.length && body[i] !== '"') i += body[i] === "\\" ? 2 : 1;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      elements.push(body.slice(start, i));
      start = i + 1;
    }
  }

  const tail = body.slice(start);
  if (tail.trim()) elements.push(tail);
  return elements.filter((element) => element.trim());
}

/** Finds `const NAME = [` (or `export const`) and returns its balanced literal. */
function readArrayConstant(source, name) {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*\\[`, "m").exec(
    source
  );
  if (!match) return null;
  return balancedSlice(source, match.index + match[0].length - 1);
}

/** Finds `export const NAME: TYPE = [` and returns its balanced literal. */
function readTypedArrayConstant(source, name) {
  const match = new RegExp(
    `export\\s+const\\s+${name}\\s*:\\s*[A-Za-z0-9_<>\\[\\]\\s|]+?=\\s*\\[`,
    "m"
  ).exec(source);
  if (!match) return null;
  return balancedSlice(source, match.index + match[0].length - 1);
}

/* ------------------------------------------------------------------ *
 * Prose extraction
 * ------------------------------------------------------------------ */

const PROSE_EXCLUDE = /var\(--|className|href\s*=|https?:\/\/|\bpx\)|\brem\)|\bvw\)|\bvh\)/;
const PROSE_LEAD = /^[/.@#-]|^[a-z-]+:/;
/**
 * Punctuation a sentence has and a Tailwind class list does not. A class list
 * like `sm:leading-[1.07]` contains a full stop, but never one followed by a
 * space, so this rejects it while keeping "how you have been feeling, and
 * what you are looking for."
 */
const SENTENCE_PUNCTUATION = /[.!?](?:\s|$)|,\s|\u2014|\u2013/;
/** Brackets mean an arbitrary value: `max-w-[44px]`, `[44px]`, `grid-cols-[…]`. */
const HAS_BRACKETS = /[[\]]/;

/**
 * True for a string literal that is copy a visitor reads rather than a class
 * list, a URL or a route. Used only on `.tsx` source, where the two are easy
 * to tell apart by eye and awkward to tell apart by parser.
 */
export function looksLikeProse(value) {
  const text = String(value ?? "").trim();
  if (text.length < 25) return false;
  if (text.split(/\s+/).length < 5) return false;
  if (PROSE_LEAD.test(text)) return false;
  if (PROSE_EXCLUDE.test(text)) return false;
  if (/[{};=]/.test(text)) return false;
  if (HAS_BRACKETS.test(text)) return false;
  if (!SENTENCE_PUNCTUATION.test(text)) return false;
  if (!/[a-z]/i.test(text)) return false;
  return true;
}

/**
 * Pulls the readable copy out of a React file: every string literal long
 * enough to be a sentence, minus the ones that are attributes. JSX comments
 * are stripped first because they read like copy but are not shipped.
 */
export function extractProse(source) {
  const withoutComments = String(source ?? "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

  const seen = new Set();
  const prose = [];

  for (const match of withoutComments.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    const value = unescapeString(match[1]).trim();
    if (!looksLikeProse(value) || seen.has(value)) continue;
    seen.add(value);
    prose.push(value);
  }

  for (const match of withoutComments.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const value = unescapeString(match[1]).trim();
    if (!looksLikeProse(value) || seen.has(value)) continue;
    seen.add(value);
    prose.push(value);
  }

  return prose;
}

/* ------------------------------------------------------------------ *
 * Website sources
 * ------------------------------------------------------------------ */

function portalsMarkdown(source) {
  const literal = readTypedArrayConstant(source, "PORTALS");
  if (!literal) return null;

  const entries = splitElements(literal.slice(1, -1)).map((block) => ({
    key: readQuoted(block, "key"),
    portal: readQuoted(block, "portal") || readQuoted(block, "label"),
    tagline: readQuoted(block, "tagline"),
    description: readQuoted(block, "description"),
    journey: readStringArray(block, "journey"),
    requiresEthics: /\brequiresEthics\s*:\s*true/.test(block),
  }));

  const usable = entries.filter((entry) => entry.portal && entry.description);
  if (usable.length === 0) return null;

  const lines = [
    "# Portals on KINDRED TAP",
    "",
    "Every role signs in to its own portal with its own account and permissions.",
    "",
  ];

  for (const entry of usable) {
    lines.push(`## ${entry.portal}`);
    if (entry.tagline) lines.push("", entry.tagline + ".");
    lines.push("", entry.description);
    if (entry.journey.length > 0) {
      lines.push("", "The journey through this portal:", "");
      for (const step of entry.journey) lines.push(`- ${step}`);
    }
    if (entry.requiresEthics) {
      lines.push(
        "",
        "People working in this portal accept a versioned ethical agreement before they can work."
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function landingMarkdown(source) {
  const emitted = new Set();
  const sections = [];

  const push = (title, items, render) => {
    const lines = items.map(render).filter(Boolean);
    if (lines.length === 0) return;
    for (const line of lines) emitted.add(line);
    sections.push(`## ${title}`, "", ...lines, "");
  };

  const readObjects = (name) => {
    const literal = readArrayConstant(source, name);
    if (!literal) return [];
    return splitElements(literal.slice(1, -1))
      .map((block) => {
        const inner = block.trim().startsWith("{") ? block.trim().slice(1, -1) : block;
        const title = readQuoted(inner, "title") || readQuoted(inner, "label");
        const body = readQuoted(inner, "body") || readQuoted(inner, "description");
        const value = readQuoted(inner, "value");
        if (title || body || value) return { title, body, value };
        const quoted = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
          unescapeString(m[1])
        );
        return quoted.length > 0 ? { title: quoted[0], body: quoted[1] } : null;
      })
      .filter(Boolean);
  };

  const trust = readObjects("TRUST").map((item) => item.title || item.value);
  const steps = readObjects("STEPS");
  const principles = readObjects("PRINCIPLES");
  const prose = extractProse(source);

  if (trust.length === 0 && steps.length === 0 && principles.length === 0 && prose.length === 0) {
    return null;
  }

  const lines = ["# The KINDRED TAP website", ""];

  const usedBodies = new Set([
    ...steps.map((item) => item.body).filter(Boolean),
    ...principles.map((item) => item.body).filter(Boolean),
    ...steps.map((item) => item.title).filter(Boolean),
    ...principles.map((item) => item.title).filter(Boolean),
    ...trust,
  ]);

  // The headline first: it is the sentence that says what this is. Anything
  // the arrays below also say is skipped here rather than printed twice.
  const headline = prose.find(
    (line) => line.split(/\s+/).length <= 14 && !usedBodies.has(line)
  );
  if (headline) {
    emitted.add(headline);
    lines.push(headline, "");
  }

  const inline = (item) => (item.title && item.body ? `**${item.title}.** ${item.body}` : null);

  push("What the platform promises", trust, (item) => `- ${item}`);
  push("How someone gets started", steps, (item) => inline(item) || `- ${item.title}`);
  push("Principles the platform is built on", principles, (item) => inline(item) || `- ${item.title}`);

  const remaining = prose.filter((line) => !emitted.has(line) && !usedBodies.has(line));
  if (remaining.length > 0) {
    sections.push("## What the site says", "", ...remaining.map((line) => `- ${line}`), "");
  }

  lines.push(...sections);
  return lines.join("\n").trim() + "\n";
}

const PORTAL_HINT = "one of the six portals (user, supporter, therapist, clinical advisor, clinical supervisor, collaborative clinic)";

function routeLabel(segments) {
  const meaningful = segments.filter((segment) => !/^\[.+\]$/.test(segment));
  const last = meaningful[meaningful.length - 1] || segments[segments.length - 1] || "home";
  return last
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function routesMarkdown(root) {
  const appDir = path.join(root, "src", "app");
  if (!(await exists(appDir))) return null;

  const routes = [];
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "api" || entry.name.startsWith("_")) continue;
        await walk(full);
      } else if (entry.name === "page.tsx") {
        const relative = path.relative(appDir, path.dirname(full)).split(path.sep).join("/");
        const segments = relative === "." ? [] : relative.split("/");
        const route = "/" + segments.map((s) => s.replace(/^\[(.+)\]$/, ":$1")).join("/");
        routes.push({ route, segments });
      }
    }
  };

  await walk(appDir);
  if (routes.length === 0) return null;
  routes.sort((a, b) => a.route.localeCompare(b.route));

  const publicRoutes = routes.filter((r) => !r.route.startsWith("/portal") && r.route !== "/admin");
  const portalRoutes = routes.filter((r) => r.route.startsWith("/portal"));

  const lines = [
    "# Pages and routes on KINDRED TAP",
    "",
    "Where things live on the website. Use this to tell someone where to go.",
    "",
    "## Public pages",
    "",
    "| Page | Path |",
    "| --- | --- |",
  ];

  for (const route of publicRoutes) {
    const name = route.segments.length === 0 ? "Home" : routeLabel(route.segments);
    lines.push(`| ${name} | \`${route.route}\` |`);
  }

  if (portalRoutes.length > 0) {
    lines.push(
      "",
      "## Portal pages",
      "",
      `Portal pages live under \`/portal/:role/…\`, where \`:role\` is ${PORTAL_HINT}.`,
      "The path after the role is the same for every portal.",
      "",
      "| Feature | Path |",
      "| --- | --- |"
    );
    for (const route of portalRoutes) {
      const rest = route.segments.slice(2); // drop "portal" and "[role]"
      const label = rest.length === 0 ? "Portal home" : routeLabel(rest);
      const target = rest.length === 0 ? "/portal/:role" : `/portal/:role/${rest.join("/")}`;
      lines.push(`| ${label} | \`${target}\` |`);
    }
  }

  lines.push(
    "",
    "## Other areas",
    "",
    "- `/admin` - the administrative panel. Admins sign in separately from portal users.",
    "- `/invite/:code` - an invitation link issued by a clinic or an admin.",
    "- `/verification/pending` and `/verification/rejected` - where a new account waits while an admin reviews it.",
    ""
  );

  return lines.join("\n");
}

async function readWebsiteSources(root = WEB_DIR) {
  const docs = [];
  const warnings = [];
  const failed = [];

  if (!(await exists(path.join(root, "src", "app")))) {
    return { docs: null, warnings: [`web workspace not found at ${root}`], failed: ["website:"] };
  }

  const read = async (relative) => {
    const full = path.join(root, relative.split("/").join(path.sep));
    return (await exists(full)) ? fs.readFile(full, "utf8") : null;
  };

  const portals = portalsMarkdown((await read("src/lib/portals.ts")) || "");
  if (portals) {
    docs.push({ source: "website:portals", title: "Portals", kind: "website", content: portals });
  } else {
    warnings.push("could not read portal metadata from web/src/lib/portals.ts");
    failed.push("website:portals");
  }

  const landing = landingMarkdown((await read("src/app/page.tsx")) || "");
  if (landing) {
    docs.push({ source: "website:landing", title: "Home page", kind: "website", content: landing });
  } else {
    warnings.push("could not read copy from web/src/app/page.tsx");
    failed.push("website:landing");
  }

  try {
    const routes = await routesMarkdown(root);
    if (routes) {
      docs.push({ source: "website:routes", title: "Pages and routes", kind: "website", content: routes });
    } else {
      warnings.push("no pages found under web/src/app");
      failed.push("website:routes");
    }
  } catch (err) {
    warnings.push(`could not enumerate routes: ${err?.message ?? err}`);
    failed.push("website:routes");
  }

  return { docs, warnings, failed };
}

/** The committed stand-in for the web workspace, for deployments without it. */
async function readWebsiteSnapshot() {
  if (!(await exists(WEBSITE_SNAPSHOT_DIR))) return { docs: [], warnings: [], failed: [] };

  const docs = [];
  for (const name of (await fs.readdir(WEBSITE_SNAPSHOT_DIR)).sort()) {
    if (!name.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(WEBSITE_SNAPSHOT_DIR, name), "utf8");
    const key = name.replace(/\.md$/, "");
    const title = /^#\s+(.*)$/m.exec(raw)?.[1]?.trim() || key;
    docs.push({ source: `website:${key}`, title, kind: "website", content: raw });
  }
  return { docs, warnings: [], failed: [] };
}

/**
 * Website documents: live extraction when the web workspace is here, the
 * committed snapshot when it is not.
 */
export async function collectWebsiteSources(root = WEB_DIR) {
  const live = await readWebsiteSources(root);
  if (live.docs !== null && live.docs.length > 0) return live;
  if (live.docs !== null && live.docs.length === 0 && live.warnings.length === 0) {
    return { docs: [], warnings: [], failed: [] };
  }
  return readWebsiteSnapshot();
}

/* ------------------------------------------------------------------ *
 * Dataset sources
 * ------------------------------------------------------------------ */

/**
 * Only tables whose contents are product vocabulary or published policy are
 * indexed. No table holding a person is on this list, so the corpus cannot
 * leak an account by being queried cleverly.
 */
const DATASETS = [
  {
    source: "dataset:issues",
    title: "Concerns KINDRED TAP supports",
    table: "issues",
    where: "active = true",
    order: "position, label",
    heading: "label",
    select: ["key", "label", "description"],
  },
  {
    source: "dataset:partner-services",
    title: "Partner services",
    table: "partner_services",
    where: "marketing_status = 'approved'",
    order: "category, name",
    heading: "name",
    select: ["name", "category", "description", "availability", "eligibility", "marketing_summary", "marketing_body", "referral_method", "price_minor", "price_currency"],
  },
  {
    source: "dataset:clinical-standards",
    title: "Clinical standards",
    table: "clinical_standards",
    where: "status = 'active'",
    order: "category, title",
    heading: "title",
    select: ["title", "key", "description", "category", "version", "status"],
  },
  {
    source: "dataset:ethics-guidelines",
    title: "Ethics guidelines",
    table: "ethics_guidelines",
    where: "status = 'active'",
    order: "category, title",
    heading: "title",
    select: ["title", "key", "description", "category", "version", "applicable_roles"],
  },
  {
    source: "dataset:assessment-questions",
    title: "Assessment questions",
    table: "assessment_questions",
    where: "active = true",
    order: "test_number, position",
    heading: "prompt",
    select: ["prompt", "question_type", "category", "test_number", "options"],
  },
  {
    source: "dataset:personality-questions",
    title: "Personality questions",
    table: "personality_questions",
    where: "active = true",
    order: "position",
    heading: "prompt",
    select: ["prompt", "hint", "trait", "reverse"],
  },
];

const LABELS = {
  key: "Key",
  label: "Label",
  description: "Description",
  name: "Name",
  category: "Category",
  availability: "Availability",
  eligibility: "Eligibility",
  marketing_summary: "Summary",
  marketing_body: "Detail",
  referral_method: "How to refer",
  price_minor: "Price",
  price_currency: "Currency",
  title: "Title",
  version: "Version",
  status: "Status",
  applicable_roles: "Applies to",
  prompt: "Question",
  question_type: "Type",
  options: "Options",
  test_number: "Test",
  hint: "Hint",
  trait: "Trait",
  reverse: "Reverse scored",
};

function formatValue(column, value) {
  if (value === null || value === undefined || value === "") return null;
  if (column === "price_minor") {
    const major = Number(value) / 100;
    return Number.isFinite(major) ? major.toFixed(2) : null;
  }
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

async function buildDatasetDocument(dataset) {
  const columns = dataset.select.join(", ");
  const sql = `SELECT ${columns} FROM ${dataset.table} WHERE ${dataset.where} ORDER BY ${dataset.order}`;
  const { rows } = await dbQuery(sql);

  if (rows.length === 0) return null;

  const lines = [`# ${dataset.title}`, "", `${rows.length} entries.`, ""];

  for (const row of rows) {
    const heading = String(row[dataset.heading] ?? "").trim();
    if (heading) lines.push(`## ${heading}`);
    for (const column of dataset.select) {
      if (column === dataset.heading) continue;
      const value = formatValue(column, row[column]);
      if (!value) continue;
      lines.push(`- **${LABELS[column] ?? column}:** ${value}`);
    }
    lines.push("");
  }

  return {
    source: dataset.source,
    title: dataset.title,
    kind: "dataset",
    content: lines.join("\n"),
  };
}

/** Product vocabulary from the database. Missing or empty tables are warnings. */
export async function collectDatasetSources() {
  const docs = [];
  const warnings = [];
  const failed = [];

  for (const dataset of DATASETS) {
    try {
      const doc = await buildDatasetDocument(dataset);
      if (doc) docs.push(doc);
      else warnings.push(`${dataset.table} is empty`);
    } catch (err) {
      warnings.push(`${dataset.table}: ${err?.message ?? err}`);
      failed.push(dataset.source);
    }
  }

  return { docs, warnings, failed };
}

/* ------------------------------------------------------------------ *
 * Collection
 * ------------------------------------------------------------------ */

/**
 * The curated documentation folder. Read directly rather than through the
 * RAG service so this module has no import cycle with it.
 */
export async function collectKnowledgeSources(dir = KNOWLEDGE_DIR) {
  if (!(await exists(dir))) return [];

  const docs = [];
  for (const name of (await fs.readdir(dir)).filter((n) => n.endsWith(".md")).sort()) {
    const raw = await fs.readFile(path.join(dir, name), "utf8");
    const title = /^#\s+(.*)$/m.exec(raw)?.[1]?.trim() || name.replace(/\.md$/, "");
    docs.push({ source: `knowledge:${name}`, title, kind: "doc", content: raw });
  }
  return docs;
}

/**
 * Everything Ask Cube may answer from, plus anything it failed to build.
 * Callers delete a managed document only when it is absent here *and* absent
 * from the warnings, so a broken source never erases the last good copy.
 */
export async function collectAllSources({ includeDatasets = true, knowledgeDir = KNOWLEDGE_DIR, webDir = WEB_DIR } = {}) {
  const docs = [];
  const warnings = [];
  const failed = [];

  docs.push(...(await collectKnowledgeSources(knowledgeDir)));

  const website = await collectWebsiteSources(webDir);
  docs.push(...website.docs);
  warnings.push(...website.warnings);
  failed.push(...website.failed);

  if (includeDatasets) {
    const datasets = await collectDatasetSources();
    docs.push(...datasets.docs);
    warnings.push(...datasets.warnings);
    failed.push(...datasets.failed);
  }

  return { docs, warnings, failed };
}

/** True when a stored source belongs to this module and may be retired by sync. */
export function isManagedSource(source) {
  return MANAGED_PREFIXES.some((prefix) => String(source ?? "").startsWith(prefix));
}
