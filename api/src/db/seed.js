import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { closeDb, getDriver, query, queryOne, transaction } from "./index.js";
import { runMigrations } from "./migrate.js";
import { PERSONALITY_QUESTIONS } from "../data/personalityQuestions.js";
import { ASSESSMENT_QUESTIONS, DEFAULT_ISSUES } from "../data/clinicalAssessmentQuestions.js";
import { ETHICS_VERSION } from "../lib/roles.js";
import { DEFAULT_ADVISOR_PERMISSIONS, grantDefaultPermissions } from "../lib/permissions.js";
import { grantDefaultClinicPermissions } from "../lib/clinic.js";
import { env } from "../env.js";

/**
 * Idempotent seed for the personality questions. Safe to run on every boot.
 */
export async function seedQuestions() {
  let inserted = 0;

  for (const q of PERSONALITY_QUESTIONS) {
    const { rowCount } = await query(
      `INSERT INTO personality_questions (position, prompt, hint, trait, reverse, active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (position) DO UPDATE
          SET prompt = EXCLUDED.prompt,
              hint = EXCLUDED.hint,
              trait = EXCLUDED.trait,
              reverse = EXCLUDED.reverse,
              active = true`,
      [q.position, q.prompt, q.hint, q.trait, q.reverse]
    );
    if (rowCount) inserted += 1;
  }

  const { rows } = await query("SELECT count(*)::int AS total FROM personality_questions");
  console.log(`[seed] personality questions ready (${rows[0].total} total, ${inserted} touched)`);
  return rows[0].total;
}

/** Housekeeping: drop sessions that have already expired. */
export async function pruneTokens() {
  const { rowCount } = await query("DELETE FROM auth_tokens WHERE expires_at <= now()");
  if (rowCount) console.log(`[seed] pruned ${rowCount} expired session(s)`);
}

/* ------------------------------------------------------------------ */
/* Concern assessment reference data                                    */
/* ------------------------------------------------------------------ */

/**
 * The configurable concern vocabulary.
 *
 * Idempotent by `key`, and upserting the label and description means an
 * existing database picks up improved wording. Re-seeding never reorders
 * categories somebody has since customised.
 */
export async function seedIssues() {
  for (const [index, issue] of DEFAULT_ISSUES.entries()) {
    await query(
      `INSERT INTO issues (key, label, description, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE
          SET label       = EXCLUDED.label,
              description = EXCLUDED.description`,
      [issue.key, issue.label, issue.description, index + 1]
    );
  }

  const { rows } = await query("SELECT count(*)::int AS total FROM issues WHERE active = true");
  console.log(`[seed] issue categories ready (${rows[0].total} active)`);
  return rows[0].total;
}

/**
 * Assessment questions, upserted by `position`.
 *
 * `category` is checked against `issues.key` here rather than trusted: a
 * question pointing at a category that does not exist would silently never
 * vote during scoring, which is a hard bug to notice from the UI.
 */
export async function seedAssessmentQuestions() {
  let skipped = 0;

  for (const question of ASSESSMENT_QUESTIONS) {
    if (question.category) {
      const known = await queryOne("SELECT id FROM issues WHERE key = $1 AND active = true", [
        question.category,
      ]);
      if (!known) {
        skipped += 1;
        continue;
      }
    }

    await query(
      `INSERT INTO assessment_questions (
         position, test_number, category, prompt, question_type, options,
         required, active, scoring_config
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
       ON CONFLICT (position) DO UPDATE
          SET test_number    = EXCLUDED.test_number,
              category        = EXCLUDED.category,
              prompt          = EXCLUDED.prompt,
              question_type   = EXCLUDED.question_type,
              options         = EXCLUDED.options,
              required        = EXCLUDED.required,
              active          = true,
              scoring_config  = EXCLUDED.scoring_config`,
      [
        question.position,
        question.testNumber,
        question.category,
        question.prompt,
        question.questionType,
        question.options ? JSON.stringify(question.options) : null,
        question.required,
        question.active,
        JSON.stringify(question.scoringConfig ?? {}),
      ]
    );
  }

  const { rows } = await query(
    `SELECT test_number, count(*)::int AS total
       FROM assessment_questions
      WHERE active = true
      GROUP BY test_number
      ORDER BY test_number`
  );
  const shape = rows.map((r) => `test ${r.test_number}: ${r.total}`).join(", ");
  console.log(`[seed] assessment questions ready (${shape})`);
  if (skipped) console.log(`[seed] skipped ${skipped} question(s) with an unknown category`);
  return shape;
}

