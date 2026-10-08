import bcrypt from "bcryptjs";
import { runMigrations } from "./api/src/db/migrate.js";
import { getDriver, transaction, closeDb } from "./api/src/db/index.js";
import { ETHICS_VERSION } from "./api/src/lib/roles.js";

const pw = "Passw0rd123";
const hash = await bcrypt.hash(pw, 10);
await runMigrations();
await getDriver();
const a = ["user.test@kindredtap.test", "user", "Test User"];
await transaction(async (tx) => {
  await tx.query(
    "INSERT INTO users (email,password_hash,full_name,role,status,terms_accepted_at,ethics_agreed_at,ethics_version,ethics_accepted,onboarded_at,test_completed) VALUES ($1,$2,$3,$4,'active',now(),now(),$5,true,now(),true) ON CONFLICT (lower(email)) DO UPDATE SET full_name=$3,role=$4,status='active',ethics_accepted=true,test_completed=true,updated_at=now()",
    [a[0], hash, a[2], a[1], ETHICS_VERSION]
  );
  await tx.query(
    "INSERT INTO user_profiles (user_id,what_brought_you_here,feeling_domains,preferred_contact_method,preferred_language,current_support_status,consented_to_matching) SELECT id,'testing',$2::jsonb,'app messaging','English','seeking_support',true FROM users WHERE lower(email)=lower($1) ON CONFLICT (user_id) DO UPDATE SET updated_at=now()",
    [a[0], JSON.stringify(["anxiety"])]
  );
});
await closeDb();
console.log("done");
process.exit(0);
