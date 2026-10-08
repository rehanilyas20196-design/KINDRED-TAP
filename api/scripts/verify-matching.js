/**
 * End-to-end check of the assessment, categorisation and matching flow.
 * Run against a live API: node scripts/verify-matching.js
 *
 * Defaults to 127.0.0.1 rather than localhost: Node resolves localhost to
 * ::1 first, and a server bound to IPv4 only refuses that connection.
 */

const BASE = process.env.API_BASE ?? "http://127.0.0.1:4000";

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${JSON.stringify(detail)}` : ""}`);
  }
}

async function call(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function signup(label, role, fullName) {
  const email = `${label}.${Date.now()}@kindredtap.test`;
  const { data } = await call("/api/auth/signup", {
    method: "POST",
    body: {
      email,
      password: "Passw0rd123",
      confirmPassword: "Passw0rd123",
      fullName,
      role,
      ethicsAccepted: true,
      termsAccepted: true,
    },
  });
  return { token: data?.token, userId: data?.user?.id, email, name: data?.user?.fullName };
}

(async () => {
  console.log("\n== auth and reference data ==");
  const anon = await call("/api/clinical/issues");
  check("issues require auth", anon.status === 401, anon.data);

  const user = await signup("verify.user", "user", "Verify User");
  check("user signed up", Boolean(user.token), user);

  const issues = await call("/api/clinical/issues", { token: user.token });
  check("issue list returned", (issues.data?.issues?.length ?? 0) >= 10, issues.data?.total);
  const anger = issues.data?.issues?.find((i) => i.key === "ANGER");

  const questions = await call("/api/clinical/questions", { token: user.token });
  check("questions returned", (questions.data?.questions?.length ?? 0) === 20, questions.data?.total);

  const t1 = questions.data.questions.filter((q) => q.testNumber === 1);
  const t2 = questions.data.questions.filter((q) => q.testNumber === 2);
  check("split into two tests", t1.length === 10 && t2.length === 10, { t1: t1.length, t2: t2.length });

  // The instrument types must be what the user actually sees. A regression that
  // turned Test 1 into radio groups would still "pass" a count check.
  check(
    "test 1 is all true/false",
    t1.every((q) => q.questionType === "true_false"),
    t1.map((q) => q.questionType)
  );
  check(
    "test 2 is all four-option",
    t2.every((q) => q.questionType === "multiple_choice" && q.options?.length === 4),
    t2.map((q) => q.options?.length)
  );
  // Reverse-keyed items must not be exposed, or the client learns the answer key.
  check("scoring config withheld from clients", t1.every((q) => q.scoringConfig === undefined));

  console.log("\n== assessment ==");
  const created = await call("/api/clinical/assessments", { method: "POST", token: user.token });
  check("assessment created", created.status === 201, created.data);
  const assessmentId = created.data?.assessment?.id;

  // Test 1: True/False, so value 1 = False and 2 = True. Answer False
  // everywhere except one anger item answered True, which should surface ANGER
  // as the primary concern. Everything False is the lowest-concern pattern, so
  // any category that still scores high is a reverse-keying bug.
  const low = t1.map((q) => ({ questionId: q.id, value: 1 }));
  const savedLow = await call(`/api/clinical/assessments/${assessmentId}/answers`, {
    method: "PUT",
    token: user.token,
    body: { answers: low },
  });
  check("test 1 answers saved", savedLow.status === 200, savedLow.data);

  const badAnswer = await call(`/api/clinical/assessments/${assessmentId}/answers`, {
    method: "PUT",
    token: user.token,
    body: { answers: [{ questionId: t1[0].id, value: 9 }] },
  });
  check("out-of-range answer rejected", badAnswer.status === 422, badAnswer.data);

  const unknownQuestion = await call(`/api/clinical/assessments/${assessmentId}/answers`, {
    method: "PUT",
    token: user.token,
    body: {
      answers: [{ questionId: "00000000-0000-0000-0000-000000000000", value: 3 }],
    },
  });
  check("unknown question rejected", unknownQuestion.status === 400, unknownQuestion.data);

  // Test 2: anger at the most severe option, stress next, everything else least
  // severe. Expected outcome is primary ANGER with STRESS secondary.
  const high = t2.map((q) => ({
    questionId: q.id,
    value: q.category === "ANGER" ? 4 : q.category === "STRESS" ? 3 : 1,
  }));
  await call(`/api/clinical/assessments/${assessmentId}/answers`, {
    method: "PUT",
    token: user.token,
    body: { answers: high },
  });

  // One Test 1 anger item answered True, so ANGER is high in both tests rather
  // than only in Test 2.
  await call(`/api/clinical/assessments/${assessmentId}/answers`, {
    method: "PUT",
    token: user.token,
    body: {
      answers: [
        ...low,
        { questionId: t1.find((q) => q.category === "ANGER").id, value: 2 },
      ],
    },
  });

  const completed = await call(`/api/clinical/assessments/${assessmentId}/complete`, {
    method: "POST",
    token: user.token,
    body: {
      selectedConcerns: [],
      userDescription: "I have been snapping at people at work and I cannot stop it.",
    },
  });
  check("assessment completed", completed.status === 200, completed.data);
  check("primary issue is ANGER", completed.data?.primaryIssue === "ANGER", completed.data?.primaryIssue);
  check("STRESS surfaced as secondary", completed.data?.secondaryIssues?.includes("STRESS"), completed.data?.secondaryIssues);
  check("summary is not a diagnosis", /indicate concerns/i.test(completed.data?.summary ?? ""), completed.data?.summary);
  check("did not name a condition", !/you have (anxiety|depression|insomnia)/i.test(completed.data?.summary ?? ""));
  check("worked with no AI provider", completed.data?.source === "fallback", completed.data?.source);

  const twice = await call(`/api/clinical/assessments/${assessmentId}/complete`, {
    method: "POST",
    token: user.token,
    body: { selectedConcerns: [] },
  });
  check("cannot complete twice", twice.status === 409, twice.data);

  console.log("\n== matching ==");
  const match = await call("/api/matching/therapists", {
    method: "POST",
    token: user.token,
    body: { primaryIssueKey: "ANGER", secondaryIssues: ["STRESS"] },
  });
  check("matching returned", match.status === 200, match.data);
  check("ANGER returned no therapists", match.data?.total === 0, match.data?.therapists);

  const stressMatch = await call("/api/matching/therapists", {
    method: "POST",
    token: user.token,
    body: { primaryIssueKey: "STRESS", secondaryIssues: ["ANXIETY"] },
  });
  check("STRESS found the demo therapist", stressMatch.data?.total === 1, stressMatch.data?.total);
  check("secondary STRESS overlap shown", stressMatch.data?.therapists?.[0]?.secondaryOverlap >= 1, stressMatch.data?.therapists?.[0]?.secondaryOverlap);
  check("privacy: no phone in payload", !("phone" in (stressMatch.data?.therapists?.[0] ?? {})));

  const badKey = await call("/api/matching/therapists", {
    method: "POST",
    token: user.token,
    body: { primaryIssueKey: "NOT_A_THING" },
  });
  check("unknown concern rejected", badKey.status === 400, badKey.data);

  const current = await call("/api/matching/therapists/current", { token: user.token });
  check("current-concern search works", current.data?.primaryIssue?.key === "ANGER", current.data?.primaryIssue);

  console.log("\n== returning user ==");
  const other = await signup("verify.other", "user", "Verify Other");
  const fresh = await call("/api/clinical/current-concern", {
    method: "POST",
    token: other.token,
    body: { primaryIssueKey: "SLEEP", secondaryIssues: [], userDescription: "Not sleeping well." },
  });
  check("new concern stored", fresh.status === 200, fresh.data);
  const freshMatch = await call("/api/matching/therapists/current", { token: other.token });
  check("matches on the NEW concern, not the first one", freshMatch.data?.primaryIssue?.key === "SLEEP", freshMatch.data?.primaryIssue);

  // Changing the concern again must supersede the previous one.
  await call("/api/clinical/current-concern", {
    method: "POST",
    token: other.token,
    body: { primaryIssueKey: "STRESS", secondaryIssues: [] },
  });
  const changed = await call("/api/matching/therapists/current", { token: other.token });
  check("concern change takes effect", changed.data?.primaryIssue?.key === "STRESS", changed.data?.primaryIssue);

  const dupSecondary = await call("/api/clinical/current-concern", {
    method: "POST",
    token: other.token,
    body: { primaryIssueKey: "SLEEP", secondaryIssues: ["SLEEP"] },
  });
  check("primary cannot repeat as secondary", dupSecondary.status === 422, dupSecondary.data);

  console.log("\n== history ==");
  const history = await call("/api/clinical/history", { token: user.token });
  check("own history returned", history.data?.total === 1, history.data?.total);
  const concernHistory = await call("/api/clinical/current-concern/history", { token: other.token });
  check("concern history appends", concernHistory.data?.total === 2, concernHistory.data?.total);

  console.log("\n== safety ==");
  const risky = await signup("verify.risk", "user", "Verify Risk");
  const riskyConcern = await call("/api/clinical/current-concern", {
    method: "POST",
    token: risky.token,
    body: { primaryIssueKey: "STRESS", userDescription: "I have been thinking about suicide." },
  });
  check("safety screen trips", riskyConcern.data?.isHighRisk === true, riskyConcern.data);
  check("safety message shown", typeof riskyConcern.data?.safetyMessage === "string");
  check(
    "no therapists pushed at a flagged user",
    riskyConcern.data?.concern?.primaryIssueKey === null,
    riskyConcern.data?.concern?.primaryIssueKey
  );

  const riskyMatch = await call("/api/matching/therapists", {
    method: "POST",
    token: risky.token,
    body: { primaryIssueKey: "STRESS", userDescription: "I want to kill myself" },
  });
  check("risky search returns safety, not matches", riskyMatch.data?.isHighRisk === true && riskyMatch.data?.total === 0, riskyMatch.data);

  console.log("\n== authorisation ==");
  const stolen = await call(`/api/clinical/assessments/${assessmentId}`, { token: other.token });
  check("cannot read another assessment", stolen.status === 403, stolen.status);

  const historyPeek = await call("/api/clinical/history", { token: other.token });
  check("history only shows own rows", historyPeek.data?.history?.every((h) => h.assessment_id !== assessmentId));

  console.log("\n== therapist specialties ==");
  const therapist = await signup("verify.therapist", "therapist", "Verify Therapist");
  const forbiddenRole = await call("/api/matching/specialties", { token: user.token });
  check("users cannot manage specialties", forbiddenRole.status === 403, forbiddenRole.status);

  const options = await call("/api/matching/specialties", { token: therapist.token });
  check("therapist sees full vocabulary", (options.data?.specialties?.length ?? 0) >= 10, options.data?.total);

  const saved = await call("/api/matching/specialties", {
    method: "PUT",
    token: therapist.token,
    body: { issueKeys: ["ANGER", "STRESS"] },
  });
  check("specialties saved", saved.status === 200, saved.data);

  const tooFew = await call("/api/matching/specialties", {
    method: "PUT",
    token: therapist.token,
    body: { issueKeys: [] },
  });
  check("empty specialty set rejected", tooFew.status === 422, tooFew.status);

  const unknown = await call("/api/matching/specialties", {
    method: "PUT",
    token: therapist.token,
    body: { issueKeys: ["NOPE"] },
  });
  check("arbitrary specialty rejected", unknown.status === 400, unknown.data);

  const dupPrimary = await call("/api/clinical/current-concern", {
    method: "POST",
    token: user.token,
    body: { primaryIssueKey: anger.key, secondaryIssues: [anger.key] },
  });
  check("primary/secondary overlap rejected", dupPrimary.status === 422, dupPrimary.status);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error("\nharness error:", error?.message ?? error);
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(1);
});