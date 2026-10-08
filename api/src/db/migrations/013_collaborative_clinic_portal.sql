-- 013_collaborative_clinic_portal.sql
-- The Collaborative Clinic Portal: partner organizations, services available
-- for referral and promotion, referrals in both directions, partnership
-- agreements, commissions, payouts and partner messaging.
--
-- Six rules shape everything in here:
--
--  1. Partnership is its own role with its own permission rows, exactly as the
--     advisor and supervisor portals do. Holding `collaborative_clinic` gets
--     you the portal; what you may do inside it comes from
--     `clinic_permissions`. Hiding a sidebar link is never the boundary.
--
--  2. Every business row belongs to an organization, and every route filters on
--     the caller's own membership before it looks at anything else. Clinic A
--     cannot reach Clinic B's referrals, clients, commission, messages,
--     documents or reports, because the query itself never considers Clinic B's
--     rows. Cross-organization filtering is never left to the frontend.
--
--  3. Minimum necessary, and deliberately so. A referral stores an opaque
--     `client_reference` for display and a `client_user_id` for linkage, but the
--     portal never joins through to `users` for a name, an email or anything in
--     `user_profiles`. There is no clinical content in this schema at all: no
--     notes from therapy, no assessment results, no treatment plans. A
--     collaborative clinic tracks referrals and outcomes; it does not read
--     records.
--
--  4. Money is computed here, never in a browser. `commission_rules` holds the
--     rate, `commissions` holds the amount the server calculated and froze at
--     creation time. A partner may dispute or request review; there is no route
--     anywhere that lets a partner edit an amount, a rate or a payout value.
--
--  5. Attribution cannot be forged from the client side. Referral links are
--     opaque random codes, a referral carries the link that produced it, and
--     commission eligibility is decided from the referral row the server
--     created - not from anything the browser sends at conversion time.
--
--  6. One commission per referral per partner, enforced by a unique constraint,
--     inside the same transaction as the status change that made it eligible.
--     A referral cannot be walked through `completed` twice to mint a second
--     commission, and no two payouts can ever claim the same approved
--     commission.

-- =============================================================================
-- Permissions
-- =============================================================================
CREATE TABLE IF NOT EXISTS clinic_permissions (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS clinic_permissions_permission_idx
  ON clinic_permissions (permission);

-- =============================================================================
-- Partner organizations
-- =============================================================================
-- One row per partner organization. A Kindred Tap clinic is both a member of
-- its own organization and, for the referrals it sends into Kindred Tap, a
-- counterpart; the shared `partner_organizations` table is what lets both
-- sides of a referral exist in the same place.
CREATE TABLE IF NOT EXISTS partner_organizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT        NOT NULL UNIQUE,
  name               TEXT        NOT NULL,
  kind               TEXT        NOT NULL DEFAULT 'partner'
                     CHECK (kind IN ('partner', 'kindred_tap')),
  organization_type  TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'paused', 'expired', 'terminated')),
  contact_name       TEXT,
  contact_email      TEXT,
  contact_phone      TEXT,
  website            TEXT,
  city               TEXT,
  country            TEXT,
  registration_number TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who may read and write as this organization. Membership - not a column on
