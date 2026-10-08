import { query, queryOne, transaction } from "../db/index.js";
import { generateEmbedding, isConfigured } from "./gemini.js";

const EMBEDDING_MODEL = "gemini-embedding-001";

function buildTherapistMatchingText(profile, specialties) {
  const parts = [];

  if (profile.discipline) {
    parts.push(`${profile.discipline}`);
  }

  if (specialties.length > 0) {
    parts.push(`Specializing in ${specialties.join(", ")}`);
  }

  if (profile.clinical_areas?.length > 0) {
    parts.push(`Clinical areas: ${profile.clinical_areas.join(", ")}`);
  }

  if (profile.modalities?.length > 0) {
    parts.push(`Modalities: ${profile.modalities.join(", ")}`);
  }

  if (profile.years_experience) {
    parts.push(`${profile.years_experience} years of experience`);
  }

  if (profile.bio) {
    parts.push(profile.bio);
  }

  return parts.filter(Boolean).join(". ") + ".";
}

function buildPatientMatchingText(currentConcern, assessmentResult, userDescription) {
  const parts = [];

  if (currentConcern?.primary_issue_key) {
    parts.push(`Current concern: ${currentConcern.primary_issue_key}`);
  }

  if (currentConcern?.secondary_issues?.length > 0) {
    parts.push(`Additional concerns: ${currentConcern.secondary_issues.join(", ")}`);
  }

  if (currentConcern?.user_description) {
    parts.push(`Current description: ${currentConcern.user_description}`);
  }

  if (assessmentResult?.summary) {
    parts.push(`Assessment summary: ${assessmentResult.summary}`);
  }

  if (assessmentResult?.user_description) {
    parts.push(`Assessment description: ${assessmentResult.user_description}`);
  }

  if (userDescription) {
    parts.push(`Patient description: ${userDescription}`);
  }

  return parts.filter(Boolean).join(". ") + ".";
}

async function getTherapistSpecialties(therapistId) {
  const { rows } = await query(
    `SELECT i.key, i.label
       FROM therapist_specialties ts
       JOIN issues i ON i.id = ts.issue_id
      WHERE ts.therapist_id = $1
      ORDER BY i.position`,
    [therapistId]
  );
  return rows.map((r) => r.label);
}

async function getTherapistProfile(therapistId) {
  return queryOne(
    `SELECT discipline, clinical_areas, modalities, years_experience, bio
       FROM therapist_profiles
      WHERE user_id = $1`,
    [therapistId]
  );
}

export async function getLatestPatientMatchingData(userId) {
  const [currentConcern, assessmentResult] = await Promise.all([
    queryOne(
      `SELECT primary_issue_key, secondary_issues, user_description, summary
         FROM user_current_concerns
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId]
    ),
    queryOne(
      `SELECT summary, user_description
         FROM assessment_results
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId]
    ),
  ]);

  return { currentConcern, assessmentResult };
}

export async function generatePatientEmbedding(userId, additionalDescription = "") {
  if (!isConfigured()) {
    return { skipped: true, reason: "not_configured" };
  }

  try {
    const { currentConcern, assessmentResult } = await getLatestPatientMatchingData(userId);

    if (!currentConcern?.primary_issue_key && !assessmentResult?.summary) {
      return { skipped: true, reason: "insufficient_data" };
    }

    const sourceText = buildPatientMatchingText(currentConcern, assessmentResult, additionalDescription);

    if (!sourceText.trim()) {
      return { skipped: true, reason: "empty_source_text" };
    }

    const embedding = await generateEmbedding(sourceText);
    return { success: true, embedding, sourceText };
  } catch (error) {
    console.error("[geminiMatching] Failed to generate patient embedding:", error.message);
    return { success: false, error: error.message };
  }
}

export async function generateAndStoreTherapistEmbedding(therapistId) {
  if (!isConfigured()) {
    console.log("[geminiMatching] Skipping embedding generation: GEMINI_API_KEY not configured");
    return { skipped: true, reason: "not_configured" };
  }

  try {
    const [profile, specialties] = await Promise.all([
      getTherapistProfile(therapistId),
      getTherapistSpecialties(therapistId),
    ]);

    if (!profile) {
      return { skipped: true, reason: "no_profile" };
    }

    const sourceText = buildTherapistMatchingText(profile, specialties);

    if (!sourceText.trim()) {
      return { skipped: true, reason: "empty_source_text" };
    }

    const embedding = await generateEmbedding(sourceText);

    await query(
      `INSERT INTO therapist_embeddings (therapist_id, embedding, model, source_text, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, now())
       ON CONFLICT (therapist_id) DO UPDATE SET
         embedding   = EXCLUDED.embedding,
         model       = EXCLUDED.model,
         source_text = EXCLUDED.source_text,
         updated_at  = now()`,
      [therapistId, JSON.stringify(embedding), EMBEDDING_MODEL, sourceText]
    );

    return { success: true, dimensions: embedding.length };
  } catch (error) {
    console.error("[geminiMatching] Failed to generate/store therapist embedding:", error.message);
    return { success: false, error: error.message };
  }
}

export async function getTherapistEmbedding(therapistId) {
  const row = await queryOne(
    `SELECT embedding FROM therapist_embeddings WHERE therapist_id = $1`,
    [therapistId]
  );
  return row?.embedding ?? null;
}

export async function getAllTherapistEmbeddings() {
  const { rows } = await query(
    `SELECT therapist_id, embedding FROM therapist_embeddings`
  );
  return rows;
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export { buildTherapistMatchingText };