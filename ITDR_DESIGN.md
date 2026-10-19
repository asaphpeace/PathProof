# Continuous Threat Detection & Response — Design

Status: **designed, not built.** This document is the design-phase output of a
multi-pass review (four rounds of deliberate gap-checking, each looking from
a different angle) before any schema or code gets written. It supersedes the
"Detection Coverage" bench item in `BUILD_PLAN.md` — see that file's roster
table for the pointer.

## 0. What this is, in one sentence

A per-identity investigation system that watches for a principal actually
*using* a privilege-escalation capability the graph already knows they
have, builds a real-time evidence trail across every system that principal
touches, and — in a later phase, deliberately not this one — takes tiered,
mostly human-gated containment action.

## 1. Scope honesty — say this in the product, not just in this doc

This design catches **privilege escalation**: an attacker (or compromised
credential) gaining more access than they should have, where the exact
escalation path is already known (Cloudsplaining's `CloudPrivEscPath`) and
the attacker actually exercises it. It does **not** catch **privilege
misuse**: an already-compromised-but-correctly-scoped credential, or a
malicious insider, doing damage entirely within access they legitimately
hold. That second problem needs real behavioral baselining (full stages
1–2 of the original six-stage pipeline), which is out of scope here.

**Action item:** the UI copy for this feature must say this plainly (e.g.
in the empty state / onboarding text), not bury it in an internal doc. The
"security guard" metaphor should not imply broader coverage than v1
delivers.

## 2. Data model

### 2.1 Identity resolution comes first — this is the structural fix from pass 1

Building `Investigation` keyed on a raw per-source principal string
(`arn:aws:iam::...` from CloudTrail, `auth0|abc123` from Auth0) was the
original plan and it was wrong: it means the same human's misbehavior in
two systems produces two disconnected rows that never get correlated,
which defeats the entire "follow them around" premise.

**`Actor`** — the resolved identity a human maps to across sources.
| field | purpose |
|---|---|
| `id`, `tenant_id` | standard |
| `display_name` | best-effort human label |
| `email` | primary resolution key when available from both sources |

**`ActorIdentity`** — one row per raw principal string, linked to an `Actor`.
| field | purpose |
|---|---|
| `actor_id` | FK to `Actor` |
| `source` | `aws_iam` \| `auth0` \| (future: `okta`, `entra_id`, ...) |
| `principal_id` | the raw string (ARN, Auth0 `user_id`, etc.) |
| `resolved_via` | `email_match` \| `federation_claim` \| `manual` — so a human can audit *why* two identities were merged |

Resolution strategy, in order of confidence: (a) SAML/OIDC federation claim
if the AWS role was assumed via Auth0 federation — the strongest signal,
since it's a direct technical link, not an inference; (b) email match
between Auth0's user profile and the AWS account's known user directory
(if available); (c) manual mapping the customer confirms once, during
onboarding of the second identity source. Never auto-merge on a weak
signal (e.g., matching display name alone) — a wrong merge means one
person's Investigation silently absorbs an unrelated person's activity.

### 2.2 Investigation and its trail

**`Investigation`** — one row per **Actor** currently under suspicion (not
per raw principal — this is the actual fix).
| field | purpose |
|---|---|
| `id`, `tenant_id`, `actor_id` | standard |
| `status` | `watching` \| `suspicious` \| `confirmed` \| `critical` — v1's one detection rule always opens at `confirmed` directly; the lower tiers exist in the schema now for forward-compatibility with future baselining-based signals, not because v1 produces them |
| `opened_at`, `last_activity_at` | trail bounds |
| `dismissed_at`, `dismissed_by_user_id` | human says "this was fine" — see §5.3 for what dismissal does and doesn't do |

**`InvestigationEvent`** — the timeline.
| field | purpose |
|---|---|
| `investigation_id` | FK |
| `source` | `cloudtrail` \| `auth0` |
| `event_id` | source's own unique ID, **unique-constrained per tenant** — prevents double-recording on overlapping poll windows |
| `action_or_event_type`, `occurred_at`, `raw_detail` | what happened |
| *(computed at read time, not stored)* `attack_techniques` | reuses `attack_technique_mapping.py` |

**Audit-trail rule (pass 3):** `Investigation`/`InvestigationEvent` are
**append-only and survive connection deletion**, matching
`CloudPrivEscPath`'s own documented philosophy exactly — a security record
shouldn't disappear because the underlying connection was later revoked.

### 2.3 Connection-level additions

`CloudAccountConnection`: `last_threat_poll_at`, `threat_detection_status`
/`threat_detection_error` — separate fields from the existing
`last_scan_status`/`last_scan_error`, because this is a materially
different pipeline (continuous polling vs. periodic deep scan) with its
own failure modes (most likely: role hasn't been updated with the new
`cloudtrail:LookupEvents` permission yet).

**New model: `IdentityProviderConnection`** (Auth0 first implementation,
shaped to generalize to Okta/Entra ID later without a redesign).
| field | purpose |
|---|---|
| `id`, `tenant_id`, `engagement_id` | standard |
| `provider` | `auth0` for now |
| `domain` (e.g. `tenant.auth0.com`), `client_id` | not secret |
| `encrypted_client_secret` | Fernet-encrypted, same `crypto_service.py` pattern as the SSH private key |
| `last_poll_at`, `poll_status`, `poll_error` | same honest-failure pattern as the cloud pipeline |

Unlike AWS (role-assumption, no stored secret) and SSH (we generate the
keypair), Auth0 credentials are customer-generated (an M2M application
they create) and handed to us — so this is the one connection type where
we *do* hold a real, sensitive customer secret. That raises the stakes on
§6 below.

## 3. Consent & authorization

- **AWS**: two separate steps remain distinct — connect the account
  (posture scanning, existing), then a separate opt-in flag
  `Engagement.scope.continuous_activity_monitoring: true`, **defaulting to
  off**. Connecting to scan configuration is not the same consent as
  ongoing behavioral observation of who does what.
- **Auth0 / `IdentityProviderConnection`**: these two steps collapse into
  one, deliberately — the *only* reason to connect an identity provider is
  behavioral monitoring, there's no posture-scan-only use case to separate
  it from. State this as a deliberate asymmetry, not an inconsistency.
- **Employee-notice attestation**: next to the opt-in checkbox, a required
  attestation — "You confirm your organization has notified employees that
  account activity is subject to security monitoring." Sentinel can't
  verify this externally, but it shouldn't stay silent about the
  prerequisite either. Same spirit as the phishing-simulation consent
  question, lighter weight.
- **RBAC — open question, not yet resolved:** every table in Command today
  is tenant-scoped, not role-scoped — any authenticated user in a tenant
  sees everything. `Investigation` is a named-employee behavioral dossier;
  "every logged-in user, including junior staff, can see it" is probably
  the wrong default. **This needs an explicit decision** (e.g., restrict to
  tenant admins) before this ships — flagging it here rather than silently
  inheriting the existing all-users-see-everything model.

## 4. Ingestion

### 4.1 AWS — CloudTrail

`cloudtrail:LookupEvents` reads the account's built-in 90-day management-event
history — **no Trail, no S3 bucket, no new customer infrastructure**, just
one more permission on the already-granted read-only role. Poll per
distinct action appearing in that tenant's `CloudPrivEscPath.technique_chain`
rows (typically a handful of `LookupEvents` calls, each filtered by
`EventName`), using `last_threat_poll_at` as the window start. *(I believe
`LookupEvents` calls themselves carry no AWS charge, unlike standing up a
Trail with S3 storage — worth confirming against current AWS pricing before
asserting this to a customer, same caution already applied to the Inspector
`ViewOnlyAccess` assumption.)*

### 4.2 Auth0 — three options, one recommendation

1. **Poll `GET /api/v2/logs`** (checkpoint-paginated, M2M token) — same
   shape as the CloudTrail job, reuses every existing pattern, no new
   public attack surface. **Recommended for this phase.**
2. **Log Streams → custom webhook** — near-real-time, but requires a
   public endpoint, a per-tenant secret (same pattern as
   `CloudAccountConnection.external_id` / `Domain.reporting_slug` — not new
   design, third application of an existing idea), and delivery-reliability
   handling Sentinel doesn't need to solve for polling. Documented fast-follow.
3. **Log Streams → AWS EventBridge** — a possible future unification if
   Sentinel ever builds a real-time EventBridge consumer for CloudTrail too
   (one ingestion mechanism for both sources), at the cost of the customer
   configuring a partner event source. Noted, not pursued now.

**Respect the other side's rate limits too** — Auth0's Management API has
its own plan-dependent rate limits; at scale, many tenants polling every
15–30 minutes needs a rate budget on *our* outbound calls, the mirror image
of the rate-limiting already built for *inbound* requests to Sentinel.

**Plan-tier honesty:** Auth0's Attack Protection features (breached-password
detection specifically) are commonly gated to paid tiers. If a customer's
plan doesn't generate a signal, that must surface as "this signal isn't
available on your current Auth0 plan" — not silently look like "nothing
suspicious happened," the same honesty principle as the Phase 0 silent-scan-failure fix.

