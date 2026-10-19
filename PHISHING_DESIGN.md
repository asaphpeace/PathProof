# Phishing Simulation — Design

Status: **Both tiers built, backend and Command frontend.** Tier A (Spoof
Proof) — `impersonation_scan_service.py`, the
`/domains/{id}/impersonation-scan` endpoint, the recurring scheduler job,
and a domain-picker + Run Test card in `PhishingView.vue`. Tier B (Human
Simulation) — `phishing_service.py`, `PhishingTargetList`/
`PhishingCampaign`/`PhishingEvent`, the `/phishing-target-lists` and
`/engagements/{id}/phishing-campaigns` endpoints, the unauthenticated
`/phishing-track/*` pixel/click/submit endpoints, the cadence line in the
signed Rules-of-Engagement document, the recurring launch scheduler, and
full target-list/simulation/campaign-results UI in `PhishingView.vue`. This
document is the output of a single
reimagining pass (triggered by researching Gophish and finding its
maintenance had stalled) with explicit direction from the product owner at
each fork. It replaces the "Phishing Simulation" FWD roster item in
`BUILD_PLAN.md` and absorbs the "Lookalike Domain Hunter" bench item — see
that file's roster table for the pointer.

## 0. What this is, in one sentence

Two features wearing one name in the original plan, now split apart: a
near-zero-risk automated proof of what impersonating the customer's domain
actually gets an attacker (no employees involved), and a traditional
employee-targeted click/credential simulation — both running on a recurring
cadence rather than as one-off campaigns, both correlating results with
V1's DMARC/SPF/DKIM posture data no competitor has access to.

## 1. Why the original design got reimagined

The original plan (`ARCHITECTURE.md` Tier 3) was one feature gated behind
its heaviest possible consent bar — real employees, HR/legal sign-off, a
self-hosted send-and-credential-capture pipeline — before *any* part of it
could ship. Researching the intended engine (Gophish) surfaced three real
problems with taking that plan as-is:

- **Gophish's releases have stalled** — no tag since `v0.12.1` (September
  2022), no substantial push since 2024. Not archived, still gets sporadic
  community PRs, but not something to build production infrastructure on
  without eyes open.
- **Gophish is single-tenant by design.** Command is multi-tenant from day
  one; using it means building the multi-tenancy layer ourselves regardless
  of whether we self-host it — so the "avoid building send/tracking from
  scratch" rationale in `ARCHITECTURE.md` Section 11 doesn't actually hold
  once multi-tenancy is accounted for.
- **The whole feature was blocked on its hardest half.** Part of what this
  feature should prove (what does the current DMARC/SPF/DKIM state actually
  allow an attacker to get away with) needs zero human targets and could
  ship far faster than the employee-simulation half — but the original
  design bundled them, so neither could ship until the harder consent
  question was resolved.

## 2. Tier A — Spoof Proof (new, near-zero risk)

### 2.1 What it does

No employees are targeted. Two checks, both against the customer's own
verified `Domain`:

1. **Send-and-verify**: attempt to send a real test message *as* the
   customer's domain to a mailbox they designate (their own security
   inbox, or a Sentinel-controlled sink for customers without one), and
   record whether SPF/DKIM/DMARC actually blocked it. **Corrected during
   implementation:** this cannot reuse V1's SendGrid path as originally
   assumed — transactional ESPs deliberately enforce sender-domain
   verification to prevent exactly this kind of spoofing, so SendGrid
   cannot be asked to send as a domain Sentinel doesn't own. Implemented
   instead as a direct raw-SMTP connection to the *recipient's* mail
   server (stdlib `smtplib`, no new dependency), from Sentinel's own
   outbound IP — which naturally has no SPF authorization for the
   customer's domain, i.e. is exactly the unauthorized-sender scenario
   being tested. Real deployment caveat: several cloud providers (AWS
   included) block outbound port 25 by default and require an explicit
   request to lift it — an infrastructure blocker to resolve before this
   runs anywhere but a developer machine.
2. **Lookalike domain scan** (absorbs the bench item): generate
   homograph/typosquat permutations of the customer's domain and check
   whether any resolve to live MX or A records — passive DNS recon, the
   same shape as `exposure_scan_service.py`'s existing subdomain-takeover
   check, not a new subsystem.

### 2.2 Data model

