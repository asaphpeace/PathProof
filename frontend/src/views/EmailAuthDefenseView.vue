<template>
  <div>
    <h1 class="title">Email Authentication Defense</h1>
    <p class="subtitle">DMARC, MTA-STS, and certificate posture — continuously monitored via report ingestion in Zoneproof, not an on-demand scan.</p>

    <div class="controls-row">
      <div class="refresh-btn" :class="{ running: loading }" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</div>
    </div>

    <div v-if="loadError" class="empty-state error">{{ loadError }}</div>

    <template v-else-if="overview">
      <div class="score-card">
        <div class="score-grade" :style="{ color: overview.sentinel.grade_color, borderColor: overview.sentinel.grade_color }">
          {{ overview.sentinel.grade }}
        </div>
        <div class="score-main">
          <div class="score-value">{{ overview.sentinel.score }}<span class="score-max">/100</span></div>
          <div class="score-label">{{ overview.sentinel.grade_label }}</div>
          <div v-if="overview.sentinel.delta !== null" class="score-delta" :class="{ up: overview.sentinel.delta > 0, down: overview.sentinel.delta < 0 }">
            {{ overview.sentinel.delta > 0 ? '+' : '' }}{{ overview.sentinel.delta }} vs last week
          </div>
        </div>
        <div class="pillar-list">
          <div class="pillar-row"><span>DMARC</span><span>{{ overview.sentinel.pillar_dmarc.toFixed(0) }} / 60</span></div>
          <div class="pillar-row"><span>TLS / MTA-STS</span><span>{{ overview.sentinel.pillar_tls.toFixed(0) }} / 25</span></div>
          <div class="pillar-row"><span>Certificates</span><span>{{ overview.sentinel.pillar_certs.toFixed(0) }} / 15</span></div>
        </div>
      </div>

      <div v-if="overview.cert_expiry_list?.length" class="alert-card">
        <div class="alert-title">Certificate expiry alerts</div>
        <div v-for="c in overview.cert_expiry_list" :key="c.domain" class="alert-row">
          <span class="alert-pill" :class="c.status">{{ c.status.replace('_', ' ') }}</span>
          <span class="alert-domain">{{ c.domain }}</span>
          <span class="alert-days">{{ c.days_remaining !== null ? `${c.days_remaining}d remaining` : 'unknown' }}</span>
        </div>
      </div>

      <div class="domain-table">
        <div class="domain-head">
          <span>Domain</span><span>Grade</span><span>DMARC</span><span>MTA-STS</span><span>Cert</span><span>Volume</span>
        </div>
        <div v-for="d in overview.domains" :key="d.domain" class="domain-row">
          <span class="domain-name">{{ d.domain }}</span>
          <span class="domain-grade" :style="{ color: d.grade_color }">{{ d.grade }}</span>
          <span class="dmarc-pill" :class="d.dmarc_stage">{{ d.dmarc_stage }}</span>
          <span class="mta-pill" :class="d.mta_sts_stage">{{ d.mta_sts_stage }} <span class="hosting-mode">({{ d.mta_sts_hosting_mode }})</span></span>
          <span class="cert-status" :class="d.cert_status ?? ''">{{ d.cert_status ? d.cert_status.replace('_', ' ') : '—' }}<span v-if="d.min_cert_days !== null" class="cert-days"> {{ d.min_cert_days }}d</span></span>
          <span class="domain-volume">{{ d.volume.toLocaleString() }}</span>
        </div>
      </div>

      <div class="certs-toggle" @click="showCerts = !showCerts">{{ showCerts ? 'Hide' : 'Show' }} full certificate detail →</div>
      <div v-if="showCerts" class="certs-table">
        <div v-if="certsLoading" class="empty-state">Loading certificates…</div>
        <div v-else-if="certs.length === 0" class="empty-state">No certificates probed yet.</div>
        <div v-else class="cert-list">
          <div v-for="c in certs" :key="c.id" class="cert-row">
            <span class="cert-pill" :class="c.status">{{ c.status.replace('_', ' ') }}</span>
            <div class="cert-main">
              <div class="cert-host">{{ c.host }} <span class="cert-type">({{ c.host_type }})</span></div>
              <div class="cert-meta">{{ c.issuer || 'unknown issuer' }} · {{ c.tls_version || 'no TLS version reported' }}</div>
            </div>
            <span class="cert-days-remaining">{{ c.days_remaining !== null ? `${c.days_remaining}d` : '—' }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'

const overview = ref<any | null>(null)
const loading = ref(false)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    overview.value = await api.overview()
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load email authentication posture'
  } finally {
    loading.value = false
  }
}

