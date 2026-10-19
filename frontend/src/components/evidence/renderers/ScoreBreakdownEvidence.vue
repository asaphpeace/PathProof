<template>
  <div class="score-breakdown">
    <div class="score-head">
      <div class="score-value" :style="{ color: data.sentinel_grade_color }">{{ data.sentinel_score }}</div>
      <div class="score-grade">
        <div class="grade-pill" :style="{ color: data.sentinel_grade_color, borderColor: data.sentinel_grade_color, background: `color-mix(in srgb, ${data.sentinel_grade_color} 16%, transparent)` }">
          {{ data.sentinel_grade }}
        </div>
        <div class="grade-label">{{ data.sentinel_grade_label }}</div>
      </div>
    </div>

    <div class="block">
      <div class="block-label">Email Authentication (DMARC + TLS + Certs)</div>
      <div class="bar-row">
        <span class="bar-name">DMARC</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: pct(data.pillar_dmarc, 60) }" /></div>
        <span class="bar-val">{{ round1(data.pillar_dmarc) }} / 60</span>
      </div>
      <div class="bar-row">
        <span class="bar-name">TLS / MTA-STS</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: pct(data.pillar_tls, 25) }" /></div>
        <span class="bar-val">{{ round1(data.pillar_tls) }} / 25</span>
      </div>
      <div class="bar-row">
        <span class="bar-name">Certificates</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: pct(data.pillar_certs, 15) }" /></div>
        <span class="bar-val">{{ round1(data.pillar_certs) }} / 15</span>
      </div>
    </div>

    <div class="block">
      <div class="block-label">Cloud Posture</div>
      <div v-if="data.pillar_cloud_posture !== null" class="bar-row">
        <span class="bar-name">Prowler + Cloudsplaining + Inspector</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: pct(data.pillar_cloud_posture, 100) }" /></div>
        <span class="bar-val">{{ round1(data.pillar_cloud_posture) }} / 100</span>
      </div>
      <div v-else class="block-text muted">No connected cloud account — this pillar isn't blended into the score yet.</div>
    </div>

    <div class="block">
      <div class="block-label">Human Risk</div>
      <div v-if="data.pillar_human_risk !== null && data.pillar_human_risk !== undefined" class="bar-row">
        <span class="bar-name">Phishing simulation history</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: pct(data.pillar_human_risk, 100) }" /></div>
        <span class="bar-val">{{ round1(data.pillar_human_risk) }} / 100</span>
      </div>
      <div v-else class="block-text muted">No phishing campaign history yet — this pillar isn't blended into the score yet.</div>
      <div v-if="data.phish_click_rate !== null && data.phish_click_rate !== undefined" class="human-risk-meta">
        <span>{{ data.phish_click_rate }}% click rate</span>
        <span>{{ data.phish_report_rate }}% report rate</span>
      </div>
    </div>

    <div class="block meta-row">
      <span>{{ data.domain_count }} domain{{ data.domain_count === 1 ? '' : 's' }}</span>
      <span>{{ data.volume_weighted ? 'Volume-weighted across domains' : 'Simple average (no report volume yet)' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ data: any }>()

function pct(value: number, max: number): string {
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`
}
function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}
</script>

<style scoped>
.score-breakdown { display: flex; flex-direction: column; gap: 20px; }
.score-head { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.score-value { font-size: 40px; font-weight: 800; line-height: 1; }
.score-grade { display: flex; flex-direction: column; gap: 4px; }
.grade-pill {
  display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; width: fit-content;
  font: 700 12px 'IBM Plex Mono', ui-monospace, monospace; border: 1px solid;
}
.grade-label { font-size: 12px; color: var(--text2); }

.block { display: flex; flex-direction: column; gap: 8px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); }
.muted { color: var(--text2); }

.bar-row { display: flex; align-items: center; gap: 10px; }
.bar-name { font-size: 12px; color: var(--text2); width: 150px; flex-shrink: 0; }
.bar-track { flex: 1; height: 8px; border-radius: 4px; background: var(--surface2); overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.bar-val { font-size: 11px; color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; width: 60px; text-align: right; flex-shrink: 0; }

.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }
.human-risk-meta { display: flex; flex-direction: row; gap: 14px; font-size: 11px; color: var(--text3); flex-wrap: wrap; }
</style>