No new tables. Both checks write directly to the existing `Finding` table
(`tier='impersonation'`), the same "reuse over duplication" pattern
`InvestigationEvent` already established for ITDR:

| field | value |
|---|---|
| `check_id` | `spoof_send_test` \| `lookalike_domain_registered` |
| `severity` | `critical` if a spoofed send was delivered (not blocked); informational if correctly rejected |
| `detail` | e.g. "Sent from spoofed `billing@customer.com` — delivered to inbox, not rejected" or "`custorner.com` (homograph) resolves to live mail infrastructure" |

`Engagement.tier = 'impersonation'` — a new tier value, sibling to
`'phishing'` rather than replacing it (see §5). `ARCHITECTURE.md`'s Tier
ladder table needs a follow-up edit to add this as its own row; not made in
this pass since it's documentation of the *original* ladder, not this doc.

### 2.3 Consent and cadence

No employee targeting means a materially lower consent bar than Tier B —
this can plausibly ride the same authorization weight as an Exposure scan
rather than needing a dedicated e-signature. Runs on a recurring schedule
automatically once the `Engagement` is active — monthly is the right
interval (DMARC policy and domain registrations don't change weekly, but a
quarterly check would catch drift too slowly). No re-consent needed per
cycle; it stops the same way every other scan stops — `Engagement.revoke`.

## 3. Tier B — Human Simulation (rebuilt, not Gophish)

### 3.1 Engine decision

**Build a minimal custom pipeline on SendGrid**, not Gophish and not a
white-labeled third party. Reasoning, in order:

1. Recurring multi-tenant delivery is close enough to this product's core
   value (the DMARC correlation, the trend-over-time story) that it's
   worth owning rather than taking on an ongoing vendor dependency.
2. The actual mechanics needed are narrow — send N tracked emails, log
   open/click/credential-submit per pseudonymized recipient — considerably
   smaller than Gophish's full feature set (template marketplace, visual
   landing-page builder), and smaller than the multi-tenancy layer that
   would have to be built on top of Gophish anyway.
3. V1 already has the adjacent infrastructure (SendGrid integration,
   domain-verification pipeline, background scheduler pattern) this can
   sit directly on top of.

**Tradeoff revisited after real usage:** v1 shipped with a small curated
set of built-in lure templates and no customization UI, on the theory that
a builder was out of scope. In practice, a user immediately needed to run
a test campaign with their own content and had no way to. Landed on a
middle ground rather than a full builder: `Engagement.scope` carries
optional `subject_override`/`body_html_override`; `GET /phishing-templates`
exposes each built-in's real subject/body so the UI pre-fills an editable
starting point instead of customizing blind. Still one generic hosted
landing page, not a page builder — that part of the original tradeoff
holds. Click tracking is guaranteed to survive a careless edit: if a
customized body drops the `{click_url}` placeholder, `_render_content`
appends a fallback tracked link rather than silently losing the signal;
the open-tracking pixel is always appended regardless of content.

### 3.2 Data model

**`PhishingTargetList`** — the employee list, re-read fresh each cycle
rather than frozen at consent time.
| field | purpose |
|---|---|
| `id`, `tenant_id` | standard |
| `name` | customer-facing label |
| `entries` | `jsonb` list of `{email, display_name}` — customer edits between cycles; a future `IdentityProviderConnection` (already designed for ITDR/Auth0) could become a live source here instead of manual upload, noted as a synergy, not built now |

**`PhishingCampaign`** — one row per launched cycle, not per engagement.
| field | purpose |
|---|---|
| `id`, `tenant_id`, `engagement_id` | standard |
| `target_list_id` | FK — resolved fresh at launch time, not at engagement-creation time |
| `template_id` | which built-in lure was used |
| `launched_at`, `status` | `sending` \| `complete` |

**`PhishingEvent`** — the timeline, pseudonymized by construction, not by
policy alone.
| field | purpose |
|---|---|
| `campaign_id` | FK |
| `recipient_hash` | `HMAC-SHA256(email, tenant_salt)` — deterministic per person, not reversible without the salt. Stronger than the original `ARCHITECTURE.md` sketch, which stored a hash but didn't specify how unmask would work; here, unmask re-hashes the *current* target list and matches, so no plaintext email is ever stored against an event row at all |
| `event_type` | `sent` \| `opened` \| `clicked` \| `credential_entered` |
| `occurred_at` | timestamp |

