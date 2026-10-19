<template>
  <div>
    <h1 class="title">What Changed? <span class="preview-tag">Preview — illustrative only</span></h1>
    <p class="subtitle">The exact configuration change or technician action behind every new attack path. This page is not wired to real data yet — see below for what it will show once it is.</p>

    <div class="timeline">
      <div class="timeline-rail" />
      <div v-for="(e, i) in TIMELINE_EVENTS" :key="i" class="timeline-item">
        <div class="timeline-dot" :style="{ background: severityColor(e.severity) }" />
        <div class="timeline-card">
          <div class="timeline-head">
            <div class="timeline-time">{{ e.time }}</div>
            <div
              class="pill"
              :style="{ color: severityColor(e.severity), borderColor: severityColor(e.severity), background: `color-mix(in srgb, ${severityColor(e.severity)} 16%, transparent)` }"
            >{{ e.severity }}</div>
          </div>
          <div class="timeline-change">{{ e.change }}</div>
          <div class="timeline-impact">{{ e.impact }}</div>
          <div class="timeline-actor">by {{ e.actor }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TIMELINE_EVENTS } from '@/data/demo'
import { severityColor } from '@/data/colors'
</script>

<style scoped>
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; display: flex; align-items: center; gap: 12px; }
.preview-tag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--amber);
  background: color-mix(in srgb, var(--amber) 14%, transparent); border: 1px solid color-mix(in srgb, var(--amber) 40%, transparent);
  border-radius: 999px; padding: 3px 10px;
}
.subtitle { margin: 0 0 28px; color: var(--text2); font-size: 14px; }

.timeline { position: relative; padding-left: 28px; }
.timeline-rail { position: absolute; left: 5px; top: 6px; bottom: 6px; width: 2px; background: var(--border); }
.timeline-item { position: relative; padding-bottom: 26px; }
.timeline-item:last-child { padding-bottom: 0; }
.timeline-dot { position: absolute; left: -28px; top: 4px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--bg); }
.timeline-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }
.timeline-head { display: flex; justify-content: space-between; margin-bottom: 6px; gap: 12px; }
.timeline-time { font-size: 12px; color: var(--text2); white-space: nowrap; }
.pill {
  display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.03em;
  border: 1px solid; white-space: nowrap;
}
.timeline-change { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.timeline-impact { font-size: 12px; color: var(--text2); margin-bottom: 4px; }
.timeline-actor { font-size: 11px; color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
</style>
