/**
 * Prints a bcrypt hash for the admin password.
 *
 * Usage:
 *   npm run admin:hash --workspace api -- "choose a long password"
 *
 * Paste the output into the repo-root .env as ADMIN_PASSWORD_HASH next to
 * ADMIN_EMAIL. Prefer that over ADMIN_PASSWORD, which is stored in plain text
 * and only meant for local development.
 */
import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run admin:hash --workspace api -- "choose a long password"');
  process.exit(1);
}

if (password.length < 12) {
  console.error("Use at least 12 characters for the admin password.");
  process.exit(1);
}

console.log(await bcrypt.hash(password, 10));
