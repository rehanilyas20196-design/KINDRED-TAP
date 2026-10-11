import { query, queryOne } from "../db/index.js";

/**
 * Conversation memory for Ask Cube.
 *
 * A conversation belongs to exactly one account. Every statement here scopes
 * by `user_id`, so an id lifted out of a URL or guessed can never surface
 * somebody else's chat - the row simply does not exist from that caller's
 * point of view.
 *
 * Only the turns are stored, never the retrieved chunks: the knowledge base
 * is public documentation and there is no reason to duplicate it per person.
 */

/** How long a conversation is kept before `pruneConversations` retires it. */
export const RETENTION_DAYS = Number(process.env.ASSISTANT_RETENTION_DAYS || 90);

/** Turns supplied by a client are capped here too, in case they bypass the schema. */
const MAX_TURNS = 20;
const TITLE_CHARS = 80;

function normaliseTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant"))
    .map((turn) => ({
      role: turn.role,
      content: String(turn.content ?? "").trim().slice(0, 600),
      kind: typeof turn.kind === "string" ? turn.kind.slice(0, 32) : "conversation",
      citations: Array.isArray(turn.citations) ? turn.citations.slice(0, 8) : [],
    }))
    .filter((turn) => turn.content)
    .slice(-MAX_TURNS);
}

function titleFrom(content) {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "New conversation";
  return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1)}…` : text;
}

export async function listConversations(userId) {
  const { rows } = await query(
    `SELECT id, title, created_at, updated_at,
            (SELECT count(*) FROM assistant_messages m WHERE m.conversation_id = c.id)::int AS turns
       FROM assistant_conversations c
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 50`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    turns: Number(row.turns ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createConversation(userId, title = null) {
  const row = await queryOne(
    `INSERT INTO assistant_conversations (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at`,
    [userId, title]
  );
  return row;
}

/** Loads a conversation and its turns, but only if it belongs to `userId`. */
export async function getConversation(userId, conversationId) {
  const conversation = await queryOne(
    `SELECT id, title, created_at, updated_at
       FROM assistant_conversations
      WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (!conversation) return null;

  const { rows } = await query(
    `SELECT role, content, kind, citations, created_at
       FROM assistant_messages
      WHERE conversation_id = $1
      ORDER BY created_at, id`,
    [conversationId]
  );

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    messages: rows.map((row) => ({
      role: row.role,
      content: row.content,
      kind: row.kind,
      citations: row.citations ?? [],
      createdAt: row.created_at,
    })),
  };
}

/**
 * Appends a user message and the reply, creating the conversation on the
 * first turn. Returns the conversation id so the client can carry it forward.
 */
export async function appendTurns(userId, conversationId, turns, { title } = {}) {
  const entries = normaliseTurns(turns);
  if (entries.length === 0) return null;

  let id = conversationId || null;
  if (id) {
    const owned = await queryOne(
      `SELECT id, title FROM assistant_conversations WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!owned) id = null;
  }

  if (!id) {
    const created = await createConversation(userId, title ?? titleFrom(entries[0]?.content));
    id = created.id;
  }

  for (const turn of entries) {
    await query(
      `INSERT INTO assistant_messages (conversation_id, role, content, kind, citations)
            VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [id, turn.role, turn.content, turn.kind, JSON.stringify(turn.citations)]
    );
  }

  await query(`UPDATE assistant_conversations SET updated_at = now() WHERE id = $1`, [id]);
  return id;
}

export async function deleteConversation(userId, conversationId) {
  const { rows } = await query(
    `DELETE FROM assistant_conversations WHERE id = $1 AND user_id = $2 RETURNING id`,
    [conversationId, userId]
  );
  return rows.length > 0;
}

/** "Start a new conversation" also means "forget the old ones" on request. */
export async function deleteAllConversations(userId) {
  const { rows } = await query(
    `DELETE FROM assistant_conversations WHERE user_id = $1 RETURNING id`,
    [userId]
  );
  return rows.length;
}

/**
 * Retention sweep. Conversations are not needed to answer anything - the
 * knowledge base is shared, not personal - so they are kept only long enough
 * to be useful and then dropped.
 */
export async function pruneConversations({ days = RETENTION_DAYS } = {}) {
  const { rows } = await query(
    `DELETE FROM assistant_conversations WHERE updated_at < now() - ($1 || ' days')::interval RETURNING id`,
    [String(Math.max(1, days))]
  );
  return rows.length;
}
