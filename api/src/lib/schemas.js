import { z } from "zod";
import { ROLE_REQUIRES_ETHICS, ROLE_TABLES } from "./roles.js";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Optional free text: trimmed, length checked, empty becomes undefined. */
const text = (max, label) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v ? v : undefined));

const requiredText = (min, max, label) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

const emailField = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .nullish()
  .transform((v) => (v ? v : undefined));

const phoneField = z
  .string()
  .trim()
  .regex(/^[+()\d][\d\s()+.-]{5,20}$/, "Enter a valid phone number")
  .nullish()
  .transform((v) => (v ? v : undefined));

const urlField = z
  .string()
  .trim()
  .url("Enter a valid URL including https://")
  .nullish()
  .transform((v) => (v ? v : undefined));

const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .nullish()
  .transform((v) => (v ? v : undefined));

/** Multi-select values arrive as arrays and are stored as JSONB. */
const listField = (maxItems = 40) =>
  z
    .array(z.string().trim().min(1, "Remove the empty option").max(120))
    .max(maxItems, `Choose ${maxItems} or fewer`)
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []));

const count = (max, label) =>
  z.coerce.number().int().min(0, `${label} cannot be negative`).max(max, `${label} looks too high`);

const bool = (message) => z.boolean(message);

const currency = z.string().trim().length(3, "Use a 3 letter currency code").toUpperCase();

/** Shared contact block, present on every portal form. */
const contactBlock = {
  phone: phoneField,
  dateOfBirth: dateField,
  gender: text(60, "Gender"),
  pronouns: text(40, "Pronouns"),
  addressLine1: text(120, "Address"),
  addressLine2: text(120, "Address"),
  city: text(80, "City"),
  state: text(80, "State or region"),
  country: text(80, "Country"),
  postalCode: text(20, "Postcode"),
  avatarUrl: urlField,
  emergencyContactName: text(120, "Emergency contact name"),
  emergencyContactPhone: phoneField,
  emergencyContactRelation: text(60, "Emergency contact relationship"),
};

/** Terms and the professional code of conduct. */
const ethicsBlock = {
  termsAccepted: bool("You must accept the terms to continue"),
  ethicsAccepted: z
    .boolean()
    .optional()
    .transform((v) => v === true),
  ethicsVersion: z.string().trim().optional(),
  consentedToDataSharing: bool().optional().default(false),
};

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128, "That password is too long")
      .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number"),
    confirmPassword: z.string().optional(),
    fullName: requiredText(2, 120, "Full name"),
    role: z.enum(
      ["user", "supporter", "therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic"],
      { errorMap: () => ({ message: "Choose the portal you are signing up for" }) }
    ),
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: "You must accept the terms to continue" }),
    }),
    ethicsAccepted: z.boolean().optional().default(false),
    ethicsVersion: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== undefined && data.confirmPassword !== data.password) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" });
    }
    if (ROLE_REQUIRES_ETHICS[data.role] && data.ethicsAccepted !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["ethicsAccepted"],
        message: "Professionals must accept the ethical agreement",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  /**
   * Optional portal key from the sign-in page. Each portal has its own
   * accounts, so the API rejects a password that belongs to a different one.
   */
  portal: z.enum(["user", "supporter", "therapist", "clinical_advisor", "clinical_supervisor", "collaborative_clinic"]).optional(),
});

/* ------------------------------------------------------------------ */
/* Personality test (kept for the next phase)                          */
/* ------------------------------------------------------------------ */

export const personalitySubmissionSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.coerce.number().int().positive(),
        value: z.coerce.number().int().min(1).max(5),
      })
    )
    .min(1, "Answer at least one question"),
});

/* ------------------------------------------------------------------ */
/* Therapist directory and messaging                                    */
/* ------------------------------------------------------------------ */

export const startConversationSchema = z.object({
  therapistId: z.string().trim().uuid("Choose a therapist from the directory"),
});

export const sendMessageSchema = z.object({
  body: requiredText(1, 2000, "Message"),
});

/* ------------------------------------------------------------------ */
/* Portal profiles                                                     */
/* ------------------------------------------------------------------ */

export const userProfileSchema = z.object({
  ...contactBlock,
  ...ethicsBlock,
  whatBroughtYouHere: text(1000, "Your message"),
  feelingDomains: listField(),
  preferredContactMethod: z.enum(["app messaging", "phone", "email", "in person"]),
  preferredLanguage: z.string().trim().min(1, "Choose a language").default("English"),
  accessibilityNeeds: text(500, "Accessibility needs"),
  currentSupportStatus: z.enum([
    "not_receiving",
    "waiting_list",
    "in_therapy",
    "self_managing",
    "seeking_support",
  ]),
  consentedToMatching: bool("Consent to AI matching is required"),
});

