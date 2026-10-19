<template>
  <div>
    <div class="header-row">
      <div>
        <h1 class="title">Detection Coverage Map</h1>
        <p class="subtitle">Every module we correlate into the attack graph, and exactly how far each one is built out.</p>
      </div>
      <div class="report-btn" :class="{ busy: reportDownloading }" @click="downloadReport">
        {{ reportDownloading ? 'Generating…' : 'Download Report' }}
      </div>
    </div>
    <p v-if="reportError" class="error-note">{{ reportError }}</p>

    <div class="stats-row">
      <div v-for="s in lineupStats" :key="s.label" class="stat-box">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <p v-if="actionError" class="error-note">{{ actionError }}</p>

    <div class="lineup">
      <div v-for="f in lineup" :key="f.feature" class="lineup-card">
        <div class="lineup-row" @click="onRowClick(f.feature)">
          <div class="category-pill" :style="{ color: posColor(f.pos), borderColor: posColor(f.pos), background: `color-mix(in srgb, ${posColor(f.pos)} 14%, transparent)` }">
            {{ CATEGORY_LABEL[f.pos] }}
          </div>
          <div class="lineup-main">
            <div class="lineup-feature">{{ f.feature }}</div>
            <div class="lineup-desc">{{ f.desc }}</div>
            <div class="lineup-last">{{ f.lastRunText }}</div>
          </div>
          <div class="status-pill" :style="{ color: statusColor(f.kind), borderColor: statusColor(f.kind), background: `color-mix(in srgb, ${statusColor(f.kind)} 16%, transparent)` }">
            {{ statusLabel(f.kind) }}
          </div>
          <div
            class="run-btn"
            :class="{ running: f.running }"
            :style="runButtonStyle(f)"
            @click.stop="runFeature(f)"
          >
            {{ f.runButtonText }}
          </div>
        </div>
      </div>
    </div>

    <div class="bench-card">
      <div class="bench-title">Planned — with a specific trigger to build</div>
      <div v-for="b in BENCH" :key="b.name" class="bench-row">
        <div class="bench-name">{{ b.name }}</div>
        <div class="bench-trigger">{{ b.trigger }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import {
  STARTING_XI, BENCH, CATEGORY_LABEL, statusKind, statusLabel,
  type StatusKind,
} from '@/data/roster'
import { usePanelStore } from '@/stores/panels'

const router = useRouter()
const panels = usePanelStore()
const cloudConnectionId = ref<string | null>(null)
const cloudEngagementActive = ref(false)
// Real bugs found live (2026-09-24): (1) this used to be
// `engagements.some(e => e.status === 'active')` — ANY tier, not
// specifically this connection's own — so a tenant with, say, an active
// cloud engagement but a still-draft host engagement would incorrectly
// read as scan-ready, only to have the actual rescan call 400 with an
// unexplained "Engagement is not active". (2) hostConnectionId picked the
// FIRST connected host silently — with 2+ hosts connected, "Run Scan" had
// no visible indication of which one it was about to hit. Both fixed by
// reading each connection's own real engagement_status (new field, see
// HostConnectionOut/CloudConnectionOut) and, for hosts, scanning every
// ready connection instead of guessing at one.
interface HostTarget { id: string; hostname: string }
const hostReadyConnections = ref<HostTarget[]>([])
const hostBlockedConnections = ref<(HostTarget & { engagementStatus: string | null })[]>([])
const oauthConnectionId = ref<string | null>(null)
const actionError = ref('')
const moduleRuns = ref<Record<string, { status: 'running' | 'done' | 'error' }>>({})
const reportDownloading = ref(false)
const reportError = ref('')

async function downloadReport() {
  if (reportDownloading.value) return
  reportDownloading.value = true
  reportError.value = ''
  try {
    await api.downloadCommandReportPdf()
  } catch (e: any) {
    reportError.value = e.message?.includes('feature_not_available')
      ? 'Downloadable reports require the Starter plan or above — upgrade to unlock this.'
      : (e.message ?? 'Report generation failed')
  } finally {
    reportDownloading.value = false
  }
}

// One active engagement per tier — the real data source drill-down reads
// from (Finding rows / CloudPrivEscPath rows), not just a connected/active
// boolean. Rebuilt whenever engagements are (re)loaded.
const engagementsByTier = ref<Record<string, any>>({})
// engagementsByTier collapses to one engagement per tier, which is wrong
// for phishing — a tenant can have several active phishing engagements
// (one per target list/template combination) at once. Kept separately so
// the Phishing Simulation drill can pull campaigns from all of them.
const activePhishingEngagements = ref<any[]>([])

// Coverage Map roadmap Phase 35 — features whose real results now live on
// a dedicated page instead of the feature-drill side panel. Group A is the
// Finding-backed features that stay on the (tier-filtered) Findings page —
// Host & Server Security spans both AWS EC2 (Inspector2, resource-scoped)
// and SSH-connected hosts via Lynis (a separate HostConnection, never a
// CloudAsset), so it can't honestly live inside the AWS-account-scoped
// Resource Explorer below without losing the Lynis half; External Exposure
// & DNS Hygiene isn't AWS-resource-scoped at all. Cloud Misconfiguration
// Defense and Identity & Credential Hygiene are both purely
// CloudAccountConnection-scoped, so Phase 38 makes the Resource Explorer
// their primary destination instead (user-confirmed).
const GROUP_A_FEATURES = new Set([
  'Host & Server Security', 'External Exposure & DNS Hygiene',
])
const RESOURCE_EXPLORER_FEATURES = new Set([
  'Cloud Misconfiguration Defense', 'Identity & Credential Hygiene',
])

// FindingsView.vue now loads tenant-wide (GET /findings, no engagement
// selection at all) — `engagement` used to be required to pick which
// engagement's findings to show; it's dropped here since passing it is now
// inert. `tier` still scopes the view, and now correctly covers every
// engagement of that tier (not just whichever one engagementsByTier's own
// per-tier collapsing happened to keep — a related, narrower version of
// the same "only tracks one connection" bug class fixed today elsewhere,
// not addressed here since this link only needs a tier, not one specific
// engagement id, to work correctly).
function findingsRouteFor(feature: string): { name: string; query: Record<string, string> } | null {
  if (feature === 'Host & Server Security') return { name: 'findings', query: { tier: 'host' } }
  if (feature === 'External Exposure & DNS Hygiene') return { name: 'findings', query: {} }
  const tierValue = feature === 'Cloud Misconfiguration Defense' ? 'cloud-misconfig' : 'credential'
  return { name: 'findings', query: { tier: tierValue } }
}

function resourceExplorerRouteFor(): { name: string; query: Record<string, string> } | null {
  return cloudConnectionId.value ? { name: 'cloud-resources', query: { connection: cloudConnectionId.value } } : null
}

// Row click (not the action button) used to always open the feature-drill
// side panel; Group A features (and, as later Phase 35 sub-phases land,
// Detection Coverage / OAuth App Risk / Simulate-the-Fix) now navigate to
// a real page instead. Anything not yet converted still falls through to
// the existing drill panel.
function onRowClick(feature: string) {
  if (RESOURCE_EXPLORER_FEATURES.has(feature)) {
    const link = resourceExplorerRouteFor()
    if (link) router.push(link)
    else actionError.value = `No connected AWS account yet for "${feature}" — connect one under Settings first.`
    return
  }
  if (GROUP_A_FEATURES.has(feature)) {
    const link = findingsRouteFor(feature)
    if (link) router.push(link)
    else actionError.value = `No active engagement yet for "${feature}" — connect and activate it under Settings first.`
    return
  }
  if (feature === 'Detection Coverage') { router.push({ name: 'detection-coverage' }); return }
  if (feature === 'Third-Party OAuth App Risk') { router.push({ name: 'oauth-app-risk' }); return }
  if (feature === 'Simulate-the-Fix') { router.push({ name: 'graph-simulate' }); return }
  if (feature === 'Email Authentication Defense') { router.push({ name: 'email-auth-defense' }); return }
  openFeatureDrill(feature)
}

function posColor(pos: string): string {
  return { GK: 'var(--green)', DEF: 'var(--accent)', MID: 'var(--violet)', FWD: 'var(--amber)' }[pos] ?? 'var(--accent)'
}
function statusColor(kind: StatusKind): string {
  return { 'not-started': 'oklch(0.55 0.02 250)', partial: 'var(--amber)', done: 'var(--green)' }[kind]
}

const lineup = computed(() => STARTING_XI.map(f => {
  const kind = statusKind(f.status)
  const run = moduleRuns.value[f.feature]
  const running = run?.status === 'running'
  const actionLabel = f.pos === 'FWD' && f.feature === 'Phishing Simulation' ? 'Launch Campaign' : 'Run Scan'
  const runButtonText = running ? (scanProgressLabel.value[f.feature] ?? 'Running…') : (run?.status === 'done' ? 'Run Again' : actionLabel)
  return {
    ...f,
    kind,
    running,
    runButtonText,
    lastRunText: run?.status === 'done' ? 'Last run just now' : (kind === 'not-started' ? 'Preview mode — synthetic data' : ''),
  }
}))

function runButtonStyle(f: { running: boolean }) {
  return {
    padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
    whiteSpace: 'nowrap' as const, flexShrink: 0, cursor: f.running ? 'default' : 'pointer',
    background: f.running ? 'var(--surface2)' : 'color-mix(in srgb, var(--accent) 16%, transparent)',
    color: f.running ? 'var(--text2)' : 'var(--accent)',
    border: `1px solid ${f.running ? 'var(--border)' : 'var(--accent)'}`,
  }
}

const doneCount = computed(() => lineup.value.filter(f => f.kind === 'done').length)
const partialCount = computed(() => lineup.value.filter(f => f.kind === 'partial').length)
const lineupStats = computed(() => [
  { label: 'Live', value: doneCount.value },
  { label: 'In Progress', value: partialCount.value },
  { label: 'Not Started', value: lineup.value.length - doneCount.value - partialCount.value },
])

async function runFeature(f: { feature: string; running: boolean }) {
  if (f.running) return
  actionError.value = ''

  // Pure navigation to the real, already-built page for this feature —
  // no fake "running" animation, since nothing here is actually a scan
  // the button itself triggers.
  if (f.feature === 'IAM Privilege-Escalation Graph') {
    router.push({ name: 'graph' })
    return
  }
  if (f.feature === 'Simulate-the-Fix') {
    router.push({ name: 'graph-simulate' })
    return
  }
  if (f.feature === 'Phishing Simulation') {
    router.push({ name: 'phishing' })
    return
  }
  if (f.feature === 'MSP Portfolio Rollup') {
    router.push({ name: 'portal' })
    return
  }

  // Connecting an M365 tenant still lives under Settings (same pattern as
  // Cloud/Host connections) — navigate there when there's no connection
  // yet. Once one exists, trigger the real scan then land on the
  // dedicated risk-analysis page (Coverage Map roadmap Phase 35c).
  if (f.feature === 'Third-Party OAuth App Risk') {
    if (!oauthConnectionId.value) {
      router.push({ name: 'settings' })
      return
    }
    moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'running' } }
    try {
      await api.scanOAuthAppConnection(oauthConnectionId.value)
    } catch (e: any) {
      actionError.value = e.message ?? 'OAuth risk scan failed'
    } finally {
      moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'done' } }
    }
    router.push({ name: 'oauth-app-risk' })
    return
  }

  // DMARC/SPF/MTA-STS is continuously monitored via IMAP report ingestion
  // in Zoneproof (Sentinel V1), not an on-demand scan — no "run now" to
  // call, but it still has a real dedicated page (Coverage Map roadmap
  // Phase 35e) pulling that live posture data.
  if (f.feature === 'Email Authentication Defense') {
    router.push({ name: 'email-auth-defense' })
    return
  }

  // Detection Coverage is a real-time correlation over data already
  // collected (Prowler's CloudTrail/GuardDuty findings + the priv-esc
  // graph), not a scan of its own — "Run Scan" here just navigates to its
  // real dedicated page (Coverage Map roadmap Phase 35b).
  if (f.feature === 'Detection Coverage') {
    router.push({ name: 'detection-coverage' })
    return
  }

  moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'running' } }

  if (f.feature === 'External Exposure & DNS Hygiene') {
    try {
      const domains = await api.domains()
      const domain = domains.find((d: any) => d.ownership_verified) ?? domains[0]
      if (!domain) {
        actionError.value = 'No domain connected yet — add and verify one in Sentinel V1 first.'
        moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'error' } }
        return
      }
      await api.runExposureScan(domain.id)
    } catch (e: any) {
      actionError.value = e.message ?? 'Scan failed'
    } finally {
      moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'done' } }
    }
    const link = findingsRouteFor(f.feature)
    if (link) router.push(link)
    return
  }

  if (f.feature === 'Cloud Misconfiguration Defense' || f.feature === 'Identity & Credential Hygiene') {
    // Both run inside the same rescan_connection() pass sequence — Identity
    // & Credential Hygiene's MFA/password-audit half is the 4th pass
    // (Prowler/Cloudsplaining/Inspector/credential), same connection, same
    // real scan, just a different Finding.tier filtering the results.
    if (!cloudConnectionId.value || !cloudEngagementActive.value) {
      actionError.value = 'Connect and activate an AWS account under Settings first.'
      moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'error' } }
      return
    }
    pollScanProgress(f.feature, 'cloud', cloudConnectionId.value)
    try {
      const result = await api.rescanCloudConnection(cloudConnectionId.value)
      if (result.last_scan_status === 'failed') actionError.value = result.last_scan_error ?? 'Scan failed'
    } catch (e: any) {
      actionError.value = e.message ?? 'Scan failed'
    } finally {
      moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'done' } }
    }
    const link = resourceExplorerRouteFor()
    if (link) router.push(link)
    return
  }

  if (f.feature === 'Host & Server Security') {
    if (hostReadyConnections.value.length === 0) {
      // A connected-but-not-yet-authorized host gets a specific, actionable
      // message (real data: hostBlockedConnections, computed from each
      // connection's own engagement_status) rather than the same generic
      // "connect a host" text whether nothing exists or something is just
      // stuck waiting on a signature.
      actionError.value = hostBlockedConnections.value.length > 0
        ? `${hostBlockedConnections.value.map(c => c.hostname).join(', ')} ${hostBlockedConnections.value.length === 1 ? 'is' : 'are'} connected but not yet authorized — resume authorization under Settings.`
        : 'Connect and activate a host under Settings first.'
      moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'error' } }
      return
    }
    // Scans every ready host, not just the first found — real bug fixed
    // live: with 2+ connected hosts, "Run Scan" silently picked one with no
    // way to know which. Sequential (not Promise.all) so the progress label
    // can name exactly which host is running right now.
    const failures: string[] = []
    for (const [i, target] of hostReadyConnections.value.entries()) {
      const prefix = hostReadyConnections.value.length > 1
        ? `${target.hostname} (${i + 1}/${hostReadyConnections.value.length}): ` : `${target.hostname}: `
      pollScanProgress(f.feature, 'host', target.id, prefix)
      try {
        const result = await api.rescanHostConnection(target.id)
        if (result.last_scan_status === 'failed') failures.push(`${target.hostname}: ${result.last_scan_error ?? 'scan failed'}`)
      } catch (e: any) {
        failures.push(`${target.hostname}: ${e.message ?? 'scan failed'}`)
      }
    }
    if (failures.length) actionError.value = failures.join(' · ')
    moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'done' } }
    const link = findingsRouteFor(f.feature)
    if (link) router.push(link)
    return
  }

  // Every lineup feature above is handled explicitly — either a real call,
  // a real navigation, or an honest "no trigger exists" message. Reaching
  // here means a new roster entry was added without a matching branch;
  // fail honestly rather than silently fabricating a result.
  actionError.value = `No real handler wired for "${f.feature}" yet.`
  moduleRuns.value = { ...moduleRuns.value, [f.feature]: { status: 'error' } }
}

