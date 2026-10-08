-- 010_clinical_advisor_portal.sql
-- Clinical oversight and clinic operations for the Clinical Advisor portal.
--
-- Four rules shape everything in here:
--
--  1. Policy history is append only. A standard or guideline is never
--     overwritten in place: every change writes a `standard_revisions` row
--     holding the previous state, so "who changed what, when" survives.
--  2. Safety escalations are real rows, not process memory. The therapist and
--     supporter escalate endpoints write here so a restart cannot lose them.
--  3. Access is permission gated. `advisor_permissions` is checked per route,
--     so hiding a link in the sidebar is never the security boundary.
--  4. Supervision records hold supervision, not case notes. Nothing in these
--     tables reads or copies private therapist-client clinical documentation.

-- =============================================================================
-- Audit log
-- =============================================================================
-- Deliberately generic: actor, action, target, result. `detail` is a small
-- JSONB bag for non-sensitive context (a status name, a version number) and
-- must never be used to park clinical content.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  result      TEXT NOT NULL DEFAULT 'ok',
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id);

-- =============================================================================
-- Permissions
-- =============================================================================
-- One row per granted permission. A clinical advisor starts from the default
-- set (seeded below) rather than from "everything": `permissions.manage` is
-- held by nobody until it is granted deliberately.
CREATE TABLE IF NOT EXISTS advisor_permissions (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS advisor_permissions_permission_idx
  ON advisor_permissions (permission);

-- =============================================================================
-- Clinical standards
-- =============================================================================
CREATE TABLE IF NOT EXISTS clinical_standards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'general',
  version         TEXT NOT NULL DEFAULT '1.0',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('draft', 'active', 'under_review', 'revision_requested', 'archived')),
  owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at  TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_standards_status_idx ON clinical_standards (status, next_review_at);

-- Append only. `snapshot` carries the state that was replaced, so a version
-- number can always be read against what it replaced.
CREATE TABLE IF NOT EXISTS standard_revisions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id    UUID NOT NULL REFERENCES clinical_standards(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,
  action         TEXT NOT NULL
                 CHECK (action IN ('created', 'updated', 'reviewed', 'revision_requested', 'archived', 'restored')),
  change_summary TEXT,
  snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS standard_revisions_standard_idx
  ON standard_revisions (standard_id, created_at DESC);

-- =============================================================================
-- Therapist supervision
-- =============================================================================
-- Supervision, not case notes: topics and development areas are written by the
-- advisor and describe the practitioner, never the client's clinical record.
CREATE TABLE IF NOT EXISTS supervision_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervision_date  DATE NOT NULL,
  modality          TEXT NOT NULL DEFAULT 'individual'
                    CHECK (modality IN ('individual', 'group', 'peer', 'case_review')),
  focus             TEXT,
  discussion_topics TEXT,
  development_areas TEXT,
  concerns          TEXT,
  action_items      TEXT,
  follow_up_date    DATE,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'completed', 'closed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervision_records_therapist_idx
  ON supervision_records (therapist_id, supervision_date DESC);
CREATE INDEX IF NOT EXISTS supervision_records_advisor_idx
  ON supervision_records (advisor_id, supervision_date DESC);

-- =============================================================================
-- Safety escalations
-- =============================================================================
-- The queue the portal is built around. `priority` is the human-declared
-- urgency recorded by the person escalating or the reviewing advisor. Nothing
-- in this system computes a risk score or a diagnosis.
CREATE TABLE IF NOT EXISTS safety_escalations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            TEXT NOT NULL UNIQUE,
  source               TEXT NOT NULL DEFAULT 'therapist'
                       CHECK (source IN ('therapist', 'supporter', 'client', 'advisor')),
  priority             TEXT NOT NULL DEFAULT 'high'
                       CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status               TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'under_review', 'action_required', 'resolved', 'closed')),
  risk_type            TEXT,
  client_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  client_alias         TEXT,
  therapist_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id           UUID REFERENCES sessions(id) ON DELETE SET NULL,
  reason               TEXT NOT NULL,
  observations         TEXT,
  recommended_action   TEXT,
  actions_taken        TEXT,
  assigned_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  follow_up_actions    TEXT,
  resolution           TEXT,
  escalated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safety_escalations_status_idx
  ON safety_escalations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_escalations_priority_idx
  ON safety_escalations (priority, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_escalations_therapist_idx
  ON safety_escalations (therapist_id, created_at DESC);

-- Every action on an escalation lands here: acknowledge, assign, request more
-- information, add an action, escalate, resolve, close.
CREATE TABLE IF NOT EXISTS safety_escalation_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES safety_escalations(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  detail        TEXT,
  from_status   TEXT,
  to_status     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safety_escalation_events_idx
  ON safety_escalation_events (escalation_id, created_at);

-- =============================================================================
-- Ethical guidelines
-- =============================================================================
CREATE TABLE IF NOT EXISTS ethics_guidelines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key              TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'general',
  version          TEXT NOT NULL DEFAULT '1.0',
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('draft', 'active', 'under_review', 'archived')),
  applicable_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An acknowledgment is against one version. When the guideline moves to a new
-- version, an old acknowledgment no longer matches and reads as pending again.
CREATE TABLE IF NOT EXISTS ethics_acknowledgments (
  guideline_id     UUID NOT NULL REFERENCES ethics_guidelines(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version          TEXT NOT NULL,
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guideline_id, user_id)
);

CREATE INDEX IF NOT EXISTS ethics_acknowledgments_user_idx
  ON ethics_acknowledgments (user_id);

-- =============================================================================
-- Clinic settings
-- =============================================================================
-- Operational settings a clinical advisor may change, plus a few marked
-- admin_only that only a platform administrator may touch. The API rejects
-- writes to admin_only keys regardless of who asks.
CREATE TABLE IF NOT EXISTS clinic_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  admin_only  BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Clinic announcements
-- =============================================================================
CREATE TABLE IF NOT EXISTS clinic_announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  audience   JSONB NOT NULL DEFAULT '["all"]'::jsonb,
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft', 'published', 'archived')),
  publish_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Matching decisions
-- =============================================================================
-- Records what the advisor decided about a client's search. The matcher still
-- only ever recommends; this row is the human decision on top of it.
CREATE TABLE IF NOT EXISTS match_decisions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id            UUID NOT NULL REFERENCES therapist_searches(id) ON DELETE CASCADE,
  therapist_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_therapist_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision             TEXT NOT NULL
                       CHECK (decision IN ('reviewed', 'approved', 'assigned', 'rejected', 'reassigned')),
  note                 TEXT,
  decided_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_decisions_search_idx
  ON match_decisions (search_id, created_at DESC);

-- =============================================================================
-- Report exports
-- =============================================================================
-- What was generated, by whom and when. The rows themselves are not stored
-- here: a report is computed when it is asked for, and this is the record that
-- somebody asked.
CREATE TABLE IF NOT EXISTS report_exports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  report_key TEXT NOT NULL,
  format     TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'json')),
  params     JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count  INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_exports_created_idx ON report_exports (created_at DESC);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clinical_standards', 'standard_revisions', 'supervision_records',
    'safety_escalations', 'ethics_guidelines', 'clinic_settings',
    'clinic_announcements'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t || '_touch', t
    );
  END LOOP;