/* ------------------------------------------------------------------ */
/* Demo therapist                                                       */
/* ------------------------------------------------------------------ */

/**
 * One therapist so the directory and the messaging flow have something real in
 * them to exercise. Without this the directory renders empty and there is no
 * second person to reply, which makes both impossible to check by hand.
 *
 * Development only. A known password must never exist in a real database, so
 * this is skipped in production no matter what is asked for.
 */
export const DEMO_THERAPIST = {
  email: "dr.okafor@kindredtap.test",
  password: "Passw0rd123",
  fullName: "Dr Amara Okafor",
};

const DEMO_THERAPIST_PROFILE = {
  discipline: "Clinical Psychologist",
  registrationNumber: "HCPC PYL29481",
  registrationBody: "HCPC",
  registrationCountry: "United Kingdom",
  clinicalAreas: ["anxiety", "depression", "burnout", "life transitions"],
  modalities: ["cbt", "act", "mindfulness"],
  qualifications: ["DClinPsy, University of Edinburgh", "BSc Psychology, University of Bristol"],
  languages: ["English", "Igbo"],
  yearsExperience: 12,
  sessionModes: ["video", "audio"],
  sessionFee: 85,
  currency: "GBP",
  availabilityHoursPerWeek: 20,
  bio:
    "I work mostly with people who are holding a lot together on the outside while feeling like they are coming apart underneath. " +
    "Most of what we do together is about slowing things down enough to name what is actually going on, then building " +
    "something that survives a bad week.",
  acceptingNewCases: true,
  registrationVerified: true,
  professionalIndemnity: true,
  supervisionExperience: true,
  /**
   * Keys from the issues table, not free text.
   *
   * This is what makes the demo therapist findable: matching joins on these, so
   * a key here that does not exist in `issues` would be ignored and the person
   * would silently vanish from every result.
   */
  specialties: ["ANXIETY", "STRESS", "DEPRESSION", "EMOTIONAL_REGULATION", "SELF_ESTEEM"],
};

