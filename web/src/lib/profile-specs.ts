import type { FieldSpec, ProfileValues } from "@/components/profile-form";

/* ------------------------------------------------------------------ */
/* Shared groups                                                       */
/* ------------------------------------------------------------------ */

const CONTACT_GROUP = "About you";

const contactFields: FieldSpec[] = [
  { name: "phone", label: "Phone", kind: "tel", group: CONTACT_GROUP, placeholder: "+44 7700 900123" },
  { name: "dateOfBirth", label: "Date of birth", kind: "date", group: CONTACT_GROUP },
  { name: "gender", label: "Gender", kind: "text", group: CONTACT_GROUP, maxLength: 60 },
  { name: "pronouns", label: "Pronouns", kind: "text", group: CONTACT_GROUP, maxLength: 40 },
  { name: "city", label: "City", kind: "text", group: CONTACT_GROUP, maxLength: 80 },
  { name: "country", label: "Country", kind: "text", group: CONTACT_GROUP, maxLength: 80 },
  {
    name: "emergencyContactName",
    label: "Emergency contact",
    kind: "text",
    group: CONTACT_GROUP,
    maxLength: 120,
  },
  {
    name: "emergencyContactPhone",
    label: "Emergency contact phone",
    kind: "tel",
    group: CONTACT_GROUP,
  },
];

/* ------------------------------------------------------------------ */
/* User portal                                                         */
/* ------------------------------------------------------------------ */

const USER_OPTIONS = {
  feelingDomains: [
    "anxiety", "low mood", "stress", "trauma", "grief", "anger", "insomnia",
    "loneliness", "relationships", "self-esteem", "burnout", "addiction",
    "work", "parenting", "chronic illness", "something else",
  ],
  preferredContactMethod: ["app messaging", "phone", "email", "in person"],
};

export const userProfileSpec: FieldSpec[] = [
  {
    name: "whatBroughtYouHere",
    label: "What brings you here?",
    kind: "textarea",
    rows: 5,
    maxLength: 1000,
    required: true,
    hint: "In your own words — this is what the AI reads to find your match.",
  },
  {
    name: "feelingDomains",
    label: "What are you dealing with?",
    kind: "multiselect",
    options: USER_OPTIONS.feelingDomains,
  },
  {
    name: "preferredContactMethod",
    label: "Preferred contact method",
    kind: "select",
    options: USER_OPTIONS.preferredContactMethod,
    required: true,
  },
  {
    name: "preferredLanguage",
    label: "Preferred language",
    kind: "text",
    required: true,
    maxLength: 60,
    initial: "English",
    hint: "Used when choosing your supporter or therapist.",
  },
  {
    name: "currentSupportStatus",
    label: "Current support",
    kind: "select",
    required: true,
    options: [
      "not_receiving",
      "waiting_list",
      "in_therapy",
      "self_managing",
      "seeking_support",
    ],
    placeholder: "How are you being supported right now?",
  },
  {
    name: "accessibilityNeeds",
    label: "Accessibility needs",
    kind: "textarea",
    rows: 2,
    maxLength: 500,
  },
  {
    name: "consentedToMatching",
    label: "I consent to AI matching",
    kind: "toggle",
    required: true,
    hint: "Required — the platform matches you with a supporter or psychologist based on what you share.",
  },
  ...contactFields,
];

/* ------------------------------------------------------------------ */
/* Supporter portal                                                    */
/* ------------------------------------------------------------------ */

const SUPPORTER_OPTIONS = {
  relationshipToUsers: ["partner", "parent", "child", "sibling", "friend", "carer", "colleague", "other"],
  supportTypes: [
    "check-ins", "crisis support", "practical help", "companionship", "advocacy",
    "transport", "childcare", "finances", "medication reminders", "other",
  ],
  languages: ["English", "Spanish", "French", "German", "Mandarin", "Hindi", "Portuguese", "Arabic", "Other"],
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  communicationPreferences: ["text", "phone", "email", "in person", "app messaging"],
};

