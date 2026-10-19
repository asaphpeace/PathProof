<template>
  <div>
    <h1 class="title">Third-Party OAuth App Risk</h1>
    <p class="subtitle">Every OAuth grant discovered across your connected Microsoft 365 tenants — cross-connection, read-only risk analysis.</p>

    <div class="controls-row">
      <div class="refresh-btn" :class="{ running: loading }" @click="load">{{ loading ? 'Loading…' : 'Refresh' }}</div>
    </div>

    <div v-if="grants.length" class="stats-row">
      <button
        v-for="s in riskStats" :key="s.tier" class="stat-box"
        :class="{ active: activeRiskFilter === s.tier }"
        :style="{ borderColor: activeRiskFilter === s.tier ? severityColor(s.tier) : 'var(--border)' }"
        @click="toggleRiskFilter(s.tier)"
      >
        <div class="stat-value" :style="{ color: severityColor(s.tier) }">{{ s.count }}</div>
        <div class="stat-label">{{ s.tier }}</div>
      </button>
      <div class="stat-box total"><div class="stat-value">{{ publisherStats.verified }}</div><div class="stat-label">verified publisher</div></div>
      <div class="stat-box total"><div class="stat-value">{{ publisherStats.unverified }}</div><div class="stat-label">unverified publisher</div></div>
    </div>

    <div v-if="loadError" class="empty-state error">{{ loadError }}</div>
    <div v-else-if="!loading && grants.length === 0" class="empty-state">
      <div class="empty-title">No OAuth grants discovered yet</div>
      <div class="empty-body">
        Connect a Microsoft 365 tenant and run a scan under <RouterLink :to="{ name: 'settings' }">Settings</RouterLink> first.
      </div>
    </div>

    <div v-else class="grant-list">
      <div v-for="g in filteredGrants" :key="g.id" class="grant-card" @click="openGrant(g)">
        <div class="pill" :style="{ color: severityColor(g.risk_tier), borderColor: severityColor(g.risk_tier), background: `color-mix(in srgb, ${severityColor(g.risk_tier)} 16%, transparent)` }">{{ g.risk_tier }}</div>
        <div class="grant-main">
          <div class="grant-title">{{ g.app_name }}</div>
          <div class="grant-meta">{{ g.publisher_verified ? `Verified — ${g.publisher_name}` : 'Unverified publisher' }} · {{ g.scopes.length }} scope{{ g.scopes.length === 1 ? '' : 's' }} · granted by {{ g.grantee_principal }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

interface OAuthGrant {
  id: string; grantee_principal: string; app_name: string; app_client_id: string
  scopes: string[]; risk_tier: string; publisher_verified: boolean; publisher_name: string | null
  granted_at: string | null; discovered_at: string
}

const panels = usePanelStore()
const grants = ref<OAuthGrant[]>([])
const loading = ref(false)
const loadError = ref('')
const activeRiskFilter = ref<string | null>(null)

// Loops every active oauth_risk ENGAGEMENT (not connections) — sidesteps a
// latent bug in SettingsView.vue's own grant-loading logic, where looping
// connections instead of engagements always resolves the same first
// matching engagement for every connection, since OAuthAppConnectionOut
// doesn't expose engagement_id to the frontend at all. Noted as a
// pre-existing issue worth a future fix, not touched here — SettingsView.vue
// stays the connection-lifecycle home, out of scope for this page.
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const engagements = await api.engagements()
    const activeOauthEngagements = engagements.filter((e: any) => e.status === 'active' && e.tier === 'oauth_risk')
    if (activeOauthEngagements.length === 0) { grants.value = []; return }
    const grantLists = await Promise.all(activeOauthEngagements.map((e: any) => api.oauthGrants(e.id)))
    grants.value = grantLists.flat()
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load OAuth grants'
  } finally {
    loading.value = false
  }
}

const RISK_ORDER = ['critical', 'high', 'medium', 'low']
const riskStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const g of grants.value) counts[g.risk_tier] = (counts[g.risk_tier] || 0) + 1
  return RISK_ORDER.filter(r => counts[r]).map(r => ({ tier: r, count: counts[r] }))
})
const publisherStats = computed(() => ({
  verified: grants.value.filter(g => g.publisher_verified).length,
  unverified: grants.value.filter(g => !g.publisher_verified).length,
}))

function toggleRiskFilter(tier: string) {
  activeRiskFilter.value = activeRiskFilter.value === tier ? null : tier
}
const filteredGrants = computed(() => {
  const list = activeRiskFilter.value ? grants.value.filter(g => g.risk_tier === activeRiskFilter.value) : grants.value
  return [...list].sort((a, b) => RISK_ORDER.indexOf(a.risk_tier) - RISK_ORDER.indexOf(b.risk_tier))
})

function openGrant(g: OAuthGrant) {
  panels.push({ type: 'oauth-grant', title: g.app_name, data: g })
}

onMounted(load)
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

.empty-state { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
.empty-state.error { border-color: var(--red); color: var(--red); }
.empty-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.empty-body { font-size: 13px; color: var(--text2); line-height: 1.6; }
.empty-body a { color: var(--accent); }

.stats-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
.stat-box {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 16px;
  min-width: 76px; cursor: pointer; font-family: var(--font-body); text-align: left;
}
.stat-box.total { cursor: default; }
.stat-box.active { background: var(--surface2); }
.stat-value { font-size: 20px; font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.03em; }

.grant-list { display: flex; flex-direction: column; gap: 10px; }
.grant-card { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; cursor: pointer; }
.pill {
  display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid; width: fit-content; white-space: nowrap; flex-shrink: 0;
}
.grant-main { flex: 1 1 220px; min-width: 0; }
.grant-title { font-size: 14px; font-weight: 600; }
.grant-meta { font-size: 11px; color: var(--text3); margin-top: 3px; }
</style>
