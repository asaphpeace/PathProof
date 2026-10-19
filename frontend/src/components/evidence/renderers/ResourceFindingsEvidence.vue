<template>
  <div class="resource-findings">
    <div v-if="data.findings.length === 0" class="empty">No other open findings on this resource.</div>
    <div v-for="f in data.findings" :key="f.id" class="row" @click="drillFinding(f)">
      <span class="pill" :style="{ color: severityColor(f.severity), borderColor: severityColor(f.severity), background: `color-mix(in srgb, ${severityColor(f.severity)} 16%, transparent)` }">
        {{ f.severity }}
      </span>
      <div class="row-main">
        <div class="row-title">{{ f.title }}</div>
        <div class="row-meta">{{ f.check_id || 'no check id' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

const props = defineProps<{ data: { resourceUid: string; findings: any[] } }>()
const panels = usePanelStore()

function drillFinding(f: any) {
  panels.push({ type: 'finding', title: f.title, data: f })
}
</script>

<style scoped>
.resource-findings { display: flex; flex-direction: column; gap: 8px; }
.empty { font-size: 13px; color: var(--text2); padding: 8px 0; }
.row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--surface2); border: 1px solid var(--border); cursor: pointer; }
.row:hover { border-color: var(--accent); }
.pill {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; flex-shrink: 0;
}
.row-main { min-width: 0; }
.row-title { font-size: 13px; font-weight: 600; overflow-wrap: break-word; }
.row-meta { font-size: 11px; color: var(--text3); margin-top: 2px; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
</style>
