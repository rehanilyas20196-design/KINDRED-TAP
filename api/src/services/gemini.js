import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";

const EMBEDDING_MODEL = "gemini-embedding-001";

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