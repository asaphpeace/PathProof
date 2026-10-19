<template>
  <div>
    <div class="header-row">
      <div>
        <h1 class="title">Audit Log</h1>
        <p class="subtitle">Every consequential action, real and independently reviewable — who did what, when, and what changed.</p>
      </div>
      <div v-if="!upgradeRequired && entries.length" class="export-btn" @click="exportCsv">Export CSV</div>
    </div>

    <div v-if="!upgradeRequired" class="controls">
      <select class="filter-select" v-model.number="days" @change="load">
        <option :value="7">Last 7 days</option>
        <option :value="30">Last 30 days</option>
        <option :value="90">Last 90 days</option>
        <option :value="365">Last 365 days</option>
      </select>
      <input v-model="actionFilter" class="filter-input" placeholder="Filter by action, e.g. cloud_connection.revoked" @keyup.enter="load" />
    </div>

    <div v-if="loading" class="empty">Loading…</div>

    <div v-else-if="upgradeRequired" class="upgrade-card">
      <div class="upgrade-title">Audit Log is an MSP/Enterprise-plan feature</div>
      <div class="upgrade-body">{{ upgradeMessage }}</div>
    </div>

    <div v-else-if="loadError" class="empty error">{{ loadError }}</div>

    <div v-else-if="entries.length === 0" class="empty">No actions logged in this window yet.</div>

    <div v-else class="table-card">
      <div class="table-head">
        <div>When</div><div>Actor</div><div>Action</div><div>Target</div>
      </div>
      <div v-for="e in entries" :key="e.id" class="table-row" @click="openEntry(e)">
        <div class="cell-time">{{ formatDate(e.created_at) }}</div>
        <div class="cell-actor mono">{{ e.actor_email || 'System' }}</div>
        <div class="cell-action mono">{{ e.action }}</div>
        <div class="cell-target">{{ e.target_label || e.target_type || '—' }}</div>
      </div>
    </div>

    <div v-if="entries.length && entries.length >= limit" class="load-more" @click="loadMore">Load more</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'

const panels = usePanelStore()

const entries = ref<any[]>([])
const loading = ref(true)
const loadError = ref('')
const upgradeRequired = ref(false)
const upgradeMessage = ref('')
const days = ref(30)
const actionFilter = ref('')
const limit = ref(50)

function parseDetail(message: string): { code?: string; message?: string } | null {
  try {
    const parsed = JSON.parse(message)
    return typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  upgradeRequired.value = false
  limit.value = 50
  try {
    entries.value = await api.auditLog({ days: days.value, action: actionFilter.value || undefined, limit: limit.value })
  } catch (e: any) {
    const parsed = parseDetail(e.message)
    if (parsed?.code === 'feature_not_available') {
      upgradeRequired.value = true
      upgradeMessage.value = parsed.message ?? 'Upgrade to the MSP or Enterprise plan for the audit trail.'
    } else {
      loadError.value = parsed?.message ?? e.message ?? 'Failed to load the audit log'
    }
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  limit.value += 50
  try {
    entries.value = await api.auditLog({ days: days.value, action: actionFilter.value || undefined, limit: limit.value })
  } catch {
    // Non-fatal — keep whatever's already loaded.
  }
}

async function exportCsv() {
  try {
    await api.exportAuditLog(days.value)
  } catch (e: any) {
    loadError.value = e.message ?? 'Export failed'
  }
}

function openEntry(e: any) {
  panels.push({ type: 'audit-log-entry', title: e.action, data: e })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

onMounted(load)
</script>

<style scoped>
.header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 14px; max-width: 560px; }
.export-btn {
  padding: 9px 16px; border-radius: 8px; background: var(--accent); color: var(--bg);
  font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}

.controls { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
.filter-select, .filter-input {
  height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 13px;
}
.filter-select:focus, .filter-input:focus { outline: none; border-color: var(--accent); }
.filter-input { flex: 1 1 260px; min-width: 0; }

.empty { color: var(--text2); font-size: 14px; padding: 24px 0; }
.empty.error { color: var(--red); }

.upgrade-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
.upgrade-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.upgrade-body { font-size: 13px; color: var(--text2); line-height: 1.6; }

.table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.table-head {
  display: grid; grid-template-columns: 1.2fr 1.4fr 1.6fr 1.8fr; padding: 12px 20px; font-size: 11px;
  color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
}
.table-row {
  display: grid; grid-template-columns: 1.2fr 1.4fr 1.6fr 1.8fr; align-items: center; padding: 12px 20px;
  border-bottom: 1px solid var(--border); cursor: pointer; gap: 8px;
}
.table-row:hover { background: var(--surface2); }
.table-row:last-child { border-bottom: none; }
.cell-time { font-size: 12px; color: var(--text2); }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; }
.cell-action { color: var(--accent); }
.cell-target { font-size: 12.5px; color: var(--text2); overflow-wrap: break-word; }

.load-more {
  text-align: center; padding: 12px; margin-top: 10px; font-size: 12.5px; color: var(--accent);
  cursor: pointer; border: 1px solid var(--border); border-radius: 8px;
}
.load-more:hover { border-color: var(--accent); }
</style>
