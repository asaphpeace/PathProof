<template>
  <div class="shell">
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false" />
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="brand">
        <div class="logo-badge">S</div>
        <div>
          <div class="brand-name">Sentinel</div>
          <div class="brand-sub">for MSPs</div>
        </div>
      </div>

      <nav class="nav-groups">
        <div v-for="grp in navGroups" :key="grp.label" class="nav-group">
          <div class="nav-group-label">{{ grp.label }}</div>
          <div class="nav-group-items">
            <RouterLink
              v-for="item in grp.items"
              :key="item.name"
              :to="{ name: item.name }"
              class="nav-row"
              :class="{ active: route.name === item.name }"
              @click="sidebarOpen = false"
            >
              <component :is="item.icon" class="nav-icon" :size="16" :stroke-width="2" />
              <span class="nav-label">{{ item.label }}</span>
              <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="status-row">
        <span class="status-dot" />
        <span class="status-text">All systems monitoring</span>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="menu-btn" aria-label="Toggle navigation" @click="sidebarOpen = !sidebarOpen">
          <span /><span /><span />
        </button>
        <div class="crumb">
          <span class="crumb-group">{{ activeGroupLabel }}</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-active">{{ activeLabel }}</span>
        </div>
        <button class="signout" @click="signOut">Sign out</button>
      </header>
      <PhishingSubNav v-if="isPhishingModule" class="phishing-subnav-tabs" tab-mode />
      <div class="content-row">
        <PhishingSubNav v-if="isPhishingModule" class="phishing-subnav-rail" />
        <main class="workspace" :class="{ 'phishing-scope': isPhishingModule }">
          <router-view />
        </main>
      </div>
    </div>

    <EvidencePanel />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { STARTING_XI, statusKind } from '@/data/roster'
import EvidencePanel from '@/components/evidence/EvidencePanel.vue'
import PhishingSubNav from '@/components/layout/PhishingSubNav.vue'
// Real per-item icons (Phishing Simulation roadmap Phase 30d) — the
// sidebar had zero icon infrastructure before this (a plain 5px dot
// bullet, no icon library anywhere in the app). First icon library this
// app has ever added — @lucide/vue specifically (lucide-vue-next is the
// deprecated predecessor package), small and tree-shakeable so only the
// icons actually imported below get bundled.
import {
  LayoutDashboard, Waypoints, ShieldCheck, TriangleAlert, Activity,
  Settings as SettingsIcon, ScrollText, Building, Fish, Search,
} from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// Off-canvas sidebar below ~900px (Phishing Simulation roadmap Phase 29d)
// — the sidebar had zero responsive behavior before this; every other
// @media query in the app only reflows content grids, none touched this
// shared chrome. Closes automatically on navigation (nav-row @click above)
// and on any route change (e.g. browser back/forward), not just a click.
const sidebarOpen = ref(false)
watch(() => route.fullPath, () => { sidebarOpen.value = false })

const liveCount = STARTING_XI.filter(f => statusKind(f.status) === 'done').length
const coverageBadge = `${liveCount}/${STARTING_XI.length}`

interface NavItem { name: string; label: string; badge?: string; icon: Component }
interface NavGroup { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { name: 'overview', label: 'Overview', icon: LayoutDashboard },
      { name: 'graph', label: 'Simulation Engine', icon: Waypoints },
      { name: 'coverage', label: 'Coverage Map', badge: coverageBadge, icon: ShieldCheck },
      { name: 'findings', label: 'Findings', icon: TriangleAlert },
      { name: 'timeline', label: 'What Changed', icon: Activity },
    ],
  },
  {
    label: 'Manage',
    items: [
      { name: 'settings', label: 'Settings', icon: SettingsIcon },
      { name: 'audit-log', label: 'Audit Log', icon: ScrollText },
      { name: 'portal', label: 'Multi-Tenant Portfolio', icon: Building },
    ],
  },
  {
    label: 'Sell',
    items: [
      { name: 'phishing', label: 'Phishing Simulation', icon: Fish },
      { name: 'prospect', label: 'Prospect Assessment', icon: Search },
    ],
  },
]

const screenMeta: Record<string, { label: string; group: string }> = {}
for (const grp of navGroups) {
  for (const item of grp.items) {
    screenMeta[item.name] = { label: item.label, group: grp.label }
  }
}
// Sub-routes that aren't their own sidebar item but should still crumb
// under their parent screen.
screenMeta['phishing-campaign'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-settings'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-training'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-triage'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-dashboard'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-templates'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-campaign-new'] = { label: 'Phishing Simulation', group: 'Sell' }
screenMeta['phishing-recipients'] = { label: 'Phishing Simulation', group: 'Sell' }

