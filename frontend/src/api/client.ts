const BASE = '/api'

let _token: string | null = localStorage.getItem('command_token')

export function setToken(t: string) {
  _token = t
  localStorage.setItem('command_token', t)
}
export function clearToken() {
  _token = null
  localStorage.removeItem('command_token')
}
export function getToken() { return _token }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string,string> || {}) } })
  if (res.status === 401) { clearToken(); window.location.href = '/login'; throw new Error('Unauthorized') }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail) || res.statusText) }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  return res.json()
}

// A CSV download rather than JSON — triggers the browser's real save-file
// flow via a blob URL, same as any other file download in this app.
async function downloadFile(path: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail) || res.statusText) }
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : 'download.csv'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// A raw-HTML fetch rather than JSON — used for the read-only admin
// course-preview surface, where the response body is server-rendered
// HTML meant to be injected into an iframe's srcdoc, not deserialized.
// Same auth-header/error-handling convention as request() (including the
// 401 redirect), swapping res.json() for res.text() as the terminal call.
async function requestText(path: string): Promise<string> {
  const headers: Record<string, string> = {}
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  if (res.status === 401) { clearToken(); window.location.href = '/login'; throw new Error('Unauthorized') }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail) || res.statusText) }
  return res.text()
}

export const api = {
  // Auth — same backend as V1 (ARCHITECTURE.md Section 9), so a direct
  // login here hits the identical /auth/token endpoint V1 uses.
  login: (email: string, password: string) =>
    request<any>('/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: email, password }),
    }),

  // V1 -> Command handoff: V1 mints a short-lived single-use code while the
  // user is already authenticated there; this exchanges it for a real
  // access token here, without V1 and Command sharing localStorage (they
  // can't — different origins) or V1 having to change its existing
  // cookie-less, localStorage-based auth pattern.
  exchangeHandoffCode: (code: string) =>
    request<any>('/auth/handoff-code/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // Cloud account connections (Tier 0)
  cloudConnections: () => request<any[]>('/cloud-connections'),
  createCloudConnection: (provider: 'aws' | 'azure' | 'gcp') =>
    request<any>('/cloud-connections', { method: 'POST', body: JSON.stringify({ provider }) }),
  verifyCloudConnection: (id: string, roleArn: string) =>
    request<any>(`/cloud-connections/${id}/verify`, { method: 'POST', body: JSON.stringify({ role_arn: roleArn }) }),
  revokeCloudConnection: (id: string) =>
    request<any>(`/cloud-connections/${id}/revoke`, { method: 'POST' }),
  rescanCloudConnection: (id: string) =>
    request<any>(`/cloud-connections/${id}/rescan`, { method: 'POST' }),
  // display_name — the one piece of "environment" identity (Production vs
  // Staging vs a client's sandbox) nothing in the AWS API can supply on its
  // own. null clears it back to the derived "account_id · role_name" label.
  renameCloudConnection: (id: string, displayName: string | null) =>
    request<any>(`/cloud-connections/${id}`, { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) }),
  cloudResources: (connectionId: string, filters?: { resourceType?: string; region?: string }) => {
    const params = new URLSearchParams()
    if (filters?.resourceType) params.set('resource_type', filters.resourceType)
    if (filters?.region) params.set('region', filters.region)
    const qs = params.toString()
    return request<any[]>(`/cloud-connections/${connectionId}/resources${qs ? `?${qs}` : ''}`)
  },
  cloudResourceDetail: (connectionId: string, assetId: string) =>
    request<any>(`/cloud-connections/${connectionId}/resources/${assetId}`),

  // Host connections (Tier 0) — SSH/Lynis half of Host & Server Security,
  // for any VPS with no cloud API surface. We generate the SSH keypair;
  // the customer installs only the public key.
  hostConnections: () => request<any[]>('/host-connections'),
  createHostConnection: (hostnameOrIp: string, sshUsername: string, sshPort: number = 22) =>
    request<any>('/host-connections', {
      method: 'POST',
      body: JSON.stringify({ hostname_or_ip: hostnameOrIp, ssh_username: sshUsername, ssh_port: sshPort }),
    }),
  verifyHostConnection: (id: string) =>
    request<any>(`/host-connections/${id}/verify`, { method: 'POST' }),
  revokeHostConnection: (id: string) =>
    request<any>(`/host-connections/${id}/revoke`, { method: 'POST' }),
  rescanHostConnection: (id: string) =>
    request<any>(`/host-connections/${id}/rescan`, { method: 'POST' }),
  // Same reasoning as renameCloudConnection — hostname/IP is real but says
  // nothing about what the machine actually is.
  renameHostConnection: (id: string, displayName: string | null) =>
    request<any>(`/host-connections/${id}`, { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) }),

  // Tenant-wide composite Sentinel Score (email auth + cloud posture,
  // ARCHITECTURE.md Section 8) — powers the Overview score gauge.
  overview: () => request<any>('/overview'),
  // Full per-host cert detail (MX/MTA-STS/web) behind the Overview's own
  // cert_expiry_list summary — Coverage Map roadmap Phase 35e's Email
  // Authentication Defense page uses this for a deeper drill-down table.
  overviewCerts: () => request<any[]>('/overview/certs'),

  // Ownership-verified domains — the same V1 Domain records Command's
  // domain-scoped scans (exposure, impersonation) run against
  // (ARCHITECTURE.md's "Command doesn't get its own copy of domain" rule).
  domains: () => request<any[]>('/domains'),

  // External Exposure & DNS Hygiene (Tier 1) — subdomain takeover + open
  // ports. Auto-approved on the same consent weight as Prowler/Cloudsplaining
  // scans (no e-signature — read-only, no employees targeted).
  runExposureScan: (domainId: string) =>
    request<any[]>(`/domains/${domainId}/exposure-scan`, { method: 'POST' }),

  // Prospect Assessment — real, passive DNS/HTTPS checks (DMARC/SPF/
  // MTA-STS) against a domain we have no relationship with. No ownership
  // needed (public records only); rate-limited server-side at 3/minute.
  assessProspect: (domain: string) =>
    request<any>('/prospect-assessment', { method: 'POST', body: JSON.stringify({ domain }) }),

  // Phishing Tier A — Spoof Proof. testRecipientEmail is required only the
  // first time for a given domain; subsequent calls reuse the engagement's
  // stored scope (same reuse pattern as exposure-scan).
  runImpersonationScan: (domainId: string, testRecipientEmail?: string) =>
    request<any[]>(`/domains/${domainId}/impersonation-scan`, {
      method: 'POST', body: JSON.stringify({ test_recipient_email: testRecipientEmail }),
    }),

  // Real Attack Path Graph — assembled from CloudPrivEscPath rows, tagged
  // with MITRE ATT&CK technique ids. Empty nodes/edges (not an error) if no
  // privilege-escalation paths have been discovered yet. connectionId
  // narrows the graph to exactly one connected AWS account or OAuth
  // tenant (the scan selector) — omitted for the default tenant-wide blend.
  graph: (connectionId?: string | null) =>
    request<any>(`/graph${connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : ''}`),

  // Simulate-the-Fix — a pure hypothetical read, nothing is changed in AWS
  // or the database. Keyed on policy_arn so one shared over-permissioned
  // policy correctly fans out to every path it causes.
  simulateFix: (policyArns: string[], privEscPathIds: string[] = []) =>
    request<{ would_close: any[] }>('/graph/simulate', {
      method: 'POST', body: JSON.stringify({ policy_arns: policyArns, priv_esc_path_ids: privEscPathIds }),
    }),

  // The Attack Path Graph's "AI Analyst" (Phase 39c) — fingerprint-gated
  // server-side, so a plain page load doesn't re-call the LLM unless the
  // graph's own chokepoint/target data changed since the last call.
  // force=true is for the explicit Regenerate button only.
  graphInsight: (force = false, connectionId?: string | null) => {
    const params = new URLSearchParams()
    if (force) params.set('force', 'true')
    if (connectionId) params.set('connection_id', connectionId)
    const qs = params.toString()
    return request<{ message: string; commend: boolean; citations: string[]; is_ai: boolean; model: string }>(
      `/graph/insight${qs ? `?${qs}` : ''}`,
    )
  },

  // Kill Chain Narrative — real, ordered entry-to-outcome hop sequences
  // (graph_service._compute_kill_chains) synthesized into one compelling,
  // true story per real outcome. Same shape/caching convention as
  // graphInsight above, separate endpoint/cache namespace.
  graphKillChains: (force = false, connectionId?: string | null) => {
    const params = new URLSearchParams()
    if (force) params.set('force', 'true')
    if (connectionId) params.set('connection_id', connectionId)
    const qs = params.toString()
    return request<{
      chains: {
        target_id: string; target_label: string; outcome: string; chain_severity: string
        hops: { edge_type: string; source: string; target: string; source_label: string; target_label: string; severity: string; remediation: string }[]
      }[]
      message: string; citations: string[]; is_ai: boolean; model: string
    }>(`/graph/kill-chains${qs ? `?${qs}` : ''}`)
  },

  // The objective, re-scan-verified counterpart to simulateFix's hypothetical
  // prediction — every group here is real CloudPrivEscPath.status=
  // "retest_closed" data, never a projection. Same fingerprint-gated caching
  // as graphInsight.
  graphFixVerification: (force = false) =>
    request<{ verifications: any[]; message: string; citations: string[]; is_ai: boolean; model: string }>(
      `/graph/fix-verification${force ? '?force=true' : ''}`,
    ),

  // Engagements — the consent gate every scan belongs to (ARCHITECTURE.md
  // Section 6). requestSignature sends the Rules of Engagement for a real
  // Dropbox Sign signature; the engagement only reaches 'active' once the
  // backend's webhook confirms it was actually signed, not on this call.
  engagements: () => request<any[]>('/engagements'),
  createEngagement: (tier: string, cloudAccountConnectionIds: string[] = [], hostConnectionIds: string[] = [], scope: Record<string, any> = {}) =>
    request<any>('/engagements', {
      method: 'POST',
      body: JSON.stringify({
        tier,
        scope,
        cloud_account_connection_ids: cloudAccountConnectionIds,
        host_connection_ids: hostConnectionIds,
      }),
    }),
  requestSignature: (id: string, signerEmail?: string, signerName?: string) =>
    request<any>(`/engagements/${id}/request-signature`, {
      method: 'POST',
      body: JSON.stringify({ signer_email: signerEmail || undefined, signer_name: signerName || undefined }),
    }),
  // Dev/test-only bypass — gated server-side behind
  // command_allow_direct_engagement_approval, disabled in production.
  // Kept for local/CI use only; the UI flow uses requestSignature above.
  approveEngagement: (id: string) =>
    request<any>(`/engagements/${id}/approve`, { method: 'POST' }),
  revokeEngagement: (id: string) =>
    request<any>(`/engagements/${id}/revoke`, { method: 'POST' }),
  // Phishing-tier only, and only while the engagement is 'active' — see the
  // backend router's docstring for why this is deliberately scoped to just
  // cadence/recurring/landing_page rather than target list/template/content.
  updateEngagementSchedule: (id: string, payload: { cadence_days?: number; recurring?: boolean; landing_page_id?: string | null }) =>
    request<any>(`/engagements/${id}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  findings: (engagementId: string) => request<any[]>(`/engagements/${engagementId}/findings`),

  // Tenant-wide, real fix for a bug pattern found three times this session
  // (per-engagement-only fetching left every screen reinventing its own
  // "loop over the right engagements" merge logic, and getting it wrong at
  // least once each). Each finding carries its own real connection_id/
  // connection_label (hostname for host, account/role for cloud), resolved
  // server-side — never guessed. `connections` is the full real catalog,
  // including a connection with zero findings yet.
  allFindings: (params: { tier?: string; connectionId?: string; severity?: string; status?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.tier) qs.set('tier', params.tier)
    if (params.connectionId) qs.set('connection_id', params.connectionId)
    if (params.severity) qs.set('severity', params.severity)
    if (params.status) qs.set('status', params.status)
    const query = qs.toString()
    return request<{ findings: any[]; connections: { id: string; tier: string; label: string; display_name: string | null }[] }>(`/findings${query ? `?${query}` : ''}`)
  },
  privEscPaths: (engagementId: string) => request<any[]>(`/engagements/${engagementId}/priv-esc-paths`),

  // Phishing Tier B — Human Simulation (PHISHING_DESIGN.md Section 3).
  // Target lists are re-read fresh at each recurring campaign launch, not
  // snapshotted at signature time — editing a list here affects the next
  // cycle, not past campaigns.
  // Real starting content (subject + body) for each built-in lure — used
  // to pre-fill an editable subject/body pair rather than customizing blind.
  phishingTemplates: () => request<any[]>('/phishing-templates'),
  // Real per-lure click-rate history across this tenant's own campaign
  // history (Phishing Simulation roadmap Phase 16) — absent entries mean
  // never sent, never a fabricated 0%.
  phishingLureStats: () => request<any[]>('/phishing-lure-stats'),
  phishingLandingPages: () => request<any[]>('/phishing-landing-pages'),
  // Tenant-owned, reusable templates — separate from the fixed built-in
  // catalog above. Create/edit/delete freely; nothing here is shared
  // across tenants.
  // targetListId, when passed, populates each medium/high-difficulty
  // template's `eligible` field against that real audience's training
  // track record (Phishing Simulation roadmap Phase 23) — still
  // independently re-checked server-side at launch, this is just for the
  // gallery to grey out what would 400.
  phishingCustomTemplates: (targetListId?: string) =>
    request<any[]>(`/phishing-custom-templates${targetListId ? `?target_list_id=${targetListId}` : ''}`),
  createPhishingCustomTemplate: (payload: Record<string, any>) =>
    request<any>('/phishing-custom-templates', { method: 'POST', body: JSON.stringify(payload) }),
  updatePhishingCustomTemplate: (id: string, payload: Record<string, any>) =>
    request<any>(`/phishing-custom-templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePhishingCustomTemplate: (id: string) =>
    request<void>(`/phishing-custom-templates/${id}`, { method: 'DELETE' }),
  // Sends a draft (saved or not) to the requesting admin's own inbox for
  // real rendering — never a real tracked send, never a PhishingEvent.
  sendTestTemplateEmail: (subject: string, body_html: string) =>
    request<void>('/phishing-templates/send-test', { method: 'POST', body: JSON.stringify({ subject, body_html }) }),
  phishingTargetLists: () => request<any[]>('/phishing-target-lists'),
  createPhishingTargetList: (name: string, entries: { email: string; display_name?: string; job_title?: string; department?: string }[]) =>
    request<any>('/phishing-target-lists', { method: 'POST', body: JSON.stringify({ name, entries }) }),
  updatePhishingTargetList: (id: string, name: string, entries: { email: string; display_name?: string; job_title?: string; department?: string }[]) =>
    request<any>(`/phishing-target-lists/${id}`, { method: 'PUT', body: JSON.stringify({ name, entries }) }),
  // Preview-only — never writes anything (Phishing Simulation roadmap
  // Phase 25). Diffs a re-uploaded CSV against the list's real current
  // entries so a customer can review exactly what would change.
  diffPhishingTargetList: (id: string, entries: { email: string; display_name?: string; job_title?: string; department?: string }[]) =>
    request<{
      added: any[]; removed: any[]; unchanged_count: number;
      changed: { email: string; before: any; after: any }[];
    }>(`/phishing-target-lists/${id}/diff`, { method: 'POST', body: JSON.stringify({ entries }) }),

  // Real-threat report & triage (Phishing Simulation roadmap Phase 26) —
  // the KnowBe4-equivalent feature, not Mimecast's (this product doesn't
  // sit in the mail path). Employees forward suspicious real emails to
  // the tenant's own forwarding address (surfaced on /phishing-meta as
  // report_suspicious_email_address); this is the triage side.
  reportedEmails: (disposition?: string) =>
    request<any[]>(`/reported-emails${disposition ? `?disposition=${disposition}` : ''}`),
  reportedEmail: (id: string) => request<any>(`/reported-emails/${id}`),
  updateReportedEmailDisposition: (id: string, disposition: string, note?: string) =>
    request<any>(`/reported-emails/${id}/disposition`, { method: 'PATCH', body: JSON.stringify({ disposition, note: note || undefined }) }),
  // Admin-only server-side, audit-logged — searches every target list
  // this tenant has for a hash match, since a reporter (unlike a
  // phishing-campaign recipient) isn't scoped to one known list.
  unmaskReportedEmailReporter: (id: string) =>
    request<{ email: string }>(`/reported-emails/${id}/unmask-reporter`, { method: 'POST' }),
  // Forces a fresh link risk scan, bypassing the domain-age cache TTL —
  // for a report that failed to score at ingestion time, or an admin
  // wanting an up-to-date check.
  rescanReportedEmailLinks: (id: string) =>
    request<any>(`/reported-emails/${id}/rescan-links`, { method: 'POST' }),

  // Tenant-wide status bar + kill switch for the Phishing Simulation screen.
  phishingMeta: () => request<any>('/phishing-meta'),
  haltPhishingSends: () => request<any>('/phishing-meta/halt', { method: 'POST' }),
  resumePhishingSends: () => request<any>('/phishing-meta/resume', { method: 'POST' }),
  // Mirrors billing.ts's updateReportSchedule for the DMARC report — same
  // off|weekly|monthly values, this one for the phishing/Human-Risk PDF.
  updatePhishingReportSchedule: (schedule: 'off' | 'weekly' | 'monthly') =>
    request<any>('/phishing-meta/report-schedule', { method: 'PATCH', body: JSON.stringify({ schedule }) }),
  updateTrainingDefaults: (payload: { auto_assign_training_course_id?: string | null; training_reminder_interval_days?: number; training_reminder_max_count?: number }) =>
    request<any>('/phishing-meta/training-defaults', { method: 'PATCH', body: JSON.stringify(payload) }),

  // Tenant-wide "never target this address" list, independent of which
  // target list an address sits on — admin-only to manage (Phishing
  // Simulation roadmap Phase 21).
  phishingExemptions: () => request<any[]>('/phishing-exemptions'),
  createPhishingExemption: (email: string, reason?: string) =>
    request<any>('/phishing-exemptions', { method: 'POST', body: JSON.stringify({ email, reason: reason || undefined }) }),
  deletePhishingExemption: (id: string) =>
    request<void>(`/phishing-exemptions/${id}`, { method: 'DELETE' }),

  // Team/role management (admin-only to write) — not previously wired
  // into this frontend; the phishing Settings page is the first caller.
  team: () => request<any[]>('/auth/team'),
  updateTeamMember: (id: string, payload: { role?: string; is_active?: boolean }) =>
    request<any>(`/auth/team/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Launches immediately using the target_list_id/template_id/cadence_days
  // already recorded in the engagement's scope at creation — same fields
  // the recurring scheduler reads for the next cycle.
  // Mandatory human-review-before-send rail: generate (or resolve the
  // static override) without sending, so it can be shown for approval;
  // the approved fields are then echoed back verbatim into launch so what
  // was reviewed is guaranteed to be what ships.
  phishingContentPreview: (engagementId: string) =>
    request<any>(`/engagements/${engagementId}/phishing-content-preview`, { method: 'POST' }),
  launchPhishingCampaign: (
    engagementId: string,
    approved?: { subject: string; body_html: string; llm_generated: boolean; dmarc_context: string | null },
    // Audience scoping (Phishing Simulation roadmap Phase 15) — omit for
    // the default "everyone" behavior, unchanged from before this existed.
    audience?: { audience_type: 'department' | 'individual'; department?: string; recipient_hashes?: string[] },
  ) =>
    request<any>(`/engagements/${engagementId}/phishing-campaigns`, {
      method: 'POST',
      body: JSON.stringify({
        ...(approved ? {
          approved_subject: approved.subject, approved_body_html: approved.body_html,
          approved_llm_generated: approved.llm_generated, approved_dmarc_context: approved.dmarc_context,
        } : {}),
        ...(audience ?? {}),
      }),
    }),
  phishingCampaigns: (engagementId: string) => request<any[]>(`/engagements/${engagementId}/phishing-campaigns`),
  // Every campaign this tenant has ever launched, pre-aggregated with its
  // own event counts, in one call (Phishing Simulation roadmap Phase 29b)
  // — replaces a phishingCampaigns-per-engagement + phishingCampaignEvents-
  // per-campaign loop that hit 485 requests on a real dev tenant.
  phishingCampaignsSummary: () => request<any[]>('/phishing-campaigns/summary'),
  // Cross-campaign, pseudonymized — one row per recipient, aggregated
  // across every campaign this engagement has ever launched (Phishing
  // Simulation roadmap Phase 13).
  phishingEngagementRecipients: (engagementId: string) => request<any[]>(`/engagements/${engagementId}/phishing-recipients`),
  phishingCampaign: (campaignId: string) => request<any>(`/phishing-campaigns/${campaignId}`),
  phishingCampaignEvents: (campaignId: string) => request<any>(`/phishing-campaigns/${campaignId}/events`),
  // Pseudonymized — hashes and event types only, never identity. A UI
  // picks one of these to pass into unmaskPhishingRecipient below.
  phishingCampaignEventsByRecipient: (campaignId: string) =>
    request<any[]>(`/phishing-campaigns/${campaignId}/events/by-recipient`),
  exportPhishingCampaignCsv: (campaignId: string) => downloadFile(`/phishing-campaigns/${campaignId}/export.csv`),
  phishingCampaignEmailAuthEvidence: (campaignId: string) => request<any>(`/phishing-campaigns/${campaignId}/email-auth-evidence`),
  // Real, server-side-aggregated department results — the recipient_hash
  // ↔ department mapping never leaves the backend, only these counts.
  // Absent department entirely means nobody on this campaign has one
  // recorded, never a fabricated "Unknown" bucket.
  phishingCampaignDepartmentBreakdown: (campaignId: string) =>
    request<{ department: string; sent: number; clicked: number; credential_entered: number }[]>(`/phishing-campaigns/${campaignId}/department-breakdown`),
  // Real, tenant-wide posture — every field is either computed live from
  // real campaign history or explicitly null, never a fabricated 0/0%.
  phishingDashboard: () => request<{
    human_risk_score: number | null; human_risk_grade: string | null;
    // 4 named, separately-graded slices of the score above (Phishing
    // Simulation roadmap Phase 30a) — score/grade both null means real
    // data doesn't exist yet for that one component specifically.
    risk_components: { label: string; score: number | null; grade: string | null }[];
    sent: number;
    click_rate: number | null; credential_rate: number | null; report_rate: number | null;
    training_assigned: number; training_completed: number; training_completion_rate: number | null;
    course_training_assigned: number; course_training_completed: number; course_training_completion_rate: number | null;
    department_training: { department: string; assigned: number; completed: number }[];
    // Real, ranked, cross-engagement repeat-offender history (Phase 30c)
    // — same shape phishingEngagementRecipients() already returns, reused
    // so a row can open the exact same evidence panel.
    watchlist: any[];
  }>('/phishing-dashboard'),
  // Admin-only server-side, audit-logged — re-hashes the target list's
  // *current* entries and matches, rather than reversing a stored value.
  unmaskPhishingRecipient: (campaignId: string, recipientHash: string) =>
    request<any>(`/phishing-campaigns/${campaignId}/events/unmask`, {
      method: 'POST', body: JSON.stringify({ recipient_hash: recipientHash }),
    }),

  // Training course library (Phishing Simulation roadmap Phase 24) — a
  // real, assignable, multi-module course, independent of the always-on
  // single micro-lesson (which stays exactly as it was, unaffected).
  trainingCourses: () => request<any[]>('/training-courses'),
  trainingCourse: (id: string) => request<any>(`/training-courses/${id}`),
  createTrainingCourse: (payload: { title: string; description?: string; category?: string; modules?: any[] }) =>
    request<any>('/training-courses', { method: 'POST', body: JSON.stringify(payload) }),
  updateTrainingCourse: (id: string, payload: { title?: string; description?: string; category?: string }) =>
    request<any>(`/training-courses/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTrainingCourse: (id: string) => request<void>(`/training-courses/${id}`, { method: 'DELETE' }),
  addTrainingCourseModule: (courseId: string, payload: { format: string; title: string; content?: string; duration_minutes?: number }) =>
    request<any>(`/training-courses/${courseId}/modules`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteTrainingCourseModule: (moduleId: string) => request<void>(`/training-course-modules/${moduleId}`, { method: 'DELETE' }),
  reorderTrainingCourseModules: (courseId: string, moduleIds: string[]) =>
    request<any>(`/training-courses/${courseId}/modules/order`, { method: 'PUT', body: JSON.stringify(moduleIds) }),
  assignTrainingCourse: (courseId: string, targetListId: string, audienceType: string = 'everyone', department?: string) =>
    request<{ newly_assigned: number; already_assigned: number }>(`/training-courses/${courseId}/assign`, {
      method: 'POST', body: JSON.stringify({ target_list_id: targetListId, audience_type: audienceType, department: department || undefined }),
    }),
  trainingCourseAssignments: (courseId: string) => request<any[]>(`/training-courses/${courseId}/assignments`),
  previewTrainingCourseHome: (courseId: string) => requestText(`/training-courses/${courseId}/preview`),
  previewTrainingCourseModule: (courseId: string, moduleId: string) => requestText(`/training-courses/${courseId}/preview/module/${moduleId}`),
  trainingSurveyResults: () => request<{ question_key: string; question_label: string; counts: Record<string, number>; response_count: number }[]>('/training-survey-results'),

  // Third-Party OAuth App Risk (M365) — connect/verify/scan/revoke follows
  // the same shape as Cloud/Host connections, but the engagement is
  // auto-approved server-side (no signature step — read-only, no employees
  // directly targeted, see oauth_app_risk.py's _get_or_create_oauth_engagement).
  oauthAppConnections: () => request<any[]>('/oauth-app-connections'),
  oauthAppSetupInstructions: () => request<string[]>('/oauth-app-connections/setup-instructions'),
  createOAuthAppConnection: (msTenantId: string, msClientId: string, msClientSecret: string) =>
    request<any>('/oauth-app-connections', {
      method: 'POST', body: JSON.stringify({ ms_tenant_id: msTenantId, ms_client_id: msClientId, ms_client_secret: msClientSecret }),
    }),
  verifyOAuthAppConnection: (id: string) => request<any>(`/oauth-app-connections/${id}/verify`, { method: 'POST' }),
  scanOAuthAppConnection: (id: string) => request<any[]>(`/oauth-app-connections/${id}/scan`, { method: 'POST' }),
  revokeOAuthAppConnection: (id: string) => request<any>(`/oauth-app-connections/${id}/revoke`, { method: 'POST' }),
  oauthGrants: (engagementId: string) => request<any[]>(`/engagements/${engagementId}/oauth-grants`),

  // Detection Coverage — real per-attack-path verdicts (covered/partial/
  // blind_spot), derived from real Prowler CloudTrail/GuardDuty findings,
  // not a fabricated "would you catch this" guess.
  detectionCoverage: () => request<any[]>('/detection-coverage'),

  // Audit Log — admin-only, gated behind the msp/enterprise plan feature
  // (require_feature 'audit_log' server-side). 403 with detail.code ===
  // 'feature_not_available' when the current plan doesn't include it;
  // AuditLogView.vue branches on that the same way PortalView.vue does
  // for 'msp_plan_required'.
  auditLog: (params: { days?: number; action?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.days) qs.set('days', String(params.days))
    if (params.action) qs.set('action', params.action)
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<any[]>(`/audit-log${suffix}`)
  },
  auditLogCount: (days: number = 30) => request<{ count: number }>(`/audit-log/count?days=${days}`),
  exportAuditLog: (days: number = 365) => downloadFile(`/audit-log/export?days=${days}`),

  // MSP sub-tenant management (app/routers/msp.py) — 403 with
  // detail.code === 'msp_plan_required' when the current tenant isn't on
  // the msp/enterprise plan; PortalView.vue branches on that rather than
  // showing a raw error.
  mspClients: () => request<any[]>('/msp/clients'),
  mspClient: (id: string) => request<any>(`/msp/clients/${id}`),
  createMspClient: (name: string, billingEmail?: string, brandName?: string) =>
    request<any>('/msp/clients', {
      method: 'POST', body: JSON.stringify({ name, billing_email: billingEmail, brand_name: brandName }),
    }),
  updateMspClient: (id: string, fields: { name?: string; billing_email?: string; brand_name?: string; brand_logo_url?: string }) =>
    request<any>(`/msp/clients/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deleteMspClient: (id: string) => request<void>(`/msp/clients/${id}`, { method: 'DELETE' }),
  inviteToMspClient: (id: string, email: string, fullName: string, role: string = 'admin') =>
    request<any>(`/msp/clients/${id}/invite`, {
      method: 'POST', body: JSON.stringify({ email, full_name: fullName, role, send_invite: true }),
    }),
  downloadMspClientReport: (id: string) => downloadFile(`/msp/clients/${id}/report-pdf`),

  // Sentinel Command report (Coverage Map plan Phase 10) — distills every
  // scan/graph/campaign this session's phases built into one branded PDF,
  // reusing V1's existing report pipeline (pdf_report_service.py) rather
  // than a second one. Gated behind the same 'pdf_report' plan feature as
  // V1's own report — 403 with detail.code === 'feature_not_available'.
  commandReportData: () => request<any>('/command-report-data'),
  downloadCommandReportPdf: () => downloadFile('/command-report-pdf'),
}