// ── Scan progress transparency: a real Prowler/Cloudsplaining/Inspector or
// Lynis pass takes minutes (measured against a real AWS account) — poll the
// connection every few seconds while "running" and surface which pass is
// actually active + elapsed time, instead of a static "Running…" label that
// looks identical whether the scan is progressing or silently stuck (this is
// what made the Phase 0 engagement bug look like "nothing happens").
const PASS_LABELS: Record<string, string> = { prowler: 'Prowler', cloudsplaining: 'Cloudsplaining', inspector: 'Inspector', lynis: 'Lynis', credential: 'Credential Hygiene', breach_monitoring: 'Breach Monitoring' }
const scanProgressLabel = ref<Record<string, string>>({})

function formatElapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const mins = Math.floor(secs / 60)
  return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`
}

// Tracks which connection the currently-running poller for a feature is
// actually watching — lets a multi-host scan (Host & Server Security) move
// the poller from one host to the next without two concurrent pollers both
// writing the same feature's progress label (a real race otherwise, since
// moduleRuns' "running" status spans the whole multi-host loop, not just
// one host's scan).
const activePollTarget = ref<Record<string, string>>({})

async function pollScanProgress(feature: string, kind: 'cloud' | 'host', connectionId: string, labelPrefix = '') {
  const startedAt = Date.now()
  activePollTarget.value = { ...activePollTarget.value, [feature]: connectionId }
  while (moduleRuns.value[feature]?.status === 'running' && activePollTarget.value[feature] === connectionId) {
    try {
      const list = kind === 'cloud' ? await api.cloudConnections() : await api.hostConnections()
      const conn = list.find((c: any) => c.id === connectionId)
      const status: string = conn?.last_scan_status ?? ''
      const pass = status.startsWith('running:') ? PASS_LABELS[status.slice(8)] ?? status.slice(8) : null
      scanProgressLabel.value = {
        ...scanProgressLabel.value,
        [feature]: `${labelPrefix}${pass ? `Running ${pass}…` : 'Running…'} (${formatElapsed(startedAt)})`,
      }
    } catch {
      // Poll failures are non-fatal — keep the last known label rather than blanking it.
    }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  const next = { ...scanProgressLabel.value }
  delete next[feature]
  scanProgressLabel.value = next
}

function gradeToSeverity(grade: string): string {
  return { A: 'low', B: 'low', C: 'medium', D: 'high', F: 'critical' }[grade] ?? 'medium'
}

function parseDetail(message: string): { code?: string; message?: string } | null {
  try {
    const parsed = JSON.parse(message)
    return typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

async function openFeatureDrill(feature: string) {
  // A reactive object, not a plain snapshot — pushed onto the panel stack
  // immediately (so the panel opens showing "Loading…"), then mutated in
  // place as the real data arrives. FeatureDrillEvidence.vue receives this
  // same object by reference, so its render updates automatically.
  const state = reactive({
    loading: true, error: '', items: [] as any[],
  })
  panels.push({ type: 'feature-drill', title: feature, data: state })

  try {
    if (feature === 'IAM Privilege-Escalation Graph') {
      const eng = engagementsByTier.value['cloud']
      if (!eng) { state.error = 'No active AWS engagement yet — connect and activate an AWS account under Settings.'; return }
      const paths = await api.privEscPaths(eng.id)
      state.items = paths.map((p: any) => ({
        id: p.id, severity: p.severity,
        title: `${p.source_principal_arn} → ${p.target_principal_arn}`,
        detail: (p.technique_chain || []).join(' → '),
        time: relativeTime(p.discovered_at),
        _type: 'iam-path', _raw: p,
      }))
    } else if (feature === 'Phishing Simulation') {
      if (activePhishingEngagements.value.length === 0) {
        state.error = 'No active phishing engagement yet — launch a Human Simulation to populate this.'
        return
      }
      // One aggregate call, pre-joined with event counts (Phishing
      // Simulation roadmap Phase 29b) — replaces a phishingCampaigns()
      // call per active engagement plus a phishingCampaignEvents() call
      // per campaign with a single tenant-wide fetch, filtered client-side
      // to this screen's active engagements.
      const activeEngagementIds = new Set(activePhishingEngagements.value.map((eng: any) => eng.id))
      const summary = await api.phishingCampaignsSummary().catch(() => [])
      const campaigns = summary
        .filter((c: any) => activeEngagementIds.has(c.engagement_id))
        .sort((a: any, b: any) => new Date(b.launched_at).getTime() - new Date(a.launched_at).getTime())
        .slice(0, 10)
      if (campaigns.length === 0) {
        state.error = 'No campaigns launched yet — use "Launch Campaign" to send the first one.'
        return
      }
      state.items = campaigns.map((c: any) => {
        const sent = c.sent ?? 0, opened = c.opened ?? 0, clicked = c.clicked ?? 0, creds = c.credential_entered ?? 0
        const severity = creds > 0 ? 'critical' : clicked > 0 ? 'high' : opened > 0 ? 'medium' : 'low'
        return {
          id: c.id, severity,
          title: c.subject_sent || c.template_id,
          detail: `${sent} sent · ${opened} opened · ${clicked} clicked · ${creds} credential${creds === 1 ? '' : 's'} entered`,
          time: relativeTime(c.launched_at),
          _type: 'phishing-campaign', _raw: c,
        }
      })
    } else if (feature === 'MSP Portfolio Rollup') {
      try {
        const clients = await api.mspClients()
        if (clients.length === 0) {
          state.error = 'No client tenants yet — add your first one under Multi-Tenant Portfolio.'
          return
        }
        state.items = clients.map((c: any) => ({
          id: c.id, severity: gradeToSeverity(c.sentinel_grade),
          title: c.name,
          detail: `${c.sentinel_score}/100 (${c.sentinel_grade}) · ${c.domain_count} domain${c.domain_count === 1 ? '' : 's'}`,
          time: relativeTime(c.created_at),
          _type: 'score-breakdown', _raw: c,
        }))
      } catch (e: any) {
        const parsed = parseDetail(e.message)
        state.error = parsed?.code === 'msp_plan_required'
          ? (parsed.message ?? 'Multi-Tenant Portfolio requires the MSP or Enterprise plan.')
          : (parsed?.message ?? e.message ?? 'Could not load clients.')
      }
    } else {
      state.error = 'No drill-down data available for this module yet.'
    }
  } catch (e: any) {
    state.error = e.message ?? 'Could not load results.'
  } finally {
    state.loading = false
  }
}

onMounted(async () => {
  try {
    const [connections, engagements, hostConnections, oauthConnections] = await Promise.all([
      api.cloudConnections(), api.engagements(), api.hostConnections(), api.oauthAppConnections(),
    ])
    const connectedCloud = connections.find((c: any) => c.status === 'connected')
    cloudConnectionId.value = connectedCloud?.id ?? null
    cloudEngagementActive.value = connectedCloud?.engagement_status === 'active'

    const connectedHosts = hostConnections.filter((c: any) => c.status === 'connected')
    hostReadyConnections.value = connectedHosts
      .filter((c: any) => c.engagement_status === 'active')
      .map((c: any) => ({ id: c.id, hostname: c.hostname_or_ip }))
    hostBlockedConnections.value = connectedHosts
      .filter((c: any) => c.engagement_status !== 'active')
      .map((c: any) => ({ id: c.id, hostname: c.hostname_or_ip, engagementStatus: c.engagement_status }))

    oauthConnectionId.value = oauthConnections.find((c: any) => c.status === 'connected')?.id ?? null

    const byTier: Record<string, any> = {}
    for (const e of engagements) if (e.status === 'active') byTier[e.tier] = e
    engagementsByTier.value = byTier
    activePhishingEngagements.value = engagements.filter((e: any) => e.status === 'active' && e.tier === 'phishing')
  } catch {
    // Coverage map still renders with static roster data if this fails.
  }
})
</script>

<style scoped>
.header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 24px; color: var(--text2); font-size: 14px; }
.report-btn {
  padding: 9px 16px; border-radius: 8px; background: var(--accent); color: var(--bg);
  font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.report-btn.busy { opacity: .6; pointer-events: none; }
.error-note {
  position: fixed; right: 24px; bottom: 24px; z-index: 90; max-width: 360px;
  color: var(--red); font-size: 12.5px; line-height: 1.4; padding: 12px 16px; border-radius: 10px;
  background: color-mix(in srgb, var(--red) 12%, var(--bg)); border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}

.stats-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
.stat-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 20px; min-width: 120px; }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-label { font-size: 12px; color: var(--text2); white-space: nowrap; }

.lineup { display: flex; flex-direction: column; gap: 10px; margin-bottom: 32px; }
.lineup-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.lineup-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 16px 20px; cursor: pointer;
}
.category-pill {
  display: inline-flex; align-items: center; justify-content: center; min-width: 64px; height: 30px; padding: 0 10px;
  border-radius: 8px; font: 800 10px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.04em;
  border: 1.5px solid; flex-shrink: 0;
}
.lineup-main { flex: 1 1 220px; min-width: 0; }
.lineup-feature { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
.lineup-desc { font-size: 12px; color: var(--text2); }
.lineup-last { font-size: 11px; color: var(--text3); margin-top: 3px; }
.status-pill {
  display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid; white-space: nowrap; flex-shrink: 0;
}
.run-btn { flex-shrink: 0; }

.bench-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 0; }
.bench-title { font-size: 13px; font-weight: 600; padding: 14px 24px 10px; }
.bench-row { padding: 14px 24px; border-top: 1px solid var(--border); }
.bench-name { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
.bench-trigger { font-size: 12px; color: var(--text2); line-height: 1.5; }
</style>
