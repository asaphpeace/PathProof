# Sentinel Command — Product & Platform Architecture

Status: planning / pre-build. Companion product to Sentinel V1 (DMARC/MTA-STS email security posture platform), built as a second stack on a shared platform rather than a standalone product.

---

## 1. Strategic framing (why this shape, not another)

**Category:** autonomous/live attack-surface verification (Breach & Attack Simulation adjacent). Incumbents — Horizon3.ai NodeZero, XBOW, Pentera, Cymulate, AttackIQ, Picus Security — already own "verified exploit, not theoretical CVE" as a category. Competing on that claim directly means matching their two hardest-built subsystems: a real exploit-chaining engine, and a deterministic verification layer that stops an LLM agent from hallucinating a false "confirmed RCE." Both are multi-year, liability-heavy builds.

**Decision:** don't build full autonomous exploitation first. Build a **ladder of live verification tiers**, each one real proof against the customer's actual infrastructure (so the "compel and nudge" effect is genuine from day one), ordered from safest/cheapest to build up to the eventual full-exploitation tier. Full live exploitation (RCE, lateral movement) remains the destination, not the starting point.

**Decision:** Sentinel Command is not a standalone app with its own login, its own domain registry, or its own consent model. It is a second product stack sharing one platform core with Sentinel V1. The cross-product signal-sharing (DMARC posture informing a phishing simulation's pitch, phishing results feeding the Sentinel Score) is the actual differentiator competitors structurally cannot copy, because none of them own email-authentication posture data.

---

## 2. The live verification ladder

| Tier | What it proves | Build size | New risk introduced |
|---|---|---|---|
| 0 — Cloud Posture Scanning | "Your CI/CD role can escalate to full account admin — here's the chain" | Small (pure read-only SDK calls, no scanning infra) | Customer must grant read-only cloud-account access (new consent type, not new attack risk) |
| 1 — Exposure Proof | "This is open to the internet right now, here's what we could read" | Small–medium | None beyond passive recon |
| 2 — Credential Proof | "We logged in as [email] using a breached password" | Medium | Active auth attempt against real accounts (lockout risk) |
| 3 — Phishing/Email Capture | "X% of staff entered credentials into a simulated phish" | Medium (mostly reuses V1's email infra) | Targets people, not infra — needs HR/legal sign-off |
| 4 — Reachability/Segmentation | "Your claimed DMZ→data-tier isolation doesn't hold" | Large | Requires an on-prem collector — ops/support burden |
| 5 — Full exploitation (RCE, lateral movement) | Live kill-chain, chained CVEs | Very large | Full liability tier — deferred until 1–4 prove conversion and the verification-layer/safety engineering exists |

**Recommended build order: 0 → 1 → 3 → 2 → 4 → (5 deferred indefinitely).** Tier 0 moved to the front on review: it needs no scanning-infrastructure provisioning (Section 9's open scanning-host blocker doesn't apply — it's authenticated, read-only cloud-SDK calls, not network probing), no commercial breach-data API, and is the most Python-native tier in the plan (see tooling below), so it can be built and demoed against a test cloud account before any other tier's external dependencies are resolved. Tiers 1 and 3 are fully agentless and reuse Sentinel V1 infrastructure directly (domain ownership verification, email-sending/deliverability expertise). Tier 3 in particular should correlate directly with a domain's live DMARC policy — "your policy is `p=none`, here's proof of what that allows" is a pitch no generic BAS competitor can make.

### Tier detail (what each needs to build)

**Tier 0 — Cloud Posture Scanning**
- Consent model is different from every other tier: instead of domain/CIDR/employee-list scope, the customer grants **read-only access into their cloud account** — for AWS, a cross-account IAM role (trust policy scoped to Command's AWS account, `ExternalId` for confused-deputy protection, `SecurityAudit`+`ViewOnlyAccess` managed policies); for Azure, a Service Principal with `Reader` role (prefer workload-identity federation over long-lived client secrets); for GCP, a Service Account (prefer Workload Identity Federation over a downloadable JSON key). AWS's role-assumption model is the cleanest — Command never stores customer credentials at all, just a Role ARN + ExternalId, and requests short-lived STS tokens per scan.
- Posture scan: run **Prowler** (Python, hundreds of CIS/best-practice checks across AWS/Azure/GCP/Kubernetes) against the connected account — findings map directly onto the existing Compliance Matrix screen's frameworks (CIS benchmarks overlap heavily with SOC2/PCI/ISO controls already modeled there).
- IAM privilege-escalation graph: run **Cloudsplaining** and/or **PMapper** (both Python, AWS-specific) to compute which IAM principals can reach account-admin through policy misconfigurations — this is structurally the same "chokepoint" analysis as Tier 4's network graph, just over IAM edges instead of network edges, and can render in the same attack-path graph component.
- Any long-lived secrets that must be stored (Azure client secret, GCP JSON key, if federation isn't used) get encrypted at rest using the `cryptography` package already in V1's `requirements.txt` — no new crypto dependency.
- Because it's read-only and consented via an explicit account-connection step, this tier carries the lowest operational risk in the plan, but should still sit inside an Engagement (`tier: 'cloud'`) with its own scope (which accounts/subscriptions/projects) and go through the same e-signature ROE as the other tiers, for one consistent consent framework rather than a special case.

**Tier 1 — Exposure Proof**
- Subdomain enumeration (cert-transparency logs, passive DNS APIs), ASN/IP-range discovery
- Rate-limited service scan: exposed admin panels, unauthenticated DB ports, `.git`/`.env` leaks, open Kubernetes dashboards, Swagger docs
- Cloud storage bucket discovery via name permutation + public-list check
- Proof capture: headless-browser screenshot; for open storage, read *sample filenames/first bytes only, hard-capped* — never bulk download
- Scan history + diffing ("newly exposed since last scan")
- Shares scanning infrastructure with V1's MTA-STS cert-probing pipeline — build as one shared scanner service

**Tier 2 — Credential Proof**
- Breach corpus via paid API (HaveIBeenPwned/SpyCloud/DeHashed/Constella) scoped to the customer's domain — never self-scraped dark web
- Auth endpoint targeting from Tier 1's discovered surfaces
- One login attempt per credential, hard-capped, with backoff — never brute force
- On success: capture proof, terminate session immediately, never browse post-auth
- Requires explicit per-auth-endpoint opt-in (stronger consent gate than Tier 1)

**Tier 3 — Phishing/Email Capture**
- Customer-provided employee list by default (not unilateral OSINT harvesting)
- Dedicated lookalike/generic sending domain — never spoof the customer's real domain
- Capture page logs "credentials were entered" as an event; never persists the actual password value
- Open/click/credential-entry event tracking
- Correlates with the domain's live DMARC/SPF/DKIM state from V1 to explain *why* the simulation succeeded
- Requires HR/legal sign-off, separate approval flow from infra scanning

**Tier 4 — Reachability/Segmentation Proof**
- Customer-deployed lightweight collector (VM/container) doing read-only `connect()`/SYN tests — no exploitation
- Path graph built from Tier 1 (external) + Tier 2 (creds) + Tier 4 (internal reachability) combined
- Segmentation checks: attempt connections across boundaries the customer claims are isolated
- First tier with a real ops/support burden (fleet of customer-deployed collectors) — hold until 1–3 prove the nudge effect converts to sales

---

## 3. Platform architecture: Core + Stacks

Two product stacks (V1, Command — designed to extend to more later) sitting on one shared platform core. A stack owns its domain-specific entities; it never duplicates another stack's entities, and cross-stack communication goes through the event bus, not point-to-point API calls (which become an N² integration mess as stacks are added).

```
┌─────────────────────────────────────────────────────┐
│                    Platform Core                      │
│  Tenant · User/Role · Domain (ownership-verified)      │
│  PostureScoreService · AuditLog · NotificationBus       │
└───────────────┬───────────────────────┬───────────────┘
                │  event bus            │  event bus
     ┌──────────▼──────────┐  ┌─────────▼──────────┐
     │   Sentinel V1         │  │  Sentinel Command    │
     │ DMARC reports          │  │ Engagement/Asset/     │
     │ MTA-STS state           │  │ Finding/Collector      │
     │ Sentinel Score inputs    │  │                       │
     └──────────────────────┘  └───────────────────────┘
```

**Rule:** Command doesn't get its own copy of "domain" — every `Engagement.domainId` points at V1's existing verified `Domain` record. A customer already onboarded into V1 has zero setup cost to try Command, because domain trust already exists.

**Rule:** Command's `Engagement.approvedBy` resolves to the same `User`/`Role` records V1 uses. No second approval hierarchy.

---

## 4. Core shared data model (Platform Core)

```ts
Tenant {
  id, name, plan, createdAt
}

Domain {                          // owned by platform core, referenced by every stack
  id, tenantId, fqdn,
  ownershipVerified: bool, verificationMethod, verifiedAt
}

User / Role {                     // one auth/RBAC system, both stacks reference it
  id, tenantId, email, role, permissions[]
}

AuditLog {
  id, tenantId, actorUserId, action, targetType, targetId, occurredAt, metadata: jsonb
}
```

## 5. Sentinel Command data model

```ts
Engagement {                      // the consent/scope/ROE gate — every scan belongs to one
  id, tenantId, domainId,          // domainId nullable for tier:'cloud' — a cloud account isn't always tied to one domain
  tier: 'cloud' | 'exposure' | 'credential' | 'phishing' | 'reachability' | 'exploit',
  scope: {
    cidrRanges?: string[],
    subdomains?: string[],
    authEndpointAssetIds?: string[],      // tier 2 — explicit per-endpoint opt-in
    employeeListRef?: string,             // tier 3
    cloudAccountConnectionIds?: string[], // tier 0 — which connected accounts are in scope
    excludedAssetIds?: string[]           // hard no-touch list
  },
  status: 'draft' | 'pending_approval' | 'active' | 'expired' | 'revoked',
  approvedBy, approvedAt, expiresAt,
  rulesOfEngagementDocUrl
}

CloudAccountConnection (tier 0) {
  id, tenantId, provider: 'aws' | 'azure' | 'gcp',
  // AWS
  roleArn?, externalId?,
  // Azure
  azureTenantId?, clientId?, encryptedClientSecret?, subscriptionId?, usesFederation?: bool,
  // GCP
  serviceAccountEmail?, encryptedKeyJson?, gcpProjectId?, usesFederation?: bool,
  status: 'pending_verification' | 'connected' | 'revoked' | 'error',
  connectedBy, connectedAt, lastScannedAt
}

CloudAsset (tier 0) {
  id, tenantId, cloudAccountConnectionId,
  resourceType: 'iam_role' | 'iam_user' | 's3_bucket' | 'ec2_instance' | 'security_group' | 'lambda_function' | 'rds_instance' | string,
  resourceId, region, metadata: jsonb
}

CloudPrivEscPath (tier 0) {         // output of Cloudsplaining/PMapper — the IAM attack graph
  id, engagementId, cloudAccountConnectionId,
  sourcePrincipalArn, targetPrincipalArn,   // target often 'account-admin'
  techniqueChain: string[],                 // e.g. ['iam:PassRole','lambda:CreateFunction','lambda:InvokeFunction']
  severity, discoveredAt
}

Asset {                           // discovered target, shared across tiers
  id, tenantId, domainId,
  type: 'subdomain' | 'ip_port' | 'storage_bucket' | 'auth_endpoint' | 'employee_email',
  value, firstSeenAt, lastSeenAt, metadata: jsonb
}

Finding {                         // envelope — proof payload varies by tier
  id, tenantId, engagementId, assetId, tier,
  severity: 'critical' | 'high' | 'medium' | 'low',
  title, discoveredAt,
  status: 'open' | 'acknowledged' | 'remediated' | 'retest_closed',
  proofRef: string
}

ExposureProof (tier 1) {
  findingId, exposureType: 'open_port'|'open_bucket'|'exposed_admin_panel'|'leaked_git'|'exposed_db',
  screenshotUrl, sampleReadKeys: string[], serviceDetail
}

CredentialProof (tier 2) {
  findingId, maskedEmail, breachSource, breachDate,
  authEndpointAssetId, loginSucceededAt,
  landingScreenshotUrl, sessionTerminatedAt
}

PhishingCampaign (tier 3) {
  id, engagementId, templateId, sendingDomain, targetCount, sentAt,
  status: 'sending' | 'complete'
}
PhishingEvent (tier 3, per recipient) {
  id, campaignId, recipientHash,     // pseudonymized; unmask is separate admin-only call
  event: 'sent'|'opened'|'clicked'|'credential_entered', occurredAt
}

ReachabilityEdge (tier 4) {
  id, engagementId, sourceAssetId, targetAssetId, port, protocol,
  reachable: bool, testedAt, collectorId
}
Collector (tier 4, on-prem probe) {
  id, tenantId, engagementId, status: 'online'|'offline',
  lastHeartbeatAt, version, authTokenId
}
```

## 6. API contract

**Cloud account connections (tier 0)**
```
POST   /v1/cloud-connections                       initiate; returns provider-specific setup instructions
                                                     (AWS: CloudFormation/Terraform snippet + ExternalId;
                                                      Azure/GCP: federation setup or key-upload step)
POST   /v1/cloud-connections/{id}/verify            confirm the role/service-account is assumable, → 'connected'
GET    /v1/cloud-connections/{id}
POST   /v1/cloud-connections/{id}/revoke
GET    /v1/engagements/{id}/priv-esc-paths          returns CloudPrivEscPath graph for a cloud-tier engagement
```

**Engagements — the safety gate**
```
POST   /v1/engagements                    create (status=draft)
POST   /v1/engagements/{id}/submit        → pending_approval
POST   /v1/engagements/{id}/approve       customer sign-off → active
POST   /v1/engagements/{id}/revoke        EMERGENCY STOP — halts all running scans immediately
GET    /v1/engagements/{id}
```

**Scans**
```
POST   /v1/engagements/{id}/scans         rejected if engagement not 'active'
GET    /v1/scans/{id}
POST   /v1/scans/{id}/cancel
```

**Assets & Findings**
```
GET    /v1/domains/{id}/assets
GET    /v1/engagements/{id}/findings
GET    /v1/findings/{id}
PATCH  /v1/findings/{id}                  status transitions
POST   /v1/findings/{id}/retest
GET    /v1/findings/{id}/proof
```

**Tier 3 — phishing**
```
POST   /v1/engagements/{id}/phishing-campaigns
GET    /v1/phishing-campaigns/{id}
GET    /v1/phishing-campaigns/{id}/events         aggregate by default
POST   /v1/phishing-campaigns/{id}/events/unmask  admin-only, audit-logged
```

**Tier 4 — collector (inbound from customer's network)**
```
POST   /v1/collectors/register           exchanges install token for short-lived scoped credential
POST   /v1/collectors/{id}/heartbeat
POST   /v1/collectors/{id}/results       pushes ReachabilityEdge batch
```

**Integrations**
```
POST   /v1/findings/{id}/export/jira
```

### Safety enforcement — the detail that makes Emergency Stop real

`engagement.revoke` cannot just flip a database flag. Every scan worker and the collector's result-push endpoint must check `engagement.status === 'active'` **before every individual action**, via a short-TTL cached status check (poll every few seconds), not once at scan start. This is what separates a real emergency stop from the decorative toggle in the original mockup.

---

## 7. Event bus contract

**Transport:** contract is transport-agnostic at the producer/consumer level (standard envelope schema below); implementation can start as a Postgres-backed outbox + worker queue or a managed pub/sub (SNS/SQS, Redis Streams) and swap later without touching producers/consumers.

**Delivery guarantees:** at-least-once delivery. Consumers must be idempotent (dedupe by `eventId`, TTL-bounded processed-ID store). No cross-event-type ordering guarantee; within a single `domainId` stream, consumers should recompute-from-latest-state rather than depend on strict order.

**Envelope schema (every event):**
```ts
{
  eventId: uuid,
  eventType: string,        // e.g. 'domain.dmarc_policy_changed'
  schemaVersion: string,    // per-event-type version, e.g. 'v1'
  tenantId, domainId,
  occurredAt: timestamp,
  producedBy: string,       // service name
  payload: { ... }          // event-type-specific, versioned independently
}
```

**Schema versioning:** each event type's payload schema is versioned independently; breaking changes bump `schemaVersion` and old consumers route through a compatibility shim. Event schemas live in a shared package both stacks import — never redefined per-consumer.

**Retry/DLQ:** failed processing retries with backoff; after N attempts, moves to dead-letter with alerting on DLQ growth.

**Access control:** publishing/consuming uses internal service identity (mTLS or signed JWT carrying service identity + allowed event-type claims) — distinct from customer-facing API auth.

### Event catalog

| Event | Producer | Key consumers | Purpose |
|---|---|---|---|
| `domain.ownership_verified` | V1 | Command | Unlocks Engagement creation for that domain |
| `domain.dmarc_policy_changed` | V1 | Command, PostureScoreService | Triggers Tier 3 pitch pre-fill; feeds score |
| `domain.sentinel_score_updated` | PostureScoreService | Dashboard UI, NotificationService | Drives trend charts, alerts on drop |
| `engagement.approved` / `engagement.revoked` | Command | AuditLog, scan workers | Safety enforcement + audit trail |
| `engagement.finding_verified` | Command | PostureScoreService, V1 (threat-surface counter) | Verified findings affect both products |
| `campaign.phishing_completed` | Command | PostureScoreService | Human-risk signal into composite score |
| `finding.status_changed` | Command | PostureScoreService, Jira sync | Remediation should visibly improve score |
| `collector.offline` | Command | NotificationService | Ops alert — a dead collector silently degrades Tier 4 coverage |

---

## 8. PostureScore — the composite aggregation model

**Purpose:** turn V1's DNS/email-auth posture and Command's verified findings into one explainable number (0–100, letter grade A–F), so the platform's value is the composite score, not two separate dashboards a customer has to reconcile themselves.

**Category weights (initial, tunable):**

| Category | Source | Weight | What feeds it |
|---|---|---|---|
| Email Authentication Posture | V1 | 20% | Existing Sentinel Score DMARC/SPF/DKIM/MTA-STS logic |
| Cloud Posture | Command Tier 0 | 15% | Prowler check pass/fail rate + severity-weighted IAM priv-esc paths |
| External Exposure | Command Tier 1 | 15% | Count/severity of open exposures |
| Credential Hygiene | Command Tier 2 | 10% | Live valid credential proofs found |
| Human Risk | Command Tier 3 | 15% | Phishing simulation click/credential-entry rate |
| Verified Exploitability | Command Tier 4/5 | 25% | Severity-weighted verified reachable paths to crown jewels |

(Weights rebalanced to make room for Cloud Posture; still an unvalidated hypothesis per Section 10, not a fixed formula.)

Verified-exploit signals are weighted highest deliberately — "we proved it live" should always outweigh "this looks misconfigured," consistent with the "verified, not theoretical" positioning.

**Recency decay:** each category score decays toward a neutral baseline as its underlying evidence ages (e.g. linear decay starting at 30 days, floor at 90 days) — a phishing result from 6 months ago shouldn't hold the same weight as one from last week. Every score snapshot carries a staleness indicator per category ("verified exploitability last tested 12 days ago").

**Recompute trigger:** event-driven, not nightly batch — `PostureScoreService` subscribes to the event catalog above and recomputes on any relevant event (`domain.dmarc_policy_changed`, `engagement.finding_verified`, `campaign.phishing_completed`, `finding.status_changed`). This is also what makes a "Simulate fix" style interaction genuinely live in production, not just a UI mock.

**Versioning:** every snapshot stores the `formulaVersion` used to compute it. Changing category weights later must never silently rewrite historical scores — trend charts must remain explainable ("your score changed because of X event," never "because we changed the math without telling you").

**Data model:**
```ts
PostureScoreSnapshot {
  id, tenantId, domainId, computedAt, formulaVersion,
  overallScore: number, grade: 'A'|'B'|'C'|'D'|'F',
  categoryScores: {
    emailAuth, exposure, credentialHygiene, humanRisk, verifiedExploitability
  },
  triggerEvent: string    // audit/explainability — what caused this recompute
}
```

`PostureScoreService` is platform-core, not owned by either stack — it's the thing that makes the two products worth more together than apart.

---

## 9. Build-readiness decisions (resolved after reviewing the actual V1 codebase)

The V1 backend (`Sentinel/V1/backend`) is already FastAPI + SQLAlchemy(async)/asyncpg + Alembic + Postgres; the frontend is Vue 3 + Pinia + Vue Router + Vite — the exact stack targeted for Command. This changes several architecture calls from provisional to concrete:

**Platform Core already exists — extend it, don't rebuild it.**
`Tenant` and `User` (`backend/app/models/user.py`) already have MSP parent-hierarchy, Stripe billing, white-label branding fields, JWT + TOTP auth, and tenant-scoped uniqueness. `Domain` (`backend/app/models/domain.py`) already has ownership verification. `audit_service.py` already implements an audit log. `posture_service.py` already computes a pillar-based letter-grade score. Command's tables (`Engagement`, `Asset`, `Finding`, etc.) get `tenant_id`/`domain_id` foreign keys straight into the existing `tenants`/`domains` tables — same database, same repo, same Alembic migration chain. No new Tenant/Domain/User/AuditLog model gets built.

**Event bus: defer the message broker.** With Core and both stacks living in one backend today, cross-product "events" (Section 7's catalog) should be direct in-process service calls or Postgres `LISTEN/NOTIFY`, not a real broker (Kafka/SNS/Redis Streams). Introduce one only if/when the scanning workload forces a genuinely separate deployment (see below) — at that point the event contract in Section 7 becomes the real integration point between processes; until then it's an internal calling convention.

**PostureScoreService extends `posture_service.py` directly**, adding the new category scores (Exposure, Credential Hygiene, Human Risk, Verified Exploitability) alongside the existing DMARC/MTA-STS pillars, rather than standing up a parallel scoring system.

**Scanning egress must be isolated from the customer-facing app.** AWS/GCP/Azure and most standard VPS hosts explicitly prohibit port-scanning traffic in their AUP, and their automated abuse detection can't distinguish an authorized engagement from a real intrusion — running Tiers 1/2/4 scan traffic from the same host/account serving customer requests risks the whole app getting suspended. Decision: source scanning infrastructure from a dedicated/private-cloud provider with no such AUP restriction (e.g. OpenMetal-class providers, ~$200/mo for dedicated hardware explicitly permitting scanning/security-research traffic), fully separate account and network egress from the main app. Even on a permissive host, keep a documented per-engagement authorization record ready to answer abuse complaints quickly, since a scan target's own upstream ISP can still file one regardless of your host's policy. **Open follow-up: pick and provision the specific provider before any Tier 1 code touches a live (non-localhost) target.**

**Breach-data provider: DeHashed first, cascade through HIBP.** SpyCloud ($12K–$100K+/year) is enterprise-managed and too large a commitment pre-revenue-validation for this tier. DeHashed is pay-as-you-go (~$0.02/query, freemium tier), gives field-level breach data including passwords for many breaches, and has no annual lock-in — the right fit for an unproven tier. Have I Been Pwned's domain-search API is cheap/free but breach-metadata-only (confirms an email was breached, doesn't surface passwords) — use it as a free first-pass presence check, and only spend a DeHashed query when HIBP confirms a hit. This cascade materially cuts per-lookup cost versus querying DeHashed directly for every asset. Revisit SpyCloud only if Tier 2 proves a strong conversion driver and continuous/managed monitoring becomes worth the spend.

**Consent: legally binding e-signature, via Dropbox Sign (formerly HelloSign).** Engagement approval authorizes active testing against live infra and, for Tier 3, real employees — decided this needs a binding signature, not just an audit-logged checkbox. Dropbox Sign's API is embedded-signing-first (dedicated endpoints for embedded signing/templates/requesting, custom branding, pre-filled document data) and meaningfully cheaper than DocuSign at this volume (per-engagement signatures, not high-frequency). `Engagement.rulesOfEngagementDocUrl` becomes the signed document's Dropbox Sign reference. Revisit DocuSign only if a specific enterprise customer's procurement requires it by name.

**Frontend: separate Vue app under a shared shell**, not new routes bolted onto V1's existing app. Chosen deliberately over the faster same-app path, given the collector/engagement/finding UI is different enough in tone and audience (practitioner console vs. posture dashboard) to warrant its own app, and to keep the door open to spinning Command out independently later. Implication: needs a defined auth handoff (shared JWT validated by both apps against the same `User`/`Tenant` tables, or a redirect-based SSO flow between the two Vue apps) and a shared design-token/component package so the two don't visually diverge — **open follow-up: decide the specific auth-handoff mechanism (shared-JWT vs redirect SSO) and stand up the shared component package before Command's frontend work starts.**

## 10. Remaining open decisions

- Specific scanning-infrastructure provider and account setup (not yet provisioned).
- Auth-handoff mechanism between the two Vue apps (shared JWT vs. redirect SSO).
- Tier 0: whether GCP connections default to Workload Identity Federation or a downloadable JSON key for MVP simplicity (federation is safer, key-file is faster to ship first).
- Tier 0: whether the same e-signature ROE flow is the right consent weight for read-only cloud scanning, or whether that's overkill given it carries materially less risk than the network/credential/phishing tiers — currently defaulted to "reuse the same flow" for consistency, worth revisiting once Tier 0 is actually being onboarded with real customers.
- Exact category weights in PostureScore — treat as a hypothesis to validate against real customer reaction, not a fixed formula.
- Whether Tier 4's collector is ever worth building given its ops burden, or whether reachability proof can be approximated well enough from Tier 1+2 external data alone.
- Tier 5 (full exploitation) has no spec yet by design — revisit only after Tiers 1–4 validate that live proof converts to sales, and only alongside dedicated investment in the deterministic-verification layer and liability/insurance posture.
- When (if ever) to graduate Tier 2 from DeHashed to SpyCloud.
- When (if ever) to introduce a real message broker in place of in-process/`LISTEN-NOTIFY` event handling.

## 11. Library & tooling choices

**Already in the V1 repo — reuse directly:**
- `playwright` — Tier 1 screenshot capture (already used for PDF rendering)
- `apscheduler` (AsyncIOScheduler) — Tier 1/3 recurring scan scheduling (already orchestrates background jobs in `main.py`)
- `dnspython`, `httpx` — DNS/HTTP-based recon and probing
- `anthropic` SDK — reuse existing client wrapper for Command's AI Analyst narration
- `audit_service.py` — extend for Engagement approve/revoke logging

**New open-source additions:**
- **Prowler** (Python) — Tier 0 baseline cloud posture scanning across AWS/Azure/GCP/Kubernetes; import directly or subprocess-invoke, no Go-binary packaging needed since it's already Python
- **Cloudsplaining** + **PMapper** (Python, AWS-specific) — Tier 0 IAM privilege-escalation graph analysis, feeds `CloudPrivEscPath`
- `boto3` / `azure-identity`+`azure-mgmt-*` / `google-cloud-*` SDKs — cross-account role assumption and resource enumeration for Tier 0
- ProjectDiscovery suite (`subfinder`, `naabu`, `httpx`-CLI, `nuclei`) — subprocess-invoked Go binaries; `nuclei`'s community template library covers most of Tier 1's exposure/misconfig detection out of the box
- Amass (OWASP) — deeper subdomain/attack-surface enumeration
- S3Scanner / `cloud_enum` — *unauthenticated* storage-bucket discovery for Tier 1 (distinct from Tier 0's authenticated in-account scanning — both are worth keeping, they catch different things)
- GoPhish — Tier 3 phishing campaign send/tracking via its REST API, rather than building send/tracking from scratch
- `@vue-flow/core` (frontend) — real node-graph rendering for the Attack Path Graph, reused for both the network graph (Tier 4) and the IAM priv-esc graph (Tier 0)
- A charting library (e.g. `vue-echarts`) — V1's frontend currently has none; needed for both products' trend/score charts, worth adding once and sharing via the shared component package

**Commercial/paid integrations:**
- DeHashed (primary) + HIBP (free pre-check cascade) — Tier 2 breach data
- Dropbox Sign — Engagement ROE e-signature
- Dedicated/private-cloud provider (OpenMetal-class) — isolated scanning egress (Tiers 1/2/4 only — Tier 0 needs no such infra, see Section 9)
