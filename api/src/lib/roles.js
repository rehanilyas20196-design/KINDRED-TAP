/**
 * The six Kindred Tap portals.
 *
 * `order` is the order they are presented on the portal picker.
 * `requiresEthics` roles must accept the professional code of conduct before
 * they can finish signing up.
 */

export const ROLES = [
  "user",
  "supporter",
  "therapist",
  "clinical_advisor",
  "clinical_supervisor",
  "collaborative_clinic",
];

export const ROLE_TABLES = {
  user: "user_profiles",
  supporter: "supporter_profiles",
  therapist: "therapist_profiles",
  clinical_advisor: "clinical_advisor_profiles",
  clinical_supervisor: "clinical_supervisor_profiles",
  collaborative_clinic: "collaborative_clinic_profiles",
};

export const ROLE_LABELS = {
  user: "User",
  supporter: "Supporter",
  therapist: "Therapist",
  clinical_advisor: "Clinical Advisor",
  clinical_supervisor: "Clinical Supervisor",
  collaborative_clinic: "Collaborative Clinic",
};

/** Short portal name used in the top bar and page titles. */
export const ROLE_PORTAL_NAMES = {
  user: "User Portal",
  supporter: "Supporter Portal",
  therapist: "Therapist Portal",
  clinical_advisor: "Clinical Advisor Portal",
  clinical_supervisor: "Clinical Supervisor Portal",
  collaborative_clinic: "Collaborative Clinic Portal",
};

/** The journey each portal is built around. Drives the dashboard roadmap. */
export const ROLE_JOURNEYS = {
  user: ["Describe your feelings", "AI matching", "Connect to a supporter or psychologist"],
  supporter: [
    "Sign up and accept the ethical agreement",
    "Receive matched requests",
    "Provide peer support",
    "Escalate concerns",
    "Complete the session",
  ],
  therapist: [
    "Sign up and accept the ethical agreement",
    "Receive AI-matched cases",
    "Provide professional therapy",
    "Document the session",
    "Follow up and escalate when needed",
  ],
  clinical_advisor: [
    "Oversee clinical standards",
    "Supervise practitioners",
    "Review safety escalations",
    "Maintain ethical guidelines",
  ],
  clinical_supervisor: [
    "Monitor safety",
    "Review escalations",
    "Supervise supporters and therapists",
    "Intervene when needed",
    "Maintain clinical and ethical oversight",
  ],
  collaborative_clinic: [
    "Receive and send referrals",
    "Promote services",
    "Track clients",
    "Track commission",
    "Manage partnerships",
  ],
};

/** Professionals must accept the code of conduct; members of the public must not. */
export const ROLE_REQUIRES_ETHICS = {
  user: false,
  supporter: true,
  therapist: true,
  clinical_advisor: true,
  clinical_supervisor: true,
  collaborative_clinic: true,
};

const ROLE_COPY = {
  user: {
    tagline: "Find the right support for how you feel",
    description:
      "Tell us what is going on and we will match you with a trained supporter or psychologist.",
    icon: "user",
  },
  supporter: {
    tagline: "Peer support for people you care about",
    description:
      "Offer lived-experience support, work matched requests and escalate anything urgent.",
    icon: "hands",
  },
  therapist: {
    tagline: "Deliver professional therapy",
    description:
      "Take AI-matched cases, deliver therapy, document sessions and escalate concerns.",
    icon: "stethoscope",
  },
  clinical_advisor: {
    tagline: "Hold the clinical standard",
    description:
      "Set clinical standards, supervise practitioners and keep ethical guidelines current.",
    icon: "clipboard",
  },
  clinical_supervisor: {
    tagline: "Safety and ethical oversight",
    description:
      "Monitor safety, review escalations, supervise the team and intervene when needed.",
    icon: "shield",
  },
  collaborative_clinic: {
    tagline: "Partner clinics, referrals and outcomes",
    description:
      "Send and receive referrals, promote your services and track clients and commission.",
    icon: "building",
  },
};

export function roleMeta(role) {
  const key = ROLES.includes(role) ? role : "user";
  return {
    key,
    label: ROLE_LABELS[key],
    portal: ROLE_PORTAL_NAMES[key],
    tagline: ROLE_COPY[key].tagline,
    description: ROLE_COPY[key].description,
    icon: ROLE_COPY[key].icon,
    requiresEthics: ROLE_REQUIRES_ETHICS[key],
    journey: ROLE_JOURNEYS[key],
  };
}

