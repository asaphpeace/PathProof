<template>
  <div class="audit-entry-evidence">
    <div class="block">
      <div class="block-label">Actor</div>
      <div class="block-text mono">{{ data.actor_email || 'System (background job)' }}</div>
    </div>

    <div class="block">
      <div class="block-label">Action</div>
      <div class="block-text mono">{{ data.action }}</div>
    </div>

    <div v-if="data.target_type" class="block">
      <div class="block-label">Target</div>
      <div class="block-text">{{ data.target_type }}{{ data.target_label ? ` — ${data.target_label}` : '' }}</div>
      <div v-if="data.target_id" class="block-text mono target-id">{{ data.target_id }}</div>
    </div>

    <div v-if="data.before || data.after" class="block">
      <div class="block-label">Change</div>
      <div class="diff-grid">
        <div v-if="data.before" class="diff-col">
          <div class="diff-col-label">Before</div>
          <pre class="diff-json">{{ pretty(data.before) }}</pre>
        </div>
        <div v-if="data.after" class="diff-col">
          <div class="diff-col-label">After</div>
          <pre class="diff-json">{{ pretty(data.after) }}</pre>
        </div>
      </div>
    </div>

    <div class="block meta-row">
      <span v-if="data.ip_address">{{ data.ip_address }}</span>
      <span>{{ formatDate(data.created_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ data: any }>()

function pretty(value: any): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.audit-entry-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; }
.target-id { color: var(--text2); }

.diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.diff-col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.diff-col-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: .03em; }
.diff-json {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10.5px; color: var(--text2);
  background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px;
  white-space: pre-wrap; overflow-wrap: break-word; max-height: 240px; overflow-y: auto; margin: 0;
}

.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }
</style>