export const supporterProfileSpec: FieldSpec[] = [
  {
    name: "livedExperience",
    label: "Your lived experience",
    kind: "textarea",
    rows: 5,
    maxLength: 2000,
    required: true,
    hint: "A short description of the experiences you draw on when supporting others.",
  },
  { name: "relationshipToUsers", label: "Who have you supported?", kind: "multiselect", options: SUPPORTER_OPTIONS.relationshipToUsers },
  { name: "supportTypes", label: "Support you can offer", kind: "multiselect", options: SUPPORTER_OPTIONS.supportTypes },
  { name: "relevantTraining", label: "Relevant training", kind: "multiselect", options: ["Mental Health First Aid", "Safeguarding", "Peer support", "Counselling skills", "Crisis line volunteering", "Other"] },
  { name: "relevantQualifications", label: "Relevant qualifications", kind: "multiselect", options: ["None yet", "Level 2/3 counselling", "Social work", "Nursing", "Psychology degree", "Other"] },
  { name: "languages", label: "Languages you speak", kind: "multiselect", options: SUPPORTER_OPTIONS.languages },
  { name: "availabilityDays", label: "Days you are available", kind: "multiselect", options: SUPPORTER_OPTIONS.weekdays },
  { name: "availabilityHours", label: "Typical hours", kind: "text", maxLength: 120, placeholder: "e.g. weekday evenings 6-9pm" },
  { name: "communicationPreferences", label: "How you prefer to communicate", kind: "multiselect", options: SUPPORTER_OPTIONS.communicationPreferences },
  { name: "maxConcurrentSessions", label: "Maximum sessions at once", kind: "number", min: 0, max: 50, initial: 3 },
  {
    name: "hasSafeguardingTraining",
    label: "I have safeguarding training",
    kind: "toggle",
  },
  { name: "supervisionContactName", label: "Supervisor or peer lead", kind: "text", maxLength: 120, group: "Safeguarding and supervision" },
  { name: "supervisionContactPhone", label: "Supervisor phone", kind: "tel", group: "Safeguarding and supervision" },
  { name: "bio", label: "Short bio shown to members", kind: "textarea", rows: 3, maxLength: 2000, group: "Safeguarding and supervision" },
  {
    name: "consentedToPractice",
    label: "I consent to practise as a peer supporter on Kindred Tap",
    kind: "toggle",
    required: true,
    hint: "Required — confirms you will work within the ethical agreement.",
  },
  ...contactFields,
];

/* ------------------------------------------------------------------ */
/* Therapist portal                                                    */
/* ------------------------------------------------------------------ */

const THERAPIST_OPTIONS = {
  clinicalAreas: [
    "anxiety", "depression", "trauma and PTSD", "grief", "addiction", "OCD",
    "bipolar disorder", "ADHD", "autism", "eating disorders", "relationships",
    "family therapy", "childhood trauma", "perinatal", "chronic illness",
    "LGBTQ+", "neurodiversity",
  ],
  modalities: [
    "CBT", "DBT", "EMDR", "ACT", "person-centred", "solution focused",
    "mindfulness based", "somatic", "family systems", "trauma focused",
    "motivational interviewing", "psychodynamic",
  ],
  qualifications: ["PhD Clinical Psychology", "PsyD", "MD", "MSc Psychology", "MA Counselling", "MSW", "BSc Nursing", "LCSW", "LMFT", "LMHC", "APCAA", "BACP", "Other"],
  languages: ["English", "Spanish", "French", "German", "Mandarin", "Hindi", "Portuguese", "Arabic", "Other"],
  sessionModes: ["video", "in person", "phone", "chat", "async messaging"],
};