-- the profile - is the authorization primitive for every other table below.
CREATE TABLE IF NOT EXISTS partner_organization_members (
  organization_id UUID NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role     TEXT NOT NULL DEFAULT 'member'
                   CHECK (member_role IN ('primary', 'billing', 'clinical', 'administrative', 'member')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS partner_members_user_idx ON partner_organization_members (user_id);

-- =============================================================================
-- Services available for referral and promotion
-- =============================================================================
-- Seeded from OPTIONS.marketingServices in api/src/lib/roles.js, so the service
-- catalogue is the platform's own, not an invention of the portal. The
-- commission rule lives on the service because the rate is a property of the
-- agreement between Kindred Tap and the partner organization.
CREATE TABLE IF NOT EXISTS partner_services (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT        NOT NULL UNIQUE,
  name                  TEXT        NOT NULL,
  category              TEXT        NOT NULL DEFAULT 'therapy',
  description           TEXT,
  availability          TEXT        NOT NULL DEFAULT 'available'
                        CHECK (availability IN ('available', 'limited', 'waitlist', 'unavailable')),
  eligibility           TEXT,
  referral_method       TEXT        NOT NULL DEFAULT 'portal'
                        CHECK (referral_method IN ('portal', 'link', 'phone', 'form')),
  price_minor           INTEGER     NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  price_currency        TEXT        NOT NULL DEFAULT 'GBP',
  commission_rule       TEXT        NOT NULL DEFAULT 'percentage'
                        CHECK (commission_rule IN ('percentage', 'fixed')),
  commission_rate_bp    INTEGER     NOT NULL DEFAULT 0 CHECK (commission_rate_bp BETWEEN 0 AND 10000),
  commission_fixed_minor INTEGER    NOT NULL DEFAULT 0 CHECK (commission_fixed_minor >= 0),
  marketing_status      TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (marketing_status IN ('draft', 'approved', 'retired')),
  marketing_summary     TEXT,
  marketing_body        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_services_status_idx ON partner_services (marketing_status, availability);
CREATE INDEX IF NOT EXISTS partner_services_category_idx ON partner_services (category);

-- =============================================================================
-- Referral links and attribution
-- =============================================================================
-- `code` is the only thing in a shared URL. It is random rather than derived
-- from the organization name, so a link cannot be guessed, and it carries no
-- client information: it identifies a partner, not a person.
CREATE TABLE IF NOT EXISTS referral_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  service_id      UUID        NOT NULL REFERENCES partner_services(id) ON DELETE CASCADE,
  code            TEXT        NOT NULL UNIQUE,
  campaign        TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'paused', 'retired')),
  clicks          INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_links_org_idx ON referral_links (organization_id, service_id);

-- =============================================================================
-- Partnerships
-- =============================================================================
-- The agreement between one partner organization and Kindred Tap. Both sides
-- read it; only Kindred Tap may change its status or its terms - which is why
-- there is no partner-writable status column on an agreement document.
CREATE TABLE IF NOT EXISTS partnerships (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_org_id       UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  kindred_tap_org_id   UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'active', 'paused', 'expired', 'terminated')),
  model                TEXT        NOT NULL DEFAULT 'referral agreement'
                       CHECK (model IN ('referral agreement', 'commission share', 'joint programme',
                                        'service level agreement', 'outsourced provider',
                                        'charitable partnership')),
  start_date           DATE,
  renewal_date         DATE,
  referral_terms       TEXT,
  commission_terms     TEXT,
  services             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  approved_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partnerships_distinct_orgs CHECK (partner_org_id <> kindred_tap_org_id)
);

CREATE INDEX IF NOT EXISTS partnerships_partner_idx ON partnerships (partner_org_id, status);
CREATE INDEX IF NOT EXISTS partnerships_kindred_idx ON partnerships (kindred_tap_org_id, status);

-- Agreement metadata. Partners may view and download, and may request an
-- update; only Kindred Tap may change the version in force.
CREATE TABLE IF NOT EXISTS partnership_agreements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID       NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  version       TEXT        NOT NULL,
  effective_from DATE,
  effective_to   DATE,
  status        TEXT        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'superseded', 'expired')),
  terms         TEXT,
  document_name TEXT,
  document_url  TEXT,
  update_requested_at TIMESTAMPTZ,
  update_request_note  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partnership_agreements_partnership_idx
  ON partnership_agreements (partnership_id, status);

-- =============================================================================
-- Referrals
-- =============================================================================
-- One row per referral, in whichever direction it is travelling. `direction`
-- is `inbound` when Kindred Tap sent it to this partner and `outbound` when the
-- partner sent it into Kindred Tap; `receiving_org_id` is always the side that
-- has to act on it.
--
-- `client_reference` is an opaque, human-quotable reference generated by the
-- server. It is what appears in tables, exports and messages. It is NOT a
-- name, an email, a date of birth or anything else from the client record: the
-- partner is told who to contact through the referral thread, not handed the
-- person's identity.
CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             TEXT        NOT NULL UNIQUE,
  direction             TEXT        NOT NULL
                        CHECK (direction IN ('inbound', 'outbound')),
  sending_org_id        UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  receiving_org_id      UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  sending_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  sending_user_name     TEXT,
  sending_professional  TEXT,
  service_id            UUID        REFERENCES partner_services(id) ON DELETE SET NULL,
  service_name          TEXT        NOT NULL,
  partnership_id        UUID        REFERENCES partnerships(id) ON DELETE SET NULL,
  referral_link_id      UUID        REFERENCES referral_links(id) ON DELETE SET NULL,

  client_user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  client_reference      TEXT        NOT NULL,
  client_alias          TEXT,

  reason                TEXT        NOT NULL,
  relevant_information  TEXT,
  priority              TEXT        NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('normal', 'high', 'urgent')),
  status                TEXT        NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'under_review', 'information_required', 'accepted',
                                          'declined', 'scheduled', 'in_progress', 'completed',
                                          'cancelled', 'closed')),
  assigned_professional_id UUID      REFERENCES users(id) ON DELETE SET NULL,
  assigned_professional_name TEXT,

  outcome_code          TEXT,
  outcome_note          TEXT,

  information_requested_at TIMESTAMPTZ,
  decline_reason        TEXT,
  accepted_at           TIMESTAMPTZ,
  scheduled_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referrals_distinct_orgs CHECK (sending_org_id <> receiving_org_id)
);

