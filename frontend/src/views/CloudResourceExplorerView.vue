<template>
  <div>
    <h1 class="title">Cloud Resources</h1>
    <p class="subtitle">Every real resource discovered in your connected AWS account, with its own risk attached to it directly — no hunting across screens to find out what's actually there.</p>

    <div class="controls-row">
      <select v-if="connections.length > 1" class="connection-select" :value="selectedConnectionId ?? ''" @change="onSelectConnection(($event.target as HTMLSelectElement).value)">
        <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.role_arn || c.id }}</option>
      </select>
      <div class="refresh-btn" :class="{ running: loading }" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</div>
    </div>

    <div v-if="resources.length" class="stats-row">
      <div class="stat-box">
        <div class="stat-value">{{ resources.length }}</div>
        <div class="stat-label">Resources</div>
      </div>
      <div v-for="s in severityStats" :key="s.severity" class="stat-box" :style="{ borderColor: severityColor(s.severity) }">
        <div class="stat-value" :style="{ color: severityColor(s.severity) }">{{ s.count }}</div>
        <div class="stat-label">{{ s.severity }} findings</div>
      </div>
      <div v-if="unusedAccessKeyCount" class="stat-box callout">
        <div class="stat-value">{{ unusedAccessKeyCount }}</div>
        <div class="stat-label">Unused access keys</div>
      </div>
      <div v-if="exploitableCveCount" class="stat-box callout">
        <div class="stat-value">{{ exploitableCveCount }}</div>
        <div class="stat-label">Exploitable CVEs, fix available</div>
      </div>
    </div>

    <div v-if="resources.length" class="controls">
      <select class="type-select" v-model="typeFilter">
        <option value="">All resource types ({{ resources.length }})</option>
        <option v-for="t in resourceTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <select class="region-select" v-model="regionFilter">
        <option value="">All regions</option>
        <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
      </select>
      <input v-model="search" class="search-input" type="text" placeholder="Search resource id or tag…" />
    </div>

    <div v-if="loadError" class="empty-state error">{{ loadError }}</div>
    <div v-else-if="!loading && !selectedConnectionId" class="empty-state">
      <div class="empty-title">No connected AWS account yet</div>
      <div class="empty-body">Connect one under <RouterLink :to="{ name: 'settings' }">Settings</RouterLink> to populate this.</div>
    </div>
    <div v-else-if="!loading && resources.length === 0" class="empty-state">
      <div class="empty-title">No resources discovered yet</div>
      <div class="empty-body">Run a Cloud Misconfiguration Defense scan from the <RouterLink :to="{ name: 'coverage' }">Coverage Map</RouterLink> to populate this.</div>
    </div>

    <div v-else class="resource-list">
      <div v-for="r in filteredResources" :key="r.id" class="resource-card" @click="openResource(r)">
        <div class="resource-type-pill">{{ r.resource_type }}</div>
        <div class="resource-main">
          <div class="resource-id mono">{{ shortId(r.resource_id) }}</div>
          <div class="resource-meta">
            <span v-if="r.region">{{ r.region }}</span>
            <span v-for="(v, k) in r.tags" :key="k">{{ k }}={{ v }}</span>
          </div>
        </div>
        <div
          v-if="r.open_findings_count > 0" class="status-pill findings"
          :style="{ color: severityColor(r.worst_open_severity ?? 'medium'), borderColor: severityColor(r.worst_open_severity ?? 'medium'), background: `color-mix(in srgb, ${severityColor(r.worst_open_severity ?? 'medium')} 16%, transparent)` }"
        >{{ r.open_findings_count }} open finding{{ r.open_findings_count === 1 ? '' : 's' }}</div>
        <div v-else-if="Object.keys(r.checked_by).length" class="status-pill clean">Checked, clean</div>
        <div v-else class="status-pill unchecked">Never evaluated</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

interface CloudAsset {
  id: string; resource_type: string; resource_id: string; region: string | null
  tags: Record<string, string>; checked_by: Record<string, string>
  open_findings_count: number; worst_open_severity: string | null
  first_seen_at: string; last_seen_at: string
}

const route = useRoute()
const router = useRouter()
const panels = usePanelStore()

const connections = ref<any[]>([])
const selectedConnectionId = ref<string | null>(null)
const resources = ref<CloudAsset[]>([])
const loading = ref(false)
const loadError = ref('')
const typeFilter = ref('')
const regionFilter = ref('')
const search = ref('')

// Fetched once per connection alongside the resource list, purely to
// derive the two named headline callouts (unused access keys, exploitable
// CVEs) client-side — cheaper than a new backend aggregate endpoint for
// two numbers this page already has all the raw data for.
const rawFindings = ref<any[]>([])

async function load() {
  if (!selectedConnectionId.value) return
  loading.value = true
  loadError.value = ''
  try {
    resources.value = await api.cloudResources(selectedConnectionId.value)
    const engagements = await api.engagements()
    const cloudEngagement = engagements.find((e: any) => e.tier === 'cloud' && e.status === 'active')
    rawFindings.value = cloudEngagement ? await api.findings(cloudEngagement.id) : []
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load cloud resources'
  } finally {
    loading.value = false
  }
}