END $$;

-- =============================================================================
-- Reference data
-- =============================================================================
-- The clinic's standing documents. Seeded once by key so re-running the
-- migration (or a later one that repeats it) cannot duplicate them, and so an
-- operator can edit them through the portal afterwards.
INSERT INTO clinical_standards
  (key, title, description, category, version, status, next_review_at)
VALUES
  ('assessment-procedures', 'Assessment procedures',
   'How intake and outcome assessments are administered, scored, reviewed and recorded.',
   'assessment', '2.0', 'active', now() - interval '5 days'),
  ('session-documentation', 'Session documentation standard',
   'What must be recorded after every session, how soon, and to what level of detail.',
   'documentation', '2.1', 'active', now() + interval '92 days'),
  ('treatment-planning', 'Treatment planning standard',
   'Goals, objectives and review cadence expected for every active treatment plan.',
   'treatment', '1.4', 'active', now() + interval '88 days'),
  ('client-communication', 'Client communication standards',
   'Response times, channel choice, tone and boundaries for contact with clients.',
   'communication', '1.2', 'active', now() + interval '30 days'),
  ('safety-escalation', 'Safety escalation procedures',
   'How a safety concern is raised, triaged, reviewed and closed, including response times.',
   'safety', '3.0', 'active', now() + interval '60 days'),
  ('confidentiality', 'Confidentiality requirements',
   'What may be shared, with whom, on what basis, and what must never leave the clinic.',
   'privacy', '2.2', 'active', now() + interval '45 days'),
  ('referral', 'Referral procedures',
   'Internal and external referral routes, handover information and consent checks.',
   'operations', '1.1', 'active', now() + interval '120 days'),
  ('documentation', 'Documentation requirements',
   'Retention, access control, correction handling and audit expectations for clinical records.',
   'documentation', '1.0', 'active', now() + interval '20 days'),
  ('professional-conduct', 'Professional conduct standard',
   'Behaviour, boundaries, fitness to practise and duty of candour expected of every practitioner.',
   'conduct', '2.0', 'active', now() + interval '150 days')
ON CONFLICT (key) DO NOTHING;

INSERT INTO standard_revisions
  (standard_id, version, action, change_summary, snapshot)
SELECT s.id, s.version, 'created', 'Standard published from the clinic policy set.',
       jsonb_build_object('title', s.title, 'description', s.description, 'version', s.version)
  FROM clinical_standards s
 WHERE NOT EXISTS (
   SELECT 1 FROM standard_revisions r WHERE r.standard_id = s.id
 );

INSERT INTO ethics_guidelines
  (key, title, description, category, version, status, applicable_roles, next_review_at)