export const therapistProfileSpec: FieldSpec[] = [
  { name: "discipline", label: "Discipline", kind: "text", required: true, maxLength: 120, group: "Registration", placeholder: "e.g. Clinical psychology" },
  { name: "registrationNumber", label: "Registration number", kind: "text", required: true, maxLength: 60, group: "Registration" },
  { name: "registrationBody", label: "Registration body", kind: "text", maxLength: 160, group: "Registration", placeholder: "e.g. HCPC, BPS, state board" },
  { name: "registrationCountry", label: "Registration country", kind: "text", required: true, maxLength: 80, group: "Registration", initial: "United Kingdom" },
  { name: "registrationExpiry", label: "Registration expiry", kind: "date", group: "Registration" },
  { name: "clinicalAreas", label: "Clinical areas", kind: "multiselect", group: "Practice", options: THERAPIST_OPTIONS.clinicalAreas },
  { name: "modalities", label: "Therapy modalities", kind: "multiselect", group: "Practice", options: THERAPIST_OPTIONS.modalities },
  { name: "qualifications", label: "Qualifications", kind: "multiselect", group: "Practice", options: THERAPIST_OPTIONS.qualifications },
  { name: "languages", label: "Languages", kind: "multiselect", group: "Practice", options: THERAPIST_OPTIONS.languages },
  { name: "yearsExperience", label: "Years of experience", kind: "number", min: 0, max: 80, group: "Practice" },
  { name: "sessionModes", label: "Session modes", kind: "multiselect", group: "Practice", options: THERAPIST_OPTIONS.sessionModes },
  { name: "sessionFee", label: "Session fee", kind: "number", min: 0, max: 100000, group: "Fees and availability" },
  { name: "currency", label: "Currency (3 letters)", kind: "text", maxLength: 3, group: "Fees and availability", placeholder: "GBP", initial: "GBP" },
  { name: "availabilityHoursPerWeek", label: "Availability (hours per week)", kind: "number", min: 0, max: 168, group: "Fees and availability" },
  { name: "acceptingNewCases", label: "Accepting new cases", kind: "toggle", group: "Fees and availability" },
  { name: "professionalIndemnity", label: "I hold professional indemnity insurance", kind: "toggle", group: "Fees and availability" },
  { name: "clinicalSupervisorName", label: "Your clinical supervisor", kind: "text", maxLength: 120, group: "Fees and availability" },
  { name: "bio", label: "Professional bio", kind: "textarea", rows: 3, maxLength: 2000, group: "Fees and availability" },
  {
    name: "consentedToPractice",
    label: "I consent to practise as a therapist on Kindred Tap",
    kind: "toggle",
    required: true,
    hint: "Required — confirms you will work within the ethical agreement.",
  },
  ...contactFields,
];

/* ------------------------------------------------------------------ */
/* Clinical Advisor portal                                             */
/* ------------------------------------------------------------------ */

const ADVISOR_OPTIONS = {
  clinicalAreas: [
    "anxiety", "depression", "trauma and PTSD", "grief", "addiction", "OCD",
    "bipolar disorder", "ADHD", "autism", "eating disorders", "relationships",
    "family therapy", "childhood trauma", "perinatal", "chronic illness",
    "LGBTQ+", "neurodiversity",
  ],
  supervisionModes: ["1:1", "group", "peer", "consultation", "on call"],
};

