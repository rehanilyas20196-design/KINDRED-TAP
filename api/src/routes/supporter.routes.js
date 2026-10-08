import { Router } from "express";
import { z } from "zod";
import { asyncHandler, badRequest, forbidden, parse } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { recordEscalation } from "../lib/advisor.js";

export const supporterRouter = Router();

supporterRouter.use(requireAuth);

function checkSupporter(req) {
  if (req.user.role !== "supporter") {
    throw forbidden("Only peer supporters can access supporter tools");
  }
}

// Mock seed matched requests for demonstration / initial load
const MOCK_SUPPORTER_REQUESTS = [
  {
    id: "req-sup-101",
    clientAlias: "Jordan K.",
    ageRange: "22-26",
    topic: "Work Stress & Anxiety",
    matchScore: 94,
    matchedReasons: ["Lived experience with workplace burnout", "Preferred communication mode: Chat"],
    summary: "Feeling overwhelmed by workload and constant pressure. Seeking peer encouragement from someone who has navigated workplace burnout.",
    urgency: "Medium",
    requestedAt: new Date(Date.now() - 3600000).toISOString(),
    status: "pending",
  },
  {
    id: "req-sup-102",
    clientAlias: "Sam T.",
    ageRange: "28-32",
    topic: "Life Transition & Isolation",
    matchScore: 89,
    matchedReasons: ["Relocation experience", "Shared age bracket"],
    summary: "Recently moved to a new city alone. Struggling with loneliness and building a support network.",
    urgency: "Low",
    requestedAt: new Date(Date.now() - 86400000).toISOString(),
    status: "pending",
  },
];

const completedSessionsStore = [];

/** GET /api/supporter/requests - Get matched peer support requests */
supporterRouter.get(
  "/requests",
  asyncHandler(async (req, res) => {
    checkSupporter(req);
    res.json({ requests: MOCK_SUPPORTER_REQUESTS });
  })
);

/** POST /api/supporter/requests/:id/accept - Accept a matched request */
supporterRouter.post(
  "/requests/:id/accept",
  asyncHandler(async (req, res) => {
    checkSupporter(req);
    const { id } = req.params;
    const item = MOCK_SUPPORTER_REQUESTS.find((r) => r.id === id);
    if (!item) throw badRequest("Request not found");
    item.status = "accepted";

    res.json({
      success: true,
      message: "Matched request accepted",
      sessionId: `session-${id}`,
      request: item,
    });
  })
);

/** POST /api/supporter/session/:id/complete - Complete peer support session */
supporterRouter.post(
  "/session/:id/complete",
  asyncHandler(async (req, res) => {
    checkSupporter(req);
    const schema = z.object({
      summaryNotes: z.string().min(3, "Summary notes are required"),
      clientEmotionalState: z.enum(["calm", "improved", "neutral", "needs_followup"]),
      nextRecommendedStep: z.string().optional(),
    });
    const payload = parse(schema, req.body);

    const record = {
      sessionId: req.params.id,
      supporterId: req.user.id,
      completedAt: new Date().toISOString(),
      ...payload,
    };
    completedSessionsStore.push(record);

    res.json({
      success: true,
      message: "Peer support session successfully completed",
      record,
    });
  })
);

/** POST /api/supporter/escalate - Trigger safeguarding escalation */
supporterRouter.post(
  "/escalate",
  asyncHandler(async (req, res) => {
    checkSupporter(req);
    const schema = z.object({
      sessionId: z.string(),
      clientAlias: z.string().optional(),
      riskType: z.enum(["self_harm", "harm_others", "severe_crisis", "safeguarding_violation"]),
      severity: z.enum(["medium", "high", "critical"]),
      details: z.string().min(10, "Please provide detailed context for the escalation"),
    });
    const payload = parse(schema, req.body);

    const escalation = await recordEscalation({
      source: "supporter",
      priority: payload.severity,
      riskType: payload.riskType,
      reason: `Peer supporter raised a safeguarding escalation (${payload.riskType.replace(/_/g, " ")}).`,
      observations: payload.details,
      clientAlias: payload.clientAlias ?? "Peer support client",
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Safeguarding escalation submitted immediately for clinical review",
      escalation: { ...escalation, createdAt: escalation.created_at },
    });
  })
);

export default supporterRouter;
