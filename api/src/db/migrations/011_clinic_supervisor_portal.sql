-- 011_clinic_supervisor_portal.sql
-- Day-to-day clinical supervision: safety concerns, escalations, case and
-- session reviews, interventions, workload and the supervisor calendar.
--
-- Four rules shape everything in here:
--
--  1. Supervision is its own role with its own permission rows. A supervisor
--     never inherits advisor permissions and vice versa; both are checked per
--     route, so hiding a sidebar link is never the security boundary.
--  2. Safety concerns are human-declared rows. Nothing in this schema
--     computes risk, diagnoses, or clears a client - priority and status are
--     what a person recorded.
--  3. Minimum necessary. Supervision records, reviews and interventions
--     reference clients by id; they never copy private therapist notes. The
--     one deliberate exception is an explicit, audited, permission-gated
--     documentation fetch for authorised session review.
--  4. Escalating to the Clinical Advisor reuses the shared
--     `safety_escalations` queue, so serious matters reach the advisor
--     through the same channel the rest of the clinic already uses.

-- =============================================================================
-- Permissions
-- =============================================================================
CREATE TABLE IF NOT EXISTS supervisor_permissions (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS supervisor_permissions_permission_idx
  ON supervisor_permissions (permission);

-- =============================================================================
-- Safety concerns (supervisor monitoring queue)
-- =============================================================================
-- Distinct from `safety_escalations`: a concern is something the supervisor
-- is watching; an escalation is the clinic's formal urgent queue. A concern
-- may point at an escalation once it has been raised.
CREATE TABLE IF NOT EXISTS safety_concerns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             TEXT NOT NULL UNIQUE,
  category              TEXT NOT NULL DEFAULT 'urgent_client_concern'
                        CHECK (category IN (
                          'urgent_client_concern', 'risk_escalation',
                          'client_status_change', 'missed_sessions',
                          'practitioner_concern', 'safeguarding',
                          'documentation', 'communication', 'treatment',
                          'operational'
                        )),
  priority              TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'under_review', 'action_required', 'resolved')),
  reason                TEXT NOT NULL,
  information           TEXT,
  current_actions       TEXT,
  follow_up_date        DATE,
  client_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  escalation_id         UUID REFERENCES safety_escalations(id) ON DELETE SET NULL,
  resolution            TEXT,
  raised_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safety_concerns_status_idx ON safety_concerns (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_concerns_subject_idx ON safety_concerns (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_concerns_client_idx ON safety_concerns (client_id, created_at DESC);

-- =============================================================================
-- Case reviews (including ethical concerns)
-- =============================================================================
-- One workflow with two domains: `clinical` covers the case review reasons,
-- `ethics` covers the ethical concern categories. Serious ethics matters
-- escalate to the Clinical Advisor through the shared escalation queue.
CREATE TABLE IF NOT EXISTS case_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             TEXT NOT NULL UNIQUE,
  domain                TEXT NOT NULL DEFAULT 'clinical'
                        CHECK (domain IN ('clinical', 'ethics')),
  reason                TEXT NOT NULL DEFAULT 'complex_case'
                        CHECK (reason IN (
                          'complex_case', 'limited_progress', 'practitioner_request',
                          'safety_concern', 'treatment_plan_concern',
                          'documentation_concern', 'client_concern',
                          'missed_sessions', 'escalation',
                          'ethical_concern', 'confidentiality_concern',
                          'communication_concern', 'boundary_concern',
                          'consent_concern', 'unauthorized_access',
                          'disclosure_concern', 'conflict_of_interest',
                          'conduct_concern'
                        )),
  priority              TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_review', 'awaiting_information', 'escalated', 'resolved')),
  summary               TEXT NOT NULL,
  information           TEXT,
  supervisor_notes      TEXT,
  client_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  therapist_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  escalation_id         UUID REFERENCES safety_escalations(id) ON DELETE SET NULL,
  follow_up_date        DATE,
  resolution            TEXT,
  advisor_escalated_at  TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_reviews_status_idx ON case_reviews (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS case_reviews_domain_idx ON case_reviews (domain, status, created_at DESC);
CREATE INDEX IF NOT EXISTS case_reviews_therapist_idx ON case_reviews (therapist_id, created_at DESC);

-- =============================================================================
-- Session / documentation reviews
-- =============================================================================
-- One row per reviewed session. Deliberately holds status and supervisor
-- feedback only: note content stays in `session_notes` and is fetched through
-- the single audited, permission-gated endpoint when it is genuinely needed.
CREATE TABLE IF NOT EXISTS session_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  therapist_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (review_status IN ('pending', 'in_review', 'completed')),
  supervisor_feedback TEXT,
  follow_up_required  BOOLEAN NOT NULL DEFAULT false,
  follow_up_date      DATE,
  supervisor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_reviews_therapist_idx ON session_reviews (therapist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS session_reviews_status_idx ON session_reviews (review_status, created_at DESC);

-- =============================================================================
-- Interventions
-- =============================================================================
-- Support, improvement and safety actions - never an automatic disciplinary
-- system. `steps` is an ordered checklist the assignee ticks off; progress is
-- derived from it, never stored as a score.
CREATE TABLE IF NOT EXISTS interventions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     TEXT NOT NULL UNIQUE,
  category      TEXT NOT NULL DEFAULT 'clinical'
                CHECK (category IN ('documentation', 'supervision', 'safety',
                                    'conduct', 'workload', 'clinical', 'other')),
  title         TEXT NOT NULL,
  reason        TEXT NOT NULL,
  instructions  TEXT,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed')),
  assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date      DATE,
  follow_up_date DATE,
  follow_up_note TEXT,
  related_type  TEXT,
  related_id    UUID,
  completed_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interventions_status_idx ON interventions (status, due_date);
CREATE INDEX IF NOT EXISTS interventions_assigned_idx ON interventions (assigned_to, status);
CREATE INDEX IF NOT EXISTS interventions_related_idx ON interventions (related_type, related_id);

-- =============================================================================
-- Supervisor activity trail
-- =============================================================================
-- One generic timeline for concerns, case reviews, session reviews and
-- interventions, so every record can show who did what without four near
-- identical event tables. Not FK to the target (the target is polymorphic);
-- rows cascade away with the domain record via explicit cleanup in the routes
-- that delete, or simply age out like `audit_log`.
CREATE TABLE IF NOT EXISTS supervisor_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT NOT NULL,
  target_id   UUID NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  from_status TEXT,
  to_status   TEXT,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervisor_activity_target_idx
  ON supervisor_activity (domain, target_id, created_at);
CREATE INDEX IF NOT EXISTS supervisor_activity_recent_idx
  ON supervisor_activity (created_at DESC);

-- =============================================================================
-- Supervisor calendar events
-- =============================================================================
-- Explicit meetings, trainings and booked reviews the supervisor creates.
-- Supervision dates, intervention due dates and follow-ups are derived from
-- their own tables and merged into the calendar view instead of being copied
-- here, so a reschedule is reflected everywhere at once.
CREATE TABLE IF NOT EXISTS supervisor_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'meeting'
               CHECK (type IN ('supervision', 'case_review', 'follow_up',
                               'meeting', 'intervention', 'training', 'appointment')),
  title        TEXT NOT NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ,
  related_type TEXT,
  related_id   UUID,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervisor_events_range_idx ON supervisor_events (starts_at);

-- =============================================================================
-- Supervision checklist
-- =============================================================================
-- The discussion-area checklist from the supervision form lives beside the
-- existing supervision record rather than in a new table: the record already
-- owns topics, action items and follow-up.
ALTER TABLE supervision_records ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE supervision_records ADD COLUMN IF NOT EXISTS supervisor_role TEXT;

-- =============================================================================
-- Escalations raised by supervisors
-- =============================================================================
-- The source CHECK predates this portal. Supervisors are a distinct source
-- from advisors because their escalation carries a supervision context.
ALTER TABLE safety_escalations DROP CONSTRAINT IF EXISTS safety_escalations_source_check;
ALTER TABLE safety_escalations ADD CONSTRAINT safety_escalations_source_check
  CHECK (source IN ('therapist', 'supporter', 'client', 'advisor', 'supervisor'));

-- =============================================================================
-- Recorded oversight status
-- =============================================================================
-- Each area on the clinical oversight page has a computed indicator (rates,
-- counts, overdue days). The supervisor's recorded status sits beside it and
-- always wins on screen: the indicator is a signal, the record is the human
-- decision.
CREATE TABLE IF NOT EXISTS oversight_status (
  area_key    TEXT PRIMARY KEY,
  status      TEXT NOT NULL
              CHECK (status IN ('compliant', 'needs_review', 'action_required', 'escalated')),
  note        TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'safety_concerns', 'case_reviews', 'session_reviews', 'interventions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t || '_touch', t
    );
  END LOOP;
END $$;

-- =============================================================================
-- Default permission set
-- =============================================================================
-- Every supervisor starts with the full operational set: there is no
-- "hand out supervisor permissions" permission in this role, so nothing is
-- withheld pending a grant.
INSERT INTO supervisor_permissions (user_id, permission)
SELECT u.id, p.permission
  FROM users u
  CROSS JOIN (
    VALUES
      ('supervisor.dashboard.view'),
      ('safety.view'), ('safety.review'), ('safety.manage'),
      ('escalations.view'), ('escalations.create'), ('escalations.review'),
      ('escalations.manage'), ('escalations.escalate'),
      ('therapists.view'), ('therapists.supervise'), ('therapists.manage'),
      ('supporters.view'), ('supporters.supervise'),
      ('clients.view'), ('clients.case_review'),
      ('supervision.view'), ('supervision.create'), ('supervision.manage'),
      ('case_reviews.view'), ('case_reviews.create'), ('case_reviews.manage'),
      ('session_reviews.view'), ('session_reviews.manage'),
      ('interventions.view'), ('interventions.create'), ('interventions.manage'),
      ('performance.view'),
      ('workload.view'), ('workload.manage'),
      ('messages.view'), ('messages.send'),
      ('reports.view'), ('reports.generate'),
      ('clinical_oversight.view'), ('clinical_oversight.manage'),
      ('ethical_oversight.view'), ('ethical_oversight.manage')
  ) AS p(permission)
 WHERE u.role = 'clinical_supervisor'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE supervisor_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE oversight_status ENABLE ROW LEVEL SECURITY;
