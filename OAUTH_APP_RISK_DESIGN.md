# Third-Party OAuth App Risk — Design

Status: **Microsoft 365 backend built.** `OAuthAppConnection`/`OAuthGrant`,
`oauth_app_risk_service.py` (real Microsoft Graph client-credentials flow +
`oauth2PermissionGrants` ingestion), the `/oauth-app-connections` +
`/engagements/{id}/oauth-grants` endpoints, the recurring scheduler job,
and the graph integration (§6 — `graph_service.py` now merges OAuth edges
onto the same Attack Path Graph, with real `Actor`/`identity_resolution_service.py`
reuse so a grantee who's also a known AWS IAM principal resolves to one
node). **Google Workspace not built** — still the designed fast-follow
(§4). **No Command frontend yet** for either provider. This document
remains the design-phase reference for both.

## 0. What this is, in one sentence

Detect over-permissioned or risky third-party OAuth application grants
against a customer's Google Workspace or Microsoft 365 tenant, and
represent them as first-class nodes and edges on the *same* Attack Path
Graph that already visualizes AWS IAM privilege-escalation paths — the
first time the graph extends beyond a single cloud provider.

## 1. Why this, why now (brief — full reasoning already in `BUILD_PLAN.md`)

Only the IAM Privilege-Escalation Graph currently produces real graph
*topology*. Every other tier's findings — Exposure, Host, Phishing, ITDR —
reuse `Finding` but never resolve to a graph node (`Finding.asset_id` is
`None` outside the IAM slice). An over-permissioned OAuth grant is
structurally the same shape as an IAM escalation edge: a principal with an
access path to a sensitive resource nobody's watching. Building it *on*
the existing graph, not as a disconnected findings tab, is the cheapest
available way to make "the graph" — the product's stated differentiator —
actually mean more than one cloud provider's IAM. No blocked external
dependency, unlike Identity & Credential Hygiene's Auth0/Okta requirement.

## 2. Scope honesty — say this in the product, not just in this doc

This catches **standing over-permissioned access**: an employee (or admin)
granted a third-party app a scope broader than it needs, and that grant
persists — the classic reason attackers target OAuth: it survives a
password reset, unlike a stolen session, and a single compromised SaaS
vendor's OAuth access can be a supply-chain path into every customer that
granted it.

This does **not** catch:
- **Active misuse of a legitimately-scoped app.** An app behaving
  maliciously *within* its granted scope is invisible to this tier — same
  "escalation, not misuse" honesty boundary `ITDR_DESIGN.md` §1 already
  drew for CloudTrail detection.
- **Providers beyond Google Workspace and Microsoft 365** (v1 scope,
  §4 below).
- **Anything automatically.** Read-only detection, matching every other
  tier's posture. Revocation is explicitly out of scope (§12).

## 3. Data model

### 3.1 `OAuthAppConnection`

Same shape-family as `CloudAccountConnection`/`HostConnection` — a
provider-specific read-only credential the customer grants once, mirrored
per tenant.

