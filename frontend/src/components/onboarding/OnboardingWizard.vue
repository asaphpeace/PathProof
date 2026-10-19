<template>
  <div class="onboarding-wizard">
    <div class="wizard-progress">
      <span
        v-for="(label, i) in STEP_LABELS" :key="label"
        class="wizard-step-dot" :class="{ active: i === stepIndex, done: i < stepIndex }"
      >{{ i + 1 }}</span>
      <span class="wizard-progress-label">Step {{ stepIndex + 1 }} of {{ STEP_LABELS.length }}: {{ STEP_LABELS[stepIndex] }}</span>
    </div>

    <!-- Step 1: Connect — no connect form here, this links out to the real,
         fully-built Settings flow rather than rebuilding it inline. -->
    <div v-if="step === 'connect'" class="wizard-card">
      <div class="wizard-title">Connect your environment</div>
      <div class="wizard-body">
        Pathproof's Simulation Engine builds a real attack-path graph from your actual AWS account, servers, or
        Microsoft 365 tenant — not a demo. The guided arc from here: <strong>Connect → Scan → Simulate attack paths →
        Fix what matters → Confirm</strong>.
      </div>
      <RouterLink :to="{ name: 'settings' }" class="wizard-cta">Connect an account in Settings →</RouterLink>
    </div>

    <!-- Step 2: Scan — real scan triggers, reusing the same API calls
         OverviewView.vue/CoverageView.vue already use, not a redirect away
         from the wizard. -->
    <div v-else-if="step === 'scan'" class="wizard-card">
      <div class="wizard-title">Run your first scan</div>
      <div class="wizard-body">
        Real data first — scan your connected environment for real findings, then see exactly how they connect
        into an attack path.
      </div>
      <div class="wizard-scan-list">
        <div v-for="c in unscannedConnections" :key="c.id" class="wizard-scan-row">
          <span class="wizard-scan-label">{{ c.label }}</span>
          <span v-if="scanStatus[c.id]" class="wizard-scan-status">{{ scanStatus[c.id] }}</span>
          <div v-else class="wizard-cta small" @click="runScan(c)">Run scan</div>
        </div>
      </div>
      <div v-if="scanError" class="wizard-error">{{ scanError }}</div>
    </div>

    <!-- Step 3/4: Findings summary + the explicit "Simulate attack paths"
         reveal moment. The underlying graph data is already loaded and
         already current (GraphView fetches it unconditionally, same as
         always) — this button only stages the first-run VISUAL reveal for
         pacing, it never gates the data itself. -->
    <div v-else class="wizard-card">
      <div class="wizard-title">Scan complete</div>
      <div class="wizard-body">
        <template v-if="graph">
          {{ graph.nodes.length }} real resource{{ graph.nodes.length === 1 ? '' : 's' }} and
          {{ graph.edges.length }} real relationship{{ graph.edges.length === 1 ? '' : 's' }} found.
          Now see how they connect into an actual attack path — from the internet to what matters.
        </template>
        <template v-else>Loading your scan results…</template>
      </div>
      <div class="wizard-cta" @click="reveal">Simulate possible attack paths →</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'

interface ConnectionLike { id: string; last_scan_status?: string }
interface CloudLike extends ConnectionLike { role_arn?: string | null; display_name?: string | null }
interface HostLike extends ConnectionLike { hostname_or_ip?: string; display_name?: string | null }
interface OAuthLike extends ConnectionLike { ms_tenant_id?: string | null }

const props = defineProps<{
  cloudConnections: CloudLike[]
  hostConnections: HostLike[]
  oauthConnections: OAuthLike[]
  graph: { nodes: any[]; edges: any[] } | null
}>()
const emit = defineEmits<{ graduated: []; 'scan-complete': [] }>()

const STEP_LABELS = ['Connect', 'Scan', 'Simulate']

const hasAnyConnection = computed(() =>
  props.cloudConnections.length > 0 || props.hostConnections.length > 0 || props.oauthConnections.length > 0)
const hasEverScanned = computed(() =>
  [...props.cloudConnections, ...props.hostConnections, ...props.oauthConnections]
    .some(c => !!c.last_scan_status && c.last_scan_status !== 'never_run'))

const step = computed<'connect' | 'scan' | 'reveal'>(() => {
  if (!hasAnyConnection.value) return 'connect'
  if (!hasEverScanned.value) return 'scan'
  return 'reveal'
})
const stepIndex = computed(() => ['connect', 'scan', 'reveal'].indexOf(step.value))