export const supporterProfileSchema = z.object({
  ...contactBlock,
  ...ethicsBlock,
  livedExperience: requiredText(20, 2000, "A short description of your lived experience"),
  relationshipToUsers: listField(),
  supportTypes: listField(),
  relevantTraining: listField(),
  relevantQualifications: listField(),
  languages: listField(),
  availabilityDays: listField(),
  availabilityHours: text(120, "Availability hours"),
  communicationPreferences: listField(),
  maxConcurrentSessions: count(50, "Maximum sessions"),
  hasSafeguardingTraining: bool().optional().default(false),
  supervisionContactName: text(120, "Supervisor name"),
  supervisionContactPhone: phoneField,
  bio: text(2000, "Bio"),
  consentedToPractice: bool("Consent to practise is required"),
});

export const therapistProfileSchema = z.object({
  ...contactBlock,
  ...ethicsBlock,
  discipline: requiredText(2, 120, "Discipline"),
  registrationNumber: requiredText(2, 60, "Registration number"),
  registrationBody: text(160, "Registration body"),
  registrationCountry: z.string().trim().min(2, "Choose a country").default("United Kingdom"),
  registrationExpiry: dateField,
  clinicalAreas: listField(),
  modalities: listField(),
  qualifications: listField(),
  languages: listField(),
  yearsExperience: count(80, "Years of experience").default(0),
  sessionModes: listField(),
  sessionFee: z.coerce.number().min(0, "Fee cannot be negative").max(100000, "Fee looks too high").default(0),
  currency: currency.default("GBP"),
  acceptingNewCases: z.boolean().optional().default(true),
  supervisionExperience: bool().optional().default(false),
  clinicalSupervisorName: text(120, "Clinical supervisor"),
  professionalIndemnity: bool().optional().default(false),
  availabilityHoursPerWeek: count(168, "Availability"),
  bio: text(2000, "Bio"),
  consentedToPractice: bool("Consent to practise is required"),
});

export const clinicalAdvisorProfileSchema = z.object({
  ...contactBlock,
  ...ethicsBlock,
  discipline: requiredText(2, 120, "Discipline"),
  registrationNumber: text(60, "Registration number"),
  registrationBody: text(160, "Registration body"),
  registrationCountry: z.string().trim().min(2, "Choose a country").default("United Kingdom"),
  clinicalAreas: listField(),
  standardsOwned: listField(),
  ethicalGuidelinesOwned: bool().optional().default(false),
  languages: listField(),
  yearsExperience: count(80, "Years of experience").default(0),
  yearsSupervising: count(80, "Years supervising").default(0),
  supervisionModes: listField(),
  maxSupervisees: count(500, "Maximum supervisees"),
  consultationDays: listField(),
  qualifications: listField(),
  bio: text(2000, "Bio"),
  consentedToPractice: bool("Consent to practise is required"),
});

export const clinicalSupervisorProfileSchema = z.object({
  ...contactBlock,
  ...ethicsBlock,
  jobTitle: requiredText(2, 120, "Job title"),
  organization: requiredText(2, 160, "Organization"),
  department: text(120, "Department"),
  registrationNumber: text(60, "Registration number"),
  registrationBody: text(160, "Registration body"),
  registrationCountry: z.string().trim().min(2, "Choose a country").default("United Kingdom"),
  oversightRegions: listField(),
  supervisionFocuses: listField(),
  practitionerTypes: listField(),
  clinicalAreas: listField(),
  languages: listField(),
  yearsExperience: count(80, "Years of experience").default(0),
  maxSupervisees: count(1000, "Maximum supervisees"),
  onCallForEscalations: bool().optional().default(false),
  safeguardingLead: bool().optional().default(false),
  qualifications: listField(),
  bio: text(2000, "Bio"),
  consentedToPractice: bool("Consent to practise is required"),
});

export const collaborativeClinicProfileSchema = z
  .object({
    ...contactBlock,
    ...ethicsBlock,
    organizationName: requiredText(2, 160, "Organization name"),
    organizationType: z.enum(
      ["private_clinic", "nhs_service", "community_organisation", "charity", "workplace", "university", "other"],
      { errorMap: () => ({ message: "Choose the type of organization" }) }
    ),
    registrationNumber: text(60, "Registration number"),
    registrationBody: text(160, "Registration body"),
    contactName: text(120, "Contact name"),
    contactEmail: emailField,
    contactPhone: phoneField,
    website: urlField,
    clinicSpecialisms: listField(),
    servicesOffered: listField(),
    partnershipModels: listField(),
    acceptsReferrals: z.boolean().optional().default(true),
    sendsReferrals: z.boolean().optional().default(false),
    referralTypes: listField(),
    marketingConsent: bool().optional().default(false),
    languages: listField(),
    yearsOperating: count(200, "Years operating").default(0),
    cqcOrEquivalentNumber: text(60, "CQC or equivalent number"),
    billingCurrency: currency.default("GBP"),
    commissionRatePercent: z.coerce.number().min(0).max(100).optional(),
    bio: text(2000, "About your organization"),
    consentedToPractice: bool("Consent to take part is required"),
  })
  .superRefine((data, ctx) => {
    if (data.acceptsReferrals && !(data.referralTypes?.length)) {
      ctx.addIssue({
        code: "custom",
        path: ["referralTypes"],
        message: "Tell us which referrals you can accept",
      });
    }
  });