export async function seedDemoTherapist() {
  if (env.nodeEnv === "production") {
    console.log("[seed] skipping demo therapist (production)");
    return null;
  }

  const passwordHash = await bcrypt.hash(DEMO_THERAPIST.password, 10);

  const therapistId = await transaction(async (tx) => {
    // Uniqueness lives on (lower(email), role), so the conflict target has
    // to name the same columns the index was built on. Re-running this seed
    // refreshes the demo account instead of failing on the second pass.
    const { rows } = await tx.query(
      `INSERT INTO users (
         email, password_hash, full_name, role, status,
         terms_accepted_at, ethics_agreed_at, ethics_version, ethics_accepted,
         onboarded_at
       )
       VALUES ($1, $2, $3, 'therapist', 'active', now(), now(), $4, true, now())
       ON CONFLICT (lower(email)) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             role = 'therapist',
             status = 'active',
             ethics_agreed_at = now(),
             ethics_version = EXCLUDED.ethics_version,
             ethics_accepted = true,
             updated_at = now()
       RETURNING id`,
      [DEMO_THERAPIST.email, passwordHash, DEMO_THERAPIST.fullName, ETHICS_VERSION]
    );

    const id = rows[0].id;
    const p = DEMO_THERAPIST_PROFILE;

    await tx.query(
      `INSERT INTO therapist_profiles (
         user_id, discipline, registration_number, registration_body,
         registration_country, clinical_areas, modalities, qualifications,
         languages, years_experience, session_modes, session_fee, currency,
         availability_hours_per_week, bio, accepting_new_cases,
         registration_verified, professional_indemnity, supervision_experience,
         consented_to_practice, consented_to_data_sharing, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10,
         $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19, true, true, now()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         discipline = EXCLUDED.discipline,
         registration_number = EXCLUDED.registration_number,
         registration_body = EXCLUDED.registration_body,
         registration_country = EXCLUDED.registration_country,
         clinical_areas = EXCLUDED.clinical_areas,
         modalities = EXCLUDED.modalities,
         qualifications = EXCLUDED.qualifications,
         languages = EXCLUDED.languages,
         years_experience = EXCLUDED.years_experience,
         session_modes = EXCLUDED.session_modes,
         session_fee = EXCLUDED.session_fee,
         currency = EXCLUDED.currency,
         availability_hours_per_week = EXCLUDED.availability_hours_per_week,
         bio = EXCLUDED.bio,
         accepting_new_cases = EXCLUDED.accepting_new_cases,
         registration_verified = EXCLUDED.registration_verified,
         professional_indemnity = EXCLUDED.professional_indemnity,
         supervision_experience = EXCLUDED.supervision_experience,
         consented_to_practice = true,
         consented_to_data_sharing = true,
         updated_at = now()`,
      [
        id,
        p.discipline,
        p.registrationNumber,
        p.registrationBody,
        p.registrationCountry,
        JSON.stringify(p.clinicalAreas),
        JSON.stringify(p.modalities),
        JSON.stringify(p.qualifications),
        JSON.stringify(p.languages),
        p.yearsExperience,
        JSON.stringify(p.sessionModes),
        p.sessionFee,
        p.currency,
        p.availabilityHoursPerWeek,
        p.bio,
        p.acceptingNewCases,
        p.registrationVerified,
        p.professionalIndemnity,
        p.supervisionExperience,
      ]
    );

    // Specialties live in the join table, keyed by issues.key. Replacing them
    // wholesale keeps a re-seed from accumulating duplicates or stale rows.
    const { rows: specialtyIssues } = await tx.query(
      `SELECT id, key FROM issues WHERE key = ANY($1::text[])`,
      [DEMO_THERAPIST_PROFILE.specialties]
    );

    await tx.query("DELETE FROM therapist_specialties WHERE therapist_id = $1", [id]);
    for (const issue of specialtyIssues) {
      await tx.query(
        `INSERT INTO therapist_specialties (therapist_id, issue_id) VALUES ($1, $2)`,
        [id, issue.id]
      );
    }

    const missing = DEMO_THERAPIST_PROFILE.specialties.filter(
      (key) => !specialtyIssues.some((issue) => issue.key === key)
    );
    if (missing.length) {
      console.warn(`[seed] unknown issue keys skipped: ${missing.join(", ")}`);
    }

    return id;
  });

  console.log(
    `[seed] demo therapist ready: ${DEMO_THERAPIST.email} (${DEMO_THERAPIST_PROFILE.specialties.length} specialties)`
  );
  return therapistId;
}

/* ------------------------------------------------------------------ */
/* Demo clinical advisor                                               */
/* ------------------------------------------------------------------ */

/**
 * One clinical advisor so clinical oversight has somebody signed in behind it.
 * Without this the standards, supervision, safety and ethics pages can only be
 * checked as 403s, which proves the guard but never the portal.
 *
 * Development only, like the demo therapist. The account receives the default
 * permission set plus one deliberate extra: `permissions.manage`. That
 * permission is held by nobody by default (see 010 and
 * DEFAULT_ADVISOR_PERMISSIONS), so without this grant the permissions page
 * could never be exercised at all. Granting it here is the deliberate act the
 * permission model asks for.
 */
export const DEMO_ADVISOR = {
  email: "clinical.advisor@kindredtap.test",
  password: "Passw0rd123",
  fullName: "Dr Nadia Rahman",
};

