<template>
  <div>
    <h1 class="title">Detection Coverage</h1>
    <p class="subtitle">For every real IAM privilege-escalation path, whether your actual detection sources — CloudTrail, GuardDuty — would catch it being exploited.</p>

    <div class="controls-row">
      <div class="refresh-btn" :class="{ running: loading }" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</div>
    </div>

    <div v-if="edges.length" class="stats-row">
      <div v-for="s in verdictStats" :key="s.verdict" class="stat-box" :style="{ borderColor: verdictColor(s.verdict) }">
        <div class="stat-value" :style="{ color: verdictColor(s.verdict) }">{{ s.count }}</div>
        <div class="stat-label">{{ verdictLabel(s.verdict) }}</div>
      </div>
    </div>

    <div v-if="loadError" class="empty-state error">{{ loadError }}</div>
    <div v-else-if="!loading && edges.length === 0" class="empty-state">
      <div class="empty-title">No privilege-escalation paths discovered yet</div>
      <div class="empty-body">
        Run a Cloud Misconfiguration Defense scan first — detection coverage is computed against whatever
        <RouterLink :to="{ name: 'graph' }">the Simulation Engine</RouterLink> already has.
      </div>
    </div>

    <div v-else class="edge-list">
      <div v-for="e in edges" :key="e.priv_esc_path_id" class="edge-card" @click="openEdge(e)">
        <div class="verdict-pill" :class="e.verdict">{{ verdictLabel(e.verdict) }}</div>
        <div class="edge-main">
          <div class="edge-title">{{ shortArn(e.source_principal_arn) }} → {{ shortArn(e.target_principal_arn) }}</div>
          <div class="edge-reason">{{ e.reason }}</div>
        </div>
        <div class="edge-severity">{{ e.severity?.toUpperCase() }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'

interface DetectionCoverageEdge {
  priv_esc_path_id: string; source_principal_arn: string; target_principal_arn: string
  technique_chain: string[]; severity: string; verdict: 'covered' | 'partial' | 'blind_spot'
  reason: string; cloudtrail_multi_region_enabled: boolean; guardduty_enabled: boolean; discovered_at: string
}

const panels = usePanelStore()
const edges = ref<DetectionCoverageEdge[]>([])
const loading = ref(false)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    edges.value = await api.detectionCoverage()
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load detection coverage'
  } finally {
    loading.value = false
  }
}

const VERDICT_ORDER = ['blind_spot', 'partial', 'covered'] as const
const verdictStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const e of edges.value) counts[e.verdict] = (counts[e.verdict] || 0) + 1
  return VERDICT_ORDER.filter(v => counts[v]).map(v => ({ verdict: v, count: counts[v] }))
})

function verdictLabel(v: string): string {
  return { covered: 'Covered', partial: 'Partial', blind_spot: 'Blind spot' }[v] ?? v
}
function verdictColor(v: string): string {
  return { covered: 'var(--green)', partial: 'var(--amber)', blind_spot: 'var(--red)' }[v] ?? 'var(--border)'
}
function shortArn(arn: string): string {
  return arn?.split('/').pop() ?? arn
}

function openEdge(e: DetectionCoverageEdge) {
  panels.push({
    type: 'coverage-verdict',
    title: `${shortArn(e.source_principal_arn)} → ${shortArn(e.target_principal_arn)}`,
    data: e,
  })
}

onMounted(load)
</script>

<style scoped>
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 20px; color: var(--text2); font-size: 14px; }
.controls-row { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 16px; }
.refresh-btn {
  padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer;
  background: var(--accent); color: var(--bg); border: 1px solid var(--accent);
}
.refresh-btn.running { background: var(--surface2); color: var(--text2); border-color: var(--border); cursor: default; }

.empty-state { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
.empty-state.error { border-color: var(--red); color: var(--red); }
.empty-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.empty-body { font-size: 13px; color: var(--text2); line-height: 1.6; }
.empty-body a { color: var(--accent); }

.stats-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.stat-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 20px; min-width: 120px; }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-label { font-size: 12px; color: var(--text2); }

.edge-list { display: flex; flex-direction: column; gap: 10px; }
.edge-card { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 16px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; cursor: pointer; }
.verdict-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px; font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; border: 1px solid; flex-shrink: 0; }
.verdict-pill.covered { color: var(--green); border-color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
.verdict-pill.partial { color: var(--amber); border-color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.verdict-pill.blind_spot { color: var(--red); border-color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }
.edge-main { flex: 1 1 220px; min-width: 0; }
.edge-title { font-size: 14px; font-weight: 700; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.edge-reason { font-size: 12px; color: var(--text2); margin-top: 3px; }
.edge-severity { font-size: 11px; color: var(--text3); flex-shrink: 0; }
</style>