## 5. Detection, correlation, and escalation

### 5.1 The one v1 rule

A principal with an entry in `CloudPrivEscPath.technique_chain` actually
*calls* that exact IAM action in CloudTrail. High-confidence by
construction — nobody accidentally calls `iam:PassRole` on a role they've
never touched.

### 5.2 Noise policy (pass 1's alert-volume gap)

Auth0's breached-password detection fires whenever *any* employee reuses a
password from a public breach corpus — routine, not rare, at any real
company size. **Not every single-source hit should open an Investigation.**
Policy: require either (a) the principal has elevated/admin scope, or (b)
two independent signals for the same Actor within a time window, before
escalating past `watching`. Without this, the feed floods and the whole
tool trains people to ignore it — a *louder* version of the silent-failure
problem Phase 0 fixed, not a quieter one.

### 5.3 Escalation and dismissal

Multiple `InvestigationEvent`s for the same `Actor`, across sources,
appending to one `Investigation` (this is what §2.1's identity resolution
makes possible). ATT&CK tactic diversity within a short window is the
strongest escalation signal — Discovery + Privilege Escalation + Exfiltration
signals stacked in an hour is a chain, one anomaly alone is noise.

Dismissal marks `dismissed_at` but **does not stop a genuinely new, different
signal from reopening evidence against the same Actor later** — a dismissed
false positive shouldn't create blanket immunity.