| field | purpose |
|---|---|
| `id`, `tenant_id`, `engagement_id` | standard |
| `provider` | `google_workspace` \| `microsoft365` |
| `encrypted_credential` | Fernet-encrypted (same `crypto_service.py` pattern as the SSH private key and, if built, `IdentityProviderConnection`'s client secret) — a Google service-account JSON key or an Entra ID app's client secret/certificate |
| `status` | `pending_verification` \| `connected` \| `revoked` \| `error` |
| `last_scanned_at`, `last_scan_status`, `last_scan_error` | the same generic recurring-scan fields already on `Engagement` — reused, not re-invented |

**Real design tension, named rather than silently resolved:** this is
structurally the *same* credential shape `ITDR_DESIGN.md` §2.3 already
designed for `IdentityProviderConnection` (a customer-generated OAuth2
client, handed to Sentinel, Fernet-encrypted). Building a second, separate
model here is a deliberate choice, not an oversight: `IdentityProviderConnection`
polls *security event logs* (who logged in, was a password breached);
`OAuthAppConnection` reads *current-state app grants* (what apps have
standing access, with what scopes). Different data, different polling
shape, different risk profile. But the credential-storage half is
duplicated. Worth a real consolidation pass once both exist and the
overlap is concrete rather than theoretical — flagged here so it doesn't
get silently forgotten, not resolved now.

### 3.2 `OAuthGrant`

The graph edge, one row per (app, grantee) pair discovered.

| field | purpose |
|---|---|
| `id`, `tenant_id`, `engagement_id`, `connection_id` | standard |
| `grantee_principal` | the human who granted access — an email address |
| `app_name`, `app_client_id` | the third-party app's display name and OAuth client id (client_id is the real dedup key; names collide, ids don't) |
| `scopes` | `jsonb` list of raw OAuth scope strings, provider-native (Google's `https://www.googleapis.com/auth/...` URIs or Graph API permission strings) |
| `risk_tier` | `critical` \| `high` \| `medium` \| `low` — computed, see §3.3 |
| `granted_at` | nullable — Google's API doesn't reliably surface exact grant dates; don't imply precision the source data doesn't have |
| `discovered_at` | standard |

No new table for the graph node itself — `graph_service.py` derives a
`third_party_app` node per distinct `app_client_id` the same way it
already derives principal nodes from `CloudPrivEscPath` rows. See §6.

**Why a new table instead of extending `CloudPrivEscPath`:** that table's
own shape (`source_principal_arn`, `target_principal_arn`) is IAM-specific
by name and already has live data behind it. Renaming/generalizing it is
the architecturally cleaner long-term move, but a disruptive migration for
what should be an additive change. `graph_service.py` becomes the real
multi-source aggregator instead — merges `CloudPrivEscPath` edges and
`OAuthGrant` edges into one response. That's the correct place for this
seam to live, not the source tables.

### 3.3 Scope-risk classification — curated, not source-verified

Neither Google nor Microsoft publishes an official "these scopes are
dangerous" list — same problem `attack_technique_mapping.py` already
solved for IAM actions lacking a Cloudsplaining-shipped crosswalk, same
honesty required: this is a maintained, curated mapping (broad Drive/Mail
read-write, `admin.directory` scopes, `offline_access` combined with a
broad data scope → high/critical; narrow read-only scopes → low), not an
authoritative source. It will need periodic revision as new scopes and
apps appear, the same "curated, not exhaustive" posture already carried
twice elsewhere in this codebase (exposure's port list, its takeover
fingerprints).

## 4. Which provider first: Microsoft 365, Google Workspace fast-follow

The two providers' APIs have a real cost asymmetry, not just a coin-flip:

- **Microsoft Graph API** exposes tenant-wide list calls —
  `GET /oauth2PermissionGrants` (user-consented delegated grants) and
  `GET /servicePrincipals/{id}/appRoleAssignedTo` (admin-consented
  application grants) — a handful of calls cover the whole org.
- **Google Admin SDK**'s documented approach is per-user:
  `GET /admin/directory/v1/users/{userKey}/tokens`, meaning one paginated
  call *per employee* to get org-wide coverage — the same rate-budget
  concern `ITDR_DESIGN.md` §4.2 already flagged for polling *any* external
  API at scale, just structurally worse here since it's O(employees) not
  O(1).

Build Microsoft 365 first on pure ingestion-cost grounds. Worth confirming
against a real Workspace domain before fully committing to the per-user
approach being current — Google's admin APIs have shifted before, and this
needs the same "verify before asserting to a customer" caution already
applied to Lynis's unverified CLI invocation and CloudTrail's assumed
zero-cost `LookupEvents` calls.

## 5. Ingestion

### 5.1 Microsoft 365 / Entra ID

An Entra ID App Registration with application permissions
`Application.Read.All` + `DelegatedPermissionGrant.Read.All`, admin-consented
once by the customer — the M365 equivalent of AWS's cross-account role,
except a registered app with client credentials (prefer a certificate over
a client secret, mirroring `ARCHITECTURE.md`'s general "prefer federation
over long-lived secrets" instinct for GCP/Azure). Poll on the same
recurring-job pattern as every other tier (`poll_all_due_*` + scheduler
registration in `main.py`). Only `oauth2PermissionGrants` (user-consented
delegated grants) is read in v1 — admin-consented application-level grants
(`servicePrincipals/{id}/appRoleAssignedTo`) are a real, separate signal
not covered by this pass, not silently conflated with delegated grants.

**Corrected during implementation, not left as a latent bug:** the first
draft resolved every grant's app/user GUID into a name *before* filtering
out admin-consented-for-all grants (no `principalId`) — wasted Graph API
calls resolving names for grants about to be discarded. Filtering happens
before resolution now. A second bug — the ingestion function's return
dicts used `grantee_email` as a key while the code that consumed them
(building `OAuthGrant` rows and `Finding` text) expected
`grantee_principal` — was caught by the test suite (`KeyError` on the very
first test run against the fix), not by inspection; fixed by using one
consistent key name (`grantee_principal`, matching the model field)
throughout.

### 5.2 Google Workspace

A service account with domain-wide delegation, scoped to the read-only
`admin.directory.user.security` (or narrower, if one exists — needs
verification) scope. Per-user `Tokens.list`, paginated across the
directory. Confirm real API behavior against a live domain before this
ships — flagged honestly as unverified, not assumed.

## 6. Graph integration — the actual point of this feature

This is where the payoff has to land, or the feature isn't worth building
over a disconnected findings list.

**Node types added:** `third_party_app` (one per distinct `app_client_id`).
**Edge type added:** `oauth_grant`, source → app, with `scopes` playing the
role `technique_chain` plays for IAM edges, and `risk_tier` driving the
same severity-color rendering the graph already uses.

**The identity-resolution payoff, which is the real reason this is worth
doing:** `grantee_principal` is an email address; an IAM principal's
identity on the existing graph is an ARN. Those don't match as strings —
the exact problem `identity_resolution_service.py` already solved for
ITDR, resolving an AWS ARN and an Auth0 `user_id` to one `Actor`. Reuse it
here unchanged: resolve `grantee_principal` (source `google_workspace` or
`microsoft365`) against the same `Actor`/`ActorIdentity` tables. When it
resolves (email match against an `Actor` already seen via AWS), **one
human shows as one node on the graph, with edges to both their IAM
privilege-escalation path and their risky OAuth grants** — cloud-infra and
SaaS-identity privilege, unified on one visualization, for one person.
That combination is not something BloodHound, Pacu/ScoutSuite, or a
SaaS-security-posture tool does — each does one half. This is the concrete
version of the "unified privilege graph" claim `BUILD_PLAN.md` makes in
the abstract.

## 7. Consent & authorization

Read-only, no active testing, no employees directly targeted by anything
Sentinel does — same shape as Exposure/Cloud Posture's lighter consent
weight. But listing OAuth grants necessarily surfaces **which named
individual** granted access to which app — "Jane granted ShadyApp access
to her mailbox" is personal behavioral data, not infrastructure
configuration. That's closer to `ITDR_DESIGN.md` §3's profile than to
Cloud Posture's. Resolution: reuse the same **employee-notice attestation**
already built for ITDR's `continuous_activity_monitoring` opt-in ("You
confirm your organization has notified employees that account activity is
subject to security monitoring") rather than requiring a full e-signature
— no active testing occurs, so the Dropbox Sign RoE weight Phishing Tier B
carries would be overkill. Auto-approved engagement (`tier='oauth_risk'`,
new tier value), attestation checkbox at connection time, same UI pattern
already shipped.

## 8. Reuse of existing infrastructure

- Every discovered `OAuthGrant` also creates a normal `Finding` row
  (`tier='oauth_risk'`, severity from `risk_tier`) — zero new plumbing for
  Overview, the PDF report, or the per-engagement findings endpoint, same
  reuse `InvestigationEvent` and every scan service already established.
- **ATT&CK tagging via the existing curated mapping, not a new system:**
  MITRE ATT&CK already names this category — T1528 (Steal Application
  Access Token) and T1550.001 are real, applicable techniques.
  `attack_technique_mapping.py` gets new curated entries mapping
  high-risk scope patterns to these techniques, the same pattern already
  used for IAM actions, not a parallel tagging mechanism.
- Recurring scan job registered in `main.py` on the established
  `_command_*_job` pattern, config setting mirroring
  `command_impersonation_scan_interval_days`.

## 9. Privacy and retention

This is the **third** time this exact gap has been flagged across
`ITDR_DESIGN.md`, `PHISHING_DESIGN.md`, and now here: named-individual
behavioral data needs a retention policy and an export/delete-on-request
path for the customer as data controller (POPIA/GDPR), and none of the
three features that need it has actually gotten one yet. Three
independent "needs design" footnotes is no longer an argument for a
fourth footnote — it's an argument that this should become its own
cross-cutting piece of work before, or alongside, whichever of the three
ships next, rather than getting silently deferred a third time.

## 10. Business model

Same not-yet-built plan-limits enforcement gap already flagged for ITDR's
continuous-monitoring flag and Phishing Tier B's recurring campaigns —
this is now the third feature whose real value (ongoing monitoring, not a
point-in-time scan) depends on plan-gating that doesn't exist yet.

## 11. API contract

```
POST   /oauth-app-connections                  initiate; returns provider-specific setup instructions
GET    /oauth-app-connections
POST   /oauth-app-connections/{id}/verify      confirm the credential can call the read API, → 'connected'
POST   /oauth-app-connections/{id}/revoke
GET    /engagements/{id}/oauth-grants          list grants for an engagement (mirrors /priv-esc-paths)
```

Naming follows the established `/cloud-connections`, `/host-connections`
convention directly.

## 12. Explicitly out of scope for this phase, and why

- **Revocation of a risky grant on the customer's behalf** — read-only
  detection only, matching every other tier; automated remediation is the
  same "arrest"-tier category ITDR explicitly deferred, for the same
  reasoning (needs its own reversibility-tiered design pass).
- **Providers beyond Google Workspace / Microsoft 365** (Okta's app
  catalog, Slack app directory, GitHub OAuth apps) — real expansion path
  once the pattern is proven against the two dominant identity platforms,
  not before.
- **Historical diffing ("newly granted since last scan")** — v1 shows
  current state only. This is exactly what the already-benched "What
  changed?" timeline idea in `BUILD_PLAN.md` is for; plug into that once
  it exists rather than building a parallel diffing mechanism here.
- **RBAC on who can see `OAuthGrant`/named-grantee data** — inherits the
  same unresolved open question already flagged in `ITDR_DESIGN.md` §3.
  One RBAC pass should cover all three features that need it, not a third
  independent answer.
- **Consolidating `OAuthAppConnection` with `IdentityProviderConnection`**
  — real overlap, named in §3.1, not resolved here. Revisit once both
  exist and the shared credential-storage duplication is concrete.
