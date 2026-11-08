import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("[gemini] GEMINI_API_KEY is not configured");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const EMBEDDING_MODEL = "gemini-embedding-2";

/**
 * Create a semantic embedding for text.
 *
 * This is used for matching patient information against
 * therapist profiles.
 */
export async function generateEmbedding(text) {
  if (!ai) {
    throw new Error("Gemini API is not configured.");
  }

  if (!text || !text.trim()) {
    throw new Error("Cannot create an embedding from empty text.");
  }

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text.trim(),
  });

  const values = response?.embeddings?.[0]?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini returned an invalid embedding.");
  }

  return values;
}

/**
 * Calculate cosine similarity between two vectors.
 *
 * Result is normally between -1 and 1.
 * Higher means the meanings are more similar.
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return 0;
  }

  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return 0;
    }

    dot += x * y;
    magnitudeA += x * x;
    magnitudeB += y * y;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

/**
 * Convert a value into a safe text fragment.
 */
function clean(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return String(value).trim();
}

/**
 * Build the text that represents a therapist's practice.
 *
 * We deliberately only include information useful for matching.
 */
export function buildTherapistMatchingText(profile) {
  const parts = [
    `Discipline: ${clean(profile.discipline)}`,
    `Clinical areas: ${clean(profile.clinicalAreas)}`,
    `Therapy modalities: ${clean(profile.modalities)}`,
    `Qualifications: ${clean(profile.qualifications)}`,
    `Languages: ${clean(profile.languages)}`,
    `Session modes: ${clean(profile.sessionModes)}`,
    `Professional experience: ${clean(profile.yearsExperience)} years`,
    `Professional bio: ${clean(profile.bio)}`,
  ];

  return parts.filter((part) => !part.endsWith(": ")).join("\n");
}

/**
 * Build the text representing a patient's current situation.
 */
export function buildPatientMatchingText({
  primaryIssue,
  secondaryIssues,
  userDescription,
  assessmentSummary,
}) {
  const parts = [
    `Current concern: ${clean(primaryIssue)}`,
    `Other concerns: ${clean(secondaryIssues)}`,
    `Patient description: ${clean(userDescription)}`,
    `Assessment information: ${clean(assessmentSummary)}`,
  ];

  return parts.filter((part) => !part.endsWith(": ")).join("\n");
}