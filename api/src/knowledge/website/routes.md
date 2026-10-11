# Pages and routes on KINDRED TAP

Where things live on the website. Use this to tell someone where to go.

## Public pages

| Page | Path |
| --- | --- |
| Home | `/` |
| Invite | `/invite/:code` |
| Login | `/login` |
| Login | `/login/:portal` |
| Signup | `/signup` |
| Signup | `/signup/:portal` |
| Pending | `/verification/pending` |
| Rejected | `/verification/rejected` |

## Portal pages

Portal pages live under `/portal/:role/…`, where `:role` is one of the six portals (user, supporter, therapist, clinical advisor, clinical supervisor, collaborative clinic).
The path after the role is the same for every portal.

| Feature | Path |
| --- | --- |
| Portal home | `/portal/:role` |
| Advisor Ethics | `/portal/:role/advisor-ethics` |
| Analytics | `/portal/:role/analytics` |
| Appointments | `/portal/:role/appointments` |
| Assessment | `/portal/:role/assessment` |
| Assessments | `/portal/:role/assessments` |
| Assessments | `/portal/:role/assessments/[id]` |
| Calendar | `/portal/:role/calendar` |
| Case Reviews | `/portal/:role/case-reviews` |
| Case Reviews | `/portal/:role/case-reviews/[id]` |
| Clients | `/portal/:role/clients` |
| Clients | `/portal/:role/clients/[id]` |
| Clinic Ethics | `/portal/:role/clinic-ethics` |
| Clinical Standards | `/portal/:role/clinical-standards` |
| Clinical Standards | `/portal/:role/clinical-standards/[id]` |
| Commission | `/portal/:role/commission` |
| Commission | `/portal/:role/commission/[id]` |
| Pending | `/portal/:role/commission/pending` |
| Escalations | `/portal/:role/escalations` |
| Escalations | `/portal/:role/escalations/[id]` |
| Ethics | `/portal/:role/ethics` |
| Interventions | `/portal/:role/interventions` |
| Interventions | `/portal/:role/interventions/[id]` |
| Matching | `/portal/:role/matching` |
| Matching | `/portal/:role/matching/[therapistId]` |
| Directory | `/portal/:role/matching/directory` |
| Requests | `/portal/:role/matching/requests/[id]` |
| Messages | `/portal/:role/messages` |
| Messages | `/portal/:role/messages/[conversationId]` |
| Notifications | `/portal/:role/notifications` |
| Organization | `/portal/:role/organization` |
| Outcomes | `/portal/:role/outcomes` |
| Oversight | `/portal/:role/oversight` |
| Partnerships | `/portal/:role/partnerships` |
| Partnerships | `/portal/:role/partnerships/[id]` |
| Payouts | `/portal/:role/payouts` |
| Performance | `/portal/:role/performance` |
| Profile | `/portal/:role/profile` |
| Progress | `/portal/:role/progress` |
| Promote | `/portal/:role/promote` |
| Materials | `/portal/:role/promote/materials` |
| Referrals | `/portal/:role/referrals/[id]` |
| History | `/portal/:role/referrals/history` |
| Received | `/portal/:role/referrals/received` |
| Sent | `/portal/:role/referrals/sent` |
| Reports | `/portal/:role/reports` |
| Safety | `/portal/:role/safety` |
| Safety | `/portal/:role/safety/[id]` |
| Services | `/portal/:role/services` |
| Session Reviews | `/portal/:role/session-reviews` |
| Session Reviews | `/portal/:role/session-reviews/[id]` |
| Sessions | `/portal/:role/sessions` |
| Notes | `/portal/:role/sessions/[id]/notes` |
| Settings | `/portal/:role/settings` |
| Supervision | `/portal/:role/supervision` |
| Supervision | `/portal/:role/supervision/[therapistId]` |
| Supervisor Ethics | `/portal/:role/supervisor-ethics` |
| Support | `/portal/:role/support` |
| Supporter Session | `/portal/:role/supporter-session` |
| Supporter Tools | `/portal/:role/supporter-tools` |
| Team | `/portal/:role/team` |
| Team | `/portal/:role/team/[id]` |
| Therapist Session | `/portal/:role/therapist-session` |
| Therapist Tools | `/portal/:role/therapist-tools` |
| Therapists | `/portal/:role/therapists` |
| Therapists | `/portal/:role/therapists/[id]` |
| Treatment Plans | `/portal/:role/treatment-plans` |
| Treatment Plans | `/portal/:role/treatment-plans/[id]` |
| Workload | `/portal/:role/workload` |
| Support | `/portal/:role/support` |

## Other areas

- `/admin` - the administrative panel. Admins sign in separately from portal users.
- `/invite/:code` - an invitation link issued by a clinic or an admin.
- `/verification/pending` and `/verification/rejected` - where a new account waits while an admin reviews it.
