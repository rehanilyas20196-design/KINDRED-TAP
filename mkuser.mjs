import bcrypt from "bcryptjs";
import { runMigrations } from "./api/src/db/migrate.js";
import { getDriver, transaction, closeDb } from "./api/src/db/index.js";
import { ETHICS_VERSION } from "./api/src/lib/roles.js";

const email = "user.test@kindredtap.test";
const pw = "Passw0rd123";

await runMigrations();
await getDriver();
const hash = await bcrypt.hash(pw, 10);
await transaction(async (tx) => {
  const r = await tx.query(
    "INSERT INTO users (email,password_hash,full_name,role,status,terms_accepted_at,ethics_agreed_at,ethics_version,ethics_accepted,onboarded_at,test_completed) VALUES ($1,$2,'Test User','user','active',now(),now(),$3,true,now(),true) ON CONFLICT (lower(email)) DO UPDATE SET status='active', role='user', test_completed=true, ethics_accepted=true, updated_at=now() RETURNING id",
    [email, hash, ETHICS_VERSION]
  );
  const id = r.rows[0].id;
  await tx.query(
    "INSERT INTO user_profiles (user_id,what_brought_you_here,feeling_domains,preferred_contact_method,preferred_language,current_support_status,consented_to_matching,consented_to_data_sharing,consented_to_practice,updated_at) VALUES ($1,'testing',$2::jsonb,'app messaging','English','seeking_support',true,true,true,now()) ON CONFLICT (user_id) DO NOTHING",
    [id, JSON.stringify(["anxiety"])]
  );
});
console.log(email, pw);
await closeDb();
process.exit(0);
