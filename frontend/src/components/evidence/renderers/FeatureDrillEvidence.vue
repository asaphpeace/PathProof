<template>
  <div class="feature-drill">
    <div v-if="data.loading" class="drill-empty">Loading real results…</div>
    <div v-else-if="data.error" class="drill-empty">{{ data.error }}</div>
    <div v-else-if="data.items.length === 0" class="drill-empty">No results yet — run a scan to populate this.</div>
    <template v-else>
      <div class="drill-summary-row">
        <div class="drill-summary">{{ summaryText }}</div>
        <RouterLink v-if="data.findingsLink" :to="data.findingsLink" class="drill-view-all" @click="panels.close()">View all in Findings →</RouterLink>
      </div>
      <div class="drill-list">
        <div v-for="item in data.items" :key="item.id" class="drill-item" @click="openItem(item)">
          <div class="pill" :style="{ color: severityColor(item.severity), borderColor: severityColor(item.severity), background: `color-mix(in srgb, ${severityColor(item.severity)} 16%, transparent)` }">
            {{ item.severity }}
          </div>
          <div class="drill-main">
            <div class="drill-title">
              {{ item.title }}
              <span v-if="item._raw?.occurrence_count > 1" class="occurrence-badge">× {{ item._raw.occurrence_count }} regions</span>
            </div>
            <div v-if="item.detail" class="drill-detail">{{ truncate(item.detail, 160) }}</div>
          </div>
          <div class="drill-time">{{ item.time }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

const props = defineProps<{ data: any }>()
const panels = usePanelStore()

const summaryText = computed(() => {
  const counts: Record<string, number> = {}
  for (const item of props.data.items) counts[item.severity] = (counts[item.severity] || 0) + 1
  const order = ['critical', 'high', 'medium', 'low']
  const parts = order.filter(s => counts[s]).map(s => `${counts[s]} ${s}`)
  return `${props.data.items.length} result${props.data.items.length === 1 ? '' : 's'} — ${parts.join(', ')}`
})

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

function openItem(item: any) {
  // Every branch of openFeatureDrill() (CoverageView.vue) already tags its
  // items with the real evidence-panel type for that data — a Finding, an
  // IAM path, an OAuth grant, a phishing campaign, a client score — so
  // this can push straight through instead of special-casing each one.
  panels.push({ type: item._type ?? 'finding', title: item.title, data: item._raw })
}
</script>

<style scoped>
.feature-drill { display: flex; flex-direction: column; gap: 4px; }
.drill-empty { color: var(--text2); font-size: 13px; }
.drill-summary-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-bottom: 10px; }
.drill-summary { font-size: 12px; color: var(--text2); }
.drill-view-all { font-size: 12px; color: var(--accent); text-decoration: none; white-space: nowrap; }
.drill-view-all:hover { text-decoration: underline; }
.drill-list { display: flex; flex-direction: column; gap: 8px; }
.drill-item {
  display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px; padding: 10px 12px;
  border-radius: 8px; background: var(--surface2); border: 1px solid var(--border); cursor: pointer;
}
.drill-item:hover { border-color: var(--accent); }
.pill {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; flex-shrink: 0;
}
.drill-main { flex: 1 1 200px; min-width: 0; }
.drill-title { font-size: 13px; overflow-wrap: break-word; }
.occurrence-badge {
  font-size: 10px; font-weight: 700; color: var(--text2); background: var(--surface);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 7px; margin-left: 6px;
  font-family: 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap;
}
.drill-detail { font-size: 11px; color: var(--text3); margin-top: 2px; overflow-wrap: break-word; }
.drill-time { font-size: 12px; color: var(--text2); white-space: nowrap; flex-shrink: 0; }
</style>
