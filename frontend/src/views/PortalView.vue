<template>
  <div>
    <div class="header-row">
      <div>
        <h1 class="title">Multi-Tenant Portfolio</h1>
        <p class="subtitle">Real Sentinel Score, domain coverage, and cert/DMARC posture across every managed client tenant.</p>
      </div>
      <div v-if="!upgradeRequired" class="add-btn" :class="{ disabled: creating }" @click="!creating && startCreate()">+ New client</div>
    </div>

    <div v-if="loading" class="empty">Loading clients…</div>

    <div v-else-if="upgradeRequired" class="upgrade-card">
      <div class="upgrade-title">Multi-Tenant Portfolio is an MSP-plan feature</div>
      <div class="upgrade-body">{{ upgradeMessage }}</div>
    </div>

    <div v-else-if="loadError" class="empty error">{{ loadError }}</div>

    <div v-else-if="clients.length === 0" class="empty">No client tenants yet — add your first one above.</div>

    <div v-else class="table-card">
      <div class="table-head">
        <div>Tenant</div><div>Score</div><div>Domains</div><div>Plan</div><div>Cert alerts</div><div>DMARC</div><div>Human Risk</div><div>Report</div>
      </div>
      <div v-for="c in clients" :key="c.id" class="table-row" @click="openScoreBreakdown(c)">
        <div>
          <div class="tenant-name">{{ c.name }}</div>
          <div class="tenant-domain">{{ c.brand_name || 'No brand set' }}</div>
        </div>
        <div class="score-cell">
          <span class="grade-pill" :style="{ color: c.sentinel_grade_color, borderColor: c.sentinel_grade_color, background: `color-mix(in srgb, ${c.sentinel_grade_color} 16%, transparent)` }">{{ c.sentinel_grade }}</span>
          <span class="score">{{ c.sentinel_score }}</span>
        </div>
        <div class="domains">{{ c.domain_count }}</div>
        <div class="plan">{{ c.plan }}</div>
        <div class="alerts" :class="{ warn: c.cert_alerts > 0 }">{{ c.cert_alerts }}</div>
        <div class="dmarc">{{ c.dmarc_reject_count }} enforced · {{ c.dmarc_none_count }} unprotected</div>
        <div class="human-risk">
          <template v-if="c.pillar_human_risk !== null && c.pillar_human_risk !== undefined">{{ Math.round(c.pillar_human_risk) }} / 100</template>
          <template v-else><span class="muted">No campaigns yet</span></template>
        </div>
        <div class="report-cell" @click.stop="downloadClientReport(c)">
          {{ reportDownloadingId === c.id ? 'Generating…' : 'Download' }}
        </div>
      </div>
    </div>
    <p v-if="reportError" class="report-error">{{ reportError }}</p>

    <!-- New client modal -->
    <div v-if="createModal" class="overlay" @click.self="cancelCreate">
      <div class="modal card">
        <h3>New client tenant</h3>
        <span class="label">Client name</span>
        <input v-model="createForm.name" class="role-input" placeholder="Acme Corp" />
        <span class="label">Billing email (optional)</span>
        <input v-model="createForm.billingEmail" class="role-input" placeholder="billing@acmecorp.com" />
        <p v-if="createError" class="error">{{ createError }}</p>
        <div class="modal-actions">
          <div class="primary-btn" :class="{ disabled: creating || !createForm.name.trim() }" @click="!(creating || !createForm.name.trim()) && submitCreate()">
            {{ creating ? 'Creating…' : 'Create' }}
          </div>
          <div class="secondary-btn" @click="cancelCreate">Cancel</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'

const panels = usePanelStore()

const clients = ref<any[]>([])
const loading = ref(true)
const loadError = ref('')
const upgradeRequired = ref(false)
const upgradeMessage = ref('')

async function loadClients() {
  loading.value = true
  loadError.value = ''
  upgradeRequired.value = false
  try {
    clients.value = await api.mspClients()
  } catch (e: any) {
    const parsed = parseDetail(e.message)
    if (parsed?.code === 'msp_plan_required') {
      upgradeRequired.value = true
      upgradeMessage.value = parsed.message ?? 'Upgrade to the MSP plan to manage client tenants.'
    } else {
      loadError.value = parsed?.message ?? e.message ?? 'Failed to load clients'
    }
  } finally {
    loading.value = false
  }
}

