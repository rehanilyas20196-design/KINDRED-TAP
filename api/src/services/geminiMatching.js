/**
 * Semantic therapist matching.
 *
 * Two halves that deliberately do not mix:
 *
 *   - `gemini.js` is the API client. It turns text into a vector and knows
 *     nothing about therapists, patients or storage.
 *   - This file decides what text to embed, where the vector lives, and how
 *     two vectors are compared.
 *
 * The vector sits on the therapist row (`therapist_profiles.matching_embedding`)
 * rather than in a side table, so a therapist is one record to read, one
 * record to expire and one record to delete. The source text is stored next
 * to it in `matching_text`: when someone asks "why was this person matched",
 * the answer is a sentence, not a 768-length array.
 */

import { query, queryOne } from "../db/index.js";
import { generateEmbedding, isConfigured } from "./gemini.js";

/* ------------------------------------------------------------------ */
/* Source text                                                         */
/* ------------------------------------------------------------------ */

/**
 * The sentence a therapist is embedded from. Specialties arrive separately
 * because they live in their own table, not on the profile row.
 */
export function buildTherapistMatchingText(profile, specialties = []) {
  const parts = [];

  if (profile.discipline) parts.push(`${profile.discipline}`);
  if (specialties.length > 0) parts.push(`Specializing in ${specialties.join(", ")}`);
  if (profile.clinical_areas?.length > 0) {
    parts.push(`Clinical areas: ${profile.clinical_areas.join(", ")}`);
  }
  if (profile.modalities?.length > 0) {
    parts.push(`Modalities: ${profile.modalities.join(", ")}`);
  }
  if (profile.years_experience) parts.push(`${profile.years_experience} years of experience`);
  if (profile.bio) parts.push(profile.bio);

  return parts.filter(Boolean).join(". ") + ".";
}

/** The sentence a patient is embedded from. Each source is optional. */
export function buildPatientMatchingText(currentConcern, assessmentResult, userDescription) {
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
  if (assessmentResult?.summary) parts.push(`Assessment summary: ${assessmentResult.summary}`);
  if (assessmentResult?.user_description) {
    parts.push(`Assessment description: ${assessmentResult.user_description}`);
  }
  if (userDescription) parts.push(`Patient description: ${userDescription}`);

  return parts.filter(Boolean).join(". ") + ".";
}

/* ------------------------------------------------------------------ */
/* Embedding (pure - no database)                                      */
/* ------------------------------------------------------------------ */

/**
 * Embeds a therapist profile. Throws rather than returning a partial vector:
 * a half-filled profile should be completed, not ranked.
 */
export async function createTherapistEmbedding(profile, specialties = []) {
  const text = buildTherapistMatchingText(profile, specialties);

  if (!text.trim()) {
    throw new Error("Therapist does not have enough profile information.");
  }

  return generateEmbedding(text);
}

/**
 * Embeds a patient. Accepts the already-loaded matching data, or the source
 * text itself when the caller has built it.
 */
export async function createPatientEmbedding(data) {
  const text =
    typeof data === "string"
      ? data
      : buildPatientMatchingText(
          data?.currentConcern,
          data?.assessmentResult,
          data?.userDescription
        );

  if (!text.trim()) {
    throw new Error("Patient does not have enough matching information.");
  }

  return generateEmbedding(text);
}

/** Cosine similarity between two vectors; anything uncomparable scores 0. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;

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

/**
 * Orders therapists best-first against a patient vector. Therapists without a
 * usable vector are dropped rather than scored 0: a missing vector is not
 * evidence of a bad match, it is evidence of nothing.
 */
export function rankTherapists(patientEmbedding, therapists) {
  return therapists
    .map((therapist) => {
      const embedding = parseEmbedding(therapist.embedding);
      if (!embedding) return null;

      return { ...therapist, matchScore: cosineSimilarity(patientEmbedding, embedding) };
    })
    .filter((therapist) => therapist !== null && Number.isFinite(therapist.matchScore))
    .sort((a, b) => b.matchScore - a.matchScore);
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

/** Stored vectors are JSON text; a corrupt or absent one reads as null. */
function parseEmbedding(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function getTherapistSpecialties(therapistId) {
  const { rows } = await query(
    `SELECT i.label
       FROM therapist_specialties ts
       JOIN issues i ON i.id = ts.issue_id
      WHERE ts.therapist_id = $1
      ORDER BY i.position`,
    [therapistId]
  );
  return rows.map((row) => row.label);
}

async function getTherapistProfile(therapistId) {
  return queryOne(
    `SELECT discipline, clinical_areas, modalities, years_experience, bio
       FROM therapist_profiles
      WHERE user_id = $1`,
    [therapistId]
  );
}

/** The newest things we know about what a person is looking for. */
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

/**
 * Embeds a therapist and writes the vector onto their profile row.
 *
 * Returns a result object instead of throwing: both callers fire this in the
 * background after a save, and a Gemini outage must never fail the save.
 */
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

    if (!profile) return { skipped: true, reason: "no_profile" };

    const sourceText = buildTherapistMatchingText(profile, specialties);
    if (!sourceText.trim()) return { skipped: true, reason: "empty_source_text" };

    const embedding = await generateEmbedding(sourceText);

    await query(
      `UPDATE therapist_profiles
          SET matching_embedding = $2,
              matching_text = $3,
              matching_embedding_updated_at = now()
        WHERE user_id = $1`,
      [therapistId, JSON.stringify(embedding), sourceText]
    );

    return { success: true, dimensions: embedding.length };
  } catch (error) {
    console.error("[geminiMatching] Failed to generate/store therapist embedding:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Embeds a patient from their stored concern and assessment.
 *
 * Callers expect `{ success, embedding }` or a skip reason, never a throw, so
 * a search still returns keyword matches when Gemini is unavailable.
 */
export async function generatePatientEmbedding(userId, additionalDescription = "") {
  if (!isConfigured()) {
    return { skipped: true, reason: "not_configured" };
  }

  try {
    const { currentConcern, assessmentResult } = await getLatestPatientMatchingData(userId);

    if (!currentConcern?.primary_issue_key && !assessmentResult?.summary) {
      return { skipped: true, reason: "insufficient_data" };
    }

    const sourceText = buildPatientMatchingText(
      currentConcern,
      assessmentResult,
      additionalDescription
    );

    if (!sourceText.trim()) return { skipped: true, reason: "empty_source_text" };

    const embedding = await generateEmbedding(sourceText);
    return { success: true, embedding, sourceText };
  } catch (error) {
    console.error("[geminiMatching] Failed to generate patient embedding:", error.message);
    return { success: false, error: error.message };
  }
}

/** One therapist's stored vector, already parsed. */
export async function getTherapistEmbedding(therapistId) {
  const row = await queryOne(
    `SELECT matching_embedding FROM therapist_profiles WHERE user_id = $1`,
    [therapistId]
  );
  return parseEmbedding(row?.matching_embedding);
}

/** Every stored vector, in the shape `rankTherapists` consumes. */
export async function getAllTherapistEmbeddings() {
  const { rows } = await query(
    `SELECT user_id AS therapist_id, matching_embedding
       FROM therapist_profiles
      WHERE matching_embedding IS NOT NULL`
  );

  return rows
    .map((row) => ({ therapist_id: row.therapist_id, embedding: parseEmbedding(row.matching_embedding) }))
    .filter((row) => row.embedding !== null);
}
