<template>
  <div class="phishing">
    <div v-if="meta" class="status-bar">
      <span class="status-chip" :class="roeStatus.tone">{{ roeStatus.icon }} {{ roeStatus.label }}</span>
      <span class="status-item">SENDING DOMAIN <b>{{ meta.tracking_domain }}</b></span>
      <span class="status-item">CREDENTIAL CAPTURE <b>{{ meta.credential_capture_policy }}</b></span>
      <span class="status-item">RECIPIENTS <b>{{ meta.recipient_privacy_policy }}</b></span>
      <span
        class="status-chip privacy"
        title="Every recipient is stored as an HMAC-SHA256 hash, never a plaintext email, against any tracking event. Revealing an identity requires an admin action that is itself logged to the audit trail. Built to the same standard POPIA and GDPR expect from personal-data handling by design."
      >🔒 PRIVACY BY DESIGN</span>
      <button class="halt-btn" :class="{ active: meta.phishing_paused }" @click="toggleHalt">
        {{ haltBusy ? '…' : (meta.phishing_paused ? '▶ RESUME SENDS' : '■ HALT ALL SENDS') }}
      </button>
    </div>

    <h1 class="title">Phishing Simulation</h1>
    <p class="subtitle">Real phishing simulations sent to real employees. Target lists and domain-spoofing checks now live in Settings.</p>

    <div class="tiers">
      <!-- Nav into Dashboard/Templates/Training/Triage/Settings used to
           live here as inline links; it's now the persistent PhishingSubNav
           rail (AppShell.vue), reachable from every screen in the module,
           not just this one — Phase 31. Target Lists (editing) and Spoof
           Proof moved to Settings — this page is now just the simulations
           table below (Phishing Simulation roadmap, Phase 33). -->
      <div class="tier-col">
        <div class="tier-head">
          <span class="tier-label">REAL PEOPLE · AUTHORIZED SENDS</span>
          <RouterLink v-if="targetLists.length && canLaunch" :to="{ name: 'phishing-campaign-new' }" class="link-btn primary">+ New simulation</RouterLink>
          <div v-else-if="canLaunch" class="link-btn primary disabled">+ New simulation</div>
        </div>
        <p class="tier-sub">Every send lands in a real inbox. Authorization, content review and per-recipient evidence are mandatory.</p>

        <div v-if="phishingEngagements.length" class="stat-row">
          <div class="stat-card">
            <span class="stat-label">ACTIVE SIMULATIONS</span>
            <span class="stat-value">{{ activeEngagementCount }}</span>
            <span class="stat-sub">of {{ phishingEngagements.length }} total</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">SENT (ALL CAMPAIGNS)</span>
            <span class="stat-value">{{ tierBTotals.sent }}</span>
            <span class="stat-sub">across {{ tierBTotals.campaignCount }} launches</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">CLICK RATE</span>
            <span class="stat-value" :class="rateTone(tierBTotals.clickRate, 'lower-is-better')">{{ tierBTotals.clickRate === null ? '—' : `${tierBTotals.clickRate}%` }}</span>
            <span class="stat-sub">{{ tierBTotals.sent ? 'clicked the lure' : 'no sends yet' }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">REPORTED RATE</span>
            <span class="stat-value" :class="rateTone(tierBTotals.reportedRate, 'higher-is-better')">{{ tierBTotals.reportedRate === null ? '—' : `${tierBTotals.reportedRate}%` }}</span>
            <span class="stat-sub">{{ tierBTotals.sent ? 'flagged it to IT' : 'no sends yet' }}</span>
          </div>
        </div>
        <p v-if="riskInsight" class="insight-line">{{ riskInsight }}</p>

        <p v-if="simError" class="error">{{ simError }}</p>
        <div v-if="phishingEngagements.length === 0 && !loadingEngagements" class="empty">No phishing simulations set up yet.</div>

        <div v-if="phishingEngagements.length" class="table-controls">
          <input v-model="engSearch" class="search-input" placeholder="Search by list or template…" />
          <div class="select-wrap">
            <select v-model="engStatusFilter" class="input select-styled">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_approval">Awaiting signature</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
            <span class="select-chevron">⌄</span>
          </div>
        </div>

        <div v-if="filteredEngagements.length" class="eng-table">
          <div class="eng-table-head">
            <span>NAME</span><span>TEMPLATE</span><span>CADENCE</span><span>SENT</span><span>LAST LAUNCH</span><span>ENGAGEMENT</span><span>STATUS</span><span></span>
          </div>
          <div v-for="eng in filteredEngagements" :key="eng.id">
            <div class="eng-table-row" :class="{ revoked: eng.status === 'revoked' }">
              <div class="etr-name">
                <span class="etr-title">
                  {{ targetListName(eng.scope.target_list_id) }}
                  <span v-if="mostRecentCampaign(eng.id)?.dmarc_context" class="warn-dot" :title="mostRecentCampaign(eng.id).dmarc_context">⚠</span>
                </span>
                <span class="etr-sub">{{ targetListCount(eng.scope.target_list_id) }} recipients</span>
              </div>
              <div class="etr-template">
                <span>{{ templateLabel(eng.scope.template_id) }}</span>
                <span class="ai-tag" :class="{ static: !eng.scope.llm_generate_fresh }">{{ eng.scope.llm_generate_fresh ? 'AI' : 'STATIC' }}</span>
              </div>
              <div class="etr-cadence">{{ eng.scope.cadence_days ? `every ${eng.scope.cadence_days}d` : 'one-off' }}</div>
              <div class="etr-sent">{{ engagementTotals(eng.id).sent || '—' }}</div>
              <div class="etr-launch">{{ engagementTotals(eng.id).lastLaunch ? formatDate(engagementTotals(eng.id).lastLaunch!) : '—' }}</div>
              <div class="etr-engagement">
                <template v-if="engagementTotals(eng.id).sent">
                  <div class="bar-track small"><div class="bar-fill clicked" :style="{ width: engagementTotals(eng.id).clickRate + '%' }" /></div>
                  <span>{{ engagementTotals(eng.id).clickRate }}%</span>
                </template>
                <span v-else class="muted-dash">—</span>
              </div>
              <div class="etr-status"><span class="status-pill" :style="statusPillStyle(eng.status)">{{ engagementStatusLabel(eng.status) }}</span></div>
              <div class="etr-actions">
                <template v-if="eng.status === 'active' && mostRecentCampaign(eng.id)">
                  <!-- Already has real history: View is the primary,
                       obvious thing to do with this row. Starting another
                       cycle is real and still possible, but it's a
                       deliberate secondary action now, not a competing
                       button — it lives in the overflow menu. -->
                  <RouterLink :to="`/phishing/campaigns/${mostRecentCampaign(eng.id).id}`" class="mini-btn small">View</RouterLink>
                </template>
                <!-- Active but nothing launched yet: nothing to view, so
                     Launch is the only real action. Hidden (not just
                     disabled) for a 'viewer' — the backend rejects the
                     call outright, so don't offer a guaranteed-403 click. -->
                <div v-else-if="eng.status === 'active' && canLaunch" class="mini-btn primary small" @click="openLaunchPreview(eng)">
                  {{ launchingId === eng.id ? '…' : 'Launch' }}
                </div>
                <!-- draft: real next step is requesting the Dropbox Sign
                     authorization — the backend only accepts this call
                     while status is exactly 'draft' (see request_signature()
                     in app/routers/engagement.py). -->
                <div v-else-if="eng.status === 'draft' && canLaunch" class="mini-btn primary small" @click="requestSignature(eng)">
                  {{ requestingSigId === eng.id ? '…' : 'Request signature' }}
                </div>
                <!-- pending_approval: there is no resend/resume endpoint —
                     the one real action is re-opening the signing link
                     already issued. A second request-signature call would
                     400 (backend rejects anything not 'draft'). -->
                <a
                  v-else-if="eng.status === 'pending_approval' && eng.roe_doc_url"
                  :href="eng.roe_doc_url" target="_blank" rel="noopener" class="mini-btn cyan small"
                >Signing link →</a>
                <div class="etr-menu">
                  <div class="etr-menu-btn" @click.stop="openRowMenu = openRowMenu === eng.id ? null : eng.id">⋮</div>
                  <div v-if="openRowMenu === eng.id" class="etr-menu-popover" @click.stop>
                    <div v-if="eng.status === 'active' && mostRecentCampaign(eng.id) && canLaunch" class="menu-item" @click="openLaunchPreview(eng); openRowMenu = null">
                      {{ launchingId === eng.id ? 'Launching…' : 'Launch another cycle' }}
                    </div>
                    <div v-if="eng.status === 'active' && canLaunch" class="menu-item" @click="openScheduleEdit(eng); openRowMenu = null">Edit schedule</div>
                    <RouterLink :to="{ name: 'phishing-recipients', params: { engagementId: eng.id } }" class="menu-item" @click="openRowMenu = null">People →</RouterLink>
                    <RouterLink v-if="eng.status !== 'active' && mostRecentCampaign(eng.id)" :to="`/phishing/campaigns/${mostRecentCampaign(eng.id).id}`" class="menu-item" @click="openRowMenu = null">Evidence →</RouterLink>
                    <div v-if="eng.status !== 'revoked' && canLaunch" class="menu-item danger" @click="revoke(eng.id); openRowMenu = null">Revoke</div>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="launchError[eng.id]" class="scan-error row-note">{{ launchError[eng.id] }}</p>
            <p v-if="requestSigError[eng.id]" class="scan-error row-note">{{ requestSigError[eng.id] }}</p>
            <p v-if="eng.status === 'pending_approval'" class="pending-note row-note">
              Rules of Engagement awaiting signature — requested {{ relativeTime(eng.created_at) }}. No mail can be dispatched until it is countersigned.
              <span v-if="!eng.roe_doc_url">The original signing link isn't on record for this engagement — revoke and start a new simulation to issue a fresh one.</span>
            </p>
            <p v-if="eng.status === 'active' && !mostRecentCampaign(eng.id)" class="section-note row-note">No campaigns launched yet for this simulation.</p>
          </div>
        </div>
        <div v-else-if="phishingEngagements.length" class="empty">No simulations match this filter.</div>
      </div>
    </div>

    <div v-if="previewModal" class="overlay" @click.self="previewModal = null">
      <div class="preview-modal">
        <PhishingEmailPreview
          :mode="previewModal.mode" :subject="previewModal.subject" :body-html="previewModal.bodyHtml"
          :to-label="previewModal.toLabel" :title="previewModal.title" :footer-note="previewModal.footerNote"
          :from-label="meta?.sending_identity ?? 'Sentinel'"
        />
        <div v-if="previewModal.onApproveLaunch" class="preview-launch-actions">
          <div class="ghost-btn" @click="previewModal = null">Cancel</div>
          <div class="mini-btn primary" @click="previewModal.onApproveLaunch()">
            {{ confirmingLaunch ? 'Launching…' : `Approve & launch to ${previewModal.recipientCount}` }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="scheduleEditEng" class="overlay" @click.self="closeScheduleEdit">
      <div class="schedule-modal">
        <h3>Edit schedule</h3>
        <p class="modal-sub">{{ targetListName(scheduleEditEng.scope.target_list_id) }}</p>

        <p v-if="scheduleEditEng.roe_signature_request_id" class="compliance-note">
          This engagement's Rules of Engagement was signed with the original cadence stated in the document itself. Changing the schedule here does not update the signed document — it will diverge from what was authorized, and this change is audit-logged.
        </p>

        <div class="field">
          <span class="label">Send timing</span>
          <div class="timing-toggle">
            <button class="toggle-btn" :class="{ active: scheduleForm.recurring }" @click="scheduleForm.recurring = true">Recurring</button>
            <button class="toggle-btn" :class="{ active: !scheduleForm.recurring }" @click="scheduleForm.recurring = false">One-time</button>
          </div>
          <div v-if="scheduleForm.recurring" class="stepper" style="margin-top: 10px;">
            <button class="step-btn" @click="scheduleForm.cadenceDays = Math.max(1, scheduleForm.cadenceDays - 1)">–</button>
            <span class="step-val">Every {{ scheduleForm.cadenceDays }} days</span>
            <button class="step-btn" @click="scheduleForm.cadenceDays = scheduleForm.cadenceDays + 1">+</button>
          </div>
        </div>

        <div v-if="landingPages.length" class="field">
          <span class="label">Landing page shown after a click</span>
          <div class="select-wrap">
            <select v-model="scheduleForm.landingPageId" class="input select-styled">
              <option v-for="lp in landingPages" :key="lp.id" :value="lp.id">{{ lp.label }}</option>
            </select>
            <span class="select-chevron">⌄</span>
          </div>
        </div>

        <p v-if="scheduleEditError" class="scan-error">{{ scheduleEditError }}</p>

        <div class="preview-launch-actions">
          <div class="ghost-btn" @click="closeScheduleEdit">Cancel</div>
          <div class="mini-btn primary" @click="saveSchedule">{{ scheduleSaving ? 'Saving…' : 'Save changes' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { severityColor } from '@/data/colors'

// A 'viewer' can see this whole screen but the backend now rejects them
// from create/request-signature/launch/revoke/schedule-edit for phishing-
// tier engagements — hidden here too so a click isn't a guaranteed 403.
const auth = useAuthStore()
const canLaunch = computed(() => auth.role !== 'viewer')
import PhishingEmailPreview from '@/components/phishing/PhishingEmailPreview.vue'

const templates = ref<any[]>([])
async function loadTemplates() {
  try { templates.value = await api.phishingTemplates() } catch { /* dropdown just stays empty */ }
}

const landingPages = ref<any[]>([])
async function loadLandingPages() {
  try { landingPages.value = await api.phishingLandingPages() } catch { /* picker just stays empty */ }
}

// ── Status bar ──────────────────────────────────────────────────────────
const meta = ref<any | null>(null)
const haltBusy = ref(false)
async function loadMeta() {
  try { meta.value = await api.phishingMeta() } catch { /* status bar just hides */ }
}
async function toggleHalt() {
  if (!meta.value) return
  haltBusy.value = true
  try {
    meta.value = meta.value.phishing_paused ? await api.resumePhishingSends() : await api.haltPhishingSends()
  } catch { /* leave state as-is on failure */ } finally { haltBusy.value = false }
}
const roeStatus = computed(() => {
  if (phishingEngagements.value.some((e: any) => e.status === 'pending_approval')) return { label: 'ROE PENDING', tone: 'warn', icon: '◔' }
  if (phishingEngagements.value.some((e: any) => e.status === 'active')) return { label: 'ROE SIGNED', tone: 'good', icon: '✓' }
  return { label: 'NO ACTIVE ROE', tone: 'muted', icon: '○' }
})

// ── Target lists — read-only lookups only. Full CRUD (create/edit, the
// modal, roles-mapped display) moved to PhishingSettingsView.vue; this
// page keeps just enough to resolve names/counts for the simulations
// table below and to gate "+ New simulation" on at least one list
// existing (Phishing Simulation roadmap, Phase 33). ─────────────────────
const targetLists = ref<any[]>([])

function targetListName(id: string): string {
  return targetLists.value.find(tl => tl.id === id)?.name ?? '(unknown list)'
}
function targetListCount(id: string): number {
  return targetLists.value.find(tl => tl.id === id)?.entries.length ?? 0
}
function relativeTime(iso: string): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

async function loadTargetLists() {
  try { targetLists.value = await api.phishingTargetLists() } catch { /* names/counts just show as unknown */ }
}

// ── Tier B: simulations + campaigns ───────────────────────────────────
const phishingEngagements = ref<any[]>([])
const loadingEngagements = ref(false)
const simError = ref('')
const campaignsByEngagement = ref<Record<string, any[]>>({})
const eventCounts = ref<Record<string, any>>({})

// One aggregate call for every campaign + its event counts, tenant-wide
// (Phishing Simulation roadmap Phase 29b) — replaces what used to be a
// phishingCampaigns() call per engagement plus a phishingCampaignEvents()
// call per campaign (485 requests on a real dev tenant). campaignsByEngagement
// and eventCounts are both derived client-side from the one response below,
// same shape downstream code already expects.
async function loadEngagements() {
  loadingEngagements.value = true
  simError.value = ''
  try {
    const [all, summary] = await Promise.all([api.engagements(), api.phishingCampaignsSummary()])
    phishingEngagements.value = all.filter((e: any) => e.tier === 'phishing')

    const grouped: Record<string, any[]> = {}
    for (const eng of phishingEngagements.value) grouped[eng.id] = []
    for (const row of summary) {
      (grouped[row.engagement_id] ??= []).push(row)
      eventCounts.value[row.id] = {
        sent: row.sent, clicked: row.clicked, credential_entered: row.credential_entered, reported: row.reported,
      }
    }
    campaignsByEngagement.value = grouped
  } catch (e: any) { simError.value = e.message ?? 'Failed to load simulations' }
  finally { loadingEngagements.value = false }
}

function templateLabel(templateId: string): string {
  return templates.value.find((t: any) => t.id === templateId)?.label ?? templateId
}

// Most recent campaign for an engagement — campaignsByEngagement() isn't
// guaranteed sorted by the API, so sort explicitly rather than assume.
function mostRecentCampaign(engagementId: string): any | null {
  const list = campaignsByEngagement.value[engagementId]
  if (!list?.length) return null
  return list.slice().sort((a: any, b: any) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime())[0]
}

// Real aggregates for one engagement's row in the table — summed across
// every campaign cycle it's run, not just the most recent one.
function engagementTotals(engagementId: string): { sent: number; clickRate: number; lastLaunch: string | null } {
  const campaigns = campaignsByEngagement.value[engagementId] ?? []
  let sent = 0, clicked = 0
  for (const c of campaigns) {
    const counts = eventCounts.value[c.id]
    if (!counts) continue
    sent += counts.sent ?? 0
    clicked += counts.clicked ?? 0
  }
  const recent = mostRecentCampaign(engagementId)
  return { sent, clickRate: sent ? Math.round((clicked / sent) * 100) : 0, lastLaunch: recent?.launched_at ?? null }
}

const engSearch = ref('')
const engStatusFilter = ref('')
const openRowMenu = ref<string | null>(null)

const filteredEngagements = computed(() => {
  const q = engSearch.value.trim().toLowerCase()
  return phishingEngagements.value.filter((eng: any) => {
    if (engStatusFilter.value && eng.status !== engStatusFilter.value) return false
    if (!q) return true
    const haystack = `${targetListName(eng.scope.target_list_id)} ${templateLabel(eng.scope.template_id)}`.toLowerCase()
    return haystack.includes(q)
  })
})

// ── Tier B stat row — real aggregates only, never a fabricated trend.
// No delta/arrow shown: we don't snapshot historical values anywhere yet,
// so a "+3% vs last week" would be invented, not computed. Once campaign
// history is snapshotted this can grow a real comparison; until then, an
// honest current number beats a dishonest trend.
const activeEngagementCount = computed(() => phishingEngagements.value.filter((e: any) => e.status === 'active').length)

const allCampaignsFlat = computed(() => Object.values(campaignsByEngagement.value).flat())

const tierBTotals = computed(() => {
  const campaigns = allCampaignsFlat.value
  let sent = 0, clicked = 0, reported = 0
  for (const c of campaigns as any[]) {
    const counts = eventCounts.value[c.id]
    if (!counts) continue
    sent += counts.sent ?? 0
    clicked += counts.clicked ?? 0
    reported += counts.reported ?? 0
  }
  return {
    campaignCount: campaigns.length,
    sent,
    clickRate: sent ? Math.round((clicked / sent) * 1000) / 10 : null,
    reportedRate: sent ? Math.round((reported / sent) * 1000) / 10 : null,
  }
})

// Semantic coloring, not sign-based: a falling click rate is good, a
// rising reported rate is good — the two use opposite thresholds, never
// the same red/green rule applied blindly to "the number is high/low".
function rateTone(rate: number | null, direction: 'lower-is-better' | 'higher-is-better'): string {
  if (rate === null) return ''
  const good = direction === 'lower-is-better' ? rate < 10 : rate > 50
  const bad = direction === 'lower-is-better' ? rate > 25 : rate < 20
  return bad ? 'tone-bad' : good ? 'tone-good' : ''
}

// One honest, specific sentence pointing at the real worst number across
// current data, instead of leaving every stat equally weighted — the
// dashboard-priority gap identified in review: a bad number needs to be
// louder than a fine one, not just a different color once you find it.
const riskInsight = computed(() => {
  const campaigns = allCampaignsFlat.value as any[]
  if (!campaigns.length) return ''
  let worst: { label: string; rate: number; sent: number; credCount: number } | null = null
  for (const c of campaigns) {
    const counts = eventCounts.value[c.id]
    if (!counts?.sent) continue
    const rate = (counts.credential_entered ?? 0) / counts.sent
    if (!worst || rate > worst.rate) {
      worst = { label: targetListName(c.target_list_id), rate, sent: counts.sent, credCount: counts.credential_entered ?? 0 }
    }
  }
  if (!worst || worst.credCount === 0) return ''
  return `${worst.credCount} of ${worst.sent} recipients on "${worst.label}" handed over a password — the highest real submission rate of any campaign right now.`
})

function engagementStatusLabel(status: string): string {
  return { draft: 'DRAFT', pending_approval: 'AWAITING SIGNATURE', active: 'ACTIVE', expired: 'EXPIRED', revoked: 'REVOKED' }[status] ?? status.toUpperCase()
}
function statusPillStyle(status: string) {
  const sevMap: Record<string, string> = { active: 'healthy', pending_approval: 'warning', draft: 'info', expired: 'critical', revoked: 'critical' }
  const color = severityColor(sevMap[status] ?? 'info')
  return { color, borderColor: color, background: `color-mix(in srgb, ${color} 16%, transparent)` }
}
function formatDate(iso: string): string { return new Date(iso).toLocaleString() }

// Launch now (existing active engagement) — routes through the same
// preview-and-approve rail the wizard uses, so a safety-checked human
// review happens before every single send, not just the first one.
const launchingId = ref<string | null>(null)
const launchError = ref<Record<string, string>>({})
const previewModal = ref<any | null>(null)
const confirmingLaunch = ref(false)

// Every send — first-cycle or a later "Launch now" on an already-active
// engagement — routes through the same preview-and-approve rail: content
// is fresh-generated per launch, so a human review has to happen every
// time, not just once at engagement creation.
async function openLaunchPreview(eng: any) {
  launchingId.value = eng.id
  delete launchError.value[eng.id]
  try {
    const preview = await api.phishingContentPreview(eng.id)
    const recipientCount = targetListCount(eng.scope.target_list_id)
    previewModal.value = {
      mode: 'draft', subject: preview.subject, bodyHtml: preview.body_html,
      toLabel: `${targetListName(eng.scope.target_list_id)} · ${recipientCount} recipients`,
      title: 'Review before launch', recipientCount,
      footerNote: 'This is exactly what will send if you approve — nothing is regenerated after this point.',
      onApproveLaunch: async () => {
        confirmingLaunch.value = true
        try {
          await api.launchPhishingCampaign(eng.id, {
            subject: preview.subject, body_html: preview.body_html,
            llm_generated: preview.llm_generated, dmarc_context: preview.dmarc_context ?? null,
          })
          // One aggregate call, same as initial load — cheap enough to just
          // re-fetch everything rather than patch one engagement's slice.
          await loadEngagements()
          previewModal.value = null
        } catch (e: any) {
          launchError.value[eng.id] = e.message ?? 'Failed to launch campaign'
        } finally { confirmingLaunch.value = false }
      },
    }
  } catch (e: any) {
    launchError.value[eng.id] = e.message ?? 'Failed to generate a preview to launch'
  } finally { launchingId.value = null }
}

// Draft-only, matching the backend's real rule (request_signature() in
// app/routers/engagement.py rejects anything that isn't 'draft') — there
// is no separate resend/resume call for a pending_approval engagement,
// which is why the table links to the already-issued roe_doc_url instead
// of calling this again for that status.
const requestingSigId = ref<string | null>(null)
const requestSigError = ref<Record<string, string>>({})
async function requestSignature(eng: any) {
  requestingSigId.value = eng.id
  delete requestSigError.value[eng.id]
  try { await api.requestSignature(eng.id); await loadEngagements() }
  catch (e: any) { requestSigError.value[eng.id] = e.message ?? 'Failed to request signature' }
  finally { requestingSigId.value = null }
}

async function revoke(id: string) {
  try { await api.revokeEngagement(id); await loadEngagements() }
  catch (e: any) { simError.value = e.message ?? 'Failed to revoke simulation' }
}

// ── Edit schedule (active engagements only — see updateEngagementSchedule
// in client.ts for why this is scoped to just cadence/recurring/landing
// page, never target list/template/content). ─────────────────────────────
const scheduleEditEng = ref<any | null>(null)
const scheduleForm = ref({ recurring: true, cadenceDays: 30, landingPageId: '' })
const scheduleSaving = ref(false)
const scheduleEditError = ref('')

function openScheduleEdit(eng: any) {
  scheduleEditError.value = ''
  scheduleForm.value = {
    recurring: eng.scope.recurring ?? true,
    cadenceDays: eng.scope.cadence_days ?? 30,
    landingPageId: eng.scope.landing_page_id ?? (landingPages.value[0]?.id ?? ''),
  }
  scheduleEditEng.value = eng
}
function closeScheduleEdit() { scheduleEditEng.value = null }

async function saveSchedule() {
  if (!scheduleEditEng.value) return
  scheduleSaving.value = true
  scheduleEditError.value = ''
  try {
    await api.updateEngagementSchedule(scheduleEditEng.value.id, {
      recurring: scheduleForm.value.recurring,
      cadence_days: scheduleForm.value.recurring ? scheduleForm.value.cadenceDays : undefined,
      landing_page_id: scheduleForm.value.landingPageId || undefined,
    })
    await loadEngagements()
    scheduleEditEng.value = null
  } catch (e: any) {
    scheduleEditError.value = e.message ?? 'Failed to update schedule'
  } finally {
    scheduleSaving.value = false
  }
}

function closeRowMenuOnOutsideClick() { openRowMenu.value = null }

onMounted(() => {
  loadMeta()
  loadTemplates()
  loadLandingPages()
  loadTargetLists()
  loadEngagements()
  document.addEventListener('click', closeRowMenuOnOutsideClick)
})
onUnmounted(() => document.removeEventListener('click', closeRowMenuOnOutsideClick))
</script>

<style scoped>
.phishing { display: flex; flex-direction: column; gap: 14px; }

.status-bar {
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 10px; padding: 9px 16px;
  font-family: var(--font-label); font-size: 10.5px;
}
.status-chip { font-weight: 700; letter-spacing: .03em; display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; }
.status-chip.good { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.status-chip.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.status-chip.muted { color: var(--text3); background: var(--surface2); }
.status-chip.privacy { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); cursor: help; }
.status-item { color: var(--text3); letter-spacing: .02em; }
.status-item b { color: var(--text2); font-weight: 600; }
.halt-btn {
  margin-left: auto; background: transparent; border: 1px solid color-mix(in srgb, var(--red) 45%, var(--border));
  color: var(--red); font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: .03em;
  padding: 5px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.halt-btn:hover { background: color-mix(in srgb, var(--red) 12%, transparent); }
.halt-btn.active { color: var(--green); border-color: color-mix(in srgb, var(--green) 45%, var(--border)); }

.title { margin: 6px 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 4px; color: var(--text2); font-size: 14px; }

/* Tier B holds a real multi-column table — measured minimum width
   (~950px before trimming below) genuinely doesn't fit any side-by-side
   split with Tier A at normal desktop widths without squeezing into the
   exact overlap failure mode already fixed once in the wizard (Phishing
   Simulation roadmap, design adoption pass). Stacked, not side-by-side,
   so the table always gets the full workspace width. */
.tiers { display: flex; flex-direction: column; gap: 26px; }
.tier-col { display: flex; flex-direction: column; gap: 12px; }
.tier-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tier-label { font-family: var(--font-label); font-size: 10.5px; letter-spacing: .04em; color: var(--text3); }
.tier-sub { font-size: 12px; color: var(--text3); margin: -4px 0 2px; }

.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
@media (max-width: 640px) { .stat-row { grid-template-columns: 1fr 1fr; } }
.stat-card {
  background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.stat-label { font-family: var(--font-label); font-size: 9.5px; font-weight: 700; letter-spacing: .04em; color: var(--text3); }
.stat-value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-value.tone-good { color: var(--green); }
.stat-value.tone-bad { color: var(--red); }
.stat-sub { font-size: 11px; color: var(--text3); }
.insight-line {
  font-size: 12px; color: var(--text2); background: color-mix(in srgb, var(--red) 7%, transparent);
  border-left: 2px solid var(--red); padding: 8px 11px; border-radius: 0 7px 7px 0; margin: 0; line-height: 1.5;
}

.section-note { font-size: 12px; color: var(--text2); margin: 0 0 12px; }
.error { color: var(--red); font-size: 12px; margin: 6px 0; }
.empty { color: var(--text2); font-size: 13px; padding: 8px 0; }

.mini-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 11px; font-weight: 600; padding: 6px 11px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.mini-btn.primary { background: var(--amber); color: var(--bg); border-color: var(--amber); }
.mini-btn.cyan { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.scan-error { font-size: 11px; color: var(--red); margin: 6px 0 0; }

.link-btn { color: var(--accent); font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.link-btn.primary { background: var(--amber); color: var(--bg); padding: 7px 14px; border-radius: 8px; }
.link-btn.primary.disabled { opacity: .5; cursor: default; }

.status-pill { font: 700 9.5px var(--font-label); text-transform: uppercase; letter-spacing: .03em; padding: 3px 8px; border-radius: 999px; border: 1px solid; white-space: nowrap; }
.ai-tag { font-family: var(--font-label); font-size: 9px; font-weight: 700; color: var(--accent); }
.ai-tag.static { color: var(--text3); }
.btn-row { display: flex; gap: 8px; margin-left: auto; }
.pending-note { font-size: 11.5px; color: var(--text2); background: var(--surface2); border-radius: 8px; padding: 9px 11px; margin: 6px 0 10px; line-height: 1.5; }
.link-inline { color: var(--accent); cursor: pointer; margin-left: 4px; text-decoration: none; }
.link-inline:hover { text-decoration: underline; }
.warn-dot { flex-shrink: 0; cursor: help; color: var(--amber); }

/* ── Campaigns table (Phishing Simulation roadmap — design adoption
   pass). One row per engagement/simulation, aggregated across every
   campaign cycle it's run — full per-campaign funnel/heatmap detail
   lives one click away on the existing per-campaign evidence page
   (already richer than anything shown inline here before), reached via
   the row's overflow menu. */
.table-controls { display: flex; gap: 10px; }
.search-input {
  flex: 1; max-width: 320px; height: 34px; padding: 0 12px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 12.5px; font-family: var(--font-body);
}
.search-input:focus { outline: none; border-color: var(--accent); }
.select-wrap { position: relative; flex-shrink: 0; }
.input { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: var(--font-body); }
.select-styled {
  appearance: none; cursor: pointer; height: 34px; padding: 0 28px 0 12px; font-size: 12.5px;
}
.select-chevron { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 11px; pointer-events: none; }

.eng-table { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.eng-table-head, .eng-table-row {
  display: grid;
  /* Actions cell holds up to two buttons + a menu icon (View/Request
     signature/Signing link, Launch, ⋮) — 56px only ever fit the icon
     alone, which is what caused them to wrap/overlap instead of sitting
     side by side. Trimmed CADENCE/SENT/LAST LAUNCH/ENGAGEMENT slightly to
     keep the row's total minimum width from creeping past what fits
     alongside Tier A at normal desktop widths (verified below). */
  grid-template-columns: minmax(130px, 1.3fr) minmax(90px, 1fr) 70px 50px 100px 80px 90px 150px;
  gap: 10px; align-items: center; padding: 11px 14px;
}
.eng-table-head {
  font-family: var(--font-body); font-size: 10px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; color: var(--text3); background: rgba(19,27,46,0.5); border-bottom: 1px solid var(--border);
}
.eng-table-row { border-top: 1px solid var(--border); font-size: 12.5px; position: relative; }
.eng-table-row:first-child { border-top: none; }
.eng-table-row.revoked { opacity: .55; }
.etr-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.etr-title { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.etr-sub { font-size: 11px; color: var(--text3); }
.etr-template { display: flex; align-items: center; gap: 6px; min-width: 0; }
.etr-template span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.etr-cadence { color: var(--text2); font-size: 11.5px; }
.etr-sent { font-variant-numeric: tabular-nums; }
.etr-launch { color: var(--text2); font-size: 11.5px; }
.etr-engagement { display: flex; align-items: center; gap: 8px; }
.bar-track.small { flex: 1; height: 6px; background: #0e1626; border-radius: 3px; overflow: hidden; min-width: 40px; }
.bar-fill.clicked { height: 100%; border-radius: 3px; background: var(--accent); }
.muted-dash { color: var(--text3); }
.etr-status { min-width: 0; }
.etr-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.mini-btn.small { padding: 5px 9px; font-size: 10.5px; }
.etr-menu { position: relative; }
.etr-menu-btn {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; cursor: pointer; color: var(--text3); font-weight: 700;
}
.etr-menu-btn:hover { background: var(--surface2); color: var(--text); }
.etr-menu-popover {
  position: absolute; right: 0; top: 28px; z-index: 20; min-width: 140px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 5px; display: flex; flex-direction: column; gap: 1px; box-shadow: 0 8px 24px rgba(0,0,0,.4);
}
.menu-item {
  display: block; padding: 7px 9px; border-radius: 6px; font-size: 12px; color: var(--text2);
  text-decoration: none; cursor: pointer; text-align: left; white-space: nowrap;
}
.menu-item:hover { background: var(--surface2); color: var(--text); }
.menu-item.danger { color: var(--red); }
.menu-item.danger:hover { background: color-mix(in srgb, var(--red) 12%, transparent); }
.row-note { padding: 0 14px 12px; margin: 0; }
@media (max-width: 1400px) {
  .eng-table-head, .eng-table-row { grid-template-columns: minmax(120px, 1.2fr) minmax(85px, 1fr) 60px 44px 90px 70px 80px 145px; font-size: 11.5px; }
}

.overlay { position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.preview-modal { width: 700px; max-width: 92vw; max-height: 88vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.preview-launch-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }

.schedule-modal { width: 420px; max-width: 92vw; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.schedule-modal h3 { margin: 0 0 2px; font-size: 15px; }
.modal-sub { margin: 0 0 14px; font-size: 12px; color: var(--text3); }
.compliance-note { font-size: 11.5px; line-height: 1.5; color: var(--amber, #d6a54a); background: color-mix(in srgb, var(--amber, #d6a54a) 10%, transparent); border: 1px solid color-mix(in srgb, var(--amber, #d6a54a) 30%, transparent); border-radius: 8px; padding: 10px 12px; margin: 0 0 16px; }
.schedule-modal .field { margin-bottom: 16px; }
.schedule-modal .label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text3); margin-bottom: 8px; }
.timing-toggle { display: flex; gap: 6px; }
.toggle-btn { flex: 1; height: 32px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface2); color: var(--text2); font-size: 12px; cursor: pointer; }
.toggle-btn.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.stepper { display: flex; align-items: center; gap: 10px; height: 36px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; width: fit-content; }
.step-btn { width: 22px; height: 22px; border-radius: 5px; border: 1px solid var(--border); background: transparent; color: var(--text2); cursor: pointer; line-height: 1; }
.step-btn:hover { border-color: var(--accent); color: var(--accent); }
.step-val { font-size: 12.5px; color: var(--text); white-space: nowrap; }
</style>