function parseDetail(message: string): { code?: string; message?: string } | null {
  try {
    const parsed = JSON.parse(message)
    return typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function openScoreBreakdown(c: any) {
  panels.push({ type: 'score-breakdown', title: c.name, data: c })
}

const reportDownloadingId = ref<string | null>(null)
const reportError = ref('')

async function downloadClientReport(c: any) {
  if (reportDownloadingId.value) return
  reportDownloadingId.value = c.id
  reportError.value = ''
  try {
    await api.downloadMspClientReport(c.id)
  } catch (e: any) {
    const parsed = parseDetail(e.message)
    reportError.value = parsed?.code === 'feature_not_available'
      ? 'White-label reports require the MSP or Enterprise plan.'
      : (parsed?.message ?? e.message ?? 'Report generation failed')
  } finally {
    reportDownloadingId.value = null
  }
}

const createModal = ref(false)
const createForm = ref({ name: '', billingEmail: '' })
const createError = ref('')
const creating = ref(false)

function startCreate() {
  createForm.value = { name: '', billingEmail: '' }
  createError.value = ''
  createModal.value = true
}
function cancelCreate() {
  createModal.value = false
}
async function submitCreate() {
  creating.value = true
  createError.value = ''
  try {
    await api.createMspClient(createForm.value.name.trim(), createForm.value.billingEmail.trim() || undefined)
    createModal.value = false
    await loadClients()
  } catch (e: any) {
    createError.value = parseDetail(e.message)?.message ?? e.message ?? 'Failed to create client'
  } finally {
    creating.value = false
  }
}

onMounted(loadClients)
</script>

<style scoped>
.header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 14px; max-width: 560px; }
.add-btn {
  padding: 9px 16px; border-radius: 8px; background: var(--accent); color: var(--bg);
  font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.add-btn.disabled { opacity: .5; cursor: default; }

.empty { color: var(--text2); font-size: 14px; padding: 24px 0; }
.empty.error { color: var(--red); }

.upgrade-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
.upgrade-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.upgrade-body { font-size: 13px; color: var(--text2); line-height: 1.6; }

.table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.table-head {
  display: grid; grid-template-columns: 2fr 1fr 0.8fr 1fr 1fr 1.4fr 1fr 0.9fr; padding: 12px 20px; font-size: 11px;
  color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
}
.table-row {
  display: grid; grid-template-columns: 2fr 1fr 0.8fr 1fr 1fr 1.4fr 1fr 0.9fr; align-items: center; padding: 14px 20px;
  border-bottom: 1px solid var(--border); cursor: pointer;
}
.table-row:hover { background: var(--surface2); }
.table-row:last-child { border-bottom: none; }
.tenant-name { font-size: 13px; font-weight: 600; }
.tenant-domain { font-size: 11px; color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.score-cell { display: flex; align-items: center; gap: 8px; }
.human-risk { font-size: 12px; color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.human-risk .muted { color: var(--text3); font-family: inherit; }
.grade-pill {
  display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; border: 1px solid;
}
.score { font-size: 14px; font-weight: 700; }
.domains { font-size: 13px; color: var(--text2); }
.plan { font-size: 13px; color: var(--text2); text-transform: capitalize; }
.alerts { font-size: 13px; }
.alerts.warn { color: var(--red); font-weight: 600; }
.dmarc { font-size: 11.5px; color: var(--text2); }
.report-cell {
  font-size: 11.5px; font-weight: 700; color: var(--accent); text-decoration: underline;
  text-underline-offset: 2px; white-space: nowrap;
}
.report-error { color: var(--red); font-size: 12.5px; margin-top: 12px; }

.overlay {
  position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 80;
}
.modal.card { width: 420px; max-width: 92vw; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
.modal h3 { font-size: 14px; margin-bottom: 4px; }
.label {
  display: block; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: .05em;
  color: var(--text3); text-transform: uppercase; margin: 14px 0 6px;
}
.role-input {
  width: 100%; height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 13px;
}
.role-input:focus { outline: none; border-color: var(--accent); }
.error { color: var(--red); font-size: 12px; margin: 6px 0; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; }
.primary-btn, .secondary-btn { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.primary-btn { background: var(--accent); color: var(--bg); }
.primary-btn.disabled { opacity: .5; cursor: default; }
.secondary-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); }
.secondary-btn:hover { color: var(--text); border-color: var(--text3); }
</style>
