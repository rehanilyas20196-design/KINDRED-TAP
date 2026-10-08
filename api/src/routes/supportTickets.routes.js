import { Router } from "express";
import { z } from "zod";
import { query, queryOne, transaction } from "../db/index.js";
import {
  asyncHandler,
  badRequest,
  forbidden,
  notFound,
  parse,
} from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

export const supportTicketsRouter = Router();

supportTicketsRouter.use(requireAuth);

const uuidParam = (value, label) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw badRequest(`${label} is not a valid id`);
  return parsed.data;
};

const TICKET_CATEGORIES = [
  "account_problem",
  "therapist_problem",
  "cant_contact_therapist",
  "video_call_problem",
  "appointment_problem",
  "ai_matching_concern",
  "technical_problem",
  "privacy_concern",
  "other",
];

const TICKET_PRIORITIES = ["normal", "urgent"];

const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"];

const ticketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES, { errorMap: () => ({ message: "Choose a valid category" }) }),
  subject: z.string().trim().min(5, "Subject must be at least 5 characters").max(120, "Subject too long"),
  description: z.string().trim().min(20, "Please describe your problem in at least 20 characters").max(5000),
  priority: z.enum(TICKET_PRIORITIES, { errorMap: () => ({ message: "Choose normal or urgent" }) }).default("normal"),
});

const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  adminResponse: z.string().trim().max(5000).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

function generateTicketNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `KT-${year}${month}${day}-${random}`;
}

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
supportTicketsRouter.post(
  "/tickets",
  asyncHandler(async (req, res) => {
    const data = parse(ticketSchema, req.body);

    const ticketNumber = generateTicketNumber();

    const { rows } = await query(
      `INSERT INTO support_tickets (
         ticket_number, user_id, category, subject, description, priority, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'open')
       RETURNING id,
                 ticket_number     AS "ticketNumber",
                 category,
                 subject,
                 description,
                 priority,
                 status,
                 admin_response    AS "adminResponse",
                 assigned_to       AS "assignedTo",
                 created_at        AS "createdAt",
                 updated_at        AS "updatedAt",
                 resolved_at       AS "resolvedAt"`,
      [ticketNumber, req.user.id, data.category, data.subject, data.description, data.priority]
    );

    res.status(201).json({ ticket: rows[0] });
  })
);

/**
 * GET /api/support/tickets
 * List user's support tickets
 */
supportTicketsRouter.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id,
              ticket_number     AS "ticketNumber",
              category,
              subject,
              description,
              priority,
              status,
              admin_response    AS "adminResponse",
              assigned_to       AS "assignedTo",
              created_at        AS "createdAt",
              updated_at        AS "updatedAt",
              resolved_at       AS "resolvedAt"
         FROM support_tickets
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ tickets: rows, total: rows.length });
  })
);

/**
 * GET /api/support/tickets/:id
 * Get a single ticket with its messages
 */
supportTicketsRouter.get(
  "/tickets/:id",
  asyncHandler(async (req, res) => {
    const ticketId = uuidParam(req.params.id, "Ticket");

    const ticket = await queryOne(
      `SELECT id,
              ticket_number     AS "ticketNumber",
              category,
              subject,
              description,
              priority,
              status,
              admin_response    AS "adminResponse",
              assigned_to       AS "assignedTo",
              created_at        AS "createdAt",
              updated_at        AS "updatedAt",
              resolved_at       AS "resolvedAt"
         FROM support_tickets
        WHERE id = $1 AND user_id = $2`,
      [ticketId, req.user.id]
    );

    if (!ticket) throw notFound("Ticket not found");

    const { rows: messages } = await query(
      `SELECT id,
              sender_id   AS "senderId",
              sender_role AS "senderRole",
              body,
              created_at  AS "createdAt"
         FROM support_ticket_messages
        WHERE ticket_id = $1
        ORDER BY created_at ASC`,
      [ticketId]
    );

    res.json({ ticket, messages });
  })
);

/**
 * POST /api/support/tickets/:id/messages
 * Add a message to a ticket (user or admin)
 */
supportTicketsRouter.post(
  "/tickets/:id/messages",
  asyncHandler(async (req, res) => {
    const ticketId = uuidParam(req.params.id, "Ticket");
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(5000) }), req.body);

    const ticket = await queryOne(
      `SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2`,
      [ticketId, req.user.id]
    );
    if (!ticket) throw notFound("Ticket not found");

    const { rows } = await query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_id, sender_role, body)
       VALUES ($1, $2, 'user', $3)
       RETURNING id,
                 sender_id   AS "senderId",
                 sender_role AS "senderRole",
                 body,
                 created_at  AS "createdAt"`,
      [ticketId, req.user.id, body]
    );

    await query(
      `UPDATE support_tickets SET updated_at = now() WHERE id = $1`,
      [ticketId]
    );

    res.status(201).json({ message: rows[0] });
  })
);

export default supportTicketsRouter;