-- The receiving side's queue and the sending side's history are the two hot
-- paths, so both directions are indexed by organization and status.
CREATE INDEX IF NOT EXISTS referrals_receiving_idx
  ON referrals (receiving_org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_sending_idx
  ON referrals (sending_org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_partnership_idx
  ON referrals (partnership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_service_idx
  ON referrals (service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_client_idx
  ON referrals (client_user_id, created_at DESC);

-- Notes and the status timeline. Both are partnership-side narrative written
-- by clinic staff about a referral: neither is a clinical record and neither
-- may be used to paste one in.
CREATE TABLE IF NOT EXISTS referral_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id  UUID        NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  author_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  author_name  TEXT,
  body         TEXT        NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_notes_referral_idx ON referral_notes (referral_id, created_at);

CREATE TABLE IF NOT EXISTS referral_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID        NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  actor_role  TEXT,
  action      TEXT        NOT NULL,
  detail      TEXT,
  from_status TEXT,
  to_status   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_events_referral_idx ON referral_events (referral_id, created_at);

-- =============================================================================
-- Appointments connected to referrals
-- =============================================================================
-- A referral-linked appointment, deliberately separate from `sessions`. The
-- partner may see that a referral client has an appointment on a given date
-- with a given professional, and nothing about the meeting itself.
CREATE TABLE IF NOT EXISTS referral_appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id       UUID        NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  client_user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  client_reference  TEXT        NOT NULL,
  service_id        UUID        REFERENCES partner_services(id) ON DELETE SET NULL,
  service_name      TEXT        NOT NULL,
  professional_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  professional_name TEXT,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled',
                                      'no_show', 'rescheduled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_appointments_referral_idx ON referral_appointments (referral_id);
CREATE INDEX IF NOT EXISTS referral_appointments_client_idx
  ON referral_appointments (client_user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS referral_appointments_status_idx
  ON referral_appointments (status, scheduled_at);

-- =============================================================================
-- Commission
-- =============================================================================
-- One row per eligible referral per earning organization. The unique constraint
-- on (referral_id, earning_org_id) is the duplicate-commission guard, and it
-- lives in the database rather than in a read-then-write check in JavaScript.
--
-- `rate_bp` and `eligible_amount_minor` are frozen at creation: what the
-- server computed under the rule that was in force when the referral completed.
-- A later change to `partner_services.commission_rate_bp` therefore never
-- silently restates a commission that already exists.
CREATE TABLE IF NOT EXISTS commissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             TEXT        NOT NULL UNIQUE,
  referral_id           UUID        NOT NULL,
  earning_org_id        UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  partnership_id        UUID        REFERENCES partnerships(id) ON DELETE SET NULL,
  service_id            UUID        REFERENCES partner_services(id) ON DELETE SET NULL,
  service_name          TEXT        NOT NULL,
  client_reference      TEXT        NOT NULL,
  referral_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  rule                  TEXT        NOT NULL
                        CHECK (rule IN ('percentage', 'fixed')),
  rate_bp               INTEGER     NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),
  eligible_amount_minor INTEGER     NOT NULL DEFAULT 0 CHECK (eligible_amount_minor >= 0),
  amount_minor          INTEGER     NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency              TEXT        NOT NULL DEFAULT 'GBP',
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'under_review', 'approved', 'scheduled',
                                          'paid', 'cancelled', 'disputed')),
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  payout_id             UUID,
  paid_at               TIMESTAMPTZ,
  dispute_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commissions_one_per_referral UNIQUE (referral_id, earning_org_id)
);

CREATE INDEX IF NOT EXISTS commissions_org_status_idx ON commissions (earning_org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS commissions_referral_idx ON commissions (referral_id);
CREATE INDEX IF NOT EXISTS commissions_payout_idx ON commissions (payout_id);

CREATE TABLE IF NOT EXISTS commission_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID      NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  actor_id     UUID      REFERENCES users(id) ON DELETE SET NULL,
  actor_role   TEXT,
  action       TEXT      NOT NULL,
  detail       TEXT,
  from_status  TEXT,
  to_status    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_events_commission_idx ON commission_events (commission_id, created_at);

-- =============================================================================
-- Payouts
-- =============================================================================
-- A payout is a batch of approved commissions paid together. `payment_reference`
-- is the processor's own reference; no banking details are stored here at all,
-- because a partner's payment destination belongs in the payments system, not
-- in a referral portal row.
CREATE TABLE IF NOT EXISTS payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         TEXT        NOT NULL UNIQUE,
  organization_id   UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  period_label      TEXT        NOT NULL,
  amount_minor      INTEGER     NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency          TEXT        NOT NULL DEFAULT 'GBP',
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  payment_method    TEXT,
  payment_reference TEXT,
  scheduled_for     DATE,
  paid_at           TIMESTAMPTZ,
  failure_reason    TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_org_idx ON payouts (organization_id, status, created_at DESC);

-- One approved commission belongs to at most one payout. Stated as a unique
-- index rather than only as a constraint on commissions.payout_id so the rule
-- holds even if that column is ever cleared.
CREATE UNIQUE INDEX IF NOT EXISTS commissions_single_payout_idx
  ON commissions (payout_id) WHERE payout_id IS NOT NULL;

-- =============================================================================
-- Partner messaging
-- =============================================================================
-- Clinic to Kindred Tap threads, keyed by organization rather than by a single
-- practitioner, because most partnership traffic is about an organization: a
-- referral, an agreement, a commission. Membership of both organizations is the
-- check on every read and write.
CREATE TABLE IF NOT EXISTS partner_conversations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  kindred_tap_org_id UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  topic              TEXT        NOT NULL,
  referral_id        UUID        REFERENCES referrals(id) ON DELETE SET NULL,
  partnership_id     UUID        REFERENCES partnerships(id) ON DELETE SET NULL,
  last_message_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT partner_conversations_distinct_orgs
    CHECK (organization_id <> kindred_tap_org_id)
);

CREATE INDEX IF NOT EXISTS partner_conversations_org_idx
  ON partner_conversations (organization_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS partner_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES partner_conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_messages_conversation_idx
  ON partner_messages (conversation_id, created_at);

-- What each participant has read. The marker belongs to the reader, not the
-- conversation, so two readers can be at different points in the same thread.
CREATE TABLE IF NOT EXISTS partner_message_reads (
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID        NOT NULL REFERENCES partner_conversations(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

-- =============================================================================
-- Approved marketing assets
-- =============================================================================
-- Downloadable promotional material. Only rows with `status = 'approved'` are
-- ever served to a partner, and the copy here is written by Kindred Tap: a
-- partner cannot create or edit an asset, so the portal cannot be used to
-- publish an unsupported clinical claim.
CREATE TABLE IF NOT EXISTS marketing_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID        REFERENCES partner_services(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  format      TEXT        NOT NULL CHECK (format IN ('pdf', 'png', 'link', 'text')),
  url         TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'approved', 'retired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_assets_service_idx ON marketing_assets (service_id, status);

-- =============================================================================
-- Report export history
-- =============================================================================
-- Which reports this organization generated, and when. The rows themselves are
-- built from that organization's own data at request time and are not stored
-- here, so a report cannot outlive the permissions that produced it.
CREATE TABLE IF NOT EXISTS clinic_report_exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  report_key      TEXT        NOT NULL,
  row_count       INTEGER     NOT NULL DEFAULT 0,
  generated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_report_exports_org_idx
  ON clinic_report_exports (organization_id, created_at DESC);

-- =============================================================================
-- Updated-at triggers
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'partner_organizations', 'partner_services', 'referral_links', 'partnerships',
    'partnership_agreements', 'referrals', 'referral_appointments', 'commissions',
    'payouts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Enabled consistently with the rest of the schema. The application connects
-- as the table owner, so these are a defence-in-depth signal rather than the
-- isolation mechanism; the isolation mechanism is the organization predicate
-- in every route, which is also what the tests assert.
ALTER TABLE clinic_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE partnership_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_report_exports ENABLE ROW LEVEL SECURITY;