Unmask stays a separate, admin-only, audit-logged call — carried over from
the original design unchanged, it was already correct.

### 3.3 Consent and cadence — the part that actually needed rethinking

One signed Rules-of-Engagement document authorizes an **ongoing cadence**,
not a single campaign — the rendered RoE text itself must state the
interval explicitly (e.g. "simulated phishing campaigns will run every 90
days against the referenced employee list, until this authorization is
revoked"), reusing the Dropbox Sign flow already built for Command's other
tiers (`dropbox_sign_service.build_roe_html`'s existing tier-label map gets
a new entry, no new signing mechanism). One signature, ongoing effect,
revocable at any time — the same pattern already proven for ITDR's
`continuous_activity_monitoring` opt-in, applied here to a physical
document instead of a scope flag.

A background job (same shape as `_command_rescan_job`) finds active
phishing engagements whose `next_launch_at` has passed, re-resolves the
current `PhishingTargetList`, and launches a new `PhishingCampaign` cycle —
so someone who left the company eight months ago never gets re-targeted
just because they were on the list at signature time.

### 3.4 Reporting

A new section in the PDF report showing click-rate **trend across cycles**
(reusing `pdf_report_service.py`'s existing `_sparkline_svg` helper, the
same pattern already used for the score trend) — this is the actual
retention hook, especially for an MSP handing a monthly report to a client:
"12% click rate this quarter, down from 34% two quarters ago" is a
materially stronger sentence than a single campaign's snapshot number.
Each campaign's results also correlate against the domain's live DMARC/SPF
state, carrying over the original design's core differentiator unchanged.

## 4. Consent summary — the two tiers side by side

| | Tier A — Spoof Proof | Tier B — Human Simulation |
|---|---|---|
| Targets | No humans — domain-level only | Real employees |
| Consent weight | Exposure-scan-equivalent | Dedicated e-signature, HR/legal sign-off |
| Cadence | Monthly, automatic, no re-consent | Customer-set interval, stated in the signed RoE itself |
| Data sensitivity | None beyond domain ownership | Personal data (employee behavior) — see §6 |

## 5. `Engagement.tier` values

`_VALID_TIERS` in `engagement.py` gets one new entry: `'impersonation'`
(Tier A). `'phishing'` (already valid) becomes Tier B specifically, not a
catch-all — this doc is the record of that split for whoever implements it.

## 6. Privacy and retention

`PhishingEvent` and `PhishingTargetList` hold personal data about named
employees — the same POPIA/GDPR surface already flagged for ITDR's
`Investigation`, and arguably a lower bar here since the *identity* is
pseudonymized by construction rather than stored plainly. Still needs: a
retention policy for completed campaign cycles, and the same
export/delete-on-request path already required for `Investigation` — design
these two features' retention story together rather than twice, since the
underlying legal obligation (POPIA data-subject rights, SA-market
positioning) is identical.

## 7. Business model

Recurring Tier B campaigns are a materially more expensive, more valuable
capability than a one-off scan (ongoing send volume, ongoing storage) — it
should be plan-gated, feeding into the same not-yet-built plan-limits
enforcement already flagged as a gap for Command generally (ITDR's
continuous monitoring flag has the identical open question). Tier A, being
cheap and infrastructure-light, is a reasonable candidate to include even
on lower tiers as a differentiator against Sendmarc-class competitors who
have no equivalent.

## 8. Explicitly out of scope for this phase, and why

- **Customer-facing landing-page builder UI** — subject/body content is now
  editable (see §3.1's revisited tradeoff), but the landing page a click
  leads to is still the one generic hosted page; a page builder is a real
  project of its own, not a corner to cut into this pass.
- **Saving custom content as a reusable named template** — content is
  edited per-simulation, not saved back into `BUILT_IN_TEMPLATES` or a new
  customer template library; each new simulation starts from the built-in
  set again.
- **`IdentityProviderConnection`-sourced target lists** — noted as a
  synergy with the already-designed Auth0/Okta connection type, not built;
  manual list upload/edit is v1.
- **RBAC on `PhishingEvent`/unmask visibility** — inherits the same
  unresolved open question already flagged in `ITDR_DESIGN.md` §3 rather
  than getting a second, possibly inconsistent answer here. One RBAC design
  pass should cover both.
- **`ARCHITECTURE.md` Tier ladder table update** — needs a follow-up edit
  to reflect Tier A as a new row; not made in this pass.
