<template>
  <div class="connected-accounts-evidence">
    <div class="block">
      <div class="block-label">Connected cloud accounts ({{ data.connections.length }})</div>
      <div v-if="data.connections.length === 0" class="empty">No connected accounts.</div>
      <div v-for="c in data.connections" :key="c.id" class="row">
        <span
          class="pill"
          :class="c.status === 'connected' ? 'pill-ok' : 'pill-danger'"
        >{{ c.status }}</span>
        <div class="row-main">
          <div class="row-title">{{ c.provider.toUpperCase() }} — {{ shortArn(c.role_arn) || 'no role configured' }}</div>
          <div v-if="c.role_arn" class="row-meta mono">{{ c.role_arn }}</div>
          <div class="row-meta">
            {{ c.last_scanned_at ? `Last scanned ${formatDate(c.last_scanned_at)}` : 'Never scanned' }}
            <span v-if="c.last_scan_status && c.last_scan_status !== 'never_run'"> · scan {{ c.last_scan_status }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="block">
      <RouterLink :to="{ name: 'settings' }" class="settings-link">Manage connections in Settings →</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{ data: { connections: any[] } }>()

function shortArn(arn: string | null): string | null {
  return arn ? arn.split('/').pop() ?? arn : null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.connected-accounts-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.empty { font-size: 13px; color: var(--text2); padding: 4px 0; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }

.row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--surface2); border: 1px solid var(--border); margin-bottom: 6px; }
.pill {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; flex-shrink: 0;
}
.pill-ok { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); background: color-mix(in srgb, var(--green) 12%, transparent); }
.pill-danger { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); background: color-mix(in srgb, var(--red) 12%, transparent); }
.row-main { min-width: 0; }
.row-title { font-size: 13px; font-weight: 600; overflow-wrap: break-word; }
.row-meta { font-size: 11px; color: var(--text3); margin-top: 2px; overflow-wrap: break-word; }

.settings-link { display: block; font-size: 12.5px; color: var(--accent); text-decoration: none; }
.settings-link:hover { text-decoration: underline; }
</style>