export const clinicalAdvisorProfileSpec: FieldSpec[] = [
  { name: "discipline", label: "Discipline", kind: "text", required: true, maxLength: 120, group: "Professional standing", placeholder: "e.g. Counselling psychology" },
  { name: "registrationNumber", label: "Registration number", kind: "text", maxLength: 60, group: "Professional standing" },
  { name: "registrationBody", label: "Registration body", kind: "text", maxLength: 160, group: "Professional standing" },
  { name: "clinicalAreas", label: "Clinical areas", kind: "multiselect", group: "Practice", options: ADVISOR_OPTIONS.clinicalAreas },
  { name: "standardsOwned", label: "Standards you oversee", kind: "multiselect", group: "Practice", options: ["Clinical governance", "Risk assessment", "Record keeping", "Supervision policy", "Ethics and boundaries", "Quality improvement"] },
  { name: "ethicalGuidelinesOwned", label: "I maintain ethical guidelines", kind: "toggle", group: "Practice" },
  { name: "yearsExperience", label: "Years of experience", kind: "number", min: 0, max: 80, group: "Practice" },
  { name: "yearsSupervising", label: "Years supervising", kind: "number", min: 0, max: 80, group: "Practice" },
  { name: "supervisionModes", label: "Supervision modes", kind: "multiselect", group: "Practice", options: ADVISOR_OPTIONS.supervisionModes },
  { name: "maxSupervisees", label: "Maximum supervisees", kind: "number", min: 0, max: 500, group: "Practice" },
  { name: "consultationDays", label: "Consultation days", kind: "multiselect", group: "Practice", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  { name: "bio", label: "Professional bio", kind: "textarea", rows: 3, maxLength: 2000 },
  {
    name: "consentedToPractice",
    label: "I consent to advise on clinical standards on Kindred Tap",
    kind: "toggle",
    required: true,
  },
  ...contactFields,
];

/* ------------------------------------------------------------------ */
/* Clinical Supervisor portal                                          */
/* ------------------------------------------------------------------ */

const SUPERVISOR_OPTIONS = {
  oversightRegions: ["Local", "Regional", "National", "International", "Telehealth only"],
  supervisionFocuses: ["caseload review", "risk assessment", "clinical governance", "ethics and boundaries", "record keeping", "practitioner wellbeing", "quality improvement"],
  practitionerTypes: ["therapist", "supporter", "clinical advisor", "counsellor", "peer worker", "care worker"],
  clinicalAreas: [
    "anxiety", "depression", "trauma and PTSD", "grief", "addiction", "OCD",
    "bipolar disorder", "ADHD", "autism", "eating disorders", "relationships",
    "family therapy", "childhood trauma", "perinatal", "chronic illness",
    "LGBTQ+", "neurodiversity",
  ],
  languages: ["English", "Spanish", "French", "German", "Mandarin", "Hindi", "Portuguese", "Arabic", "Other"],
};

export const clinicalSupervisorProfileSpec: FieldSpec[] = [
  { name: "jobTitle", label: "Job title", kind: "text", required: true, maxLength: 120, group: "Role", placeholder: "e.g. Lead clinical supervisor" },
  { name: "organization", label: "Organization", kind: "text", required: true, maxLength: 160, group: "Role" },
  { name: "department", label: "Department", kind: "text", maxLength: 120, group: "Role" },
  { name: "registrationNumber", label: "Registration number", kind: "text", maxLength: 60, group: "Role" },
  { name: "registrationBody", label: "Registration body", kind: "text", maxLength: 160, group: "Role" },
  { name: "oversightRegions", label: "Oversight regions", kind: "multiselect", group: "Oversight", options: SUPERVISOR_OPTIONS.oversightRegions },
  { name: "supervisionFocuses", label: "Supervision focuses", kind: "multiselect", group: "Oversight", options: SUPERVISOR_OPTIONS.supervisionFocuses },
  { name: "practitionerTypes", label: "Practitioners you supervise", kind: "multiselect", group: "Oversight", options: SUPERVISOR_OPTIONS.practitionerTypes },
  { name: "clinicalAreas", label: "Clinical areas", kind: "multiselect", group: "Oversight", options: SUPERVISOR_OPTIONS.clinicalAreas },
  { name: "languages", label: "Languages", kind: "multiselect", group: "Oversight", options: SUPERVISOR_OPTIONS.languages },
  { name: "yearsExperience", label: "Years of experience", kind: "number", min: 0, max: 80, group: "Oversight" },
  { name: "maxSupervisees", label: "Maximum supervisees", kind: "number", min: 0, max: 1000, group: "Oversight" },
  { name: "onCallForEscalations", label: "On call for escalations", kind: "toggle", group: "Oversight" },
  { name: "safeguardingLead", label: "I am a safeguarding lead", kind: "toggle", group: "Oversight" },
  { name: "bio", label: "Professional bio", kind: "textarea", rows: 3, maxLength: 2000 },
  {
    name: "consentedToPractice",
    label: "I consent to provide clinical oversight on Kindred Tap",
    kind: "toggle",
    required: true,
  },
  ...contactFields,
];

/* ------------------------------------------------------------------ */
/* Collaborative Clinic portal                                         */
/* ------------------------------------------------------------------ */

const CLINIC_OPTIONS = {
  organizationType: ["private_clinic", "nhs_service", "community_organisation", "charity", "workplace", "university", "other"],
  clinicSpecialisms: ["Mental health", "Addiction", "Child and adolescent", "Eating disorders", "LGBTQ+ affirming", "Trauma informed", "Community", "Corporate wellbeing"],
  servicesOffered: ["Mental health assessment", "Therapy (adult)", "Therapy (adolescent)", "Crisis support", "Peer support", "Workplace wellbeing", "Substance use programme"],
  partnershipModels: ["Referral agreement", "Commission share", "Joint programme", "Service level agreement", "Outsourced provider", "Charitable partnership"],
  referralTypes: ["Assessment", "Therapy", "Crisis", "Peer support", "Family work", "Aftercare"],
  languages: ["English", "Spanish", "French", "German", "Mandarin", "Hindi", "Portuguese", "Arabic", "Other"],
};

export const collaborativeClinicProfileSpec: FieldSpec[] = [
  { name: "organizationName", label: "Organization name", kind: "text", required: true, maxLength: 160, group: "Organization" },
  { name: "organizationType", label: "Organization type", kind: "select", required: true, options: CLINIC_OPTIONS.organizationType, group: "Organization" },
  { name: "registrationNumber", label: "Registration number", kind: "text", maxLength: 60, group: "Organization" },
  { name: "registrationBody", label: "Registration body", kind: "text", maxLength: 160, group: "Organization" },
  { name: "cqcOrEquivalentNumber", label: "CQC or equivalent number", kind: "text", maxLength: 60, group: "Organization" },
  { name: "contactName", label: "Primary contact", kind: "text", maxLength: 120, group: "Organization" },
  { name: "contactEmail", label: "Contact email", kind: "email", group: "Organization" },
  { name: "contactPhone", label: "Contact phone", kind: "tel", group: "Organization" },
  { name: "website", label: "Website", kind: "text", maxLength: 200, group: "Organization", placeholder: "https://..." },
  { name: "clinicSpecialisms", label: "Specialisms", kind: "multiselect", group: "Services", options: CLINIC_OPTIONS.clinicSpecialisms },
  { name: "servicesOffered", label: "Services offered", kind: "multiselect", group: "Services", options: CLINIC_OPTIONS.servicesOffered },
  { name: "languages", label: "Languages", kind: "multiselect", group: "Services", options: CLINIC_OPTIONS.languages },
  { name: "yearsOperating", label: "Years operating", kind: "number", min: 0, max: 200, group: "Services" },
  { name: "acceptsReferrals", label: "We accept referrals", kind: "toggle", group: "Referrals and partnership" },
  { name: "sendsReferrals", label: "We send referrals", kind: "toggle", group: "Referrals and partnership" },
  { name: "referralTypes", label: "Referral types", kind: "multiselect", group: "Referrals and partnership", options: CLINIC_OPTIONS.referralTypes },
  { name: "partnershipModels", label: "Partnership models", kind: "multiselect", group: "Referrals and partnership", options: CLINIC_OPTIONS.partnershipModels },
  { name: "commissionRatePercent", label: "Commission rate (%)", kind: "number", min: 0, max: 100, group: "Referrals and partnership" },
  { name: "billingCurrency", label: "Billing currency (3 letters)", kind: "text", maxLength: 3, group: "Referrals and partnership", placeholder: "GBP", initial: "GBP" },
  { name: "marketingConsent", label: "We would like help promoting our services", kind: "toggle", group: "Referrals and partnership" },
  { name: "bio", label: "About your organization", kind: "textarea", rows: 3, maxLength: 2000 },
  {
    name: "consentedToPractice",
    label: "I consent to take part as a partner clinic on Kindred Tap",
    kind: "toggle",
    required: true,
  },
  ...contactFields,
];

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

export const profileSpecs: Record<string, FieldSpec[]> = {
  user: userProfileSpec,
  supporter: supporterProfileSpec,
  therapist: therapistProfileSpec,
  clinical_advisor: clinicalAdvisorProfileSpec,
  clinical_supervisor: clinicalSupervisorProfileSpec,
  collaborative_clinic: collaborativeClinicProfileSpec,
};

/**
 * Builds the form's starting values: keeps saved values from the API, fills
 * in spec defaults for anything untouched.
 */
export function initialProfileValues(spec: FieldSpec[], profile: Record<string, unknown> | null): ProfileValues {
  const values: ProfileValues = {};
  for (const field of spec) {
    const saved = profile?.[field.name];
    if (field.kind === "number") {
      values[field.name] = typeof saved === "number" ? saved : field.initial;
      continue;
    }
    if (field.kind === "multiselect") {
      values[field.name] = Array.isArray(saved) ? saved : [];
      continue;
    }
    if (field.kind === "toggle") {
      values[field.name] = saved === true;
      continue;
    }
    values[field.name] = typeof saved === "string" ? saved : typeof field.initial === "string" ? field.initial : "";
  }
  return values;
}
