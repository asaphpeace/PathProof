<template>
  <aside class="phishing-subnav phishing-scope" :class="{ 'tab-mode': tabMode }">
    <RouterLink
      v-for="item in ITEMS" :key="item.name" :to="{ name: item.name }"
      class="psn-row" :class="{ active: route.name === item.name }"
    >
      <component :is="item.icon" class="psn-icon" :size="16" :stroke-width="2" />
      <span class="psn-label">{{ item.label }}</span>
    </RouterLink>
  </aside>
</template>

<script setup lang="ts">
// Persistent Phishing sub-navigation (Phishing Simulation roadmap Phase
// 31) — replaces what used to be three separate, inconsistent mechanisms
// layered on each other: PhishingView.vue's 5 inline Tier B link-btns
// (only reachable from the landing page), a repeated "‹ Phishing
// Simulation" back-link on every sub-screen (only goes back one screen at
// a time), and the top-bar breadcrumb (location-only, not a nav control).
// This one persistent rail replaces the first two; the breadcrumb stays,
// since it was never a nav mechanism to begin with.
//
// Wrapped in .phishing-scope itself (same class the workspace content
// area already uses, tokens.css:56-59) so its active-state color is
// violet — consistent with this module's already-established sub-brand,
// not a new theming decision. The GLOBAL app sidebar (AppShell.vue)
// deliberately does NOT get this class and keeps its own teal identity
// per tokens.css's existing, explicit rule.
import { useRoute, RouterLink } from 'vue-router'
import { Target, Gauge, FileText, GraduationCap, Inbox, Settings } from '@lucide/vue'

defineProps<{ tabMode?: boolean }>()

const route = useRoute()

const ITEMS = [
  { name: 'phishing', label: 'Simulations', icon: Target },
  { name: 'phishing-dashboard', label: 'Dashboard', icon: Gauge },
  { name: 'phishing-templates', label: 'Templates', icon: FileText },
  { name: 'phishing-training', label: 'Training', icon: GraduationCap },
  { name: 'phishing-triage', label: 'Real-Threat Reports', icon: Inbox },
  { name: 'phishing-settings', label: 'Settings', icon: Settings },
]
</script>

<style scoped>
.phishing-subnav {
  width: 184px; flex-shrink: 0; background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 2px; padding: 16px 10px;
}
.psn-row {
  display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px;
  cursor: pointer; font-size: 12.5px; font-weight: 500; color: var(--text2);
  text-decoration: none; transition: background .12s, color .12s;
}
.psn-row:hover { background: var(--surface2); color: var(--text); }
.psn-row.active { background: var(--surface2); color: var(--text); font-weight: 600; }
.psn-icon { flex-shrink: 0; color: var(--text3); }
.psn-row:hover .psn-icon { color: var(--text2); }
.psn-row.active .psn-icon { color: var(--accent); }
.psn-label { flex: 1; white-space: nowrap; }

/* Below ~900px (AppShell's own breakpoint) this becomes a horizontal
   scrollable tab strip instead of a second off-canvas drawer — two
   hamburgers would be more confusing than the nav problem this phase
   fixes. AppShell toggles tab-mode via the tabMode prop at that width. */
.phishing-subnav.tab-mode {
  width: 100%; flex-direction: row; overflow-x: auto; border-right: none;
  border-bottom: 1px solid var(--border); padding: 8px 10px; gap: 4px;
}
.tab-mode .psn-row { flex-shrink: 0; padding: 7px 11px; }
.tab-mode .psn-label { white-space: nowrap; }
</style>