export const profileSchemas = {
  user: userProfileSchema,
  supporter: supporterProfileSchema,
  therapist: therapistProfileSchema,
  clinical_advisor: clinicalAdvisorProfileSchema,
  clinical_supervisor: clinicalSupervisorProfileSchema,
  collaborative_clinic: collaborativeClinicProfileSchema,
};

/* ------------------------------------------------------------------ */
/* camelCase payload -> snake_case columns                             */
/* ------------------------------------------------------------------ */

const columnMaps = new Map();

/**
 * `.superRefine()` wraps an object in a ZodEffects, which hides `.shape`.
 * Unwrap until we reach the underlying ZodObject.
 */
function shapeOf(schema) {
  let current = schema;
  for (let i = 0; i < 10 && current; i += 1) {
    if (typeof current === "object" && current.shape) return current.shape;
    const def = current?._def;
    if (!def) break;
    current = def.schema ?? def.innerType;
  }
  return {};
}

/**
 * Discovered from information_schema once at boot, so an API rename can never
 * silently drift from the database.
 */
export async function loadColumnMap(db) {
  for (const [role, table] of Object.entries(ROLE_TABLES)) {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      [table]
    );
    if (!rows.length) {
      throw new Error(`Portal table "${table}" is missing. Run: npm run migrate`);
    }

    const available = new Set(rows.map((r) => r.column_name));
    const map = {};

    for (const key of Object.keys(shapeOf(profileSchemas[role]))) {
      const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      if (available.has(snake)) map[key] = snake;
    }

    columnMaps.set(role, map);
  }
  return columnMaps;
}

export function toColumns(role, input) {
  const map = columnMaps.get(role);
  if (!map) throw new Error(`No column map loaded for "${role}". loadColumnMap() runs at startup.`);

  const columns = [];
  const values = [];

  for (const [key, column] of Object.entries(map)) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === undefined) continue;

    columns.push(column);
    values.push(Array.isArray(value) ? JSON.stringify(value) : value === "" ? null : value);
  }

  if (!columns.length) throw new Error(`Nothing to save for the ${role} portal`);
  return { columns, values };
}

/* ------------------------------------------------------------------ */
/* Concern assessment                                                   */
/* ------------------------------------------------------------------ */

/**
 * One answer.
 *
 * The 1..5 bound covers every instrument in use: True/False arrives as 1 or 2,
 * the four-option severity items as 1..4, and Likert as 1..5. Which scale a
 * question uses is data, held on the question row.
 */
export const assessmentAnswerSchema = z.object({
  questionId: z.string().uuid("That question id is not valid"),
  value: z.coerce.number().int().min(1, "Choose an answer").max(5, "Choose an answer"),
  answerText: text(2000, "Answer").optional(),
});

/**
 * A batch of answers saved mid-assessment.
 *
 * Saved per test rather than all at the end, so Test 1's answers are already
 * stored while somebody answers Test 2.
 */
export const assessmentAnswersSchema = z.object({
  answers: z
    .array(assessmentAnswerSchema)
    .min(1, "Answer at least one question")
    .max(200, "Too many answers in one submission"),
});

/** Finishing an assessment: the optional concern picks plus free text. */
export const completeAssessmentSchema = z.object({
  selectedConcerns: z
    .array(z.string().trim().min(1).max(64))
    .max(6, "Choose six or fewer")
    .optional()
    .default([]),
  userDescription: text(2000, "Description").optional(),
});

/**
 * "What are you dealing with today?"
 *
 * `primaryIssueKey` is only shape-checked here. Whether it names a real concern
 * is decided against the issues table in the route, because the vocabulary is
 * configurable and an enum in this file would go stale the moment somebody adds
 * a category.
 */
export const currentConcernSchema = z
  .object({
    primaryIssueKey: z.string().trim().min(1, "Choose what you are dealing with").max(64),
    secondaryIssues: z
      .array(z.string().trim().min(1).max(64))
      .max(5, "Choose five or fewer")
      .optional()
      .default([]),
    userDescription: text(2000, "Description").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.secondaryIssues.includes(data.primaryIssueKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["secondaryIssues"],
        message: "That is already your main concern",
      });
    }
  });

/* ------------------------------------------------------------------ */
/* Therapist specialties                                                */
/* ------------------------------------------------------------------ */

/** Replaces the whole set, so at least one is required. */
export const therapistSpecialtiesSchema = z.object({
  issueKeys: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "Choose at least one specialty")
    .max(20, "Choose twenty or fewer"),
});

/* ------------------------------------------------------------------ */
/* Support assistant                                                   */
/* ------------------------------------------------------------------ */

/**
 * Length-bounded on purpose: the question is embedded and then handed to a
 * paid model, so a megabyte of text is a cost problem before it is anything
 * else. The 256kb body limit on the API is the outer stop; this is the inner
 * one that actually means anything.
 */
export const assistantAskSchema = z.object({
  question: requiredText(2, 1000, "Your question"),
});
