<template>
  <div class="triage-page">
    <h1 class="title">Real-Threat Reports</h1>
    <p class="subtitle">Real suspicious emails employees forwarded in — not the simulation. Triage and dispose of each one.</p>

    <div class="card address-card">
      <div class="address-row">
        <div>
          <span class="label">Forward suspicious emails here</span>
          <div class="address-value mono">{{ meta?.report_suspicious_email_address || '…' }}</div>
        </div>
        <button class="ghost-btn" @click="copyAddress">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
      </div>
      <p class="hint">Share this with your team — anyone can forward a suspicious email here and it appears below within a few minutes.</p>
    </div>

    <div class="filter-row">
      <button v-for="f in filters" :key="f.value" class="filter-btn" :class="{ active: dispositionFilter === f.value }" @click="setFilter(f.value)">{{ f.label }}</button>
    </div>

    <p v-if="loadError" class="error">{{ loadError }}</p>
    <div v-if="!loading && reports.length === 0" class="empty">Nothing reported yet in this view.</div>

    <div class="report-list">
      <div v-for="r in reports" :key="r.id" class="report-card">
        <div class="report-head" @click="toggleExpand(r.id)">
          <div class="rh-main">
            <span class="rh-subject">{{ r.original_subject || '(no subject)' }}</span>
            <span class="rh-from">from <span class="mono">{{ r.original_from || 'unknown' }}</span><template v-if="!r.is_original_message_attached"> — forwarded inline, not verified</template></span>
          </div>
          <div class="rh-signals">
            <span v-if="worstRiskVerdict(r)" class="risk-pill" :style="pillStyle(riskVerdictColor(worstRiskVerdict(r)!))">{{ riskLabel(worstRiskVerdict(r)!) }} link{{ r.urls_found.length > 1 ? 's' : '' }}</span>
            <span v-if="r.spf_result" class="auth-pill" :style="authPillStyle(r.spf_result)">SPF {{ r.spf_result }}</span>
            <span v-if="r.dkim_result" class="auth-pill" :style="authPillStyle(r.dkim_result)">DKIM {{ r.dkim_result }}</span>
            <span v-if="r.dmarc_result" class="auth-pill" :style="authPillStyle(r.dmarc_result)">DMARC {{ r.dmarc_result }}</span>
            <span class="disp-pill" :style="dispositionStyle(r.disposition)">{{ dispositionLabel(r.disposition) }}</span>
          </div>
        </div>

        <div v-if="expandedId === r.id" class="report-detail">
          <div class="detail-grid">
            <div><span class="dk">Received</span><span class="dv">{{ formatDate(r.received_at) }}</span></div>
            <div><span class="dk">Claimed sender domain</span><span class="dv">{{ r.original_from_domain || '—' }}</span></div>
            <div><span class="dk">Original date</span><span class="dv">{{ r.original_date ? formatDate(r.original_date) : '—' }}</span></div>
            <div><span class="dk">Reporter</span>
              <span class="dv">
                <template v-if="unmaskedEmails[r.id]">{{ unmaskedEmails[r.id] }}</template>
                <template v-else-if="isAdmin">
                  <span class="mono">{{ r.reporter_hash ? r.reporter_hash.slice(0, 12) + '…' : 'unknown' }}</span>
                  <button class="link-btn small" @click="unmask(r.id)">{{ unmasking === r.id ? '…' : 'Unmask' }}</button>
                </template>
                <template v-else><span class="mono">{{ r.reporter_hash ? r.reporter_hash.slice(0, 12) + '…' : 'unknown' }}</span></template>
              </span>
            </div>
          </div>

          <p v-if="!r.is_original_message_attached" class="honesty-note">This was a plain "Forward" — the original message wasn't attached as its own file, so the sender/date/headers above describe the forwarding email itself, not necessarily the real original. Ask the reporter to use "Forward as attachment" for full evidence next time.</p>

          <div v-if="r.body_text_excerpt" class="body-excerpt">
            <span class="dk">Body excerpt (plain text only, HTML stripped)</span>
            <p>{{ r.body_text_excerpt }}</p>
          </div>

          <div v-if="r.urls_found?.length" class="url-list">
            <div class="url-list-head">
              <span class="dk">URLs found ({{ r.urls_found.length }})</span>
              <button class="link-btn small" @click="rescanLinks(r)">
                {{ rescanning === r.id ? 'Scanning…' : (r.url_risk ? 'Re-scan links' : 'Scan links') }}
              </button>
            </div>
            <p v-if="r.url_risk_scored_at" class="scored-at">Last checked {{ formatDate(r.url_risk_scored_at) }}</p>
            <div v-for="u in r.urls_found" :key="u" class="url-row">
              <span class="mono url-text">{{ u }}</span>
              <template v-if="riskFor(r, u)">
                <span class="risk-pill" :style="pillStyle(riskVerdictColor(riskFor(r, u).verdict))">{{ riskLabel(riskFor(r, u).verdict) }}</span>
                <p class="risk-explanation">{{ riskFor(r, u).explanation }}</p>
              </template>
            </div>
            <p v-if="rescanError[r.id]" class="error">{{ rescanError[r.id] }}</p>
          </div>

          <div v-if="r.auth_results_raw" class="raw-auth">
            <span class="dk">Raw Authentication-Results header</span>
            <div class="mono raw-text">{{ r.auth_results_raw }}</div>
          </div>

          <div class="disposition-row">
            <span class="dk">Disposition</span>
            <div class="disp-options">
              <button v-for="d in dispositionOptions" :key="d" class="disp-btn" :class="{ active: r.disposition === d }" :style="r.disposition === d ? dispositionStyle(d) : undefined" @click="setDisposition(r, d)">{{ dispositionLabel(d) }}</button>
            </div>
            <input v-model="noteDrafts[r.id]" class="input note-input" placeholder="Optional note for the record" @change="setNote(r)" />
          </div>
          <p v-if="dispositionError[r.id]" class="error">{{ dispositionError[r.id] }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { COLORS, pillStyle, riskVerdictColor } from '@/data/colors'

const auth = useAuthStore()
const isAdmin = computed(() => auth.role === 'admin')

const meta = ref<any | null>(null)
const copied = ref(false)
async function loadMeta() {
  try { meta.value = await api.phishingMeta() } catch { /* address just stays blank */ }
}
async function copyAddress() {
  if (!meta.value?.report_suspicious_email_address) return
  try {
    await navigator.clipboard.writeText(meta.value.report_suspicious_email_address)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* clipboard API unavailable — silently do nothing */ }
}

const filters = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'confirmed_malicious', label: 'Confirmed malicious' },
  { value: 'false_positive', label: 'False positive' },
  { value: 'already_known', label: 'Already known' },
]
const dispositionFilter = ref('')
const reports = ref<any[]>([])
const loading = ref(false)
const loadError = ref('')

