<template>
  <div class="coverage-verdict-evidence">
    <div class="verdict-head">
      <span class="verdict-pill" :class="data.verdict">{{ verdictLabel(data.verdict) }}</span>
    </div>

    <div class="block">
      <div class="block-label">Why</div>
      <div class="block-text">{{ data.reason }}</div>
    </div>

    <div class="block">
      <div class="block-label">Detection sources on this account</div>
      <div class="source-row">
        <span class="source-icon" :class="{ on: data.cloudtrail_multi_region_enabled }">{{ data.cloudtrail_multi_region_enabled ? '✓' : '✗' }}</span>
        <span>CloudTrail — multi-region</span>
      </div>
      <div class="source-row">
        <span class="source-icon" :class="{ on: data.guardduty_enabled }">{{ data.guardduty_enabled ? '✓' : '✗' }}</span>
        <span>GuardDuty — enabled</span>
      </div>
    </div>

    <div class="block">
      <div class="block-label">The attack path this covers</div>
      <div class="path-chain">
        <span class="path-node">{{ shortArn(data.source_principal_arn) }}</span>
        <span class="path-arrow">→</span>
        <span class="path-node target">{{ shortArn(data.target_principal_arn) }}</span>
      </div>
      <div class="action-list">
        <span v-for="a in data.technique_chain" :key="a" class="action-tag">{{ a }}</span>
      </div>
    </div>

    <div class="block meta-row">
      <span>{{ data.severity?.toUpperCase() }}</span>
      <span>Path discovered {{ formatDate(data.discovered_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ data: any }>()

function verdictLabel(verdict: string): string {
  return { covered: 'Covered', partial: 'Partial coverage', blind_spot: 'Blind spot' }[verdict] ?? verdict
}
function shortArn(arn: string): string {
  return arn?.split('/').pop() ?? arn
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.coverage-verdict-evidence { display: flex; flex-direction: column; gap: 18px; }
.verdict-head { padding-bottom: 4px; }
.verdict-pill {
  display: inline-flex; align-items: center; padding: 5px 12px; border-radius: 999px;
  font: 700 12px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid;
}
.verdict-pill.covered { color: var(--green); border-color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
.verdict-pill.partial { color: var(--amber); border-color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.verdict-pill.blind_spot { color: var(--red); border-color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }

.block { display: flex; flex-direction: column; gap: 8px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }

.source-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.source-icon { font-weight: 700; color: var(--red); width: 14px; }
.source-icon.on { color: var(--green); }

.path-chain { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.path-node {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; padding: 6px 10px;
  border-radius: 6px; background: var(--surface2); border: 1px solid var(--border);
}
.path-node.target { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); }
.path-arrow { color: var(--text3); }
.action-list { display: flex; flex-direction: column; gap: 4px; }
.action-tag {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 6px; padding: 6px 9px; width: fit-content;
}

.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }
</style>
