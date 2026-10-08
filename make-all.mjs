import bcrypt from "bcryptjs";
import { runMigrations } from "./api/src/db/migrate.js";
import { getDriver, transaction, closeDb } from "./api/src/db/index.js";
import { ETHICS_VERSION } from "./api/src/lib/roles.js";

const pw = "Passw0rd123";
const hash = await bcrypt.hash(pw, 10);

await runMigrations();
await getDriver();

await transaction(async (tx) => {
  const accounts = [
    {
      email: "supporter.test@kindredtap.test",
      role: "supporter",
      full: "Test Supporter",
      table: "supporter_profiles",
      fields: [
        "phone",
        "date_of_birth",
        "gender",
        "pronouns",
        "city",
        "country",
        "preferred_language",
        "lived_experience_domains",
        "support_areas",
        "training_level",
        "years_experience",
        "availability_hours_per_week",
        "bio",
        "consented_to_moderation",
        "consented_to_data_sharing",
        "consented_to_practice",
      ],
      values: [
        "+44 7000 000100",
        "1990-01-01",
        "non_binary",
        "they/them",
        "London",
        "United Kingdom",
        "English",
        JSON.stringify(["anxiety"]),
        JSON.stringify(["active_listening"]),
        "peer",
        2,
        5,
        "Testing supporter flow",
        true,
        true,
        true,
      ],
    },
    {
      email: "therapist.test@kindredtap.test",
      role: "therapist",
      full: "Test Therapist",
      table: "therapist_profiles",
      fields: [
        "phone",
        "discipline",
        "registration_number",
        "registration_body",
        "registration_country",
        "clinical_areas",
        "modalities",
        "languages",
        "years_experience",
        "session_modes",
        "session_fee",
        "currency",
        "availability_hours_per_week",
        "bio",
        "accepting_new_cases",
        "registration_verified",
        "professional_indemnity",
        "supervision_experience",
        "consented_to_practice",
        "consented_to_data_sharing",
      ],
      values: [
        "+44 7000 000200",
        "Psychotherapist",
        "TEST-001",
        "Test Board",
        "United Kingdom",
        JSON.stringify(["anxiety"]),
        JSON.stringify(["cbt"]),
        JSON.stringify(["English"]),
        5,
        JSON.stringify(["video"]),
        70,
        "GBP",
        15,
        "Testing therapist flow",
        true,
        true,
        true,
        true,
        true,
        true,
      ],
    },
    {
      email: "advisor.test@kindredtap.test",
      role: "clinical_advisor",
      full: "Test Advisor",
      table: "clinical_advisor_profiles",
      fields: [
        "phone",
        "discipline",
        "registration_number",
        "registration_body",
        "clinical_areas",
        "languages",
        "years_experience",
        "supervision_capacity_per_week",
        "bio",
        "consented_to_practice",
        "consented_to_data_sharing",
      ],
      values: [
        "+44 7000 000300",
        "Clinical Psychologist",
        "ADV-001",
        "HCPC",
        JSON.stringify(["ethics"]),
        JSON.stringify(["English"]),
        10,
        4,
        "Testing advisor flow",
        true,
        true,
      ],
    },
    {
      email: "supervisor.test@kindredtap.test",
      role: "clinical_supervisor",
      full: "Test Supervisor",
      table: "clinical_supervisor_profiles",
      fields: [
        "phone",
        "discipline",
        "registration_number",
        "registration_body",
        "clinical_areas",
        "languages",
        "years_experience",
        "supervision_capacity_per_week",
        "bio",
        "consented_to_practice",
        "consented_to_data_sharing",
      ],
      values: [
        "+44 7000 000400",
        "Clinical Psychologist",
        "SUP-001",
        "HCPC",
        JSON.stringify(["supervision"]),
        JSON.stringify(["English"]),
        12,
        6,
        "Testing supervisor flow",
        true,
        true,
      ],
    },
    {
      email: "clinic.test@kindredtap.test",
      role: "collaborative_clinic",
      full: "Test Clinic",
      table: "collaborative_clinic_profiles",
      fields: [
        "organization_name",
        "organization_type",
        "contact_name",
        "contact_email",
        "contact_phone",
        "clinic_specialisms",
        "services_offered",
        "accepts_referrals",
        "sends_referrals",
        "billing_currency",
        "years_operating",
        "bio",
        "consented_to_practice",
        "consented_to_data_sharing",
      ],
      values: [
        "Test Clinic",
        "private_clinic",
        "Clinic Lead",
        "clinic.lead@kindredtap.test",
        "+44 7000 000500",
        JSON.stringify(["anxiety"]),
        JSON.stringify(["therapy"]),
        true,
        false,
        "GBP",
        5,
        "Testing clinic flow",
        true,
        true,
      ],
    },
  ];

  for (const a of accounts) {
    const r = await tx.query(
      "INSERT INTO users (email,password_hash,full_name,role,status,terms_accepted_at,ethics_agreed_at,ethics_version,ethics_accepted,onboarded_at,test_completed) VALUES ($1,$2,$3,$4,'active',now(),now(),$5,true,now(),true) ON CONFLICT (lower(email)) DO UPDATE SET full_name=$3, role=$4, status='active', ethics_accepted=true, test_completed=true, updated_at=now() RETURNING id",
      [a.email, hash, a.full, a.role, ETHICS_VERSION]
    );
    const id = r.rows[0].id;
    const placeholders = a.fields.map((_, i) => `$${i + 2}`).join(",");
    const cols = a.fields.join(",");
    const sql = `INSERT INTO ${a.table} (user_id,${cols}) VALUES ($1,${placeholders}) ON CONFLICT (user_id) DO UPDATE SET updated_at=now()`;
    await tx.query(sql, [id, ...a.values]);
  }
});

await closeDb();
console.log("done");
process.exit(0);