**Revoke/Emergency-Stop interaction:** revoking the engagement stops the
polling job from generating *new* evidence (existing mechanism, same as the
scan pipeline). It must **not** auto-dismiss or hide already-open
Investigations — auto-hiding on revoke would make "turn off monitoring" the
fastest way to make a real threat disappear from view, exactly backwards.

## 6. Sentinel's own exposure (pass 4 — the vendor-side lens)

Sentinel now holds three categories of customer secret behind one Fernet
key: AWS role-assumption trust material, an SSH private key per host, and
(with this feature) Auth0 M2M client secrets. The cumulative picture is a
bigger prize than any one of these alone — a Sentinel breach could now open
a path into a customer's cloud account, their servers, *and* their identity
provider at once. This needs an explicit answer, not an assumption that
"we already encrypt secrets" fully covers it: is the encryption key
rotated, and does a single key compromise decrypt everything behind it.

**Operational kill switch:** every safety mechanism built so far (Emergency
Stop, Engagement revocation) is customer-controlled, scoped to one tenant.
There is currently no equivalent for Sentinel's own operators — a way to
pause the entire detection subsystem across every tenant at once, if a bad
deploy starts misclassifying routine activity and flooding everyone. Given
how central Emergency Stop is to this product's whole safety philosophy,
this is the same principle applied to Sentinel's own potential to
malfunction, not just the customer's.

**Don't become the intruder while looking for one:** polling cadence and
backoff need to be conservative enough that Sentinel's own traffic doesn't
trip the customer's *own* rate limiting or anomaly detection.

## 7. Notification

Nothing pages anyone today — an Investigation just sits in a dashboard.
Given the entire premise is catching something *before* damage, that's a
half-finished promise. Reuse the SendGrid path already wired for scheduled
reports for a real-time alert on any `confirmed`-or-above Investigation.

## 8. Privacy, retention, and legal surface

An `Investigation` is a behavioral record of a named individual — personal
data under GDPR and POPIA (the latter genuinely relevant given this
product's SA-market positioning, not just a marketing angle here). Needs:
a retention policy (especially for dismissed/false-positive Investigations
— how long does a record that turned out to be nothing get kept), and an
export/delete path so the customer, as data controller, can honor a data
subject request. Design this alongside the schema, not after a customer or
regulator asks.

## 9. Reuse of existing infrastructure

Every `InvestigationEvent` also creates a normal `Finding` row (`tier='threat'`,
severity from the ATT&CK tactic) — small duplication, but it means the
Overview findings feed, the per-engagement findings endpoint, and the PDF
report (later) all pick this up with zero new plumbing. `Investigation`/
`InvestigationEvent` exist specifically for the grouped-by-Actor,
chronological view on top of those Finding rows.

Once the Multi-Tenant Portfolio Rollup is real (currently demo data),
Investigations across a managed portfolio should feed it — an MSP
technician needs "every open Investigation across every client I manage,"
not one tenant at a time.

## 10. Business model

Continuous monitoring (both the AWS activity flag and any
`IdentityProviderConnection`) is a genuinely more expensive, more valuable
capability than point-in-time scanning — it should be plan-gated, feeding
into the same not-yet-built plan-limits enforcement already flagged as a
gap for Command generally (Cloud/Host connection limits aren't enforced by
plan today either). Not a new problem, but this feature makes that
existing gap more costly to leave unresolved.

## 11. Explicitly out of scope for this phase, and why

- **Full behavioral baselining** (pipeline stages 1–2 in general form) —
  not needed for the one v1 detection rule, which is exactly why that rule
  is the right thing to build first.
- **Any auto-response ("arrest")** — ships last, after the Tier A/B/C
  reversibility design gets its own careful pass, same reasoning as before.
- **RBAC implementation itself** — flagged as a required decision (§3) but
  not designed in detail here; needs its own scoping pass.
- **Detection-rule calibration validation** — unit tests can prove the
  plumbing works (event in → Investigation out), not that the rule is
  well-tuned in production. That's only provable against real traffic over
  time, the same honesty already applied to Lynis's unverified CLI.
