<template>
  <div class="cloud-asset-evidence">
    <div class="block">
      <div class="block-label">Resource</div>
      <div class="block-text mono">{{ data.resource_id }}</div>
    </div>

    <div class="block">
      <div class="block-label">Details</div>
      <div class="tag-row">
        <span class="tag">{{ data.resource_type }}</span>
        <span v-if="data.region" class="tag">{{ data.region }}</span>
        <span v-for="(v, k) in data.tags" :key="k" class="tag">{{ k }}={{ v }}</span>
      </div>
    </div>

    <div v-if="checkedByEntries.length" class="block">
      <div class="block-label">Checked by</div>
      <div class="tag-row">
        <span
          v-for="[tool, status] in checkedByEntries" :key="tool"
          class="tag" :class="status === 'fail' ? 'tag-danger' : 'tag-ok'"
        >{{ tool }}: {{ status === 'fail' ? 'has findings' : 'clean' }}</span>
      </div>
    </div>

    <div class="block">
      <div class="block-label">Findings ({{ data.findings.length }})</div>
      <div v-if="data.findings.length === 0" class="empty">No findings recorded for this resource — either genuinely clean, or not yet evaluated by any scan pass.</div>
      <div v-for="f in data.findings" :key="f.id" class="row" @click="drillFinding(f)">
        <span
          class="pill"
          :style="{ color: severityColor(f.severity), borderColor: severityColor(f.severity), background: `color-mix(in srgb, ${severityColor(f.severity)} 16%, transparent)` }"
        >{{ f.severity }}</span>
        <div class="row-main">
          <div class="row-title">
            {{ f.title }}
            <span v-if="f.status !== 'open'" class="resolved-tag">{{ f.status }}</span>
          </div>
          <div class="row-meta">{{ f.check_id || 'no check id' }}</div>
        </div>
      </div>
    </div>

    <div class="block meta-row">
      <span>First seen {{ formatDate(data.first_seen_at) }}</span>
      <span>Last seen {{ formatDate(data.last_seen_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

const props = defineProps<{ data: any }>()
const panels = usePanelStore()

const checkedByEntries = computed(() => Object.entries(props.data.checked_by || {}))

function drillFinding(f: any) {
  panels.push({ type: 'finding', title: f.title, data: f })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.cloud-asset-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.empty { font-size: 13px; color: var(--text2); padding: 4px 0; }

.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  font-size: 11px; padding: 3px 8px; border-radius: 6px; background: var(--surface2);
  border: 1px solid var(--border); color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.tag-danger { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); background: color-mix(in srgb, var(--red) 12%, transparent); }
.tag-ok { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); background: color-mix(in srgb, var(--green) 12%, transparent); }

.row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--surface2); border: 1px solid var(--border); cursor: pointer; margin-bottom: 6px; }
.row:hover { border-color: var(--accent); }
.pill {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; flex-shrink: 0;
}
.row-main { min-width: 0; }
.row-title { font-size: 13px; font-weight: 600; overflow-wrap: break-word; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.resolved-tag { font-size: 10px; font-weight: 700; color: var(--green); text-transform: uppercase; }
.row-meta { font-size: 11px; color: var(--text3); margin-top: 2px; font-family: 'IBM Plex Mono', ui-monospace, monospace; }

.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }
</style>