export const ALL_ROLE_META = ROLES.map(roleMeta);

/** Option lists shared by the API schemas and the signup form choices. */
export const OPTIONS = {
  gender: ["Female", "Male", "Non-binary", "Prefer to self-describe", "Prefer not to say"],
  pronouns: ["she/her", "he/him", "they/them", "she/they", "he/they", "other", "prefer not to say"],
  feelingDomains: [
    "anxiety", "low mood", "stress", "trauma", "grief", "anger", "insomnia",
    "loneliness", "relationships", "self-esteem", "burnout", "addiction",
    "work", "parenting", "chronic illness", "something else",
  ],
  relationshipToUser: [
    { value: "partner", label: "Partner" },
    { value: "parent", label: "Parent" },
    { value: "child", label: "Child" },
    { value: "sibling", label: "Sibling" },
    { value: "friend", label: "Friend" },
    { value: "carer", label: "Carer" },
    { value: "colleague", label: "Colleague" },
    { value: "other", label: "Other" },
  ],
  supportTypes: [
    "check-ins", "crisis support", "practical help", "companionship", "advocacy",
    "transport", "childcare", "finances", "medication reminders", "other",
  ],
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  communicationPreferences: ["text", "phone", "email", "in person", "app messaging"],
  professionalDisciplines: [
    "Clinical psychology", "Counselling psychology", "Psychiatry", "Psychotherapy",
    "Social work", "Nursing", "Occupational therapy", "Addiction specialist",
    "Mental health practitioner", "Other",
  ],
  clinicalAreas: [
    "anxiety", "depression", "trauma and PTSD", "grief", "addiction", "OCD",
    "bipolar disorder", "ADHD", "autism", "eating disorders", "relationships",
    "family therapy", "childhood trauma", "perinatal", "chronic illness",
    "LGBTQ+", "neurodiversity",
  ],
  therapyModalities: [
    "CBT", "DBT", "EMDR", "ACT", "person-centred", "solution focused",
    "mindfulness based", "somatic", "family systems", "trauma focused",
    "motivational interviewing", "psychodynamic",
  ],
  qualifications: [
    "PhD Clinical Psychology", "PsyD", "MD", "MSc Psychology", "MA Counselling",
    "MSW", "BSc Nursing", "LCSW", "LMFT", "LMHC", "APCAA", "BACP", "Other",
  ],
  languages: ["English", "Spanish", "French", "German", "Mandarin", "Hindi", "Portuguese", "Arabic", "Other"],
  sessionModes: ["video", "in person", "phone", "chat", "async messaging"],
  registrationBodies: [
    "General Medical Council", "Health and Care Professions Council", "British Psychological Society",
    "American Psychological Association", "APA (Counseling)", "State Licensing Board",
    "National Association of Social Workers", "Other",
  ],
  supervisionFocuses: [
    "caseload review", "risk assessment", "clinical governance", "ethics and boundaries",
    "record keeping", "practitioner wellbeing", "quality improvement",
  ],
  practitionerTypes: [
    "therapist", "supporter", "clinical advisor", "counsellor", "peer worker", "care worker",
  ],
  oversightRegions: [
    "Local", "Regional", "National", "International", "Telehealth only",
  ],
  clinicSpecialisms: [
    "Mental health", "Addiction", "Child and adolescent", "Eating disorders",
    "LGBTQ+ affirming", "Trauma informed", "Community", "Corporate wellbeing",
  ],
  clinicReferralTypes: [
    "Assessment", "Therapy", "Crisis", "Peer support", "Family work", "Aftercare",
  ],
  partnershipModels: [
    "Referral agreement", "Commission share", "Joint programme", "Service level agreement",
    "Outsourced provider", "Charitable partnership",
  ],
  marketingServices: [
    "Mental health assessment", "Therapy (adult)", "Therapy (adolescent)",
    "Crisis support", "Peer support", "Workplace wellbeing", "Substance use programme",
  ],
  interests: [
    "anxiety", "depression", "stress", "trauma", "grief", "insomnia", "addiction",
    "relationships", "self-esteem", "burnout", "parenting", "workplace", "chronic illness",
  ],
};

export const ETHICS_VERSION = "2026.1";
