import bcrypt from "bcryptjs";
import { query, transaction, closeDb, runMigrations, getDriver } from "./api/src/db/index.js";
import { ETHICS_VERSION } from "./api/src/lib/roles.js";

const email = "user.test@kindredtap.test";
const pw = "Passw0rd123";

await runMigrations();
await getDriver();

const hash = await bcrypt.hash(pw, 10);

await transaction(async (tx) => {
  const { rows } = await tx.query(
    `INSERT INTO users (
       email, password_hash, full_name, role, status,
       terms_accepted_at, ethics_agreed_at, ethics_version, ethics_accepted,
       onboarded_at, test_completed
     )
     VALUES ($1, $2, 'Test User', 'user', 'active', now(), now(), $3, true, now(), true)
     ON CONFLICT (lower(email)) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           role = 'user',
           status = 'active',
           ethics_agreed_at = now(),
           ethics_version = EXCLUDED.ethics_version,
           ethics_accepted = true,
           onboarded_at = now(),
           test_completed = true,
           updated_at = now()
     RETURNING id`,
    [email, hash, ETHICS_VERSION]
  );
  const id = rows[0].id;
  await tx.query(
    `INSERT INTO user_profiles (
       user_id, phone, what_brought_you_here, feeling_domains, preferred_contact_method,
       preferred_language, current_support_status, consented_to_matching, consented_to_data_sharing,
       consented_to_practice, updated_at
     )
     VALUES ($1, '+44 7000 000000', 'Testing the messaging flow', $2::jsonb, 'app messaging',
       'English', 'seeking_support', true, true, true, now())
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
    [id, JSON.stringify(["anxiety"])]
  );
});

console.log("user:", email, pw);
await closeDb();
process.exit(0);