const DEMO_ADVISOR_PROFILE = {
  discipline: "Counselling Psychologist",
  registrationNumber: "HCPC PYL72104",
  registrationBody: "HCPC",
  registrationCountry: "United Kingdom",
  clinicalAreas: ["anxiety", "depression", "trauma"],
  standardsOwned: ["safety-escalation", "confidentiality", "documentation"],
  languages: ["English", "Urdu"],
  yearsExperience: 18,
  yearsSupervising: 12,
  supervisionModes: ["individual", "group"],
  maxSupervisees: 12,
  consultationDays: ["monday", "wednesday", "friday"],
  qualifications: ["DCounPsy, University of Manchester", "BSc (Hons) Psychology, University of Leeds"],
  bio:
    "I look after the clinical side of the clinic: the standards we hold ourselves to, supervision for the team, " +
    "and the safety queue. If something has gone wrong or might, it reaches me first.",
};

export async function seedDemoClinicalAdvisor() {
  if (env.nodeEnv === "production") {
    console.log("[seed] skipping demo clinical advisor (production)");
    return null;
  }

  const passwordHash = await bcrypt.hash(DEMO_ADVISOR.password, 10);

  const advisorId = await transaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO users (
         email, password_hash, full_name, role, status,
         terms_accepted_at, ethics_agreed_at, ethics_version, ethics_accepted,
         onboarded_at
       )
       VALUES ($1, $2, $3, 'clinical_advisor', 'active', now(), now(), $4, true, now())
       ON CONFLICT (lower(email)) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             role = 'clinical_advisor',
             status = 'active',
             ethics_agreed_at = now(),
             ethics_version = EXCLUDED.ethics_version,
             ethics_accepted = true,
             updated_at = now()
       RETURNING id`,
      [DEMO_ADVISOR.email, passwordHash, DEMO_ADVISOR.fullName, ETHICS_VERSION]
    );

    const id = rows[0].id;
    const p = DEMO_ADVISOR_PROFILE;

    await tx.query(
      `INSERT INTO clinical_advisor_profiles (
         user_id, discipline, registration_number, registration_body,
         registration_country, clinical_areas, standards_owned,
         ethical_guidelines_owned, languages, years_experience,
         years_supervising, supervision_modes, max_supervisees,
         consultation_days, qualifications, bio, consented_to_practice,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true, $8::jsonb, $9,
         $10, $11::jsonb, $12, $13::jsonb, $14::jsonb, $15, true, now()
       )
       ON CONFLICT (user_id) DO UPDATE SET
         discipline = EXCLUDED.discipline,
         registration_number = EXCLUDED.registration_number,
         registration_body = EXCLUDED.registration_body,
         registration_country = EXCLUDED.registration_country,
         clinical_areas = EXCLUDED.clinical_areas,
         standards_owned = EXCLUDED.standards_owned,
         languages = EXCLUDED.languages,
         years_experience = EXCLUDED.years_experience,
         years_supervising = EXCLUDED.years_supervising,
         supervision_modes = EXCLUDED.supervision_modes,
         max_supervisees = EXCLUDED.max_supervisees,
         consultation_days = EXCLUDED.consultation_days,
         qualifications = EXCLUDED.qualifications,
         bio = EXCLUDED.bio,
         consented_to_practice = true,
         updated_at = now()`,
      [
        id,
        p.discipline,
        p.registrationNumber,
        p.registrationBody,
        p.registrationCountry,
        JSON.stringify(p.clinicalAreas),
        JSON.stringify(p.standardsOwned),
        JSON.stringify(p.languages),
        p.yearsExperience,
        p.yearsSupervising,
        JSON.stringify(p.supervisionModes),
        p.maxSupervisees,
        JSON.stringify(p.consultationDays),
        JSON.stringify(p.qualifications),
        p.bio,
      ]
    );

    return id;
  });

  // Default set first (idempotent), then the one deliberate grant above.
  await grantDefaultPermissions(advisorId, null);
  await query(
    `INSERT INTO advisor_permissions (user_id, permission)
     VALUES ($1, 'permissions.manage')
     ON CONFLICT DO NOTHING`,
    [advisorId]
  );

  console.log(
    `[seed] demo clinical advisor ready: ${DEMO_ADVISOR.email} (${DEFAULT_ADVISOR_PERMISSIONS.length + 1} permissions)`
  );
  return advisorId;
}

/* ------------------------------------------------------------------ */
/* Collaborative clinic: services and a demo partner                   */
/* ------------------------------------------------------------------ */

/**
 * The service catalogue partners may refer into and promote.
 *
 * Deliberately built from `OPTIONS.marketingServices` in lib/roles.js rather
 * than a new list, so the portal offers the platform's own services and cannot
 * drift away from them. Prices and commission rates are in minor units and
 * basis points; the seed writes them as integers and the server computes every
 * commission from these rows.
 */
const PARTNER_SERVICES = [
  {
    slug: "mental-health-assessment",
    name: "Mental health assessment",
    category: "assessment",
    description:
      "A structured clinical assessment covering mood, anxiety, sleep and current concerns, delivered by an accredited practitioner.",
    eligibility: "Anyone over 16 seeking a formal picture of what they are experiencing.",
    availability: "available",
    priceMinor: 12_000,
    commissionRateBp: 1_000,
    marketingSummary: "Understand what you are dealing with, with a qualified assessment.",
    marketingBody:
      "Kindred Tap mental health assessments give people a clear, clinician-led picture of what they are experiencing, " +
      "and a recommended route into support. Suitable for adults and young people aged 16 and over.",
  },
  {
    slug: "therapy-adult",
    name: "Therapy (adult)",
    category: "therapy",
    description:
      "One-to-one therapy with a matched therapist, available by video, phone or in person.",
    eligibility: "Adults aged 18 and over.",
    availability: "available",
    priceMinor: 9_500,
    commissionRateBp: 1_200,
    marketingSummary: "One-to-one therapy with a therapist matched to what you are dealing with.",
    marketingBody:
      "Kindred Tap matches adults to therapists with the right experience for what they are facing. " +
      "Sessions are available online, by phone or in person.",
  },
  {
    slug: "therapy-adolescent",
    name: "Therapy (adolescent)",
    category: "therapy",
    description: "Therapy for young people aged 13 to 17, with parental or guardian involvement.",
    eligibility: "Young people aged 13 to 17.",
    availability: "limited",
    priceMinor: 9_500,
    commissionRateBp: 1_200,
    marketingSummary: "Therapy for young people, with the family involved.",
    marketingBody:
      "Support for young people aged 13 to 17, delivered by practitioners experienced in working with adolescents, " +
      "with the family kept involved throughout.",
  },
  {
    slug: "crisis-support",
    name: "Crisis support",
    category: "crisis",
    description:
      "Urgent support when someone is in acute distress, with escalation to a clinician where needed.",
    eligibility: "Open to anyone in acute distress.",
    availability: "available",
    priceMinor: 0,
    commissionRule: "fixed",
    commissionFixedMinor: 4_000,
    marketingSummary: "Urgent support when someone is in acute distress.",
    marketingBody:
      "When someone needs help now, Kindred Tap provides crisis support with a trained practitioner, " +
      "escalating to a clinician where that is the right step.",
  },
  {
    slug: "peer-support",
    name: "Peer support",
    category: "support",
    description: "Lived-experience support matched on what someone has been through.",
    eligibility: "Open to anyone seeking peer support.",
    availability: "available",
    priceMinor: 3_000,
    commissionRateBp: 800,
    marketingSummary: "Support from someone who has been through it themselves.",
    marketingBody:
      "Peer supporters are matched on lived experience rather than credentials, which often makes the first step " +
      "easier for people who are reluctant to seek clinical help.",
  },
  {
    slug: "workplace-wellbeing",
    name: "Workplace wellbeing",
    category: "programme",
    description: "Structured wellbeing support for teams, including check-ins and staff sessions.",
    eligibility: "Organisations of 20 or more employees.",
    availability: "available",
    priceMinor: 45_000,
    commissionRateBp: 600,
    referralMethod: "form",
    marketingSummary: "Mental health support your staff will actually use.",
    marketingBody:
      "Kindred Tap workplace wellbeing combines individual sessions with team check-ins, so your staff have a route " +
      "to support that sits alongside - not instead of - the services you already offer.",
  },
  {
    slug: "substance-use-programme",
    name: "Substance use programme",
    category: "programme",
    description: "A structured programme for substance use, with ongoing support aftercare.",
    eligibility: "Adults aged 18 and over.",
    availability: "waitlist",
    priceMinor: 60_000,
    commissionRateBp: 900,
    marketingSummary: "Structured support for substance use, with aftercare.",
    marketingBody:
      "A structured programme covering assessment, sessions and aftercare, designed for people whose use of substances " +
      "is affecting their mental health.",
  },
];

export async function seedPartnerServices() {
  for (const service of PARTNER_SERVICES) {
    await query(
      `INSERT INTO partner_services
         (slug, name, category, description, availability, eligibility, referral_method,
          price_minor, price_currency, commission_rule, commission_rate_bp,
          commission_fixed_minor, marketing_status, marketing_summary, marketing_body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GBP', $9, $10, $11, 'approved', $12, $13)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             category = EXCLUDED.category,
             description = EXCLUDED.description,
             availability = EXCLUDED.availability,
             eligibility = EXCLUDED.eligibility,
             referral_method = EXCLUDED.referral_method,
             price_minor = EXCLUDED.price_minor,
             commission_rule = EXCLUDED.commission_rule,
             commission_rate_bp = EXCLUDED.commission_rate_bp,
             commission_fixed_minor = EXCLUDED.commission_fixed_minor,
             marketing_summary = EXCLUDED.marketing_summary,
             marketing_body = EXCLUDED.marketing_body,
             updated_at = now()`,
      [
        service.slug,
        service.name,
        service.category,
        service.description,
        service.availability,
        service.eligibility,
        service.referralMethod ?? "portal",
        service.priceMinor,
        service.commissionRule ?? "percentage",
        service.commissionRateBp ?? 0,
        service.commissionFixedMinor ?? 0,
        service.marketingSummary,
        service.marketingBody,
      ]
    );
  }
  console.log(`[seed] partner service catalogue ready (${PARTNER_SERVICES.length} services)`);
}

/**
 * One approved partner clinic, so the referral exchange can be exercised
 * end to end. Development only, like the demo therapist and advisor.
 *
 * The organization row is created explicitly (rather than through
 * `ensurePartnerOrganization`) so the seed can also give it an active
 * partnership and an approved agreement - a partner with no agreement cannot
 * demonstrate any of the commission workflow.
 */
export const DEMO_CLINIC = {
  email: "partner.clinic@kindredtap.test",
  password: "Passw0rd123",
  fullName: "Amara Osei",
  organizationName: "Riverbend Community Wellbeing",
};

export async function seedDemoClinic() {
  if (env.nodeEnv === "production") {
    console.log("[seed] skipping demo collaborative clinic (production)");
    return null;
  }

  const passwordHash = await bcrypt.hash(DEMO_CLINIC.password, 10);

  const clinicId = await transaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO users (
         email, password_hash, full_name, role, status,
         terms_accepted_at, ethics_agreed_at, ethics_version, ethics_accepted, onboarded_at
       )
       VALUES ($1, $2, $3, 'collaborative_clinic', 'active', now(), now(), $4, true, now())
       ON CONFLICT (lower(email)) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             role = 'collaborative_clinic',
             status = 'active',
             ethics_agreed_at = now(),
             ethics_accepted = true,
             updated_at = now()
       RETURNING id`,
      [DEMO_CLINIC.email, passwordHash, DEMO_CLINIC.fullName, ETHICS_VERSION]
    );
    const userId = rows[0].id;

    await tx.query(
      `INSERT INTO collaborative_clinic_profiles (
         user_id, organization_name, organization_type, contact_name, contact_email,
         contact_phone, website, city, country, registration_number,
         clinic_specialisms, services_offered, partnership_models, referral_types,
         accepts_referrals, sends_referrals, marketing_consent, languages,
         years_operating, cqc_or_equivalent_number, billing_currency, bio,
         consented_to_practice, consented_to_data_sharing, updated_at
       )
       VALUES ($1, $2, 'community_organisation', $3, $4, '+44 117 496 0182',
               'https://riverbend.example.org', 'Bristol', 'United Kingdom', 'CQC RB-4471',
               '["Mental health", "Community"]', '["Peer support", "Family work"]',
               '["Referral agreement", "Commission share"]',
               '["Assessment", "Therapy", "Peer support", "Aftercare"]',
               true, true, true, '["English"]', 9, 'RB-4471', 'GBP',
               'A community wellbeing service working with adults and families across Bristol.',
               true, true, now())
       ON CONFLICT (user_id) DO UPDATE
         SET organization_name = EXCLUDED.organization_name,
             marketing_consent = true,
             updated_at = now()`,
      [userId, DEMO_CLINIC.organizationName, DEMO_CLINIC.fullName, DEMO_CLINIC.email]
    );

    const kindred = await tx.query(
      `INSERT INTO partner_organizations (slug, name, kind, status)
       VALUES ('kindred-tap', 'Kindred Tap', 'kindred_tap', 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const kindredId = kindred.rows[0].id;

    const org = await tx.query(
      `INSERT INTO partner_organizations
         (slug, name, kind, organization_type, status, contact_name, contact_email,
          contact_phone, website, city, country, registration_number)
       VALUES ('riverbend-community-wellbeing', $1, 'partner', 'community_organisation', 'active',
               $2, $1, '+44 117 496 0182', 'https://riverbend.example.org',
               'Bristol', 'United Kingdom', 'CQC RB-4471')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [DEMO_CLINIC.organizationName, DEMO_CLINIC.fullName]
    );
    const orgId = org.rows[0].id;

    await tx.query(
      `INSERT INTO partner_organization_members (organization_id, user_id, member_role)
       VALUES ($1, $2, 'primary') ON CONFLICT DO NOTHING`,
      [orgId, userId]
    );

    const partnership = await tx.query(
      `INSERT INTO partnerships
         (partner_org_id, kindred_tap_org_id, name, status, model,
          start_date, renewal_date, referral_terms, commission_terms, services, approved_by, approved_at)
       VALUES ($1, $2, 'Riverbend x Kindred Tap referral agreement', 'active', 'commission share',
               CURRENT_DATE - interval '7 months',
               CURRENT_DATE + interval '5 months',
               'Either party may refer into the other. Referrals are reviewed within two working days.',
               'Commission of 10-12% of the service price, calculated on completion and paid monthly in arrears.',
               '["Mental health assessment", "Therapy (adult)", "Peer support"]', $3, now())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [orgId, kindredId, userId]
    );

    // An already-approved agreement, so the partner portal opens onto a
    // partnership that already has terms rather than an empty state.
    let partnershipId = partnership.rows[0]?.id;
    if (!partnershipId) {
      const found = await tx.query(
        `SELECT id FROM partnerships WHERE partner_org_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [orgId]
      );
      partnershipId = found.rows[0]?.id;
    }
    if (partnershipId) {
      await tx.query(
        `INSERT INTO partnership_agreements
           (partnership_id, title, version, effective_from, effective_to, status, terms, document_name)
         VALUES ($1, 'Referral and commission agreement', '2.1',
                 CURRENT_DATE - interval '7 months',
                 CURRENT_DATE + interval '5 months',
                 'active',
                 'Either party may refer into the other. Referrals are reviewed within two working days. '
                 || 'Commission is calculated on completion and paid monthly in arrears.',
                 'referral-agreement-v2.1.pdf')
         ON CONFLICT DO NOTHING`,
        [partnershipId]
      );
    }

    return userId;
  });

  await grantDefaultClinicPermissions(clinicId, null);
  console.log(`[seed] demo collaborative clinic ready: ${DEMO_CLINIC.email}`);
  return clinicId;
}

const isEntrypoint =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  (async () => {
    await runMigrations();
    await getDriver();
    // Order matters: questions reference issue keys, and the demo therapist
    // references both.
    await seedQuestions();
    await seedIssues();
    await seedAssessmentQuestions();
    await seedDemoTherapist();
    await seedDemoClinicalAdvisor();
    await seedPartnerServices();
    await seedDemoClinic();
    await pruneTokens();
    await closeDb();
  })()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[seed] failed:", err);
      await closeDb().catch(() => {});
      process.exit(1);
    });
}
