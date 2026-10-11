import { Router } from "express";

import { asyncHandler, parse } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { assistantAskSchema, assistantConversationIdSchema } from "../lib/schemas.js";
import { rag } from "../services/rag.js";
import {
  appendTurns,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  getConversation,
  listConversations,
  pruneConversations,
} from "../services/conversation-store.js";

export const assistantRouter = Router();

export const ASSISTANT_DISCLAIMER =
  "Ask Cube answers from KINDRED TAP's own documentation, and converses when there is " +
  "nothing there to cite. It is not a therapist, does not give diagnoses or treatment, " +
  "and cannot respond in an emergency.";

/**
 * Language that means danger rather than a product question. Anything here is
 * answered from a fixed script without a retrieval or a model call, so a
 * person in crisis is never handed an LLM.
 */
const CRISIS_PATTERN =
  /\b(suicid\w*|kill\s*myself|end\s*(my|it\s*all)|want\s*to\s*die|do(?:n't| not)\s+want\s+to\s+(live|be\s+here)|self[-\s]?harm|hurt\s*myself|take\s+my\s+own\s+life|no\s+reason\s+to\s+live|better\s*off\s*dead)\b/i;

const CRISIS_MESSAGE =
  "I'm not able to help with that, and this assistant is not monitored. Please contact your " +
  "local emergency number, a crisis line in your country, or your therapist now. If you are " +
  "in the UK and prefer to talk, Samaritans are on 116 123, free at any time.";

/** Tight window on unauthenticated traffic, applied before the session lookup. */
assistantRouter.use(rateLimit({ name: "assistant-ip", windowMs: 60_000, max: 30 }));

assistantRouter.use(requireAuth);

/** Every ask costs a retrieval plus a model call, so the per-account window
 *  is deliberately short - but high enough that normal use never reaches it.
 *  Scoped to the endpoints that spend money so listing a conversation cannot
 *  eat the budget for asking one. */
const askBudget = rateLimit({ name: "assistant-user", windowMs: 60_000, max: 12 });

/**
 * The turns the model should see: the stored conversation when one was named,
 * otherwise whatever the client is carrying. The client copy exists so a
 * browser that has not got a conversation id yet can still hold a follow-up.
 */
async function turnsFor(userId, { conversationId, newConversation, history }) {
  if (conversationId && !newConversation) {
    const stored = await getConversation(userId, conversationId);
    if (stored) {
      return {
        conversationId: stored.id,
        turns: stored.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      };
    }
    // An unknown id is not an error: it is a client that invented one. Start
    // fresh rather than telling the person their conversation is not theirs.
  }
  return { conversationId: null, turns: Array.isArray(history) ? history : [] };
}

/**
 * Whether the assistant has anything to answer with. The web app hides the
 * assistant entirely when this says it is not configured, rather than showing
 * a box that can only ever refuse.
 */
assistantRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    res.json(await rag.stats());
  })
);

assistantRouter.post(
  "/ask",
  askBudget,
  asyncHandler(async (req, res) => {
    const { question, conversationId, newConversation, history } = parse(
      assistantAskSchema,
      req.body
    );

    const previous = await turnsFor(req.user.id, {
      conversationId,
      newConversation,
      history,
    });

    const crisis = CRISIS_PATTERN.test(question);

    const result = crisis
      ? {
          answer: CRISIS_MESSAGE,
          citations: [],
          insufficient: false,
          safety: true,
          kind: "safety",
        }
      : await rag.answer(question, { history: previous.turns });

    const savedId = await appendTurns(
      req.user.id,
      previous.conversationId,
      [
        { role: "user", content: question },
        {
          role: "assistant",
          content: result.answer,
          kind: result.kind ?? "conversation",
          citations: result.citations ?? [],
        },
      ],
      { title: previous.conversationId ? null : question }
    );

    return res.json({
      ...result,
      disclaimer: ASSISTANT_DISCLAIMER,
      conversationId: savedId,
    });
  })
);

/* ------------------------------------------------------------------ *
 * Conversations
 * ------------------------------------------------------------------ */

assistantRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    // Opportunistic retention sweep: listing is infrequent enough that this
    // costs nothing, and it means no scheduled job has to exist.
    await pruneConversations().catch(() => 0);
    res.json({ conversations: await listConversations(req.user.id) });
  })
);

assistantRouter.post(
  "/conversations",
  askBudget,
  asyncHandler(async (req, res) => {
    const conversation = await createConversation(req.user.id);
    res.status(201).json({ conversation: { id: conversation.id, title: conversation.title, messages: [] } });
  })
);

assistantRouter.get(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const { id } = parse(assistantConversationIdSchema, req.params);
    const conversation = await getConversation(req.user.id, id);
    if (!conversation) {
      return res.status(404).json({ error: "No conversation with that id" });
    }
    res.json({ conversation });
  })
);

assistantRouter.delete(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const { id } = parse(assistantConversationIdSchema, req.params);
    const removed = await deleteConversation(req.user.id, id);
    if (!removed) {
      return res.status(404).json({ error: "No conversation with that id" });
    }
    res.json({ removed: true, id });
  })
);

assistantRouter.delete(
  "/conversations",
  asyncHandler(async (req, res) => {
    const removed = await deleteAllConversations(req.user.id);
    res.json({ removed });
  })
);

export default assistantRouter;