function onSelectConnection(id: string) {
  selectedConnectionId.value = id || null
  router.replace({ query: { ...route.query, connection: id } })
  load()
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']
const severityStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const r of resources.value) if (r.worst_open_severity) counts[r.worst_open_severity] = (counts[r.worst_open_severity] || 0) + 1
  return SEVERITY_ORDER.filter(s => counts[s]).map(s => ({ severity: s, count: counts[s] }))
})

const unusedAccessKeyCount = computed(() =>
  rawFindings.value.filter(f => f.status === 'open' && (f.check_id || '').includes('access_key') && (f.check_id || '').includes('unused')).length,
)
const exploitableCveCount = computed(() =>
  rawFindings.value.filter(f => f.status === 'open' && f.extra?.exploit_available === 'YES' && f.extra?.fix_available === 'YES').length,
)

const resourceTypes = computed(() => [...new Set(resources.value.map(r => r.resource_type))].sort())
const regions = computed(() => [...new Set(resources.value.map(r => r.region).filter((r): r is string => !!r))].sort())

const filteredResources = computed(() => {
  let list = resources.value
  if (typeFilter.value) list = list.filter(r => r.resource_type === typeFilter.value)
  if (regionFilter.value) list = list.filter(r => r.region === regionFilter.value)
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter(r => r.resource_id.toLowerCase().includes(q) || Object.entries(r.tags).some(([k, v]) => `${k}=${v}`.toLowerCase().includes(q)))
  }
  return [...list].sort((a, b) => b.open_findings_count - a.open_findings_count)
})

function shortId(resourceId: string): string {
  return resourceId?.includes('/') ? resourceId.split('/').pop()! : resourceId
}

async function openResource(r: CloudAsset) {
  if (!selectedConnectionId.value) return
  try {
    const detail = await api.cloudResourceDetail(selectedConnectionId.value, r.id)
    panels.push({ type: 'cloud-asset', title: shortId(r.resource_id), data: detail })
  } catch (e: any) {
    loadError.value = e.message ?? 'Could not load resource detail'
  }
}

onMounted(async () => {
  try {
    connections.value = await api.cloudConnections()
    const queryConnection = typeof route.query.connection === 'string' ? route.query.connection : null
    const initial = (queryConnection && connections.value.find((c: any) => c.id === queryConnection))
      ?? connections.value.find((c: any) => c.status === 'connected')
      ?? connections.value[0]
    if (initial) {
      selectedConnectionId.value = initial.id
      await load()
    }
  } catch (e: any) {
    loadError.value = e.message ?? 'Could not load cloud connections'
  }
})
</script>

<style scoped>
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 20px; color: var(--text2); font-size: 14px; }

.controls-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }
.connection-select {
  height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-family: var(--font-body); font-size: 13px; flex: 1 1 260px; min-width: 0;
}
.refresh-btn {
  padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer;
  background: var(--accent); color: var(--bg); border: 1px solid var(--accent);
}
.refresh-btn.running { background: var(--surface2); color: var(--text2); border-color: var(--border); cursor: default; }

.stats-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.stat-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 20px; min-width: 120px; }
.stat-box.callout { border-color: var(--red); }
.stat-box.callout .stat-value { color: var(--red); }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-label { font-size: 12px; color: var(--text2); }

.controls { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.type-select, .region-select, .search-input {
  height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-family: var(--font-body); font-size: 13px;
}
.type-select:focus, .region-select:focus, .search-input:focus { outline: none; border-color: var(--accent); }
.search-input { flex: 1 1 220px; min-width: 0; }
.type-select { flex: 1 1 220px; min-width: 0; }
.region-select { flex: 1 1 160px; min-width: 0; }

.empty-state { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
.empty-state.error { border-color: var(--red); color: var(--red); }
.empty-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.empty-body { font-size: 13px; color: var(--text2); line-height: 1.6; }
.empty-body a { color: var(--accent); }

.resource-list { display: flex; flex-direction: column; gap: 8px; }
.resource-card {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 14px 18px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; cursor: pointer;
}
.resource-card:hover { border-color: var(--accent); }
.resource-type-pill {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 4px 8px;
  border-radius: 6px; background: var(--surface2); color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; flex-shrink: 0;
}
.resource-main { flex: 1 1 260px; min-width: 0; }
.resource-id { font-size: 13.5px; font-weight: 600; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.resource-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text3); margin-top: 3px; }
.status-pill {
  font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; flex-shrink: 0;
  border: 1px solid var(--border);
}
.status-pill.findings { border-width: 1px; border-style: solid; }
.status-pill.clean { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); background: color-mix(in srgb, var(--green) 12%, transparent); }
.status-pill.unchecked { color: var(--text3); background: var(--surface2); }
</style>