VALUES
  ('professional-conduct', 'Professional conduct',
   'The professional behaviour expected of every practitioner working with the clinic.',
   'conduct', '2.0', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '150 days'),
  ('confidentiality', 'Confidentiality',
   'How client information is held, shared and protected, and when disclosure is permitted.',
   'privacy', '2.1', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '60 days'),
  ('informed-consent', 'Informed consent',
   'What a client must understand before assessment, therapy or any change to their care.',
   'practice', '1.3', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '90 days'),
  ('boundaries', 'Boundaries',
   'Professional, personal and digital boundaries, including dual relationships and gifts.',
   'conduct', '1.5', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '90 days'),
  ('communication', 'Ethical communication',
   'Channel, tone, timing and record keeping for written and spoken contact with clients.',
   'communication', '2.0', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '45 days'),
  ('documentation', 'Ethical documentation',
   'Accuracy, contemporaneity, ownership and correction of clinical records.',
   'documentation', '1.2', 'active', '["therapist","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '75 days'),
  ('conflicts-of-interest', 'Conflicts of interest',
   'Declaring, managing and avoiding conflicts of interest, including referral incentives.',
   'conduct', '1.0', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor","collaborative_clinic"]'::jsonb, now() + interval '180 days'),
  ('client-rights', 'Client rights',
   'Access, choice, complaint routes, withdrawal and the right to be treated with dignity.',
   'practice', '1.4', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '120 days'),
  ('referral-escalation', 'Referral and escalation duties',
   'When to refer on, when to escalate, and how to hand over safely.',
   'safety', '2.0', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '60 days'),
  ('data-privacy', 'Data privacy',
   'Lawful basis, retention, minimisation and subject rights for personal data.',
   'privacy', '1.1', 'active', '["therapist","supporter","clinical_advisor","clinical_supervisor","collaborative_clinic"]'::jsonb, now() + interval '90 days'),
  ('professional-responsibilities', 'Professional responsibilities',
   'Supervision, continuing development, insurance and fitness to practise obligations.',
   'conduct', '1.0', 'active', '["therapist","clinical_advisor","clinical_supervisor"]'::jsonb, now() + interval '150 days')
ON CONFLICT (key) DO NOTHING;

INSERT INTO clinic_settings (key, value, category, description, admin_only) VALUES
  ('clinic_name', '"Kindred Tap"'::jsonb, 'clinic', 'The name shown to clients.', true),
  ('clinic_contact_email', '"care@kindredtap.test"'::jsonb, 'clinic', 'Contact address printed on client correspondence.', true),
  ('supervision_interval_days', '30'::jsonb, 'supervision', 'Days between supervision reviews for each therapist.', false),
  ('supervision_reminder_days', '7'::jsonb, 'supervision', 'Days before a supervision date when the advisor is reminded.', false),
  ('standards_review_interval_days', '90'::jsonb, 'standards', 'Default review cycle for a clinical standard.', false),
  ('ethics_acknowledgment_interval_days', '365'::jsonb, 'ethics', 'How often a practitioner re-acknowledges the ethical guidelines.', false),
  ('escalation_response_hours', '4'::jsonb, 'safety', 'Target working hours for a first response to a safety escalation.', false),
  ('escalation_emergency_procedure',
   '"In an emergency, contact local emergency services immediately (999 in the UK). Notify the duty clinical advisor and record the action taken on the escalation."'::jsonb,
   'safety', 'The clinic procedure shown for critical escalations.', false),
  ('matching_review_required', 'true'::jsonb, 'matching', 'Require a clinical advisor to review a match before it is assigned.', false),
  ('default_session_duration_minutes', '50'::jsonb, 'appointments', 'Default session length offered at booking.', false),
  ('cancellation_notice_hours', '24'::jsonb, 'appointments', 'Notice a client should give to cancel without a flag.', false)
ON CONFLICT (key) DO NOTHING;

-- Default permission set for advisors who already exist. New advisors get the
-- same set when their profile is created (see profile.routes.js). Everything
-- not listed here - notably `permissions.manage` - has to be granted on purpose.
INSERT INTO advisor_permissions (user_id, permission)
SELECT u.id, p.permission
  FROM users u
  CROSS JOIN (
    VALUES
      ('clinical_standards.view'), ('clinical_standards.manage'),
      ('supervision.view'), ('supervision.manage'),
      ('safety_escalations.view'), ('safety_escalations.manage'),
      ('ethics.view'), ('ethics.manage'),
      ('therapists.view'), ('therapists.manage'),
      ('clients.view'),
      ('matching.manage'),
      ('appointments.manage'),
      ('assessments.view'),
      ('outcomes.view'),
      ('reports.generate'),
      ('clinic_settings.manage'),
      ('announcements.manage'),
      ('audit.view')
  ) AS p(permission)
 WHERE u.role = 'clinical_advisor'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Consistent with the rest of the schema: RLS is on, the API is the only
-- writer, and every route checks the signed-in user itself.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervision_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_escalation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethics_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethics_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