interface ScanTarget { id: string; label: string; kind: 'cloud' | 'host' | 'oauth' }
const unscannedConnections = computed<ScanTarget[]>(() => {
  const out: ScanTarget[] = []
  for (const c of props.cloudConnections) {
    if (!c.last_scan_status || c.last_scan_status === 'never_run') out.push({ id: c.id, label: c.display_name || c.role_arn || 'AWS account', kind: 'cloud' })
  }
  for (const c of props.hostConnections) {
    if (!c.last_scan_status || c.last_scan_status === 'never_run') out.push({ id: c.id, label: c.display_name || c.hostname_or_ip || 'Server', kind: 'host' })
  }
  for (const c of props.oauthConnections) {
    if (!c.last_scan_status || c.last_scan_status === 'never_run') out.push({ id: c.id, label: c.ms_tenant_id ? `Microsoft 365 (${c.ms_tenant_id})` : 'Microsoft 365', kind: 'oauth' })
  }
  return out
})

const scanStatus = ref<Record<string, string>>({})
const scanError = ref('')

// Mirrors OverviewView.vue's own pollScanProgress pattern (small, deliberate
// per-view duplication — same convention already established across this
// codebase) rather than importing a shared composable for one call site.
async function runScan(target: ScanTarget) {
  scanError.value = ''
  scanStatus.value = { ...scanStatus.value, [target.id]: 'Running…' }
  const poll = window.setInterval(async () => {
    try {
      const list = target.kind === 'cloud' ? await api.cloudConnections()
        : target.kind === 'host' ? await api.hostConnections()
        : await api.oauthAppConnections()
      const conn = list.find((c: any) => c.id === target.id)
      const status: string = conn?.last_scan_status ?? ''
      const pass = status.startsWith('running:') ? status.slice(8) : null
      scanStatus.value = { ...scanStatus.value, [target.id]: pass ? `Running ${pass}…` : 'Running…' }
    } catch {
      // Poll failures are non-fatal — keep the last known label.
    }
  }, 4000)
  try {
    const result = target.kind === 'cloud' ? await api.rescanCloudConnection(target.id)
      : target.kind === 'host' ? await api.rescanHostConnection(target.id)
      : await api.scanOAuthAppConnection(target.id)
    if (result?.last_scan_status === 'failed') {
      scanError.value = result.last_scan_error ?? 'Scan failed'
      const next = { ...scanStatus.value }
      delete next[target.id]
      scanStatus.value = next
    } else {
      scanStatus.value = { ...scanStatus.value, [target.id]: 'Done' }
      emit('scan-complete')
    }
  } catch (e: any) {
    scanError.value = e.message ?? 'Scan failed'
    const next = { ...scanStatus.value }
    delete next[target.id]
    scanStatus.value = next
  } finally {
    window.clearInterval(poll)
  }
}

function reveal() {
  emit('graduated')
}
</script>

<style scoped>
.onboarding-wizard { display: flex; flex-direction: column; gap: 16px; }

.wizard-progress { display: flex; align-items: center; gap: 8px; }
.wizard-step-dot {
  width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: var(--text3); background: var(--surface2); border: 1px solid var(--border);
}
.wizard-step-dot.active { color: var(--bg); background: var(--violet); border-color: var(--violet); }
.wizard-step-dot.done { color: var(--violet); border-color: var(--violet); background: color-mix(in srgb, var(--violet) 16%, transparent); }
.wizard-progress-label { font-size: 12px; font-weight: 600; color: var(--text2); margin-left: 4px; }

.wizard-card {
  background: color-mix(in srgb, var(--violet) 6%, var(--surface)); border: 1.5px solid var(--violet);
  border-radius: 12px; padding: 28px 30px; display: flex; flex-direction: column; gap: 14px; align-items: flex-start;
}
.wizard-title { font-size: 19px; font-weight: 700; color: var(--text); }
.wizard-body { font-size: 14px; color: var(--text2); line-height: 1.6; max-width: 540px; }
.wizard-body strong { color: var(--text); }

.wizard-cta {
  display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
  cursor: pointer; background: var(--violet); color: var(--bg); border: 1px solid var(--violet); text-decoration: none;
}
.wizard-cta.small { padding: 6px 12px; font-size: 12px; }

.wizard-scan-list { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 480px; }
.wizard-scan-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px;
  border-radius: 8px; background: var(--surface2); border: 1px solid var(--border);
}
.wizard-scan-label { font-size: 13px; color: var(--text); font-weight: 600; }
.wizard-scan-status { font-size: 12px; color: var(--text3); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.wizard-error { font-size: 13px; color: var(--red); }
</style>
