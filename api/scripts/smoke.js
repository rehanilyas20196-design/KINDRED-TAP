const BASE = process.env.SMOKE_BASE || "http://localhost:4000";

let token = null;
let passed = 0;
let failed = 0;

function check(name, ok, extra = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const contact = {
  phone: "+44 7700 900123",
  dateOfBirth: "1990-06-15",
  gender: "Female",
  pronouns: "she/her",
  addressLine1: "10 Downing Row",
  city: "Bristol",
  country: "United Kingdom",
  postalCode: "BS1 4ST",
  emergencyContactName: "Sam Reed",
  emergencyContactPhone: "+44 7700 900999",
  emergencyContactRelation: "Partner",
};

/** One valid payload per portal, plus one that must fail validation. */
const PORTALS = {
  user: {
    valid: {
      ...contact,
      whatBroughtYouHere: "Stress has been building for months and I cannot switch off.",
      feelingDomains: ["stress", "anxiety", "insomnia"],
      preferredContactMethod: "app messaging",
      preferredLanguage: "English",
      currentSupportStatus: "seeking_support",
      consentedToMatching: true,
      consentedToDataSharing: true,
      termsAccepted: true,
    },
    invalid: { consentedToMatching: false },
  },
  supporter: {
    valid: {
      ...contact,
      livedExperience: "I lived through six years of recovery from alcohol dependency.",
      relationshipToUsers: ["friend", "sibling"],
      supportTypes: ["check-ins", "crisis support"],
      relevantTraining: ["Mental Health First Aid"],
      relevantQualifications: ["Peer Support Certificate"],
      languages: ["English"],
      availabilityDays: ["Mon", "Wed"],
      availabilityHours: "Evenings after 18:00",
      communicationPreferences: ["text", "phone"],
      maxConcurrentSessions: 6,
      hasSafeguardingTraining: true,
      supervisionContactName: "Jo Bell",
      bio: "Peer supporter focused on recovery.",
      consentedToPractice: true,
      termsAccepted: true,
    },
    invalid: { relationshipToUsers: "everyone" },
  },
  therapist: {
    valid: {
      ...contact,
      discipline: "Clinical psychology",
      registrationNumber: "HCPC PYL12345",
      registrationBody: "Health and Care Professions Council",
      registrationCountry: "United Kingdom",
      registrationExpiry: "2028-03-31",
      clinicalAreas: ["anxiety", "trauma and PTSD"],
      modalities: ["CBT", "EMDR"],
      qualifications: ["Doctorate in Clinical Psychology", "BSc Psychology"],
      languages: ["English", "Spanish"],
      yearsExperience: 11,
      sessionModes: ["video", "in person"],
      sessionFee: 120,
      currency: "GBP",
      acceptingNewCases: true,
      supervisionExperience: true,
      clinicalSupervisorName: "Dr A Okafor",
      professionalIndemnity: true,
      availabilityHoursPerWeek: 20,
      bio: "Clinical psychologist working with adults.",
      consentedToPractice: true,
      consentedToDataSharing: true,
      termsAccepted: true,
    },
    invalid: { sessionFee: -10 },
  },
  clinical_advisor: {
    valid: {
      ...contact,
      discipline: "Clinical psychology",
      registrationNumber: "HCPC PYL98765",
      registrationBody: "Health and Care Professions Council",
      clinicalAreas: ["trauma and PTSD", "clinical governance"],
      standardsOwned: ["Record keeping", "Risk assessment"],
      ethicalGuidelinesOwned: true,
      languages: ["English"],
      yearsExperience: 19,
      yearsSupervising: 12,
      supervisionModes: ["video", "in person"],
      maxSupervisees: 18,
      consultationDays: ["Tue", "Thu"],
      qualifications: ["Doctorate in Clinical Psychology"],
      bio: "Advisor on clinical standards and ethics.",
      consentedToPractice: true,
      termsAccepted: true,
    },
    invalid: { ethicalGuidelinesOwned: "yes" },
  },
  clinical_supervisor: {
    valid: {
      ...contact,
      jobTitle: "Clinical Supervisor",
      organization: "Riverbend Mental Health Trust",
      department: "Adult Services",
      registrationNumber: "BPS CS2026-118",
      registrationBody: "British Psychological Society",
      oversightRegions: ["Regional", "Telehealth only"],
      supervisionFocuses: ["caseload review", "risk assessment"],
      practitionerTypes: ["therapist", "supporter"],
      clinicalAreas: ["anxiety", "depression"],
      languages: ["English"],
      yearsExperience: 22,
      maxSupervisees: 24,
      onCallForEscalations: true,
      safeguardingLead: true,
      qualifications: ["Doctorate in Clinical Psychology", "Supervision Certificate"],
      bio: "Supervising the adult therapy team.",
      consentedToPractice: true,
      termsAccepted: true,
    },
    invalid: { jobTitle: "" },
  },
  collaborative_clinic: {
    valid: {
      ...contact,
      organizationName: "Northgate Therapy Collective",
      organizationType: "community_organisation",
      registrationNumber: "CQC R-9911",
      registrationBody: "Care Quality Commission",
      contactName: "Priya Nair",
      contactEmail: "hello@northgate.example",
      contactPhone: "+44 117 496 0000",
      website: "https://northgate.example",
      clinicSpecialisms: ["Trauma informed", "LGBTQ+ affirming"],
      servicesOffered: ["Therapy (adult)", "Crisis support"],
      partnershipModels: ["Referral agreement", "Commission share"],
      acceptsReferrals: true,
      sendsReferrals: true,
      referralTypes: ["Assessment", "Therapy"],
      marketingConsent: true,
      languages: ["English", "Hindi"],
      yearsOperating: 9,
      cqcOrEquivalentNumber: "R-9911",
      billingCurrency: "GBP",
      commissionRatePercent: 12.5,
      bio: "Community mental health clinic.",
      consentedToPractice: true,
      consentedToDataSharing: true,
      termsAccepted: true,
    },
    invalid: { acceptsReferrals: true, referralTypes: [] },
  },
};

const uniq = Date.now();
const accounts = [];

async function main() {
  console.log("\n== 1. health ==");
  const health = await call("GET", "/api/health");
  check("health ok", health.status === 200 && health.json?.ok === true, JSON.stringify(health.json));

  console.log("\n== 2. portal metadata ==");
  const portals = await call("GET", "/api/meta/portals");
  check("6 portals exposed", portals.json?.portals?.length === 6, `got ${portals.json?.portals?.length}`);
  check("user portal needs no ethics", portals.json?.portals?.find((p) => p.key === "user")?.requiresEthics === false);
  check("therapist portal needs ethics", portals.json?.portals?.find((p) => p.key === "therapist")?.requiresEthics === true);
  check("journeys present", portals.json?.portals?.every((p) => Array.isArray(p.journey) && p.journey.length > 0));

  const options = await call("GET", "/api/meta/options");
  check("option lists exposed", Boolean(options.json?.options?.clinicalAreas?.length));

  console.log("\n== 3. signup validation ==");
  const weak = await call("POST", "/api/auth/signup", {
    email: "bad", password: "short", fullName: "A", role: "user", termsAccepted: false,
  });
  check("rejects invalid signup", weak.status === 422, `status=${weak.status}`);

  const noTerms = await call("POST", "/api/auth/signup", {
    email: `t${uniq}@example.com`, password: "Passw0rd123", fullName: "T", role: "user", termsAccepted: false,
  });
  check("rejects missing terms", noTerms.status === 422, `status=${noTerms.status}`);

  const noEthics = await call("POST", "/api/auth/signup", {
    email: `e${uniq}@example.com`, password: "Passw0rd123", fullName: "T", role: "therapist", termsAccepted: true,
  });
  check("therapist cannot skip ethics agreement", noEthics.status === 422, `status=${noEthics.status}`);

  const badRole = await call("POST", "/api/auth/signup", {
    email: `r${uniq}@example.com`, password: "Passw0rd123", fullName: "T", role: "wizard", termsAccepted: true,
  });
  check("rejects unknown portal", badRole.status === 422, `status=${badRole.status}`);

  console.log("\n== 4. signup + ethics + portal routing ==");
  for (const role of Object.keys(PORTALS)) {
    const email = `${role}.${uniq}@example.com`;
    const signup = await call("POST", "/api/auth/signup", {
      email,
      password: "Passw0rd123",
      fullName: `${role} tester`,
      role,
      termsAccepted: true,
      ethicsAccepted: role !== "user",
    });
    check(`signup ${role}`, signup.status === 201, JSON.stringify(signup.json).slice(0, 180));
    check(`${role} portal recorded`, signup.json?.user?.role === role, signup.json?.user?.role);
    check(`${role} status pending profile`, signup.json?.user?.status === "pending_profile", signup.json?.user?.status);
    check(`${role} redirected to own portal`, signup.json?.next === `/portal/${role}/profile`, signup.json?.next);
    check(
      `${role} ethics recorded correctly`,
      role === "user"
        ? signup.json?.user?.ethicsAccepted === false
        : signup.json?.user?.ethicsAccepted === true,
      `ethicsAccepted=${signup.json?.user?.ethicsAccepted}`
    );

    accounts.push({ role, email, token: signup.json?.token });
    token = signup.json?.token;
  }

  console.log("\n== 5. duplicate email ==");
  const dup = await call("POST", "/api/auth/signup", {
    email: accounts[0].email, password: "Passw0rd123", fullName: "Dup", role: "user", termsAccepted: true,
  });
  check("duplicate email rejected", dup.status === 409, `status=${dup.status}`);

  console.log("\n== 6. portal profile save ==");
  for (const acc of accounts) {
    const spec = PORTALS[acc.role];
    token = acc.token;

    const invalid = await call("PUT", `/api/profiles/${acc.role}`, spec.invalid);
    check(`${acc.role} rejects invalid payload`, invalid.status === 422, `status=${invalid.status} ${JSON.stringify(invalid.json)}`);

    const prof = await call("PUT", `/api/profiles/${acc.role}`, spec.valid);
    check(`${acc.role} profile saved`, prof.status === 200, JSON.stringify(prof.json).slice(0, 200));
    check(`${acc.role} now active`, prof.json?.user?.status === "active", prof.json?.user?.status);
    check(`${acc.role} lands in portal`, prof.json?.next === `/portal/${acc.role}`, prof.json?.next);

    const me = await call("GET", "/api/me");
    check(`${acc.role} /api/me has profile`, Boolean(me.json?.profile), JSON.stringify(me.json).slice(0, 140));
    check(`${acc.role} session still valid`, me.status === 200);
  }

  console.log("\n== 7. cross-portal protection ==");
  {
    token = (await call("POST", "/api/auth/login", { email: accounts[0].email, password: "Passw0rd123" })).json.token;
    check("login works after profile saved", Boolean(token));

    const other = await call("PUT", "/api/profiles/therapist", PORTALS.therapist.valid);
    check("user cannot write therapist portal", other.status === 400, `status=${other.status}`);

    const readOther = await call("GET", "/api/profiles/therapist");
    check("user cannot read therapist portal", readOther.status === 400, `status=${readOther.status}`);

    const readOwn = await call("GET", `/api/profiles/${accounts[0].role}`);
    check("user reads own portal", readOwn.status === 200, `status=${readOwn.status}`);

    const unknown = await call("PUT", "/api/profiles/wizard", {});
    check("unknown portal rejected", unknown.status === 400, `status=${unknown.status}`);
  }

  console.log("\n== 8. session handling ==");
  {
    const login = await call("POST", "/api/auth/login", { email: accounts[1].email, password: "Passw0rd123" });
    token = login.json?.token;
    check("login returns portal route", login.json?.next === `/portal/${accounts[1].role}`, login.json?.next);

    const logout = await call("POST", "/api/auth/logout");
    check("logout ok", logout.status === 200);

    const after = await call("GET", "/api/me");
    check("token revoked after logout", after.status === 401, `status=${after.status}`);
  }

  console.log("\n== 9. auth failures ==");
  {
    token = null;
    check("no token -> 401", (await call("GET", "/api/me")).status === 401);

    const badPass = await call("POST", "/api/auth/login", { email: accounts[0].email, password: "WrongPass1" });
    check("wrong password -> 401", badPass.status === 401, `status=${badPass.status}`);

    const res = await fetch(`${BASE}/api/me`, { headers: { Authorization: "Bearer not.a.jwt" } });
    check("garbage token -> 401", res.status === 401, `status=${res.status}`);

    const wrongScheme = await fetch(`${BASE}/api/me`, { headers: { Authorization: "Basic abc" } });
    check("wrong auth scheme -> 401", wrongScheme.status === 401);
  }

  console.log("\n== 10. personality test still works ==");
  {
    const email = `ptest.${uniq}@example.com`;
    token = (await call("POST", "/api/auth/signup", {
      email, password: "Passw0rd123", fullName: "PT", role: "user", termsAccepted: true,
    })).json.token;

    const qs = await call("GET", "/api/personality/questions");
    check("10 questions served", qs.json?.questions?.length === 10, `got ${qs.json?.questions?.length}`);

    const bad = await call("POST", "/api/personality/submit", { answers: [{ questionId: 1, value: 9 }] });
    check("out-of-range answer rejected", bad.status === 422, `status=${bad.status}`);

    const answers = qs.json.questions.map((q, i) => ({ questionId: q.id, value: (i % 5) + 1 }));
    const submit = await call("POST", "/api/personality/submit", { answers });
    check("test scored", submit.status === 200, JSON.stringify(submit.json).slice(0, 140));
    check("archetype returned", Boolean(submit.json?.result?.archetype?.label));
    check("5 trait scores", Object.keys(submit.json?.result?.scores ?? {}).length === 5);
    check("role fit covers 6 portals", submit.json?.result?.roleFit?.length === 6);

    const again = await call("POST", "/api/personality/submit", { answers });
    check("cannot retake", again.status === 409, `status=${again.status}`);

    const stored = await call("GET", "/api/personality/result");
    check("result retrievable", stored.status === 200 && Boolean(stored.json?.label));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke crashed:", err);
  process.exit(1);
});
