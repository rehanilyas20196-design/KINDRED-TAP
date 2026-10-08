import bcrypt from "bcryptjs";
import { runMigrations } from "./api/src/db/migrate.js";
import { getDriver, transaction, closeDb } from "./api/src/db/index.js";
import { ETHICS_VERSION } from "./api/src/lib/roles.js";

const pw = "Passw0rd123";
const hash = await bcrypt.hash(pw, 10);
await runMigrations();
await getDriver();
const list = [
  ["supporter.test@kindredtap.test", "supporter", "Test Supporter"],
  ["advisor.test@kindredtap.test", "clinical_advisor", "Test Advisor"],
  ["supervisor.test@kindredtap.test", "clinical_supervisor", "Test Supervisor"],
  ["clinic.test@kindredtap.test", "collaborative_clinic", "Test Clinic"],
  ["therapist.test@kindredtap.test", "therapist", "Test Therapist"],
];
await transaction(async (tx) => {
  for (const a of list) {
    await tx.query(
      "INSERT INTO users (email,password_hash,full_name,role,status,terms_accepted_at,ethics_agreed_at,ethics_version,ethics_accepted,onboarded_at,test_completed) VALUES ($1,$2,$3,$4,'active',now(),now(),$5,true,now(),true) ON CONFLICT (lower(email)) DO UPDATE SET full_name=$3,role=$4,status='active',ethics_accepted=true,test_completed=true,updated_at=now()",
      [a[0], hash, a[2], a[1], ETHICS_VERSION]
    );
  }
});
await closeDb();
console.log("ok");
process.exit(0);