const activeLabel = computed(() => (route.name ? screenMeta[route.name as string]?.label : '') ?? '')
const activeGroupLabel = computed(() => (route.name ? screenMeta[route.name as string]?.group : '') ?? '')

// Phishing/Awareness sub-brand scope (design adoption pass) — the violet
// accent + sans-only labels live only inside this content area, never on
// the shared sidebar/topbar chrome. Matches every route name under
// PhishingCampaignWizardView/PhishingView/etc. registered in router/index.ts.
const isPhishingModule = computed(() => typeof route.name === 'string' && route.name.startsWith('phishing'))

function signOut() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.shell { display: flex; height: 100vh; width: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: var(--font-body); }

.sidebar {
  width: 236px; flex-shrink: 0; background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 20px 14px;
}

.brand {
  display: flex; align-items: center; gap: 10px;
  padding: 0 6px 22px; margin-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.logo-badge {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1.5px solid var(--accent); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 14px;
}
.brand-name { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
.brand-sub { font-size: 10px; color: var(--text2); }

.nav-groups { display: flex; flex-direction: column; gap: 22px; overflow-y: auto; flex: 1; }
.nav-group-label {
  font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase;
  letter-spacing: 0.08em; padding: 0 10px 8px;
}
.nav-group-items { display: flex; flex-direction: column; gap: 2px; }
.nav-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px;
  cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text2);
  text-decoration: none; transition: background .12s, color .12s;
}
.nav-row:hover { background: var(--surface2); color: var(--text); }
.nav-row.active { background: var(--surface2); color: var(--text); font-weight: 600; }
.nav-icon { flex-shrink: 0; color: var(--text3); }
.nav-row:hover .nav-icon { color: var(--text2); }
.nav-row.active .nav-icon { color: var(--accent); }
.nav-label { flex: 1; }
.nav-badge {
  font: 600 10px 'IBM Plex Mono', ui-monospace, monospace; color: var(--text3);
  background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px;
}

.status-row {
  margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.status-text { font-size: 12px; color: var(--text2); }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  height: 56px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 0 28px; border-bottom: 1px solid var(--border);
}
.crumb { flex: 1; min-width: 0; font-size: 13px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumb-sep { margin: 0 4px; }
.crumb-active { color: var(--text); font-weight: 600; }
.signout {
  padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border); background: transparent;
  font-size: 12px; color: var(--text2); cursor: pointer; white-space: nowrap; flex-shrink: 0;
  font-family: var(--font-body);
}
.signout:hover { color: var(--text); border-color: var(--text3); }

/* ── Phishing sub-nav (Phishing Simulation roadmap Phase 31) ───────────
   Two instances of PhishingSubNav are rendered when isPhishingModule is
   true — a vertical rail (default) and a horizontal tab strip — and
   which one is visible is decided purely by CSS at the same ~900px
   breakpoint the main sidebar already collapses at, matching this file's
   existing pure-CSS responsive pattern rather than adding JS breakpoint
   state. Never both visible at once. */
.content-row { flex: 1; min-height: 0; display: flex; }
.phishing-subnav-tabs { display: none; }
.workspace { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 32px 40px; }

/* ── Off-canvas sidebar, ≤900px (Phishing Simulation roadmap Phase 29d) ── */
.menu-btn {
  display: none; flex-direction: column; justify-content: center; gap: 4px;
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 7px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; padding: 0;
}
.menu-btn span { display: block; height: 1.5px; margin: 0 7px; background: var(--text2); border-radius: 1px; }
.menu-btn:hover span { background: var(--text); }
.sidebar-backdrop { display: none; }

@media (max-width: 900px) {
  .menu-btn { display: flex; }
  .topbar { padding: 0 16px; }
  .workspace { padding: 20px 16px; }
  .phishing-subnav-rail { display: none; }
  .phishing-subnav-tabs { display: flex; }

  .sidebar {
    position: fixed; inset: 0 auto 0 0; z-index: 40; width: 260px; max-width: 82vw;
    transform: translateX(-100%); transition: transform .18s ease; box-shadow: 0 0 0 1px var(--border);
  }
  .sidebar.open { transform: translateX(0); }
  .sidebar-backdrop {
    display: block; position: fixed; inset: 0; z-index: 30; background: rgba(6,9,16,.55);
  }
}
</style>