async function loadReports() {
  loading.value = true
  loadError.value = ''
  try { reports.value = await api.reportedEmails(dispositionFilter.value || undefined) }
  catch (e: any) { loadError.value = e.message ?? 'Failed to load reports' }
  finally { loading.value = false }
}
function setFilter(v: string) {
  dispositionFilter.value = v
  loadReports()
}

const expandedId = ref<string | null>(null)
function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

const dispositionOptions = ['new', 'confirmed_malicious', 'false_positive', 'already_known']
function dispositionLabel(d: string): string {
  return { new: 'New', confirmed_malicious: 'Confirmed malicious', false_positive: 'False positive', already_known: 'Already known' }[d] ?? d
}
function dispositionStyle(d: string): string {
  const color = d === 'confirmed_malicious' ? COLORS.red : d === 'false_positive' ? COLORS.green : d === 'already_known' ? COLORS.accent : COLORS.amber
  return pillStyle(color)
}
function authPillStyle(result: string): string {
  const good = ['pass'].includes(result.toLowerCase())
  const bad = ['fail'].includes(result.toLowerCase())
  return pillStyle(good ? COLORS.green : bad ? COLORS.red : COLORS.amber)
}

// Verdict rank for "worst wins" — a report with even one likely_dangerous
// link should read as dangerous, not diluted by other clean links.
const VERDICT_RANK: Record<string, number> = { likely_safe: 0, uncertain: 1, likely_dangerous: 2 }
function riskFor(r: any, url: string): any {
  return (r.url_risk || []).find((e: any) => e.url === url) || null
}
function riskLabel(v: string): string {
  return ({ likely_safe: 'No known risk', uncertain: 'Uncertain', likely_dangerous: 'Likely dangerous' } as Record<string, string>)[v] ?? v
}
function worstRiskVerdict(r: any): string | null {
  const entries: any[] = r.url_risk || []
  if (!entries.length) return null
  return entries.reduce((worst: string, e: any) => (VERDICT_RANK[e.verdict] ?? -1) > (VERDICT_RANK[worst] ?? -1) ? e.verdict : worst, entries[0].verdict)
}

