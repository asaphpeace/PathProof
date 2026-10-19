<template>
  <div class="campaign-view">
    <div v-if="loading" class="loading">Loading campaign…</div>
    <div v-else-if="loadError" class="error-block">{{ loadError }}</div>
    <template v-else-if="campaign">
      <div class="head-row">
        <div>
          <span class="tier-chip">TIER B</span>
          <span class="head-date">{{ formatDate(campaign.launched_at) }}</span>
        </div>
        <div class="head-actions">
          <button class="ghost-btn" @click="exportCsv">{{ exporting ? 'Exporting…' : '⬇ Export CSV' }}</button>
          <button class="ghost-btn" @click="previewOpen = true">◉ What they received</button>
          <RouterLink :to="{ name: 'phishing-recipients', params: { engagementId: campaign.engagement_id } }" class="ghost-btn">People across all campaigns →</RouterLink>
        </div>
      </div>
      <h1 class="subject-title">"{{ campaign.subject_sent }}"</h1>
      <p class="head-sub">
        {{ campaign.audience_label ? `${targetListLabel} — ${campaign.audience_label}` : targetListLabel }} · template <span class="mono">{{ campaign.template_id }}</span>
        <span class="ai-tag" :class="{ static: !campaign.llm_generated }">{{ campaign.llm_generated ? 'AI-GENERATED' : 'STATIC' }}</span>
        <span v-if="landingPageLabel"> · landing page shown on click: <b>{{ landingPageLabel }}</b></span>
      </p>
      <p v-if="engagementExpiry" class="expiry-note" :class="{ warn: expirySoon, crit: isExpired }">
        Authorization {{ isExpired ? 'expired' : 'expires' }} {{ formatDateOnly(engagementExpiry) }}{{ isExpired ? ' — this simulation can no longer launch new cycles.' : '.' }}
      </p>

      <div class="layout-grid">
        <div class="main-col">
          <div class="stat-cards">
            <div class="stat-card">
              <div class="stat-lbl">Delivered</div>
              <div class="stat-big" :class="{ red: (counts.send_failed ?? 0) > 0 }">{{ pct(counts.sent, counts.sent + (counts.send_failed ?? 0)) }}</div>
              <div class="stat-sub">{{ counts.sent }} of {{ counts.sent + (counts.send_failed ?? 0) }}{{ (counts.send_failed ?? 0) > 0 ? ` — ${counts.send_failed} failed` : '' }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">Open rate</div>
              <div class="stat-big amber">{{ pct(counts.opened, counts.sent) }}</div>
              <div class="stat-sub">{{ counts.opened }} people</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">Click rate</div>
              <div class="stat-big orange">{{ pct(counts.clicked, counts.sent) }}</div>
              <div class="stat-sub">{{ counts.clicked }} people</div>
            </div>
            <div class="stat-card crit">
              <div class="stat-lbl">Gave up credentials</div>
              <div class="stat-big red">{{ pct(counts.credential_entered, counts.sent) }}</div>
              <div class="stat-sub">{{ counts.credential_entered }} people</div>
            </div>
            <div class="stat-card good">
              <div class="stat-lbl">Report rate</div>
              <div class="stat-big green">{{ pct(counts.reported, counts.sent) }}</div>
              <div class="stat-sub">{{ counts.reported }} people — a success, not a failure</div>
            </div>
            <div v-if="counts.training_assigned > 0" class="stat-card">
              <div class="stat-lbl">Training completed</div>
              <div class="stat-big accent">{{ pct(counts.training_completed, counts.training_assigned) }}</div>
              <div class="stat-sub">{{ counts.training_completed }} of {{ counts.training_assigned }} assigned</div>
            </div>
            <div v-if="medianDwellSeconds !== null" class="stat-card">
              <div class="stat-lbl">Median time to act</div>
              <div class="stat-big">{{ formatDwell(medianDwellSeconds) }}</div>
              <div class="stat-sub">from opening the email to clicking or entering credentials</div>
            </div>
          </div>

          <div v-if="campaign.dmarc_context" class="evidence-block">
            <div class="ev-label">DMARC posture at send time · evidence</div>
            <div class="ev-row">
              <span class="dmarc-pill">{{ dmarcShort }}</span>
              <span class="ev-text">{{ campaign.dmarc_context }}</span>
            </div>
            <p class="ev-note">This lure was written against {{ primaryDomainName }}'s real, current DMARC posture — not a role guess or scraped OSINT. Most simulation platforms personalize by job title; this one personalizes by your actual email-authentication exposure.</p>
            <div class="ev-source">SOURCE <RouterLink to="/coverage">Coverage Map</RouterLink> / {{ primaryDomainName }} / DNS posture · captured {{ formatDate(campaign.launched_at) }}</div>
          </div>

          <div v-if="emailAuthEvidence" class="evidence-block independent">
            <div class="ev-label">Independent evidence — no simulation platform can produce this</div>
            <p class="ev-text">
              In the {{ emailAuthEvidence.window_days }} days around this campaign,
              <b>{{ emailAuthEvidence.unaligned_message_count }} of {{ emailAuthEvidence.total_message_count }}</b>
              real messages sent as {{ primaryDomainName }} failed DMARC alignment from unauthorized senders.
              <template v-if="emailAuthEvidence.spoof_test_status === 'open'">
                PathProof's own spoof test confirmed a forged message was <b>not blocked</b>
                <template v-if="emailAuthEvidence.spoof_test_date"> on {{ formatDateOnly(emailAuthEvidence.spoof_test_date) }}</template>.
              </template>
              <template v-else-if="emailAuthEvidence.spoof_test_status">
                PathProof's own spoof test result: {{ emailAuthEvidence.spoof_test_detail }}
              </template>
            </p>
            <div class="ev-source">SOURCE <RouterLink to="/coverage">Coverage Map</RouterLink> / {{ primaryDomainName }} / DMARC aggregate reports + spoof test</div>
          </div>

          <div v-if="departmentBreakdown.length" class="dept-block">
            <div class="ev-label">Click rate by department — this campaign</div>
            <div v-for="d in departmentBreakdown" :key="d.department" class="dept-row">
              <span class="dept-name">{{ d.department }}</span>
              <div class="dept-bar-track"><div class="dept-bar-fill" :style="{ width: pct(d.clicked, d.sent) }" /></div>
              <span class="dept-pct">{{ pct(d.clicked, d.sent) }}</span>
              <span class="dept-sub">{{ d.clicked }} of {{ d.sent }}{{ d.credential_entered ? ` · ${d.credential_entered} gave up credentials` : '' }}</span>
            </div>
          </div>

          <div class="recipients-head">
            <h2>Recipients <span class="muted">hashed until a tenant admin unmasks · {{ counts.sent }} sent</span></h2>
            <div class="filter-tabs">
              <button v-for="f in filters" :key="f.key" class="filter-tab" :class="{ active: filter === f.key }" @click="filter = f.key">{{ f.label }}</button>
            </div>
          </div>

          <div v-if="filteredRecipients.length === 0" class="empty">No recipients match this filter.</div>
          <div class="recipients-table">
            <div v-for="(r, i) in filteredRecipients" :key="r.recipient_hash" class="recipient-row">
              <div class="rr-main" @click="openRecipient(i)">
                <span class="rr-hash mono">{{ shortHash(r.recipient_hash) }}</span>
                <span class="rr-outcome" :class="worstOutcome(r).tone">{{ worstOutcome(r).label }}</span>
                <span v-if="r.training_status" class="rr-training" :class="r.training_status">
                  {{ r.training_status === 'completed' ? 'TRAINING DONE' : 'TRAINING ASSIGNED' }}
                </span>
                <span class="rr-lastseen">{{ formatDate(lastSeen(r)) }}</span>
                <span class="rr-open">Open ›</span>
              </div>
            </div>
          </div>
        </div>

        <div class="side-col">
          <div class="trend-card">
            <div class="trend-label">Campaign history on this simulation</div>
            <div v-if="loadingTrend" class="trend-empty">Loading…</div>
            <div v-else-if="trendCampaigns.length < 2" class="trend-empty">Only one campaign so far — a trend needs at least two.</div>
            <template v-else>
              <svg class="trend-svg" viewBox="0 0 260 130" preserveAspectRatio="none">
                <line x1="0" y1="10" x2="260" y2="10" class="trend-gridline" />
                <line x1="0" y1="65" x2="260" y2="65" class="trend-gridline" />
                <line x1="0" y1="120" x2="260" y2="120" class="trend-gridline" />
                <polyline :points="trendLine('clicked')" class="trend-line clicked" fill="none" />
                <polyline :points="trendLine('credential_entered')" class="trend-line creds" fill="none" />
                <circle v-for="(p, i) in trendPointCoords('clicked')" :key="'c'+i" :cx="p.x" :cy="p.y" r="2.5" class="trend-dot clicked" />
                <circle v-for="(p, i) in trendPointCoords('credential_entered')" :key="'r'+i" :cx="p.x" :cy="p.y" r="2.5" class="trend-dot creds" />
              </svg>
              <div class="trend-legend">
                <span><i class="dot clicked" /> Click rate</span>
                <span><i class="dot creds" /> Credential entry</span>
              </div>
              <div class="trend-dates">
                <span>{{ formatDateOnly(trendCampaigns[0].launched_at) }}</span>
                <span>{{ formatDateOnly(trendCampaigns[trendCampaigns.length - 1].launched_at) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <div v-if="previewOpen" class="overlay" @click.self="previewOpen = false">
      <div class="preview-modal">
        <PhishingEmailPreview
          mode="sent"
          :subject="campaign?.subject_sent ?? ''"
          :body-html="campaign?.body_html_sent ?? ''"
          :from-label="meta?.sending_identity ?? 'PathProof'"
          :to-label="firstRecipientLabel"
          :title="`Received by ${counts.sent} recipients on ${campaign ? formatDateOnly(campaign.launched_at) : ''}`"
          footer-note="Rendered from body_html_sent. Links are rewritten to the simulation host — no credential ever leaves PathProof in clear text."
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { usePanelStore } from '@/stores/panels'
import { worstOutcome, shortHash, formatDwell } from '@/data/phishingOutcomes'
import PhishingEmailPreview from '@/components/phishing/PhishingEmailPreview.vue'

const route = useRoute()
const auth = useAuthStore()
const isAdmin = computed(() => auth.role === 'admin')
const panels = usePanelStore()

const loading = ref(true)
const loadError = ref('')
const campaign = ref<any | null>(null)
const counts = ref<Record<string, number>>({
  sent: 0, opened: 0, clicked: 0, credential_entered: 0, reported: 0, training_assigned: 0, training_completed: 0,
})
const medianDwellSeconds = ref<number | null>(null)
const recipients = ref<any[]>([])
const meta = ref<any | null>(null)
const targetListLabel = ref('')
const primaryDomainName = ref('')
const dmarcShort = ref('')
const previewOpen = ref(false)
const emailAuthEvidence = ref<any | null>(null)
const landingPageLabel = ref<string | null>(null)
const engagementExpiry = ref<string | null>(null)
const departmentBreakdown = ref<{ department: string; sent: number; clicked: number; credential_entered: number }[]>([])
const isExpired = computed(() => engagementExpiry.value ? new Date(engagementExpiry.value).getTime() < Date.now() : false)
const expirySoon = computed(() => {
  if (!engagementExpiry.value || isExpired.value) return false
  return new Date(engagementExpiry.value).getTime() - Date.now() < 7 * 86400000
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const id = route.params.id as string
    const [c, ev, byRecipient, m] = await Promise.all([
      api.phishingCampaign(id),
      api.phishingCampaignEvents(id),
      api.phishingCampaignEventsByRecipient(id),
      api.phishingMeta().catch(() => null),
    ])
    campaign.value = c
    counts.value = ev
    medianDwellSeconds.value = ev.median_dwell_seconds ?? null
    recipients.value = byRecipient
    meta.value = m

    try {
      const lists = await api.phishingTargetLists()
      const tl = lists.find((l: any) => l.id === c.target_list_id)
      targetListLabel.value = tl ? `${tl.name} · ${tl.entries.length}` : 'Target list'
    } catch { targetListLabel.value = 'Target list' }

    try {
      const domains = await api.domains()
      const d = domains.find((x: any) => x.ownership_verified) ?? domains[0]
      if (d) {
        primaryDomainName.value = d.domain
        dmarcShort.value = `p=${d.dmarc_stage}`
      }
    } catch { /* non-fatal */ }

    try {
      const pages = await api.phishingLandingPages()
      landingPageLabel.value = pages.find((p: any) => p.id === c.landing_page_id)?.label ?? null
    } catch { landingPageLabel.value = null }

    // No single-engagement GET exists — the list is cheap and every other
    // real lookup on this page (target list, domains) already follows the
    // same fetch-all-then-find pattern.
    try {
      const engagements = await api.engagements()
      const eng = engagements.find((e: any) => e.id === c.engagement_id)
      engagementExpiry.value = eng?.expires_at ?? null
    } catch { engagementExpiry.value = null }

    try { departmentBreakdown.value = await api.phishingCampaignDepartmentBreakdown(id) } catch { departmentBreakdown.value = [] }

    loadTrend(c.engagement_id)
    try { emailAuthEvidence.value = await api.phishingCampaignEmailAuthEvidence(id) } catch { emailAuthEvidence.value = null }
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load campaign'
  } finally {
    loading.value = false
  }
}

// Real trend across this one engagement's own campaign history — not a
// placeholder chart, built from the same events endpoint the stat cards
// above already use, just once per sibling campaign.
const trendCampaigns = ref<any[]>([])
const trendCounts = ref<Record<string, any>>({})
const loadingTrend = ref(true)
async function loadTrend(engagementId: string) {
  loadingTrend.value = true
  try {
    const campaigns = await api.phishingCampaigns(engagementId)
    const chronological = campaigns.slice().reverse() // API returns newest-first
    trendCampaigns.value = chronological
    await Promise.all(chronological.map(async (c: any) => {
      trendCounts.value[c.id] = await api.phishingCampaignEvents(c.id)
    }))
  } catch { trendCampaigns.value = [] }
  finally { loadingTrend.value = false }
}

function trendPointCoords(eventType: string): { x: number; y: number }[] {
  const n = trendCampaigns.value.length
  if (n < 2) return []
  return trendCampaigns.value.map((c, i) => {
    const counts = trendCounts.value[c.id]
    const rate = counts?.sent ? (counts[eventType] ?? 0) / counts.sent : 0
    const x = (i / (n - 1)) * 260
    const y = 120 - rate * 110
    return { x, y }
  })
}
function trendLine(eventType: string): string {
  return trendPointCoords(eventType).map(p => `${p.x},${p.y}`).join(' ')
}

const exporting = ref(false)
async function exportCsv() {
  if (!campaign.value) return
  exporting.value = true
  try { await api.exportPhishingCampaignCsv(campaign.value.id) }
  finally { exporting.value = false }
}

function pct(n: number, denom: number): string {
  if (!denom) return '0%'
  return `${Math.round((n / denom) * 100)}%`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

const filters = [
  { key: 'all', label: 'All' },
  { key: 'credential_entered', label: 'Entered creds' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'opened', label: 'Opened only' },
  { key: 'reported', label: 'Reported' },
]
const filter = ref('all')
const filteredRecipients = computed(() => {
  if (filter.value === 'all') return recipients.value
  if (filter.value === 'opened') return recipients.value.filter(r => r.event_types.includes('opened') && !r.event_types.includes('clicked'))
  return recipients.value.filter(r => r.event_types.includes(filter.value))
})

function lastSeen(r: any): string {
  return r.events.length ? r.events[r.events.length - 1].occurred_at : ''
}

// Opens the recipient slide-over panel (Coverage Map plan phishing
// transformation, Phase 11) — a genuine drill from this list into one
// person's detail, so it earns a real breadcrumb entry via push(). The
// panel itself owns unmasking, the event timeline, and the cloud
// privilege check; this view only needs to hand it the recipient list,
// the starting index, and the campaign id.
function openRecipient(index: number) {
  if (!campaign.value) return
  panels.push({
    type: 'phishing-recipient',
    title: shortHash(filteredRecipients.value[index].recipient_hash),
    data: { recipients: filteredRecipients.value, index, campaignId: campaign.value.id, isAdmin: isAdmin.value },
  })
}

const firstRecipientLabel = computed(() => {
  const n = counts.value.sent
  if (recipients.value.length === 0) return `${n} recipients`
  return `${shortHash(recipients.value[0].recipient_hash)} (+${Math.max(0, n - 1)})`
})

onMounted(load)
</script>

<style scoped>
.campaign-view { display: flex; flex-direction: column; gap: 14px; max-width: 1240px; }
.head-actions { display: flex; gap: 8px; }
.layout-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 20px; align-items: start; }
@media (max-width: 900px) { .layout-grid { grid-template-columns: 1fr; } }
.main-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.side-col { position: sticky; top: 12px; }
.trend-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.trend-label { font-family: var(--font-label); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); margin-bottom: 12px; }
.trend-empty { font-size: 12px; color: var(--text3); line-height: 1.5; }
.trend-svg { width: 100%; height: 130px; }
.trend-gridline { stroke: var(--border); stroke-width: 1; }
.trend-line { stroke-width: 2; }
.trend-line.clicked { stroke: #ff7a2f; }
.trend-line.creds { stroke: var(--red); }
.trend-dot.clicked { fill: #ff7a2f; }
.trend-dot.creds { fill: var(--red); }
.trend-legend { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 11px; color: var(--text2); }
.trend-legend .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; }
.trend-legend .dot.clicked { background: #ff7a2f; }
.trend-legend .dot.creds { background: var(--red); }
.trend-dates { display: flex; justify-content: space-between; font-family: var(--font-label); font-size: 9.5px; color: var(--text3); margin-top: 8px; }
.loading, .empty { color: var(--text2); font-size: 13px; padding: 20px 0; }
.error-block { color: var(--red); font-size: 13px; }

.head-row { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.tier-chip { font-family: var(--font-label); font-size: 10px; font-weight: 700; color: var(--bg); background: var(--amber); padding: 3px 8px; border-radius: 5px; margin-right: 10px; }
.head-date { font-family: var(--font-label); font-size: 12px; color: var(--text2); }
.ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 12px; padding: 7px 12px; border-radius: 8px; cursor: pointer; }
.ghost-btn:hover { border-color: var(--accent); color: var(--accent); }

.subject-title { font-size: 24px; font-weight: 700; margin: 4px 0 2px; text-wrap: balance; }
.head-sub { font-size: 12.5px; color: var(--text2); margin: 0 0 6px; }
.head-sub b { color: var(--text); font-weight: 600; }
.ai-tag { font-family: var(--font-label); font-size: 9.5px; font-weight: 700; color: var(--accent); margin-left: 8px; }
.ai-tag.static { color: var(--text3); }
.expiry-note { font-size: 11.5px; color: var(--text3); margin: 0 0 6px; }
.expiry-note.warn { color: var(--amber); }
.expiry-note.crit { color: var(--red); }
.mono { font-family: var(--font-label); }

.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 8px 0; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.stat-card.crit { border-color: color-mix(in srgb, var(--red) 35%, var(--border)); background: color-mix(in srgb, var(--red) 6%, var(--surface)); }
.stat-card.good { border-color: color-mix(in srgb, var(--green) 35%, var(--border)); background: color-mix(in srgb, var(--green) 6%, var(--surface)); }
.stat-lbl { font-family: var(--font-label); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); margin-bottom: 6px; }
.stat-big { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-big.amber { color: var(--amber); }
.stat-big.orange { color: color-mix(in srgb, var(--amber) 60%, var(--red)); }
.stat-big.red { color: var(--red); }
.stat-big.green { color: var(--green); }
.stat-big.accent { color: var(--accent); }
.stat-sub { font-size: 11px; color: var(--text3); margin-top: 3px; }

.evidence-block { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.evidence-block.independent { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.evidence-block.independent .ev-label { color: var(--accent); }
.evidence-block.independent .ev-text b { color: var(--text); }
.ev-label { font-family: var(--font-label); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); margin-bottom: 9px; }
.ev-row { display: flex; align-items: flex-start; gap: 10px; }
.dmarc-pill { font-family: var(--font-label); font-size: 10.5px; font-weight: 700; color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); border: 1px solid color-mix(in srgb, var(--red) 40%, transparent); padding: 2px 8px; border-radius: 5px; flex-shrink: 0; }
.ev-text { font-size: 12.5px; color: var(--text2); line-height: 1.55; }
.ev-note { font-size: 11.5px; color: var(--text3); line-height: 1.5; margin: 8px 0 0; }
.ev-source { font-family: var(--font-label); font-size: 10.5px; color: var(--text3); margin-top: 8px; }
.ev-source a { color: var(--accent); text-decoration: none; }

.dept-block { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.dept-row { display: grid; grid-template-columns: 110px 1fr 44px; align-items: center; gap: 10px; }
.dept-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dept-bar-track { height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
.dept-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.dept-pct { font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
.dept-sub { grid-column: 1 / -1; font-size: 10.5px; color: var(--text3); margin-top: -4px; }

.recipients-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.recipients-head h2 { font-size: 14px; }
.muted { color: var(--text3); font-weight: 400; font-size: 11.5px; margin-left: 6px; }
.filter-tabs { display: flex; gap: 4px; }
.filter-tab { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 11px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
.filter-tab.active { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

.recipients-table { display: flex; flex-direction: column; gap: 6px; }
.recipient-row { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.rr-main { display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; flex-wrap: wrap; }
.rr-main:hover { background: var(--surface2); }
.rr-hash { font-size: 12px; color: var(--text2); flex-shrink: 0; }
.rr-outcome { font-family: var(--font-label); font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
.rr-outcome.crit { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.rr-outcome.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.rr-outcome.info { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.rr-outcome.muted { color: var(--text3); background: var(--surface2); }
.rr-outcome.good { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.rr-training { font-family: var(--font-label); font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: .02em; }
.rr-training.assigned { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.rr-training.completed { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.rr-lastseen { font-size: 11px; color: var(--text3); margin-left: auto; }
.rr-open { font-size: 11px; color: var(--text3); }
.rr-main:hover .rr-open { color: var(--accent); }

.overlay { position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.preview-modal { width: 620px; max-width: 92vw; max-height: 88vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
</style>
