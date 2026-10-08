import { query, queryOne } from "../db/index.js";

/**
 * Notification writes.
 *
 * Everything here is fire-and-forget from the caller's point of view: failing
 * to record "you have a new message" must never fail the message itself, so
 * every helper swallows its own error and the caller never waits on a decision
 * it has already made.
 *
 * `data.key` is an optional idempotency key. Reminders derived from the same
 * row on every read (a session about to happen, a goal past its target date)
 * pass one, so re-opening the inbox cannot fill it with copies.
 */

export const NOTIFICATION_TYPES = [
  "appointment_request",
  "session_updated",
  "new_message",
  "assessment_completed",
  "session_reminder",
  "treatment_plan_reminder",
  "homework_completed",
];

/**
 * Which switch on the settings page controls each type. `reminders` is one
 * switch for both derived reminders; `homework_completed` is deliberately
 * unmapped, because it is the practitioner's own record of work done.
 */
const PREF_CATEGORY = {
  appointment_request: "appointments",
  session_updated: "appointments",
  new_message: "messages",
  assessment_completed: "assessments",
  session_reminder: "reminders",
  treatment_plan_reminder: "reminders",
};

/** False only when the recipient has explicitly turned that switch off. */
async function suppressedFor(userId, type) {
  const category = PREF_CATEGORY[type];
  if (!category) return false;

  try {
    const row = await queryOne(
      `SELECT notification_prefs AS prefs FROM therapist_profiles WHERE user_id = $1`,
      [userId]
    );
    return row?.prefs?.[category] === false;
  } catch {
    return false;
  }
}

/**
 * @param {{ userId: string,
 *           type: string,
 *           title: string,
 *           body?: string | null,
 *           link?: string | null,
 *           data?: Record<string, unknown>,
 *           key?: string }} input
 */
export async function notify(input) {
  try {
    if (await suppressedFor(input.userId, input.type)) return;

    if (input.key) {
      const existing = await query(
        `SELECT id FROM notifications
          WHERE user_id = $1 AND data->>'key' = $2
          LIMIT 1`,
        [input.userId, input.key]
      );
      if (existing.rows.length) return;
    }

    await query(
      `INSERT INTO notifications (user_id, type, title, body, link, data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.userId,
        input.type,
        input.title,
        input.body ?? null,
        input.link ?? null,
        JSON.stringify({ ...(input.data ?? {}), ...(input.key ? { key: input.key } : {}) }),
      ]
    );
  } catch (err) {
    console.warn(`[notify] skipped ${input.type}: ${err.message}`);
  }
}

/**
 * Tell every practitioner who has a relationship with this client, which is
 * how an assessment completed by the person on the other side reaches the
 * therapist who is working with them.
 *
 * @param {string} clientId
 * @param {Omit<Parameters<typeof notify>[0], "userId">} input
 */
export async function notifyTherapistsOfClient(clientId, input) {
  try {
    const { rows } = await query(
      `SELECT DISTINCT therapist_id FROM (
         SELECT therapist_id FROM sessions        WHERE user_id = $1
         UNION
         SELECT therapist_id FROM conversations   WHERE user_id = $1
         UNION
         SELECT therapist_id FROM client_cases    WHERE client_id = $1
         UNION
         SELECT therapist_id FROM treatment_plans WHERE client_id = $1
       ) linked`,
      [clientId]
    );

    for (const row of rows) {
      if (row.therapist_id === clientId) continue;
      await notify({ ...input, userId: row.therapist_id });
    }
  } catch (err) {
    console.warn(`[notify] skipped client broadcast: ${err.message}`);
  }
}