const rescanning = ref<string | null>(null)
const rescanError = ref<Record<string, string>>({})
async function rescanLinks(r: any) {
  rescanning.value = r.id
  delete rescanError.value[r.id]
  try {
    const updated = await api.rescanReportedEmailLinks(r.id)
    r.url_risk = updated.url_risk
    r.url_risk_scored_at = updated.url_risk_scored_at
  } catch (e: any) {
    rescanError.value[r.id] = e.message ?? 'Failed to re-scan links'
  } finally {
    rescanning.value = null
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

const dispositionError = ref<Record<string, string>>({})
async function setDisposition(r: any, disposition: string) {
  delete dispositionError.value[r.id]
  try {
    const updated = await api.updateReportedEmailDisposition(r.id, disposition, noteDrafts.value[r.id])
    r.disposition = updated.disposition
    r.disposition_note = updated.disposition_note
  } catch (e: any) {
    dispositionError.value[r.id] = e.message ?? 'Failed to update disposition'
  }
}
const noteDrafts = ref<Record<string, string>>({})
async function setNote(r: any) {
  if (r.disposition_note === noteDrafts.value[r.id]) return
  await setDisposition(r, r.disposition)
}

const unmasking = ref<string | null>(null)
const unmaskedEmails = ref<Record<string, string>>({})
async function unmask(id: string) {
  unmasking.value = id
  try {
    const result = await api.unmaskReportedEmailReporter(id)
    unmaskedEmails.value[id] = result.email
  } catch { /* 404 (no match) or 403 — leave the hash shown, no fabricated identity */ }
  finally { unmasking.value = null }
}

onMounted(() => {
  loadMeta()
  loadReports()
})
</script>

<style scoped>
.triage-page { display: flex; flex-direction: column; gap: 16px; max-width: 880px; }
.title { margin: 4px 0 2px; font-size: 24px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 13px; }
.error { color: var(--red); font-size: 12px; margin: 4px 0; }
.empty { color: var(--text2); font-size: 13px; padding: 10px 0; }
.hint { margin: 8px 0 0; font-size: 11.5px; color: var(--text3); line-height: 1.5; }
.mono { font-family: var(--font-mono); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; }
.address-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.label { display: block; font-family: var(--font-label); font-size: 10px; letter-spacing: .03em; color: var(--text3); text-transform: uppercase; margin-bottom: 4px; }
.address-value { font-size: 15px; font-weight: 600; color: var(--accent); }
.ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 11.5px; padding: 6px 12px; border-radius: 7px; cursor: pointer; }
.ghost-btn:hover { border-color: var(--accent); color: var(--accent); }

.filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 11.5px; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
.filter-btn.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

.report-list { display: flex; flex-direction: column; gap: 8px; }
.report-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.report-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; cursor: pointer; }
.report-head:hover { background: var(--surface2); }
.rh-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rh-subject { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rh-from { font-size: 11.5px; color: var(--text3); }
.rh-signals { display: flex; gap: 6px; flex-shrink: 0; }
.auth-pill, .disp-pill { font-size: 9.5px; }

.report-detail { padding: 14px 16px 18px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 14px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; }
.dk { display: block; font-family: var(--font-label); font-size: 9.5px; letter-spacing: .03em; color: var(--text3); text-transform: uppercase; margin-bottom: 3px; }
.dv { font-size: 12.5px; color: var(--text); display: flex; align-items: center; gap: 8px; }
.link-btn.small { color: var(--accent); font-size: 11px; background: none; border: none; cursor: pointer; padding: 0; }
.honesty-note { font-size: 11.5px; color: var(--amber, #d6a54a); background: color-mix(in srgb, var(--amber, #d6a54a) 10%, transparent); border-left: 2px solid var(--amber, #d6a54a); padding: 8px 10px; border-radius: 0 6px 6px 0; margin: 0; line-height: 1.5; }
.body-excerpt p { font-size: 12px; color: var(--text2); line-height: 1.6; white-space: pre-wrap; margin: 0; max-height: 200px; overflow-y: auto; background: var(--surface2); border-radius: 7px; padding: 10px 12px; }
.url-list { display: flex; flex-direction: column; gap: 3px; }
.url-list-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.scored-at { font-size: 10.5px; color: var(--text3); margin: 0 0 4px; }
.url-row { font-size: 11.5px; color: var(--text2); word-break: break-all; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; margin-bottom: 6px; }
.url-row .url-text { word-break: break-all; }
.risk-pill { font-size: 9.5px; }
.risk-explanation { font-size: 11px; color: var(--text3); margin: 0; line-height: 1.4; }
.raw-text { font-size: 10.5px; color: var(--text3); background: var(--surface2); border-radius: 7px; padding: 8px 10px; word-break: break-all; }

.disposition-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.disp-options { display: flex; gap: 6px; flex-wrap: wrap; }
.disp-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 11px; padding: 6px 11px; border-radius: 7px; cursor: pointer; }
.disp-btn.active { border-width: 1px; font-weight: 600; }
.note-input { flex: 1; min-width: 180px; }
.input { background: var(--surface2); border: 1px solid var(--border); border-radius: 7px; color: var(--text); font-size: 12px; padding: 6px 10px; }
.input:focus { outline: none; border-color: var(--accent); }
</style>
