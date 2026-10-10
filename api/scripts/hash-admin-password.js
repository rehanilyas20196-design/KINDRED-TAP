/**
 * Prints a bcrypt hash for the admin password.
 *
 * Usage:
 *   npm run admin:hash --workspace api -- "choose a long password"
 *   npm run admin:hash --workspace api -- "choose a long password" you@example.com
 *
 * With an email it prints the whole statement, ready to paste into the
 * database, so the hash never has to be copied by hand - which is how a hash
 * ends up truncated and the login ends up answering 500.
 *
 * Without one it prints just the hash, for putting in the environment as
 * ADMIN_PASSWORD_HASH. Prefer that over ADMIN_PASSWORD, which is stored in
 * plain text and only meant for local development.
 */
import bcrypt from "bcryptjs";

const [password, email] = process.argv.slice(2);

if (!password) {
  console.error('Usage: npm run admin:hash --workspace api -- "choose a long password"');
  process.exit(1);
}

if (password.length < 12) {
  console.error("Use at least 12 characters for the admin password.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

// A bcrypt hash is 60 characters and always starts with a cost prefix. If that
// is not what came out, nothing downstream can use it.
if (!/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(hash)) {
  console.error("Generated hash is malformed, not printing it:", hash);
  process.exit(1);
}

if (!email) {
  console.log(hash);
  process.exit(0);
}

if (!email.includes("@")) {
  console.error("The second argument must be an email address.");
  process.exit(1);
}

console.log(
  [
    "-- Run this against the database the API uses (Supabase SQL editor):",
    "",
    "INSERT INTO admin_accounts (email, password_hash, is_active)",
    `VALUES ('${email.replace(/'/g, "''")}', '${hash}', true)`,
    "ON CONFLICT (lower(email)) DO UPDATE",
    "  SET password_hash = EXCLUDED.password_hash,",
    "      is_active = true;",
    "",
  ].join("\n")
);
