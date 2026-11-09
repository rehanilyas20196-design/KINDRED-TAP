import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";

const apiKey = env.geminiApiKey;

if (!apiKey) {
  console.warn("[gemini] GEMINI_API_KEY is not configured");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const EMBEDDING_MODEL = "gemini-embedding-2";

/**
 * Text model used for grounded answer generation. Overridable because the
 * available model names move and differ per account, so a wrong name should be
 * a config fix, not a code change.
 */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";

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
 * Embed many texts in one request. Used when indexing the knowledge base,
 * where a document becomes dozens of chunks that share one API round trip.
 *
 * The order of the returned vectors matches the order of `texts`.
 */
export async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("Texts must be a non-empty array.");
  }

  if (!ai) {
    throw new Error("Gemini API is not configured.");
  }

  const trimmed = texts.map((text) => String(text ?? "").trim());
  if (trimmed.some((text) => text === "")) {
    throw new Error("Cannot create an embedding from empty text.");
  }

  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: trimmed,
  });

  const vectors = response?.embeddings;

  if (!Array.isArray(vectors) || vectors.length !== trimmed.length) {
    throw new Error("Gemini returned the wrong number of embeddings.");
  }

  return vectors.map((vector) => vector.values);
}

/** Whether the API key is configured, for callers that can degrade gracefully. */
export function isConfigured() {
  return Boolean(ai);
}

/**
 * Plain text completion. Kept deliberately bare: no tools, no function
 * calling, no code execution. Callers decide what the model is allowed to
 * see; the model is never allowed to act.
 */
export async function generateText({
  prompt,
  systemInstruction,
  temperature = 0.2,
  maxOutputTokens = 700,
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error("Cannot generate text from an empty prompt.");
  }

  if (!ai) {
    throw new Error("Gemini API is not configured.");
  }

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
      temperature,
      maxOutputTokens,
    },
  });

  const text = response?.text;

  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Gemini returned an empty answer.");
  }

  return text.trim();
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