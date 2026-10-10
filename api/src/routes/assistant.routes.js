import { Router } from "express";

import { asyncHandler, parse } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { assistantAskSchema } from "../lib/schemas.js";
import { rag } from "../services/rag.js";

export const assistantRouter = Router();

export const ASSISTANT_DISCLAIMER =
  "Answers come from KINDRED TAP's own documentation. The assistant is not a therapist, " +
  "does not give diagnoses or treatment, and cannot respond in an emergency.";

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
 *  is deliberately short - but high enough that normal use never reaches it. */
assistantRouter.use(rateLimit({ name: "assistant-user", windowMs: 60_000, max: 12 }));

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
  asyncHandler(async (req, res) => {
    const { question } = parse(assistantAskSchema, req.body);

    if (CRISIS_PATTERN.test(question)) {
      return res.json({
        answer: CRISIS_MESSAGE,
        citations: [],
        insufficient: false,
        safety: true,
        disclaimer: ASSISTANT_DISCLAIMER,
      });
    }

    const result = await rag.answer(question);

    return res.json({ ...result, disclaimer: ASSISTANT_DISCLAIMER });
  })
);

export default assistantRouter;
