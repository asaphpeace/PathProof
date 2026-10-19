<template>
  <div>
    <h1 class="title">Security Overview</h1>
    <p class="subtitle">Composite risk across every connected tenant, backed by what's actually detected — not just configured.</p>

    <div class="quick-actions">
      <div
        v-for="qa in quickActions"
        :key="qa.feature"
        class="qa-btn"
        :class="{ running: qa.running }"
        @click="runModule(qa.feature)"
      >
        <span class="qa-dot" :class="{ running: qa.running }" />
        <span>{{ qa.buttonText }}</span>
      </div>
    </div>
    <p v-if="quickActionError" class="error-note">{{ quickActionError }}</p>

    <div class="top-grid">
      <div class="score-card">
        <div class="gauge" :style="{ background: gaugeStyle }">
          <div class="gauge-inner">
            <div class="gauge-value">{{ overallScore ?? '—' }}</div>
            <div class="gauge-max">/ 100</div>
          </div>
        </div>
        <div class="score-label">Composite ZoneProof Score</div>
        <div v-if="scoreDelta !== null" class="score-delta" :class="{ down: scoreDelta < 0, up: scoreDelta > 0 }">
          {{ scoreDelta > 0 ? '▲' : scoreDelta < 0 ? '▼' : '—' }} {{ Math.abs(scoreDelta) }} pts vs last week
        </div>
      </div>

      <div class="coverage-card">
        <div class="coverage-head">
          <div class="coverage-title">Detection Coverage by Module</div>
          <RouterLink :to="{ name: 'coverage' }" class="coverage-link">View coverage map →</RouterLink>
        </div>
        <div class="coverage-grid">
          <div v-for="m in coveragePreview" :key="m.feature" class="coverage-item">
            <span class="coverage-dot" :style="{ background: statusDotColor(m) }" />
            <div class="coverage-text">
              <div class="coverage-feature">{{ m.feature }}</div>
              <div class="coverage-status">{{ statusLabel(statusKind(m.status)) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="findings-card">
      <div class="findings-title">
        Live Findings
        <span v-if="alerts.length && alerts[0].isExample" class="example-tag">Example — no findings yet</span>
      </div>
      <div v-if="loadingFindings" class="findings-empty">Loading…</div>
      <div v-else-if="alerts.length === 0" class="findings-empty">No findings yet — run a scan to populate this feed.</div>
      <div
        v-for="a in alerts"
        :key="a.id"
        class="finding-row"
        :class="{ clickable: !a.isExample }"
        @click="openFinding(a)"
      >
        <div class="pill" :style="{ color: severityColor(a.severity), borderColor: severityColor(a.severity), background: pillBg(a.severity) }">{{ a.severity }}</div>
        <div class="finding-main">
          <div class="finding-text">{{ a.text }}</div>
          <div class="finding-module">via {{ a.module }}</div>
        </div>
        <div class="finding-time">{{ a.time }}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div v-for="s in statCards" :key="s.label" class="stat-card">
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value">{{ s.value }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import { STARTING_XI, statusKind, statusLabel, type RosterEntry } from '@/data/roster'
import { severityColor } from '@/data/colors'
import { SEEDED_ALERTS } from '@/data/demo'
import { usePanelStore } from '@/stores/panels'

const router = useRouter()
const panels = usePanelStore()

const overallScore = ref<number | null>(null)
const scoreDelta = ref<number | null>(null)
const cloudConnectionId = ref<string | null>(null)
const cloudEngagementActive = ref(false)
// Same real bugs as CoverageView.vue (its own comment has the full
// reasoning): the old boolean checked ANY engagement being active, not
// this connection's own, and hostConnectionId silently picked the first
// connected host with no way to tell which one a scan would actually hit.
interface HostTarget { id: string; hostname: string }
const hostReadyConnections = ref<HostTarget[]>([])
const hostBlockedConnections = ref<(HostTarget & { engagementStatus: string | null })[]>([])

const realFindings = ref<any[]>([])
const loadingFindings = ref(true)
const connectedAccountCount = ref(0)
const activeEngagementCount = ref(0)
const moduleRuns = ref<Record<string, { status: 'running' | 'done' | 'error' }>>({})
const quickActionError = ref('')

const gaugeStyle = computed(() => {
  const score = overallScore.value ?? 0
  return `conic-gradient(var(--accent) ${score * 3.6}deg, var(--surface2) 0deg)`
})

const order: Record<string, number> = { done: 0, partial: 1, 'not-started': 2 }
const coveragePreview = computed(() =>
  [...STARTING_XI].sort((a, b) => order[statusKind(a.status)] - order[statusKind(b.status)]).slice(0, 6)
)

function statusDotColor(f: RosterEntry): string {
  const kind = statusKind(f.status)
  return { 'not-started': 'var(--text3)', partial: 'var(--amber)', done: 'var(--green)' }[kind]
}

function pillBg(severity: string): string {
  return `color-mix(in srgb, ${severityColor(severity)} 16%, transparent)`
}

function openFinding(a: any) {
  if (a.isExample) return
  const f = realFindings.value.find((x: any) => x.id === a.id)
  if (f) panels.push({ type: 'finding', title: f.title, data: f })
}

function moduleForFinding(f: any): string {
  if (f.tier === 'host') return 'Host & Server Security'
  if (f.tier !== 'cloud') return f.tier
  return (f.check_id || '').startsWith('arn:') ? 'Host & Server Security' : 'Cloud Misconfiguration Defense'
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

const alerts = computed(() => {
  const real = realFindings.value.map(f => ({
    id: f.id,
    severity: f.severity,
    module: moduleForFinding(f),
    text: f.title,
    time: relativeTime(f.discovered_at),
    isExample: false,
  }))
  if (real.length > 0) return real.slice(0, 8)
  // Nothing real yet — show illustrative seeded examples, clearly labeled
  // as such (see the findings-title "Example" tag), rather than presenting
  // fabricated data identically to a real feed.
  return SEEDED_ALERTS.map((a, i) => ({ id: `seed-${i}`, ...a, isExample: true }))
})

// Real, single-tenant stats from data already loaded on this page — this
// used to be DEMO_TENANTS (a fabricated multi-tenant portfolio view that
// doesn't even make sense on a single tenant's own Overview). Real
// portfolio-wide numbers exist now (Coverage Map plan Phase 2/3's MSP
// Portfolio), but they belong on /portal for MSP-plan tenants, not
// invented here for every tenant regardless of plan.
const statCards = computed(() => {
  const openFindings = realFindings.value.filter((f: any) => f.status === 'open')
  return [
    { label: 'Connected Accounts', value: connectedAccountCount.value },
    { label: 'Active Engagements', value: activeEngagementCount.value },
    { label: 'Open Findings', value: openFindings.length },
    { label: 'Critical Findings', value: openFindings.filter((f: any) => f.severity === 'critical').length },
  ]
})

const quickActionDefs = [
  { feature: 'Cloud Misconfiguration Defense', label: 'Run Cloud Scan' },
  { feature: 'Host & Server Security', label: 'Run Host Scan' },
  { feature: 'Identity & Credential Hygiene', label: 'Check Credentials' },
  { feature: 'Phishing Simulation', label: 'Launch Phishing Sim' },
  { feature: 'Email Authentication Defense', label: 'Verify Email Auth' },
]
const scanProgressLabel = ref<Record<string, string>>({})
const PASS_LABELS: Record<string, string> = { prowler: 'Prowler', cloudsplaining: 'Cloudsplaining', inspector: 'Inspector', lynis: 'Lynis', credential: 'Credential Hygiene', breach_monitoring: 'Breach Monitoring' }

function formatElapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const mins = Math.floor(secs / 60)
  return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`
}

// Same "which pass is actually running" transparency as Coverage Map — see
// its pollScanProgress for the full rationale.
// See CoverageView.vue's own copy of this ref for the full reasoning —
// same fix applied here, duplicated per this codebase's existing
// per-file pollScanProgress convention.
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

const quickActions = computed(() => quickActionDefs.map(qa => {
  const run = moduleRuns.value[qa.feature]
  const running = run?.status === 'running'
  return { ...qa, running, buttonText: running ? (scanProgressLabel.value[qa.feature] ?? 'Running…') : qa.label }
}))

async function runModule(feature: string) {
  if (moduleRuns.value[feature]?.status === 'running') return
  quickActionError.value = ''

  // Same honest navigate-instead-of-fake-run pattern Coverage Map already
  // uses for these two — no fabricated "scan completed" result.
  if (feature === 'Phishing Simulation') {
    router.push({ name: 'phishing' })
    return
  }
  if (feature === 'Email Authentication Defense') {
    quickActionError.value = 'Continuously monitored via DMARC/SPF/MTA-STS report ingestion in ZoneProof — no manual trigger exists.'
    return
  }

  moduleRuns.value = { ...moduleRuns.value, [feature]: { status: 'running' } }

  if (feature === 'Cloud Misconfiguration Defense' || feature === 'Identity & Credential Hygiene') {
    // Same real scan pass sequence as Cloud Misconfiguration Defense — the
    // MFA/password-audit half runs as its 4th pass, see cloud_scan_service.py.
    if (!cloudConnectionId.value || !cloudEngagementActive.value) {
      quickActionError.value = 'Connect and activate an AWS account under Settings first.'
      moduleRuns.value = { ...moduleRuns.value, [feature]: { status: 'error' } }
      return
    }
    pollScanProgress(feature, 'cloud', cloudConnectionId.value)
    try {
      const result = await api.rescanCloudConnection(cloudConnectionId.value)
      if (result.last_scan_status === 'failed') quickActionError.value = result.last_scan_error ?? 'Scan failed'
      await Promise.all([loadFindings(), loadScore()])
    } catch (e: any) {
      quickActionError.value = e.message ?? 'Scan failed'
    } finally {
      moduleRuns.value = { ...moduleRuns.value, [feature]: { status: 'done' } }
    }
    return
  }

  if (feature === 'Host & Server Security') {
    if (hostReadyConnections.value.length === 0) {
      quickActionError.value = hostBlockedConnections.value.length > 0
        ? `${hostBlockedConnections.value.map(c => c.hostname).join(', ')} ${hostBlockedConnections.value.length === 1 ? 'is' : 'are'} connected but not yet authorized — resume authorization under Settings.`
        : 'Connect and activate a host under Settings first.'
      moduleRuns.value = { ...moduleRuns.value, [feature]: { status: 'error' } }
      return
    }
    const failures: string[] = []
    for (const [i, target] of hostReadyConnections.value.entries()) {
      const prefix = hostReadyConnections.value.length > 1
        ? `${target.hostname} (${i + 1}/${hostReadyConnections.value.length}): ` : `${target.hostname}: `
      pollScanProgress(feature, 'host', target.id, prefix)
      try {
        const result = await api.rescanHostConnection(target.id)
        if (result.last_scan_status === 'failed') failures.push(`${target.hostname}: ${result.last_scan_error ?? 'scan failed'}`)
      } catch (e: any) {
        failures.push(`${target.hostname}: ${e.message ?? 'scan failed'}`)
      }
    }
    if (failures.length) quickActionError.value = failures.join(' · ')
    await Promise.all([loadFindings(), loadScore()])
    moduleRuns.value = { ...moduleRuns.value, [feature]: { status: 'done' } }
    return
  }

  // Every quick action above is handled explicitly with a real call or an
  // honest "no trigger exists" message — reaching here means a new action
  // was added to quickActionDefs without a matching branch. Fail honestly
  // rather than silently fabricating a result.
  quickActionError.value = `No real handler wired for "${feature}" yet.`
  moduleRuns.value = { ...moduleRuns.value, [feature]: { status: 'error' } }
}

async function loadScore() {
  try {
    const data = await api.overview()
    overallScore.value = data.sentinel?.score ?? null
    scoreDelta.value = data.sentinel?.delta ?? null
  } catch {
    // Overview score is best-effort on this screen — Settings/Coverage
    // remain the source of truth if this call fails.
  }
}

async function loadFindings() {
  loadingFindings.value = true
  try {
    const [connections, hostConnections, engagements] = await Promise.all([
      api.cloudConnections(), api.hostConnections(), api.engagements(),
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

    connectedAccountCount.value =
      connections.filter((c: any) => c.status === 'connected').length +
      hostConnections.filter((c: any) => c.status === 'connected').length

    const activeEngagements = engagements.filter((e: any) => e.status === 'active')
    activeEngagementCount.value = activeEngagements.length

    const allFindings = (await Promise.all(
      activeEngagements.map((e: any) => api.findings(e.id).catch(() => []))
    )).flat()
    allFindings.sort((a: any, b: any) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime())
    realFindings.value = allFindings
  } catch {
    realFindings.value = []
  } finally {
    loadingFindings.value = false
  }
}

onMounted(() => {
  loadScore()
  loadFindings()
})
</script>

<style scoped>
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 24px; color: var(--text2); font-size: 14px; }

.quick-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
.qa-btn {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 9px;
  font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer;
  background: var(--surface2); color: var(--text); border: 1px solid var(--border);
}
.qa-btn.running { color: var(--text2); cursor: default; }
.qa-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.qa-dot.running { background: var(--amber); animation: dashmove 1s linear infinite; }
.error-note {
  position: fixed; right: 24px; bottom: 24px; z-index: 90; max-width: 360px;
  color: var(--red); font-size: 12.5px; line-height: 1.4; padding: 12px 16px; border-radius: 10px;
  background: color-mix(in srgb, var(--red) 12%, var(--bg)); border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}

.top-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; margin-bottom: 28px; margin-top: 20px; }
.score-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
}
.gauge { width: 152px; height: 152px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.gauge-inner { width: 118px; height: 118px; border-radius: 50%; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.gauge-value { font-size: 36px; font-weight: 800; }
.gauge-max { font-size: 10px; color: var(--text2); letter-spacing: 0.05em; }
.score-label { font-size: 13px; font-weight: 600; text-align: center; white-space: nowrap; }
.score-delta { font-size: 12px; white-space: nowrap; color: var(--text2); }
.score-delta.down { color: var(--red); }
.score-delta.up { color: var(--green); }

.coverage-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
.coverage-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; }
.coverage-title { font-size: 13px; font-weight: 600; }
.coverage-link { font-size: 12px; color: var(--accent); text-decoration: none; }
.coverage-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.coverage-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--surface2); border: 1px solid var(--border); min-width: 0; }
.coverage-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.coverage-text { flex: 1; min-width: 0; }
.coverage-feature { font-size: 12px; font-weight: 600; line-height: 1.3; overflow-wrap: break-word; }
.coverage-status { font-size: 11px; color: var(--text2); margin-top: 2px; }

.findings-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 0; margin-bottom: 28px; }
.findings-title { font-size: 13px; font-weight: 600; padding: 14px 24px 10px; display: flex; align-items: center; gap: 10px; }
.example-tag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--amber);
  background: color-mix(in srgb, var(--amber) 14%, transparent); border: 1px solid color-mix(in srgb, var(--amber) 40%, transparent);
  border-radius: 999px; padding: 2px 8px;
}
.findings-empty { color: var(--text2); font-size: 13px; padding: 10px 24px 16px; }
.finding-row { display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-top: 1px solid var(--border); }
.finding-row.clickable { cursor: pointer; }
.finding-row.clickable:hover { background: var(--surface2); }
.pill {
  display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid; width: fit-content; white-space: nowrap; flex-shrink: 0;
}
.finding-main { flex: 1; min-width: 0; }
.finding-text { font-size: 13px; }
.finding-module { font-size: 11px; color: var(--text3); margin-top: 2px; }
.finding-time { font-size: 12px; color: var(--text2); width: 90px; text-align: right; white-space: nowrap; }

.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.stat-label { font-size: 12px; color: var(--text2); margin-bottom: 8px; white-space: nowrap; }
.stat-value { font-size: 26px; font-weight: 700; }
</style>