const certs = ref<any[]>([])
const certsLoading = ref(false)
const showCerts = ref(false)
async function loadCerts() {
  if (certs.value.length || certsLoading.value) return
  certsLoading.value = true
  try {
    certs.value = await api.overviewCerts()
  } catch {
    // The summary card above already shows expiry alerts — this deeper
    // table is optional, so a failure here just leaves it empty.
  } finally {
    certsLoading.value = false
  }
}

onMounted(async () => {
  await load()
  loadCerts()
})
</script>

<style scoped>
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 20px; color: var(--text2); font-size: 14px; }
.controls-row { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 16px; }
.refresh-btn {
  padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer;
  background: var(--accent); color: var(--bg); border: 1px solid var(--accent);
}
.refresh-btn.running { background: var(--surface2); color: var(--text2); border-color: var(--border); cursor: default; }

.empty-state { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; color: var(--text2); font-size: 13px; }
.empty-state.error { border-color: var(--red); color: var(--red); }

.score-card { display: flex; align-items: center; gap: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; flex-wrap: wrap; }
.score-grade { font-size: 32px; font-weight: 800; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; border: 2px solid; border-radius: 50%; flex-shrink: 0; }
.score-main { flex-shrink: 0; }
.score-value { font-size: 28px; font-weight: 800; }
.score-max { font-size: 14px; color: var(--text3); font-weight: 600; }
.score-label { font-size: 12.5px; color: var(--text2); }
.score-delta { font-size: 11px; color: var(--text3); margin-top: 2px; }
.score-delta.up { color: var(--green); }
.score-delta.down { color: var(--red); }
.pillar-list { display: flex; flex-direction: column; gap: 4px; margin-left: auto; }
.pillar-row { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; color: var(--text2); min-width: 180px; }

.alert-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
.alert-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.alert-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 12.5px; }
.alert-row:first-of-type { border-top: none; }
.alert-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--surface2); color: var(--text2); }
.alert-pill.expired { color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }
.alert-pill.critical { color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }
.alert-pill.expiring_soon { color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.alert-domain { font-weight: 600; }
.alert-days { color: var(--text3); margin-left: auto; }

.domain-table { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
.domain-head, .domain-row { display: grid; grid-template-columns: 1.6fr 0.6fr 0.9fr 1.2fr 1fr 0.8fr; gap: 10px; align-items: center; padding: 11px 16px; }
.domain-head { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text3); background: var(--surface2); }
.domain-row { border-top: 1px solid var(--border); font-size: 12.5px; }
.domain-name { font-weight: 600; overflow-wrap: break-word; }
.domain-grade { font-weight: 800; }
.dmarc-pill, .mta-pill, .cert-status { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; text-transform: capitalize; }
.dmarc-pill.reject, .mta-pill.enforce { color: var(--green); }
.dmarc-pill.quarantine, .mta-pill.testing { color: var(--amber); }
.dmarc-pill.none, .mta-pill.none { color: var(--text3); }
.hosting-mode { color: var(--text3); text-transform: lowercase; }
.cert-status.ok { color: var(--green); }
.cert-status.expiring_soon { color: var(--amber); }
.cert-status.critical, .cert-status.expired { color: var(--red); }
.cert-days { color: var(--text3); }
.domain-volume { font-variant-numeric: tabular-nums; color: var(--text2); }

.certs-toggle { color: var(--accent); font-size: 12.5px; cursor: pointer; width: fit-content; margin-bottom: 10px; }
.certs-table { border: 1px solid var(--border); border-radius: 12px; padding: 4px 0; }
.cert-list { display: flex; flex-direction: column; }
.cert-row { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--border); }
.cert-row:first-child { border-top: none; }
.cert-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--surface2); color: var(--text2); flex-shrink: 0; }
.cert-pill.ok { color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
.cert-pill.expiring_soon { color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.cert-pill.critical, .cert-pill.expired, .cert-pill.error { color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }
.cert-main { flex: 1 1 auto; min-width: 0; }
.cert-host { font-size: 12.5px; font-weight: 600; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.cert-type { color: var(--text3); font-weight: 400; }
.cert-meta { font-size: 11px; color: var(--text3); margin-top: 2px; }
.cert-days-remaining { font-size: 12px; color: var(--text2); white-space: nowrap; }
</style>
