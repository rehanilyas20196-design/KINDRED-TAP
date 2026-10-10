import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";

const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Text model used for grounded answer generation. Overridable because the
 * available model names move and differ per account - the key in this project
 * rejects older names outright - so a wrong name should be a config fix, not
 * a code change.
 */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";

let client = null;

function getClient() {
  if (!client) {
    if (!env.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment");
    }
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return client;
}

export async function generateEmbedding(text) {
  if (!text || typeof text !== "string" || text.trim() === "") {
    throw new Error("Text must be a non-empty string");
  }

  const client = getClient();

  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text.trim(),
      config: {
        taskType: "SEMANTIC_SIMILARITY",
      },
    });

    if (!response?.embeddings?.[0]?.values) {
      throw new Error("No embedding returned from Gemini");
    }

    return response.embeddings[0].values;
  } catch (error) {
    const message = error?.message ?? "Unknown error";
    console.error("[gemini] Embedding generation failed:", message);
    throw new Error(`Failed to generate embedding: ${message}`);
  }
}

export async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("Texts must be a non-empty array");
  }

  const client = getClient();

  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts.map((t) => t.trim()),
      config: {
        taskType: "SEMANTIC_SIMILARITY",
      },
    });

    if (!response?.embeddings || response.embeddings.length !== texts.length) {
      throw new Error("Embedding count mismatch");
    }

    return response.embeddings.map((e) => e.values);
  } catch (error) {
    const message = error?.message ?? "Unknown error";
    console.error("[gemini] Batch embedding generation failed:", message);
    throw new Error(`Failed to generate embeddings: ${message}`);
  }
}

export function isConfigured() {
  return Boolean(env.geminiApiKey);
}

/**
 * Plain text completion. Kept deliberately bare: no tools, no function
 * calling, no code execution. Callers decide what the model is allowed to
 * see; the model is never allowed to act.
 *
 * A transient "model is busy" is retried once, because the alternative is a
 * user seeing a failure for something that clears in a second.
 */
export async function generateText({ prompt, systemInstruction, temperature = 0.2, maxOutputTokens = 700 }) {
  if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
    throw new Error("Prompt must be a non-empty string");
  }

  const client = getClient();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await client.models.generateContent({
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
        throw new Error("No text returned from Gemini");
      }

      return text.trim();
    } catch (error) {
      const message = error?.message ?? "Unknown error";
      const transient = attempt === 1 && /\b(429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded)\b/i.test(message);

      if (transient) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }

      console.error("[gemini] Text generation failed:", message);
      throw new Error(`Failed to generate text: ${message}`);
    }
  }

  throw new Error("Failed to generate text: exhausted retries");
}