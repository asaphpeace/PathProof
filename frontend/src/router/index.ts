import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/api/client'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    // V1 -> Command deep-link target: exchanges a short-lived handoff code
    // for a real session here, then redirects into the app shell.
    { path: '/auth/callback', name: 'auth-callback', component: () => import('@/views/CallbackView.vue') },
    {
      path: '/',
      component: () => import('@/components/layout/AppShell.vue'),
      meta: { requiresAuth: true },
      children: [
        // New nav IA per Command_New_face.html: Monitor / Manage / Sell.
        { path: '',              name: 'overview', component: () => import('@/views/OverviewView.vue') },
        { path: 'graph',         name: 'graph',    component: () => import('@/views/GraphView.vue') },
        // Simulate-the-Fix now lives inline on the graph itself (same
        // component, no page transition) — this keeps old bookmarks/links
        // (IamPathEvidence.vue's "Simulate fixing this", saved URLs)
        // working by forwarding the same query params onto /graph, where
        // GraphView.vue reads them to enter simulate mode on load.
        { path: 'graph/simulate', redirect: to => ({ name: 'graph', query: to.query }) },
        { path: 'coverage',      name: 'coverage', component: () => import('@/views/CoverageView.vue') },
        { path: 'detection-coverage', name: 'detection-coverage', component: () => import('@/views/DetectionCoverageView.vue') },
        { path: 'oauth-app-risk', name: 'oauth-app-risk', component: () => import('@/views/OAuthAppRiskView.vue') },
        { path: 'cloud-resources', name: 'cloud-resources', component: () => import('@/views/CloudResourceExplorerView.vue') },
        { path: 'email-auth-defense', name: 'email-auth-defense', component: () => import('@/views/EmailAuthDefenseView.vue') },
        { path: 'findings',      name: 'findings', component: () => import('@/views/FindingsView.vue') },
        { path: 'timeline',      name: 'timeline', component: () => import('@/views/TimelineView.vue') },
        { path: 'settings',      name: 'settings', component: () => import('@/views/SettingsView.vue') },
        { path: 'audit-log',     name: 'audit-log', component: () => import('@/views/AuditLogView.vue') },
        { path: 'portal',        name: 'portal',   component: () => import('@/views/PortalView.vue') },
        { path: 'phishing',      name: 'phishing', component: () => import('@/views/PhishingView.vue') },
        { path: 'phishing/settings', name: 'phishing-settings', component: () => import('@/views/PhishingSettingsView.vue') },
        { path: 'phishing/training', name: 'phishing-training', component: () => import('@/views/PhishingTrainingView.vue') },
        { path: 'phishing/triage', name: 'phishing-triage', component: () => import('@/views/PhishingTriageView.vue') },
        { path: 'phishing/templates', name: 'phishing-templates', component: () => import('@/views/PhishingTemplateLibraryView.vue') },
        { path: 'phishing/dashboard', name: 'phishing-dashboard', component: () => import('@/views/PhishingDashboardView.vue') },
        { path: 'phishing/campaigns/new', name: 'phishing-campaign-new', component: () => import('@/views/PhishingCampaignWizardView.vue') },
        { path: 'phishing/campaigns/:id', name: 'phishing-campaign', component: () => import('@/views/PhishingCampaignView.vue') },
        { path: 'phishing/engagements/:engagementId/recipients', name: 'phishing-recipients', component: () => import('@/views/PhishingRecipientsView.vue') },
        { path: 'prospect',      name: 'prospect', component: () => import('@/views/ProspectView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !getToken()) return '/login'
})

export default router
