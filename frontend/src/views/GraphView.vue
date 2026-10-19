<template>
  <div>
    <div class="header-row">
      <div>
        <h1 class="title">Simulation Engine</h1>
        <p class="subtitle">Real, verified privilege-escalation and third-party app paths in your connected account — click a node or edge for evidence.</p>
      </div>
      <div class="header-actions">
        <!-- Scan selector: narrows the whole graph to exactly one connected
             AWS account or Microsoft 365 tenant, grouped by the real
             hierarchy this data actually supports (provider -> AWS account
             -> connection) — only shown once there's more than one
             connection to pick between, same convention as FindingsView's
             own connection filter. -->
        <select
          v-if="totalConnectionCount > 1" class="connection-select"
          :value="selectedConnectionId ?? ''"
          @change="selectConnection(($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">All connections ({{ totalConnectionCount }})</option>
          <optgroup v-for="g in awsAccountGroups" :key="g.accountId" :label="g.label">
            <option v-for="c in g.connections" :key="c.id" :value="c.id">{{ cloudConnectionLabel(c) }}</option>
          </optgroup>
          <optgroup v-if="oauthConnectionsList.length" label="Microsoft 365">
            <option v-for="c in oauthConnectionsList" :key="c.id" :value="c.id">{{ c.ms_tenant_id || 'Microsoft 365' }}</option>
          </optgroup>
          <optgroup v-if="hostConnectionsList.length" label="Servers">
            <option v-for="c in hostConnectionsList" :key="c.id" :value="c.id">{{ c.display_name ? `${c.display_name} (${c.hostname_or_ip})` : c.hostname_or_ip }}</option>
          </optgroup>
        </select>
        <div class="refresh-btn" :class="{ running: loading }" @click="loadAll">{{ loading ? 'Loading…' : 'Refresh' }}</div>
      </div>
    </div>

    <div v-if="graph" class="scope-bar">
      <span class="scope-badge">● READ-ONLY</span>
      <template v-if="graph.viewing">
        <span class="scope-item">Viewing: {{ graph.viewing.label }}</span>
        <span class="scope-item scope-item-clickable" @click="selectConnection(null)">Show all ›</span>
      </template>
      <template v-else>
        <span class="scope-item scope-item-clickable" @click="openConnectedAccounts">{{ graph.scope.connected_accounts }} connected account{{ graph.scope.connected_accounts === 1 ? '' : 's' }} ›</span>
        <span class="scope-divider">·</span>
        <span class="scope-item">{{ graph.scope.iam_principals }} IAM principal{{ graph.scope.iam_principals === 1 ? '' : 's' }}</span>
      </template>
      <span class="scope-divider">·</span>
      <span class="scope-note">No active exploitation — evidence is static analysis only</span>
    </div>

    <div v-if="graph && graph.sources.length" class="source-card">
      <div class="source-head">
        Assembled from <span class="domain">{{ graph.sources.join(', ') }}</span> · last analyzed {{ graph.last_analyzed }}
      </div>
    </div>

    <!-- First-run onboarding wizard (Connect -> Scan -> Simulate reveal) —
         gated on a per-tenant localStorage flag, never re-shown once set.
         Everything below stays exactly as it was; this just swaps the whole
         main content area for the guided flow until the user graduates. -->
    <template v-if="!showOnboarding">
    <!-- Kill Chain Narrative — the flagship "here's the full story" moment:
         real, ordered entry-to-outcome hop sequences (never a guess — see
         graph_service._compute_kill_chains), synthesized into one
         compelling, true narrative. Deliberately its own panel, not a
         rewrite of the AI Analyst sidebar below, which keeps its own
         distinct chokepoint/fix-priority job. Citations are rendered here,
         unlike that panel's own drop of that data. -->
    <div v-if="killChains && killChains.chains.length" class="kill-chain-panel">
      <div class="kill-chain-header">
        <span class="kill-chain-title">Kill Chain</span>
        <span class="analyst-tag" :class="{ ai: killChains.is_ai }">{{ killChains.is_ai ? 'AI' : 'Computed' }}</span>
        <div class="kill-chain-regenerate" :class="{ running: killChainsLoading }" @click="loadKillChains(true)">Regenerate</div>
      </div>
      <div class="kill-chain-message">{{ killChains.message }}</div>

      <div v-for="chain in killChains.chains" :key="chain.target_id" class="kill-chain-block">
        <div class="kill-chain-outcome-line">
          <span
            class="kill-chain-severity-badge"
            :style="{ color: severityColor(chain.chain_severity), borderColor: severityColor(chain.chain_severity) }"
          >{{ chain.chain_severity }}</span>
          <div class="kill-chain-outcome" :style="{ borderColor: severityColor(chain.chain_severity), color: severityColor(chain.chain_severity) }">
            {{ chain.outcome }}
          </div>
        </div>
        <div v-for="(hop, i) in chain.hops" :key="i" class="kill-chain-hop-wrap">
          <div class="kill-chain-hop">
            <span class="kill-chain-hop-index">{{ i + 1 }}</span>
            <span class="kill-chain-hop-text mono">{{ hop.source_label }} → {{ hop.target_label }}</span>
            <span class="kill-chain-hop-severity" :style="{ color: severityColor(hop.severity) }">{{ hop.severity }}</span>
          </div>
          <div v-if="hop.remediation" class="kill-chain-hop-remediation">{{ hop.remediation }}</div>
        </div>
      </div>

      <div v-if="killChains.citations.length" class="kill-chain-citations">
        <div class="kill-chain-citations-label">Evidence</div>
        <div v-for="(c, i) in killChains.citations" :key="i" class="kill-chain-citation mono">{{ c }}</div>
      </div>
    </div>

    <div v-if="loadError" class="empty-state error">{{ loadError }}</div>

    <div v-else-if="graph && graph.nodes.length === 0" class="empty-state">
      <div class="empty-title">No privilege-escalation paths detected yet</div>
      <div class="empty-body">
        This graph is assembled from real Cloudsplaining scan results. Connect and verify an AWS account under
        <RouterLink :to="{ name: 'settings' }">Settings</RouterLink>, then run a Cloud Misconfiguration Defense scan
        from the <RouterLink :to="{ name: 'coverage' }">Coverage Map</RouterLink> to populate this.
      </div>
    </div>

    <template v-else-if="graph">
      <!-- Fix Priority — the single ranked "what to fix first" list. Absorbs
           the old standalone chokepoint-callout banner's job (announce the
           single highest-impact fix) into this panel's top entry instead of
           stating it twice with two different, independently-computed
           numbers. The chokepoint entry's displayCount/displayTotal are the
           backend's own authoritative graph.chokepoint.closes_count/
           total_open_count (see fixQueue computed) so this can never
           disagree with what the graph itself reports. -->
      <div v-if="fixQueue.length" class="fix-priority-panel">
        <div class="fix-queue-head">Fix priority <span class="fix-queue-sub">ranked by real path fan-out</span></div>
        <div
          v-for="(entry, i) in fixQueue" :key="entry.key"
          class="fix-entry" :class="{ 'fix-entry-top': i === 0 }"
          @click="enterSimulateMode(entry.policyArn ?? undefined, entry.pathIds[0])"
        >
          <div class="fix-entry-head">
            <span v-if="entry.isChokepoint" class="fix-entry-tag chokepoint">CHOKEPOINT</span>
            <span
              class="fix-entry-tag severity"
              :style="{ color: severityColor(entry.worstSeverity), borderColor: severityColor(entry.worstSeverity) }"
            >{{ entry.worstSeverity }}</span>
          </div>
          <div class="fix-entry-title">Patch {{ entry.label }}</div>
          <div class="fix-entry-sub">
            <template v-if="entry.isChokepoint">{{ entry.displayCount }} of {{ entry.displayTotal }} verified paths close</template>
            <template v-else>{{ entry.count }} open path{{ entry.count === 1 ? '' : 's' }} share this policy</template>
          </div>
          <div class="fix-entry-remediation">{{ entry.remediation }}</div>
          <div class="fix-entry-bar-track"><div class="fix-entry-bar" :style="{ width: `${(entry.count / fixQueue[0].count) * 100}%` }"></div></div>
        </div>
      </div>

      <div v-if="targetCards.length" class="targets-row">
        <div v-for="t in targetCards" :key="t.node_id" class="target-card" :class="t.tier">
          <div class="target-status">{{ t.tierLabel }}</div>
          <div class="target-label mono"><Crown :size="12" class="target-crown-icon" />{{ t.label }}</div>
          <div class="target-count">{{ t.open_path_count }}</div>
          <div class="target-sub">{{ t.subtext }}</div>
        </div>
      </div>

      <!-- Simulate-the-Fix, inline on this same graph (no page redirect) —
           the entry points above/below all funnel into enterSimulateMode(),
           which recolors the real graph's own edges/nodes rather than
           rendering a separate mini graph-diff canvas. -->
      <div v-if="simulateMode" class="simulate-banner">
        <div class="simulate-banner-head">
          <span class="simulate-banner-badge">SIMULATING A FIX</span>
          <span class="simulate-banner-note">A pure hypothetical read — nothing changes in AWS or the database.</span>
          <div class="simulate-exit" @click="exitSimulateMode"><XIcon :size="12" /> Exit simulation</div>
        </div>

        <div v-if="simulating" class="simulate-loading">Simulating…</div>
        <div v-else-if="simulateError" class="simulate-error">{{ simulateError }}</div>
        <template v-else>
          <!-- The actual answer to "what constitutes the fix", in plain
               English — real principals/actions from the graph's own
               edges, not a summary that could drift from what was really
               tested. -->
          <div v-if="simulatePlan.length" class="simulate-plan">
            <div class="simulate-plan-label">What this fix means</div>
            <div v-for="p in simulatePlan" :key="p.key" class="simulate-plan-entry">
              <span v-if="p.policyName || p.policyArn">
                Removing <strong>{{ p.policyName || shortId(p.policyArn!) }}</strong> would revoke
                <span class="simulate-plan-actions">{{ p.actions.join(', ') }}</span>
                from {{ p.principalCount }} principal{{ p.principalCount === 1 ? '' : 's' }}: {{ p.principalArns.map(shortId).join(', ') }}.
              </span>
              <span v-else>
                Removing <span class="simulate-plan-actions">{{ p.actions.join(', ') }}</span> from {{ p.principalArns.map(shortId).join(', ') }} directly — no policy shared with any other path.
              </span>
            </div>
          </div>

          <div v-if="simulateResult" class="simulate-result-summary">
            <span class="simulate-result-chip closed">✓ {{ simulateResult.would_close.length }} path{{ simulateResult.would_close.length === 1 ? '' : 's' }} would close</span>
            <span class="simulate-result-chip remain">{{ simulateRemainOpenCount }} remain open</span>
            <span class="simulate-result-hint">Green on the graph below shows exactly which paths this affects.</span>
          </div>
        </template>

        <div class="simulate-selector-toggle" @click="showSimulateSelector = !showSimulateSelector">
          {{ showSimulateSelector ? 'Hide' : 'Simulate a different fix' }}
        </div>
        <div v-if="showSimulateSelector" class="simulate-selector">
          <div v-for="g in simulateGroups" :key="g.key" class="simulate-selector-row" @click="toggleSimulateSelection(g.key)">
            <input type="checkbox" :checked="simulateSelectedKeys.has(g.key)" @click.stop="toggleSimulateSelection(g.key)" />
            <span class="simulate-selector-label">{{ g.label }}</span>
            <span class="simulate-selector-count">{{ g.count }} path{{ g.count === 1 ? '' : 's' }}</span>
          </div>
          <div
            class="simulate-run-btn" :class="{ disabled: simulateSelectedKeys.size === 0 || simulating }"
            @click="!(simulateSelectedKeys.size === 0 || simulating) && runSimulation()"
          >{{ simulating ? 'Simulating…' : 'Run simulation' }}</div>
        </div>
      </div>

      <div class="main-row">
        <div class="graph-column">
          <div class="graph-card-head">
            <div class="graph-card-title">
              Explore the graph
              <span v-if="primaryTarget" class="graph-card-headline">{{ primaryTarget.open_path_count }} verified path{{ primaryTarget.open_path_count === 1 ? '' : 's' }} → {{ graph?.nodes.find(n => n.id === primaryTarget!.node_id)?.label ?? shortId(primaryTarget.node_id) }}</span>
            </div>
            <div class="graph-card-actions">
              <span class="live-badge">live state</span>
              <div v-if="graph.chokepoint && !simulateMode" class="simulate-shortcut" @click="enterSimulateMode(graph.chokepoint.policy_arn)">Simulate fix →</div>
            </div>
          </div>
          <div class="graph-canvas-full">
            <div v-if="levelHeaders.length > 1" class="level-headers">
              <div v-for="lh in levelHeaders" :key="lh.level" class="level-header" :style="{ left: `${lh.xPct}%` }">
                {{ String(lh.level + 1).padStart(2, '0') }} · {{ lh.name }}
              </div>
            </div>
            <div class="graph-canvas-inner" :style="{ height: canvasHeight + 'px' }">
              <svg width="100%" :height="canvasHeight" :viewBox="`0 0 100 ${canvasHeight}`" preserveAspectRatio="none" class="graph-svg">
                <g v-for="(e, i) in layoutEdges" :key="i">
                  <!-- Invisible wide hit-area — the visible line below is only 1-2px,
                       far too thin to reliably click; this one carries the click
                       handler and is 10x wider but fully transparent. -->
                  <line
                    :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                    stroke="transparent" stroke-width="18" vector-effect="non-scaling-stroke"
                    style="cursor: pointer; pointer-events: stroke;"
                    @click="openEdge(i)"
                  />
                  <line
                    :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                    :stroke="e.color" :stroke-width="e.willClose ? 3 : (e.isChokepoint ? 2 : 1)" vector-effect="non-scaling-stroke"
                    :stroke-dasharray="e.isSevered ? '3 5' : '6 6'"
                    :stroke-opacity="e.dimmed ? 0.25 : 1"
                    :class="['edge-line', { severed: e.isSevered, 'will-close': e.willClose }]" style="pointer-events: none;"
                  />
                </g>
              </svg>
              <div
                v-for="(e, i) in edgePortLabels" :key="`port-${i}`"
                class="edge-port-label"
                :style="{ left: `${e.midXPct}%`, top: `${e.midY}px` }"
              >{{ e.portLabel }}</div>
              <div
                v-for="n in layoutNodes" :key="n.id"
                class="graph-node"
                :class="{ 'is-entry': n.role === 'entry', 'is-assumed': n.role === 'assumed', exposed: n.role === 'target' && n.targetExposed, contained: n.role === 'target' && !n.targetExposed, 'is-chokepoint': n.isChokepointNode, 'will-be-contained': n.willBecomeContained }"
                :style="nodeStyle(n)"
                @click="openNode(n)"
              >
                <!-- In simulate mode, "would become contained" is the most
                     relevant thing to say about a still-exposed crown jewel —
                     it's the direct payoff of the fix being previewed, so it
                     wins over the plain CROWN JEWEL tag while simulating.
                     Crown-jewel/patched identity otherwise wins over the
                     chokepoint tag on a target node — a chokepoint tag is
                     meant to flag the shared upstream resource to patch, not
                     restate what's already the node's own more fundamental
                     identity (a target can BE the chokepoint's one common
                     node, e.g. two sources converging on the same target via
                     the same policy). -->
                <div v-if="n.willBecomeContained" class="node-tag will-close"><Check :size="10" /> WOULD CLOSE</div>
                <div v-else-if="n.role === 'target' && n.targetExposed" class="node-tag crown-jewel"><Crown :size="10" /> CROWN JEWEL</div>
                <div v-else-if="n.role === 'target' && n.closedPathCount > 0 && n.openPathCount === 0" class="node-tag patched">{{ n.closedPathCount }} PATCHED</div>
                <div v-else-if="n.isChokepointNode" class="node-tag chokepoint">CHOKEPOINT</div>
                <div v-else-if="n.role === 'assumed'" class="node-tag assumed-access"><TriangleAlert :size="10" /> ASSUMED ACCESS</div>
                <div class="node-type">{{ n.label }}</div>
                <div class="node-sub">{{ n.subtitle }}</div>
                <div v-if="n.open_credential_findings > 0" class="credential-badge" :title="`${n.open_credential_findings} open identity/credential finding(s) for this principal`">
                  {{ n.open_credential_findings }}
                </div>
                <!-- Just as catastrophic as a privesc path, but not one —
                     no source->target chain, so it's a badge on the
                     existing node, never a fabricated edge. Distinguished
                     from the generic credential-badge above (which blends
                     in routine password/MFA/key hygiene findings) by
                     position, an icon, and severity-driven color. -->
                <div
                  v-if="n.open_policy_risk_findings > 0" class="policy-risk-badge"
                  :style="{ background: severityColor(n.policy_risk_worst_severity || 'medium'), borderColor: severityColor(n.policy_risk_worst_severity || 'medium') }"
                  :title="`${n.open_policy_risk_findings} open finding(s) — this principal can act catastrophically (data exfiltration, resource exposure, unconstrained service access, or credentials exposure) without ever escalating privileges.`"
                >
                  <ShieldAlert :size="10" />{{ n.open_policy_risk_findings }}
                </div>
              </div>
            </div>
          </div>
          <div class="legend-row">
            <template v-if="simulateMode && simulateResult">
              <span class="legend-item"><span class="legend-swatch will-close"></span>would close (this fix)</span>
              <span class="legend-item"><span class="legend-swatch dimmed"></span>unaffected by this fix</span>
              <span class="legend-item"><span class="legend-dot contained"></span>would become contained</span>
            </template>
            <template v-else>
              <span class="legend-item"><span class="legend-swatch active"></span>active path (by severity)</span>
              <span class="legend-item"><span class="legend-swatch chokepoint"></span>chokepoint edge</span>
              <span class="legend-item"><span class="legend-swatch severed"></span>severed (closed)</span>
              <span class="legend-item"><span class="legend-dot exposed"></span>crown jewel — exposed</span>
              <span class="legend-item"><span class="legend-dot contained"></span>crown jewel — contained</span>
              <span v-if="graph.nodes.some(n => n.open_policy_risk_findings > 0)" class="legend-item">
                <ShieldAlert :size="10" class="legend-shield-icon" />catastrophic capability (not escalation)
              </span>
            </template>
          </div>

          <!-- Real findings (VPS/host + general cloud misconfiguration)
               with no provable relationship to anything else on the graph
               yet — a deliberately separate section, not folded into the
               leveled canvas above, so nothing here is ever misread as
               part of a verified escalation chain. -->
          <div v-if="orphanNodes.length" class="orphan-section">
            <div class="orphan-head">Findings without a mapped path yet <span class="orphan-sub">real, scanned findings — not yet connected to an attack path</span></div>
            <div class="orphan-row">
              <div
                v-for="n in orphanNodes" :key="n.id" class="orphan-card"
                :style="{ borderLeftColor: severityColor(n.findings_worst_severity || 'medium') }"
                @click="openNode(n)"
              >
                <component :is="n.kind === 'host' ? Server : Box" :size="14" class="orphan-icon" />
                <div class="orphan-body">
                  <div class="orphan-label">{{ n.label }}</div>
                  <div class="orphan-sub-label">{{ kindLabel(n) }}</div>
                </div>
                <span
                  class="orphan-badge"
                  :style="{ color: severityColor(n.findings_worst_severity || 'medium'), borderColor: severityColor(n.findings_worst_severity || 'medium') }"
                >{{ n.open_findings }} open</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="ledgerFindings.length" class="ledger">
        <div class="ledger-head">
          <span>Verified Findings</span>
          <span class="ledger-sub">by severity — findings on a verified attack-path principal surface first</span>
          <RouterLink :to="{ name: 'findings' }" class="ledger-link">Open full ledger →</RouterLink>
        </div>
        <div v-for="f in rankedLedgerFindings" :key="f.id" class="ledger-row" @click="openFinding(f)">
          <span
            class="ledger-pill"
            :style="{ color: severityColor(f.severity), borderColor: severityColor(f.severity), background: `color-mix(in srgb, ${severityColor(f.severity)} 16%, transparent)` }"
          >{{ f.severity }}</span>
          <div class="ledger-main">
            <div class="ledger-title">
              {{ f.title }}
              <span v-if="f._onPath" class="ledger-reach-tag">→ verified path</span>
            </div>
            <div class="ledger-meta">{{ f.check_id || 'no check id' }}</div>
          </div>
          <span class="ledger-status" :class="{ resolved: f.status !== 'open' }">{{ f.status === 'open' ? 'open' : f.status }}</span>
        </div>
      </div>
    </template>
    </template>

    <OnboardingWizard
      v-else
      :cloud-connections="cloudConnectionsList"
      :host-connections="hostConnectionsList"
      :oauth-connections="oauthConnectionsList"
      :graph="graph"
      @graduated="graduateOnboarding"
      @scan-complete="onWizardScanComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, getToken } from '@/api/client'
import { hueColor, severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'
import { useAuthStore } from '@/stores/auth'
import { Crown, Check, X as XIcon, ShieldAlert, Server, Box, TriangleAlert } from '@lucide/vue'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard.vue'

interface GraphNode {
  id: string; label: string; hue: string; detail: string; discovered: string; kind?: string
  open_credential_findings: number
  open_policy_risk_findings: number; policy_risk_worst_severity: string | null
  open_findings: number; findings_worst_severity: string | null
  is_high_value?: boolean
}
interface AttackTechnique { id: string; name: string; tactics: string[] }
interface GraphEdge {
  source: string; target: string; severity: string
  technique_chain: string[]; attack_techniques: AttackTechnique[]; discovered: string
  escalation_type?: string | null; policy_name?: string | null; policy_arn?: string | null
  priv_esc_path_id?: string | null; status: string; remediation: string
  edge_type?: string
  // Real security-group rule evidence, exposed_to_internet edges only —
  // EVERY real matched port/protocol/CIDR rule, not just the one that
  // drove severity.
  exposed_ports?: { port: number | null; protocol: string | null; cidr: string }[]
}
interface GraphTarget { node_id: string; open_path_count: number; closed_path_count: number; worst_severity: string | null }
interface GraphChokepoint { policy_arn: string; policy_name: string | null; closes_count: number; total_open_count: number }
interface GraphScope { read_only: boolean; connected_accounts: number; iam_principals: number }
interface GraphViewing { id: string; provider: string; label: string }
interface TenantGraph {
  nodes: GraphNode[]; edges: GraphEdge[]; last_analyzed: string | null; sources: string[]
  targets: GraphTarget[]; chokepoint: GraphChokepoint | null; scope: GraphScope; viewing: GraphViewing | null
}

const router = useRouter()
const route = useRoute()
const panels = usePanelStore()
const authStore = useAuthStore()
const graph = ref<TenantGraph | null>(null)
const loading = ref(false)
const loadError = ref('')

// ── First-run onboarding wizard gating — see OnboardingWizard.vue for the
// step machine itself. GraphView only owns two things: the one-time
// "graduated" persistence, and a bootstrap check so a tenant who already
// had a real connected + scanned environment before this feature shipped
// never sees the wizard (see maybeAutoGraduateOnboarding below).
const onboardingGraduated = ref(false)
const showOnboarding = computed(() => !onboardingGraduated.value)
// The JWT's own "tenant" claim is the reliable source here — it's present
// on every authenticated request regardless of how the session was
// established (real login, V1 handoff, or a dev-minted token), unlike
// authStore.tenantId, which only gets populated by login()/completeHandoff()
// writing to their own separately-persisted session key. Falling back to
// that key's tenantId, then a literal 'unknown', keeps this from ever
// throwing — never from silently sharing one tenant's graduated state with
// another's, which a bare authStore dependency could risk if that ref were
// ever null for one tenant but not another in the same browser.
function decodedTenantIdFromToken(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.tenant === 'string' ? json.tenant : null
  } catch {
    return null
  }
}
function onboardingStorageKey(): string {
  return `pathproof_onboarding_graduated_${decodedTenantIdFromToken() ?? authStore.tenantId ?? 'unknown'}`
}
function graduateOnboarding() {
  onboardingGraduated.value = true
  localStorage.setItem(onboardingStorageKey(), '1')
}
function maybeAutoGraduateOnboarding() {
  if (localStorage.getItem(onboardingStorageKey()) === '1') {
    onboardingGraduated.value = true
    return
  }
  if (hasAnyConnection.value && hasEverScanned.value) graduateOnboarding()
}
// Reload connections (and the graph, once the scan's real data is ready)
// after the wizard's own inline scan trigger completes — real state, not
// wizard-local optimism, is what actually advances it past the Scan step.
async function onWizardScanComplete() {
  await loadConnections()
  await load()
  loadKillChains()
}

interface KillChainHop {
  edge_type: string; source: string; target: string
  source_label: string; target_label: string; severity: string; remediation: string
}
interface KillChain { target_id: string; target_label: string; outcome: string; chain_severity: string; hops: KillChainHop[] }
const killChains = ref<{ chains: KillChain[]; message: string; citations: string[]; is_ai: boolean } | null>(null)
const killChainsLoading = ref(false)
const ledgerFindings = ref<any[]>([])

// ── Scan selector: which single connection (if any) the graph is narrowed
// to. Default (null) is today's flat tenant-wide blend, unchanged.
interface CloudConnectionOption { id: string; provider: string; role_arn: string | null; display_name: string | null; status: string; last_scan_status?: string }
interface OAuthConnectionOption { id: string; provider: string; ms_tenant_id: string | null; status: string; last_scan_status?: string }
interface HostConnectionOption { id: string; hostname_or_ip: string; display_name: string | null; status: string; last_scan_status?: string }
const cloudConnectionsList = ref<CloudConnectionOption[]>([])
const oauthConnectionsList = ref<OAuthConnectionOption[]>([])
const hostConnectionsList = ref<HostConnectionOption[]>([])
const selectedConnectionId = ref<string | null>(null)

// ── Simulate-the-Fix, inline on this same graph (direct user request: no
// separate page/redirect). A pure hypothetical read — nothing here ever
// mutates AWS or the database; the graph's own edges/nodes just recolor to
// preview what a real fix would close, then revert on exit.
interface SimulatedPath {
  id: string; source_principal_arn: string; target_principal_arn: string; technique_chain: string[]
  attack_techniques: AttackTechnique[]; severity: string; policy_name: string | null; policy_arn: string | null
  remediation: string
}
const simulateMode = ref(false)
const simulateSelectedKeys = ref<Set<string>>(new Set())
const simulateResult = ref<{ would_close: SimulatedPath[] } | null>(null)
const simulating = ref(false)
const simulateError = ref('')
const showSimulateSelector = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    graph.value = await api.graph(selectedConnectionId.value)
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load the Simulation Engine'
  } finally {
    loading.value = false
  }
}

async function loadKillChains(force = false) {
  killChainsLoading.value = true
  try {
    killChains.value = await api.graphKillChains(force, selectedConnectionId.value)
  } catch {
    killChains.value = null
  } finally {
    killChainsLoading.value = false
  }
}

async function loadConnections() {
  try {
    const [cloud, oauth, host] = await Promise.all([api.cloudConnections(), api.oauthAppConnections(), api.hostConnections()])
    cloudConnectionsList.value = (cloud ?? []).filter((c: CloudConnectionOption) => c.status === 'connected')
    oauthConnectionsList.value = (oauth ?? []).filter((c: OAuthConnectionOption) => c.status === 'connected')
    hostConnectionsList.value = (host ?? []).filter((c: HostConnectionOption) => c.status === 'connected')
  } catch {
    cloudConnectionsList.value = []
    oauthConnectionsList.value = []
    hostConnectionsList.value = []
  }
}

async function loadLedger() {
  try {
    const engagements = await api.engagements()
    const cloudEngagement = engagements.find((e: any) => e.tier === 'cloud' && e.status === 'active')
    if (!cloudEngagement) { ledgerFindings.value = []; return }
    const findings = await api.findings(cloudEngagement.id)
    const order = ['critical', 'high', 'medium', 'low']
    ledgerFindings.value = [...findings]
      .filter((f: any) => f.status === 'open')
      .sort((a: any, b: any) => order.indexOf(a.severity) - order.indexOf(b.severity))
      .slice(0, 8)
  } catch {
    ledgerFindings.value = []
  }
}

async function loadAll() {
  selectedConnectionId.value = typeof route.query.connection_id === 'string' ? route.query.connection_id : null
  await Promise.all([loadConnections(), load()])
  maybeAutoGraduateOnboarding()
  loadKillChains()
  loadLedger()
  // Deep-link entry (IamPathEvidence.vue's "Simulate fixing this", or a
  // saved /graph/simulate?... link redirected here) — graph.value must be
  // loaded first since entering simulate mode reads real edges off it.
  const q = route.query
  if (typeof q.policy_arn === 'string') enterSimulateMode(q.policy_arn)
  else if (typeof q.priv_esc_path_id === 'string') enterSimulateMode(undefined, q.priv_esc_path_id)
}

// Switching scan scope is a real re-fetch (unlike simulate mode, which
// recolors already-loaded data) — a different connection_id means
// genuinely different CloudPrivEscPath/OAuthGrant rows from the backend.
function selectConnection(id: string | null) {
  selectedConnectionId.value = id
  const query: Record<string, any> = { ...route.query }
  if (id) query.connection_id = id
  else delete query.connection_id
  router.replace({ name: 'graph', query })
  if (simulateMode.value) exitSimulateMode()
  load()
  loadKillChains()
}

// Same deep-link params arriving while this page is already mounted (the
// query changes but the route name doesn't, so Vue Router reuses this
// component instead of remounting it — onMounted alone would miss this).
watch(() => route.query, (q) => {
  if (typeof q.policy_arn === 'string') enterSimulateMode(q.policy_arn)
  else if (typeof q.priv_esc_path_id === 'string') enterSimulateMode(undefined, q.priv_esc_path_id)
})

// Findings whose resource_uid matches a principal that's actually a source
// or target on an open attack-path edge get a real "verified path" tag and
// sort first within their severity tier — the honest slice of "proven
// reach" this data can actually support. Most Finding tiers (cloud
// misconfig/host/DNS) don't resolve to a graph node at all (per
// graph_service.py's own scope docstring), so this can't honestly claim to
// rank the WHOLE ledger by reach — only the subset that provably does.
const onPathArns = computed(() => {
  const set = new Set<string>()
  for (const e of graph.value?.edges ?? []) {
    if (e.status !== 'open') continue
    set.add(e.source)
    set.add(e.target)
  }
  return set
})
const rankedLedgerFindings = computed(() => {
  // Severity stays the primary key (unchanged from before) — on-path is a
  // tie-breaker within the same severity, not an override of it, so this
  // never demotes a critical finding below a low one just because the low
  // one happens to sit on a graph node.
  return [...ledgerFindings.value]
    .map(f => ({ ...f, _onPath: onPathArns.value.has(f.resource_uid) }))
    .sort((a, b) => {
      const rankDiff = (_SEVERITY_RANK[b.severity] ?? 0) - (_SEVERITY_RANK[a.severity] ?? 0)
      if (rankDiff !== 0) return rankDiff
      return (b._onPath ? 1 : 0) - (a._onPath ? 1 : 0)
    })
})

function openFinding(f: any) {
  panels.push({ type: 'finding', title: f.title, data: f })
}

// Point (b) drill-down: the scope bar only ever showed a bare count —
// clicking it now fetches the real CloudAccountConnection rows (the same
// data Settings manages) and opens them in the usual evidence-panel stack,
// instead of leaving "3 connected accounts" as a dead-end number.
async function openConnectedAccounts() {
  const connections = await api.cloudConnections()
  panels.push({ type: 'connected-accounts', title: 'Connected accounts', data: { connections } })
}

function shortId(id: string): string {
  if (!id) return id
  return id.includes('/') ? id.split('/').pop()! : id
}

// Real, honest hierarchy for the scan selector: provider -> AWS account
// (parsed from role_arn, same regex convention already established in
// FindingsView.vue/SettingsView.vue) -> individual connection. No AWS
// Organizations/OU data exists anywhere in this product — this is the
// deepest grouping the real data actually supports, not a fabricated tree.
const _ROLE_ARN_RE = /^arn:aws:iam::(\d+):role\/(.+)$/
function cloudConnectionLabel(c: CloudConnectionOption): string {
  const parsed = c.role_arn ? c.role_arn.match(_ROLE_ARN_RE) : null
  const technical = parsed ? `${parsed[1]} · ${parsed[2]}` : (c.role_arn || 'AWS account (pending verification)')
  return c.display_name ? `${c.display_name} (${technical})` : technical
}
interface AccountGroup { accountId: string; label: string; connections: CloudConnectionOption[] }
const awsAccountGroups = computed<AccountGroup[]>(() => {
  const byAccount = new Map<string, CloudConnectionOption[]>()
  for (const c of cloudConnectionsList.value) {
    const parsed = c.role_arn ? c.role_arn.match(_ROLE_ARN_RE) : null
    const accountId = parsed ? parsed[1] : 'unknown'
    if (!byAccount.has(accountId)) byAccount.set(accountId, [])
    byAccount.get(accountId)!.push(c)
  }
  return Array.from(byAccount.entries())
    .map(([accountId, connections]) => ({ accountId, label: `AWS · ${accountId}`, connections }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId))
})
const totalConnectionCount = computed(() => cloudConnectionsList.value.length + oauthConnectionsList.value.length + hostConnectionsList.value.length)
const hasAnyConnection = computed(() => totalConnectionCount.value > 0)
const hasEverScanned = computed(() =>
  [...cloudConnectionsList.value, ...hostConnectionsList.value, ...oauthConnectionsList.value]
    .some(c => !!c.last_scan_status && c.last_scan_status !== 'never_run'))

// Real path fan-out, grouped by policy_arn — same shape as fixQueue below,
// but the FULL list (not sliced to 4), for the "simulate a different fix"
// selector. No separate fetch: the graph's own edges (already loaded)
// already carry policy_arn/technique_chain/priv_esc_path_id.
interface SimulateGroup { key: string; policyArn: string | null; policyName: string | null; label: string; pathIds: string[]; count: number }
const simulateGroups = computed<SimulateGroup[]>(() => {
  if (!graph.value) return []
  const openIamEdges = graph.value.edges.filter(e => e.status === 'open' && e.priv_esc_path_id)
  const byPolicy = new Map<string, SimulateGroup>()
  const pathOnly: SimulateGroup[] = []
  for (const e of openIamEdges) {
    if (e.policy_arn) {
      let g = byPolicy.get(e.policy_arn)
      if (!g) {
        g = { key: e.policy_arn, policyArn: e.policy_arn, policyName: e.policy_name ?? null, label: e.policy_name || shortId(e.policy_arn), pathIds: [], count: 0 }
        byPolicy.set(e.policy_arn, g)
      }
      g.pathIds.push(e.priv_esc_path_id!)
      g.count++
    } else {
      pathOnly.push({
        key: `path:${e.priv_esc_path_id}`, policyArn: null, policyName: null,
        label: `${shortId(e.source)} → ${shortId(e.target)}`, pathIds: [e.priv_esc_path_id!], count: 1,
      })
    }
  }
  return [...byPolicy.values(), ...pathOnly].sort((a, b) => b.count - a.count)
})

// The plain-English "what this fix means" statement — real data (each
// selected group's actual technique_chain/principals), not invented. Same
// idea as the old standalone Simulate-the-Fix page's own plan block, now
// sourced straight from the graph's already-loaded edges.
interface SimulatePlanEntry { key: string; policyName: string | null; policyArn: string | null; principalArns: string[]; principalCount: number; actions: string[] }
const simulatePlan = computed<SimulatePlanEntry[]>(() => {
  if (!graph.value) return []
  return simulateGroups.value
    .filter(g => simulateSelectedKeys.value.has(g.key))
    .map(g => {
      const edges = graph.value!.edges.filter(e => e.priv_esc_path_id && g.pathIds.includes(e.priv_esc_path_id))
      const principalArns = [...new Set(edges.map(e => e.source))]
      const actions = [...new Set(edges.flatMap(e => e.technique_chain))]
      return { key: g.key, policyName: g.policyName, policyArn: g.policyArn, principalArns, principalCount: principalArns.length, actions }
    })
})

const wouldCloseIds = computed(() => new Set((simulateResult.value?.would_close ?? []).map(p => p.id)))
const simulateRemainOpenCount = computed(() => totalOpenIamPaths.value - (simulateResult.value?.would_close.length ?? 0))

function enterSimulateMode(policyArn?: string, pathId?: string) {
  panels.close() // never leave an evidence panel covering the graph once simulate mode takes over
  simulateMode.value = true
  simulateResult.value = null
  simulateError.value = ''
  showSimulateSelector.value = false
  if (policyArn) simulateSelectedKeys.value = new Set([policyArn])
  else if (pathId) simulateSelectedKeys.value = new Set([`path:${pathId}`])
  else simulateSelectedKeys.value = new Set()
  if (simulateSelectedKeys.value.size > 0) runSimulation()
}

function exitSimulateMode() {
  simulateMode.value = false
  simulateResult.value = null
  simulateSelectedKeys.value = new Set()
  simulateError.value = ''
  showSimulateSelector.value = false
  // Clear only the simulate-specific deep-link params so navigating back
  // to this same page later doesn't silently re-enter simulate mode from
  // a stale URL — preserves any other real query state (e.g. connection_id
  // from the scan selector) rather than wiping the whole query object.
  if (route.query.policy_arn || route.query.priv_esc_path_id) {
    const query: Record<string, any> = { ...route.query }
    delete query.policy_arn
    delete query.priv_esc_path_id
    router.replace({ name: 'graph', query })
  }
}

function toggleSimulateSelection(key: string) {
  const next = new Set(simulateSelectedKeys.value)
  next.has(key) ? next.delete(key) : next.add(key)
  simulateSelectedKeys.value = next
}

async function runSimulation() {
  if (simulateSelectedKeys.value.size === 0) return
  simulating.value = true
  simulateError.value = ''
  try {
    const groups = simulateGroups.value.filter(g => simulateSelectedKeys.value.has(g.key))
    const policyArns = groups.filter(g => g.policyArn).map(g => g.policyArn!)
    const pathIds = groups.filter(g => !g.policyArn).flatMap(g => g.pathIds)
    simulateResult.value = await api.simulateFix(policyArns, pathIds)
  } catch (e: any) {
    simulateError.value = e.message ?? 'Simulation failed'
    simulateResult.value = null
  } finally {
    simulating.value = false
  }
}

function openNode(n: GraphNode) {
  panels.push({ type: 'graph-node', title: n.label, data: n })
}

function openEdge(index: number) {
  const e = graph.value?.edges[index]
  if (!e) return
  const title = `${e.source.split('/').pop()} → ${e.target.split('/').pop()}`
  const sourceNode = graph.value?.nodes.find(n => n.id === e.source)
  const targetNode = graph.value?.nodes.find(n => n.id === e.target)
  panels.push({
    type: 'iam-path',
    title,
    data: {
      id: e.priv_esc_path_id, source_principal_arn: e.source, target_principal_arn: e.target, severity: e.severity,
      technique_chain: e.technique_chain, attack_techniques: e.attack_techniques, discovered_at: null,
      escalation_type: e.escalation_type, policy_name: e.policy_name, policy_arn: e.policy_arn,
      _discoveredLabel: e.discovered, status: e.status, remediation: e.remediation,
      source_open_credential_findings: sourceNode?.open_credential_findings,
      target_open_credential_findings: targetNode?.open_credential_findings,
      source_policy_risk_findings: sourceNode?.open_policy_risk_findings,
      target_policy_risk_findings: targetNode?.open_policy_risk_findings,
      exposed_ports: e.exposed_ports,
    },
  })
}

// Simple left-to-right BFS layout: nodes that never appear as an edge
// target start at level 0, everything else is placed one level past its
// nearest source. Good enough for the shallow chains Cloudsplaining
// actually produces (source role -> ... -> account-admin), not a general
// graph-layout algorithm.
const ROW_HEIGHT = 90
const LEVEL_NAMES = ['ENTRY', 'FOOTHOLD', 'PIVOT']
// Real bug found via live layout inspection: a fixed-pixel CSS clamp()
// (clamp(56px, X%, calc(100% - 56px))) put a 138px-wide node's CENTER at
// exactly 56px from the edge on every render regardless of container
// width — with translateX(-50%) that's a left edge at 56-69=-13px,
// overflowing the container unconditionally, not just on narrow screens.
// Worse, the SVG edges used the raw 0-100% coordinate space while nodes
// used this clamped pixel space, so the two were never guaranteed to
// agree in the first place. Fixed by giving nodes AND edges the exact
// same percentage number (PADDING_PCT margin baked into xPct itself,
// no clamp()) — they literally cannot disagree anymore.
//
// PADDING_PCT must satisfy (PADDING_PCT/100) * MIN_CANVAS_WIDTH_PX >=
// node half-width, or a node at the 0%/100% end can still clip past the
// container's own min-width floor (.graph-canvas-inner's 380px below).
// Node width is 138px (half = 69px) at .graph-canvas-inner's 380px floor,
// so 15% (57px) was still short by ~12px — verified via a live
// getBoundingClientRect() repro, not just recalculated on paper. 21%
// (79.8px) clears it with a real margin.
const PADDING_PCT = 21

// Real findings with no edge in or out (cloud_resource/host nodes,
// graph_service.py's own standalone-node design) can't be BFS-leveled at
// all — they'd otherwise fall into the initial "never targeted" queue
// below and render as if they were real ENTRY principals, misrepresenting
// them as part of an escalation chain. Excluded from the leveled canvas
// entirely and rendered in their own honestly-labeled section instead.
const orphanNodeIds = computed(() => {
  if (!graph.value) return new Set<string>()
  const connected = new Set<string>()
  for (const e of graph.value.edges) { connected.add(e.source); connected.add(e.target) }
  return new Set(graph.value.nodes.filter(n => !connected.has(n.id)).map(n => n.id))
})
const orphanNodes = computed(() => {
  if (!graph.value) return []
  return graph.value.nodes.filter(n => orphanNodeIds.value.has(n.id))
})

const nodeLevels = computed(() => {
  if (!graph.value) return new Map<string, number>()
  const nodes = graph.value.nodes.filter(n => !orphanNodeIds.value.has(n.id))
  const edges = graph.value.edges
  const targets = new Set(edges.map(e => e.target))
  const levels = new Map<string, number>()
  const queue: string[] = nodes.filter(n => !targets.has(n.id)).map(n => n.id)
  queue.forEach(id => levels.set(id, 0))

  let frontier = [...queue]
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      const level = levels.get(id) ?? 0
      for (const e of edges) {
        if (e.source === id && !levels.has(e.target)) {
          levels.set(e.target, level + 1)
          next.push(e.target)
        }
      }
    }
    frontier = next
  }
  // Anything unreached (shouldn't normally happen) gets appended at level 0.
  for (const n of nodes) if (!levels.has(n.id)) levels.set(n.id, 0)
  return levels
})

const levelHeaders = computed(() => {
  if (!graph.value) return []
  const maxLevel = Math.max(0, ...Array.from(nodeLevels.value.values()))
  const headers: { level: number; xPct: number; name: string }[] = []
  for (let level = 0; level <= maxLevel; level++) {
    const xPct = maxLevel === 0 ? 50 : PADDING_PCT + (level / maxLevel) * (100 - 2 * PADDING_PCT)
    const name = level === maxLevel ? 'CROWN JEWEL' : (LEVEL_NAMES[level] ?? `LEVEL ${level + 1}`)
    headers.push({ level, xPct, name })
  }
  return headers
})

const targetsById = computed(() => {
  const map = new Map<string, GraphTarget>()
  for (const t of graph.value?.targets ?? []) map.set(t.node_id, t)
  return map
})

const chokepointEdges = computed(() => {
  const policyArn = graph.value?.chokepoint?.policy_arn
  if (!graph.value || !policyArn) return []
  return graph.value.edges.filter(e => e.policy_arn === policyArn)
})

// If every chokepoint edge shares one common source or target node, tag
// that node too — computed client-side, never fabricated when no single
// common node actually exists (a shared policy can span edges between
// entirely different principal pairs).
const chokepointNodeId = computed(() => {
  const edges = chokepointEdges.value
  if (!edges.length) return null
  const sources = new Set(edges.map(e => e.source))
  if (sources.size === 1) return [...sources][0]
  const targets = new Set(edges.map(e => e.target))
  if (targets.size === 1) return [...targets][0]
  return null
})

const _SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

// 3-tier crown-jewel cards (mockup calls the middle tier "AT RISK") — real
// data, not a new field: EXPOSED/AT RISK split on the same worst_severity
// the backend already computes, CONTAINED unchanged. Subtext names the
// actual technique behind the worst open edge reaching this target instead
// of a generic "N verified paths" — short phrases only (not full sentences
// like IamPathEvidence's plain-language block), scoped to this card's tight
// space; duplicating a few words locally beats importing that component's
// full-sentence map for a different job.
const SHORT_REASON: Record<string, string> = {
  'iam:passrole': 'role pass-through',
  'iam:createaccesskey': 'stolen access key',
  'iam:createloginprofile': 'console takeover',
  'iam:updateloginprofile': 'password reset',
  'sts:assumerole': 'role assumption',
  'iam:createpolicyversion': 'policy self-grant',
  'iam:setdefaultpolicyversion': 'policy version swap',
  'iam:attachuserpolicy': 'policy attach',
  'iam:attachrolepolicy': 'policy attach',
  'iam:updateassumerolepolicy': 'trust policy edit',
  'lambda:createfunction': 'Lambda execution role',
  'lambda:invokefunction': 'Lambda execution role',
  'ec2:runinstances': 'instance profile abuse',
}
interface TargetCard { node_id: string; label: string; open_path_count: number; tier: 'exposed' | 'at-risk' | 'contained'; tierLabel: string; subtext: string }
// Breach Reachability cards — scoped to real customer/heuristic-flagged
// high-value assets (CloudAsset.is_high_value) only, not every graph
// target. _compute_targets() itself stays generic (any node reached by
// >=1 edge — its own "crown jewel cards" naming predates this field and
// means something different: pure topology, not asset value) — this is
// the intersection of that real reachability data with the real
// is-this-asset-actually-valuable signal, matching the design benchmark's
// 3 specifically-named cards rather than a card per escalation target.
const highValueNodeIds = computed(() => new Set((graph.value?.nodes ?? []).filter(n => n.is_high_value).map(n => n.id)))
const targetCards = computed<TargetCard[]>(() => {
  if (!graph.value) return []
  return graph.value.targets.filter(t => highValueNodeIds.value.has(t.node_id)).map(t => {
    const label = graph.value!.nodes.find(n => n.id === t.node_id)?.label ?? shortId(t.node_id)
    if (t.open_path_count === 0) {
      return {
        node_id: t.node_id, label, open_path_count: 0, tier: 'contained' as const, tierLabel: 'CONTAINED',
        subtext: t.closed_path_count > 0 ? `${t.closed_path_count} path(s) closed — no longer reachable` : 'No verified path reaches this target',
      }
    }
    const rank = _SEVERITY_RANK[t.worst_severity ?? ''] ?? 0
    const tier = rank >= 3 ? 'exposed' as const : 'at-risk' as const
    // Real edge, not fabricated: the actual worst-severity open edge into
    // this specific target, read straight from the already-loaded graph.
    const worstEdge = graph.value!.edges
      .filter(e => e.target === t.node_id && e.status === 'open')
      .sort((a, b) => (_SEVERITY_RANK[b.severity] ?? 0) - (_SEVERITY_RANK[a.severity] ?? 0))[0]
    const action = worstEdge?.technique_chain?.[0]?.toLowerCase()
    const reason = action ? (SHORT_REASON[action] ?? action) : null
    return {
      node_id: t.node_id, label, open_path_count: t.open_path_count, tier, tierLabel: tier === 'exposed' ? 'EXPOSED' : 'AT RISK',
      subtext: reason ? `Path via ${reason}` : `${t.open_path_count} verified path${t.open_path_count === 1 ? '' : 's'}`,
    }
  })
})

// The graph card's own headline ("N verified paths → target") — the single
// most-exposed HIGH-VALUE target, or null when nothing is open (no card,
// no headline) — scoped the same way targetCards is, so the headline
// never names a target that isn't a real crown jewel.
const primaryTarget = computed(() => {
  if (!graph.value) return null
  const open = graph.value.targets
    .filter(t => t.open_path_count > 0 && highValueNodeIds.value.has(t.node_id))
    .sort((a, b) => b.open_path_count - a.open_path_count)
  return open[0] ?? null
})

const totalOpenIamPaths = computed(() => graph.value?.edges.filter(e => e.status === 'open' && e.priv_esc_path_id).length ?? 0)

interface FixQueueEntry { key: string; policyArn: string | null; label: string; count: number; worstSeverity: string; pathIds: string[]; isChokepoint: boolean; remediation: string; displayCount: number; displayTotal: number }
// Fix queue: real path fan-out, grouped by policy_arn exactly like
// simulateGroups' own selection groups — no separate fetch, the graph's
// own edges (already loaded) already carry policy_arn/severity/
// priv_esc_path_id. Deliberately real severity + a real inline Simulate
// fix action here, not the mockup's fabricated CVSS score / Jira button —
// this product has neither a CVSS model nor a Jira integration, and
// inventing either would be exactly the kind of unearned polish this
// redesign otherwise avoids (see Phase 39's own findings-ledger decision).
const fixQueue = computed<FixQueueEntry[]>(() => {
  if (!graph.value) return []
  const openIamEdges = graph.value.edges.filter(e => e.status === 'open' && e.priv_esc_path_id)
  const byPolicy = new Map<string, FixQueueEntry>()
  const pathOnly: FixQueueEntry[] = []
  const chokepointPolicyArn = graph.value.chokepoint?.policy_arn ?? null
  for (const e of openIamEdges) {
    const rank = _SEVERITY_RANK[e.severity] ?? 0
    if (e.policy_arn) {
      let g = byPolicy.get(e.policy_arn)
      if (!g) {
        g = {
          key: e.policy_arn, policyArn: e.policy_arn, label: e.policy_name || shortId(e.policy_arn),
          count: 0, worstSeverity: e.severity, pathIds: [], isChokepoint: e.policy_arn === chokepointPolicyArn,
          // Representative remediation text for the group — every path sharing
          // this exact policy_arn overwhelmingly shares the same granted
          // action(s) too, so the first edge's real text is a safe stand-in
          // rather than inventing a separate "group-level" summary.
          remediation: e.remediation, displayCount: 0, displayTotal: 0,
        }
        byPolicy.set(e.policy_arn, g)
      }
      g.count++
      g.pathIds.push(e.priv_esc_path_id!)
      if (rank > (_SEVERITY_RANK[g.worstSeverity] ?? 0)) g.worstSeverity = e.severity
    } else {
      pathOnly.push({
        key: `path:${e.priv_esc_path_id}`, policyArn: null, label: `${shortId(e.source)} → ${shortId(e.target)}`,
        count: 1, worstSeverity: e.severity, pathIds: [e.priv_esc_path_id!], isChokepoint: false,
        remediation: e.remediation, displayCount: 0, displayTotal: 0,
      })
    }
  }
  const chokepoint = graph.value.chokepoint
  return [...byPolicy.values(), ...pathOnly]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(entry => ({
      ...entry,
      // The chokepoint entry's displayed count is the backend's own
      // authoritative graph.chokepoint.closes_count/total_open_count —
      // never this client-side group count — so the Fix Priority panel's
      // top entry can never disagree with what _compute_chokepoint itself
      // reports. Every other (non-chokepoint) entry has no backend
      // equivalent to compare against and keeps its own real count.
      displayCount: entry.isChokepoint && chokepoint ? chokepoint.closes_count : entry.count,
      displayTotal: entry.isChokepoint && chokepoint ? chokepoint.total_open_count : entry.count,
    }))
})

function kindLabel(n: GraphNode): string {
  if (n.kind === 'third_party_app') return 'third-party app'
  if (n.kind === 'host') return 'server'
  if (n.kind === 'cloud_resource') return 'cloud resource'
  const prefix = n.label?.split('/')[0]
  if (prefix === 'role') return 'IAM role'
  if (prefix === 'user') return 'IAM user'
  if (prefix === 'group') return 'IAM group'
  return 'identity'
}

const layoutNodes = computed(() => {
  if (!graph.value) return []
  const levels = nodeLevels.value
  const maxLevel = Math.max(0, ...Array.from(levels.values()))
  const countPerLevel = new Map<number, number>()
  return graph.value.nodes.filter(n => !orphanNodeIds.value.has(n.id)).map(n => {
    const level = levels.get(n.id) ?? 0
    const row = countPerLevel.get(level) ?? 0
    countPerLevel.set(level, row + 1)
    const target = targetsById.value.get(n.id)
    // level 0 only means "nothing in this graph points at it" — a
    // topological accident, not proof an outsider can reach it. 'entry'
    // is reserved for the one real proven starting point (the "internet"
    // node, EXPOSED_TO_INTERNET); every other level-0 node is an
    // honestly-labeled 'assumed' access point (e.g. a bare Cloudsplaining
    // source principal — real "can escalate from here" data, but no
    // claim about how an attacker would ever get there in the first place).
    const role = target ? 'target' : (level === 0 ? (n.kind === 'internet' ? 'entry' : 'assumed') : 'intermediate')
    const subtitle = target
      ? (target.open_path_count > 0 ? `${target.open_path_count} verified path${target.open_path_count === 1 ? '' : 's'}` : 'contained')
      : kindLabel(n)
    // Simulate-mode preview: real, not fabricated — only true when EVERY
    // currently-open edge into this target is actually in the API's own
    // would_close result, never assumed from a partial match.
    const openEdgesIn = target ? graph.value!.edges.filter(e => e.target === n.id && e.status === 'open') : []
    const willBecomeContained = simulateMode.value && !!simulateResult.value && target
      ? target.open_path_count > 0 && openEdgesIn.length > 0 && openEdgesIn.every(e => e.priv_esc_path_id && wouldCloseIds.value.has(e.priv_esc_path_id))
      : false
    return {
      ...n,
      xPct: maxLevel === 0 ? 50 : PADDING_PCT + (level / maxLevel) * (100 - 2 * PADDING_PCT),
      y: row * ROW_HEIGHT + 30,
      level, role, subtitle,
      targetExposed: target ? target.open_path_count > 0 : false,
      openPathCount: target?.open_path_count ?? 0,
      closedPathCount: target?.closed_path_count ?? 0,
      isChokepointNode: chokepointNodeId.value === n.id,
      willBecomeContained,
    }
  })
})

const canvasHeight = computed(() => {
  const maxRow = Math.max(1, ...Array.from(
    layoutNodes.value.reduce((m, n) => {
      m.set(n.xPct, (m.get(n.xPct) ?? 0) + 1)
      return m
    }, new Map<number, number>()).values(),
  ))
  return Math.max(340, maxRow * ROW_HEIGHT + 80)
})

const layoutEdges = computed(() => {
  if (!graph.value) return []
  const byId = new Map(layoutNodes.value.map(n => [n.id, n]))
  const chokepointPolicyArn = graph.value.chokepoint?.policy_arn ?? null
  const resultReady = simulateMode.value && !!simulateResult.value
  return graph.value.edges.map(e => {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b) return null
    const isSevered = e.status === 'retest_closed'
    const isChokepoint = !!chokepointPolicyArn && e.policy_arn === chokepointPolicyArn
    // The actual "fix" preview: real API result (would_close), matched by
    // the same priv_esc_path_id every other evidence view already keys on
    // — never a guess at which edges a policy "probably" affects.
    const willClose = resultReady && !!e.priv_esc_path_id && wouldCloseIds.value.has(e.priv_esc_path_id)
    const dimmed = resultReady && !willClose
    return {
      x1: a.xPct, y1: a.y + 20, x2: b.xPct, y2: b.y + 20,
      color: willClose ? 'var(--green)' : (isSevered ? 'var(--border)' : (isChokepoint ? 'var(--accent)' : severityColor(e.severity))),
      isSevered, isChokepoint, willClose, dimmed,
      // Real security-group evidence (exposed_to_internet edges only) —
      // one joined badge covering EVERY real matched port, not just one,
      // so the canvas and the click-through panel always show the same
      // full picture.
      midXPct: (a.xPct + b.xPct) / 2, midY: (a.y + b.y) / 2 + 20,
      portLabel: e.exposed_ports?.length
        ? `PORT${e.exposed_ports.length > 1 ? 'S' : ''} ${e.exposed_ports.map(p => p.port ?? 'ALL').join(', ')}`
        : null,
    }
  }).filter((e): e is NonNullable<typeof e> => e !== null)
})

const edgePortLabels = computed(() => layoutEdges.value.filter(e => e.portLabel))

function nodeStyle(n: { xPct: number; y: number; hue: string; role: string; targetExposed: boolean; willBecomeContained?: boolean }) {
  let color = hueColor(n.hue)
  if (n.role === 'entry') color = 'var(--violet)'
  if (n.role === 'assumed') color = hueColor('amber')
  if (n.role === 'target') color = n.targetExposed ? 'var(--red)' : 'var(--green)'
  if (n.willBecomeContained) color = 'var(--green)' // simulate-mode preview wins over the real current EXPOSED color
  return {
    left: `${n.xPct}%`,
    top: `${n.y}px`,
    borderColor: color,
    color,
  }
}

onMounted(loadAll)
</script>

<style scoped>
.header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 14px; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap; }

.connection-select {
  height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-family: var(--font-body); font-size: 13px; max-width: 260px;
}
.connection-select:focus { outline: none; border-color: var(--accent); }

.refresh-btn {
  padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer;
  background: var(--accent); color: var(--bg); border: 1px solid var(--accent); flex-shrink: 0;
}
.refresh-btn.running { background: var(--surface2); color: var(--text2); border-color: var(--border); cursor: default; }

.scope-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--text2);
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 16px; margin-bottom: 14px;
}
.scope-badge { color: var(--green); font-weight: 700; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.03em; }
.scope-item { color: var(--text); font-weight: 600; }
.scope-item-clickable { cursor: pointer; }
.scope-item-clickable:hover { color: var(--accent); }
.scope-divider { color: var(--text3); }
.scope-note { color: var(--text3); }

.source-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; }
.source-head { font-size: 12px; color: var(--text2); }
.domain { color: var(--text); font-weight: 600; font-family: 'IBM Plex Mono', ui-monospace, monospace; }

.empty-state { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
.empty-state.error { border-color: var(--red); color: var(--red); }
.empty-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.empty-body { font-size: 13px; color: var(--text2); line-height: 1.6; }
.empty-body a { color: var(--accent); }

/* ── Crown-jewel target cards ── */
.targets-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 14px; }
.target-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px;
  border-left-width: 3px; position: relative;
}
.target-card.exposed { border-left-color: var(--red); }
.target-card.at-risk { border-left-color: var(--amber); }
.target-card.contained { border-left-color: var(--green); }
.target-status {
  position: absolute; top: 12px; right: 14px; font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
  padding: 3px 7px; border-radius: 5px; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.target-card.exposed .target-status { color: var(--red); background: color-mix(in srgb, var(--red) 16%, transparent); }
.target-card.at-risk .target-status { color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.target-card.contained .target-status { color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
.target-label { font-size: 12px; color: var(--text2); margin-bottom: 8px; padding-right: 70px; overflow-wrap: break-word; display: flex; align-items: center; gap: 5px; }
.target-crown-icon { flex-shrink: 0; color: var(--amber); }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.target-count { font-size: 28px; font-weight: 800; line-height: 1; }
.target-card.exposed .target-count { color: var(--red); }
.target-card.at-risk .target-count { color: var(--amber); }
.target-card.contained .target-count { color: var(--green); }
.target-sub { font-size: 11.5px; color: var(--text3); margin-top: 4px; }

/* ── Kill Chain Narrative — the page's flagship "here's the full story"
   panel, promoted (thicker border, more room) since the reorg: this is now
   the lead artifact, not one panel among many. The old standalone
   chokepoint-callout banner is gone — its job is now the Fix Priority
   panel's top entry, stated once. ── */
.kill-chain-panel {
  background: color-mix(in srgb, var(--violet) 6%, var(--surface)); border: 1.5px solid var(--violet);
  border-radius: 12px; padding: 20px 22px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 14px;
}
.kill-chain-header { display: flex; align-items: center; gap: 10px; }
.kill-chain-title { font-size: 13px; font-weight: 700; color: var(--violet); text-transform: uppercase; letter-spacing: 0.05em; }
.kill-chain-regenerate { margin-left: auto; font-size: 11.5px; font-weight: 700; color: var(--violet); cursor: pointer; }
.kill-chain-regenerate.running { color: var(--text3); cursor: default; }
.kill-chain-message { font-size: 15px; color: var(--text); line-height: 1.6; }
.kill-chain-block { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; border-top: 1px solid var(--border); }
.kill-chain-outcome-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kill-chain-severity-badge {
  flex-shrink: 0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 3px 7px; border-radius: 5px; border: 1px solid; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.kill-chain-outcome {
  font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; border: 1px solid;
  background: color-mix(in srgb, currentColor 12%, transparent);
}
.kill-chain-hop-wrap { display: flex; flex-direction: column; gap: 2px; padding-left: 4px; }
.kill-chain-hop { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text2); }
.kill-chain-hop-index {
  flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%; background: var(--surface2); color: var(--text3);
  font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.kill-chain-hop-text { flex: 1; color: var(--text); }
.kill-chain-hop-severity { flex-shrink: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; }
.kill-chain-hop-remediation { font-size: 11px; color: var(--text3); line-height: 1.45; padding-left: 24px; }
.kill-chain-citations { padding-top: 8px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
.kill-chain-citations-label { font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; }
.kill-chain-citation { font-size: 11px; color: var(--text3); }

/* ── Fix Priority — the single ranked "what to fix first" list, replacing
   the old chokepoint-callout banner + AI-Analyst-adjacent Fix Queue pair. ── */
.fix-priority-panel {
  background: var(--surface); border: 1px solid var(--accent); border-radius: 12px; padding: 16px 18px; margin-bottom: 16px;
  display: flex; flex-direction: column; gap: 10px;
}

/* ── Main row: the graph canvas only, now that Fix Priority/targets/Kill
   Chain own the top of the page. Kept as a simple block wrapper (was
   previously a flex pairing with a sidebar column, removed in the reorg
   below this graph is now the secondary, click-to-explore layer). ── */
.main-row { margin-bottom: 16px; }
.graph-column { min-width: 0; }
/* .analyst-tag is still used by the Kill Chain panel's own AI/Computed tag
   above — kept, the rest of the old AI Analyst sidebar's rules are gone. */
.analyst-tag {
  font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; color: var(--text3); background: var(--surface2);
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.analyst-tag.ai { color: var(--violet); background: color-mix(in srgb, var(--violet) 16%, transparent); }

/* ── Graph card header: now the secondary "explore it yourself" layer, so
   deliberately quieter than the Kill Chain/Fix Priority panels above it. ── */
.graph-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.graph-card-title { font-size: 12px; font-weight: 600; color: var(--text2); display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.graph-card-headline { font-size: 12px; font-weight: 600; color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.graph-card-actions { display: flex; align-items: center; gap: 10px; }
.live-badge {
  font-size: 9px; font-weight: 800; letter-spacing: 0.04em; color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 40%, transparent);
  background: color-mix(in srgb, var(--green) 12%, transparent); border-radius: 5px; padding: 3px 7px; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.simulate-shortcut { font-size: 11.5px; font-weight: 700; color: var(--accent); cursor: pointer; }
.simulate-shortcut:hover { text-decoration: underline; }

/* ── Fix queue: real path fan-out, ranked, linking into Simulate-the-Fix ── */
.fix-queue-head { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.fix-queue-sub { font-weight: 400; text-transform: none; color: var(--text3); letter-spacing: 0; margin-left: 6px; }
.fix-entry {
  display: block; padding: 10px 12px; border-radius: 8px; background: var(--surface2); border: 1px solid var(--border);
  text-decoration: none; color: inherit;
}
.fix-entry:hover { border-color: var(--accent); }
.fix-entry-top { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface2)); }
.fix-entry-head { display: flex; gap: 6px; margin-bottom: 5px; }
.fix-entry-tag {
  font-size: 8.5px; font-weight: 800; letter-spacing: 0.03em; padding: 2px 6px; border-radius: 4px;
  font-family: 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
}
.fix-entry-tag.chokepoint { color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, transparent); }
.fix-entry-tag.severity { border: 1px solid; background: transparent; }
.fix-entry-title { font-size: 12.5px; font-weight: 700; color: var(--text); overflow-wrap: break-word; }
.fix-entry-sub { font-size: 11px; color: var(--text3); margin-top: 2px; }
.fix-entry-remediation { font-size: 11px; color: var(--text2); line-height: 1.45; margin-top: 6px; }
.fix-entry-bar-track { height: 3px; border-radius: 999px; background: var(--border); margin-top: 8px; overflow: hidden; }
.fix-entry-bar { height: 100%; background: var(--accent); border-radius: 999px; }

/* ── Graph canvas ── */
.graph-canvas-full { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; overflow-x: auto; }
/* min-width, not on the outer box: a hard safety floor for the percentage-
   based node layout above (stays correct at any width down to this floor).
   Narrower than that, .graph-canvas-full's own overflow-x scrolls this
   content horizontally rather than ever clipping a node against the edge —
   both this and .graph-canvas-inner share the floor so the level headers
   and the nodes/edges they label always scroll together in lockstep. */
.level-headers { position: relative; height: 16px; margin-bottom: 6px; min-width: 380px; }
.level-header {
  position: absolute; transform: translateX(-50%); font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em;
  color: var(--text3); white-space: nowrap; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
/* max-height + overflow, not a fixed height — canvas-inner (below) is
   sized to the real content height (canvasHeight), this just caps the
   visible window and scrolls the rest. A fixed height here would force
   the SVG's height="100%" to stretch/squish its own Y-axis to fit,
   independently of the node <div>s' literal top:${y}px positions —
   exactly the edges-don't-line-up-with-nodes bug this replaces. */
.graph-canvas-inner { position: relative; width: 100%; min-width: 380px; max-height: 460px; overflow: auto; }
.graph-svg { position: absolute; top: 0; left: 0; }
.edge-line { animation: dashmove 1.2s linear infinite; transition: stroke-opacity 0.2s ease; }
.edge-line.severed { animation: none; opacity: 0.6; }
.edge-line.will-close { animation: dashmove 0.7s linear infinite; }
.edge-port-label {
  position: absolute; transform: translate(-50%, -50%); pointer-events: none; z-index: 2;
  font-size: 9px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap;
  padding: 2px 6px; border-radius: 4px;
  background: color-mix(in srgb, var(--red) 20%, var(--bg)); color: var(--red);
  border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
}
.graph-node {
  position: absolute; box-sizing: border-box; transform: translateX(-50%); width: 138px; padding: 9px 8px;
  border-radius: 10px; background: var(--surface2); border-width: 2px; border-style: solid;
  cursor: pointer; white-space: normal; text-align: center; line-height: 1.25; word-break: break-word;
}
.graph-node.is-chokepoint { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 50%, transparent); }
.graph-node.will-be-contained { box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 55%, transparent); }
.node-tag {
  font-size: 8px; font-weight: 800; letter-spacing: 0.04em; padding: 2px 6px 2px 5px; border-radius: 4px; margin-bottom: 5px;
  display: inline-flex; align-items: center; gap: 3px; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.node-tag.chokepoint { color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, transparent); }
.node-tag.crown-jewel { color: var(--red); background: color-mix(in srgb, var(--red) 20%, transparent); }
.node-tag.patched { color: var(--green); background: color-mix(in srgb, var(--green) 20%, transparent); }
.node-tag.will-close { color: var(--green); background: color-mix(in srgb, var(--green) 24%, transparent); }
.node-tag.assumed-access { color: var(--amber); background: color-mix(in srgb, var(--amber) 20%, transparent); }
.node-type { font-size: 10px; font-weight: 700; letter-spacing: 0.02em; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.node-sub { font-size: 9px; color: var(--text3); margin-top: 2px; font-family: var(--font-body); }
.credential-badge {
  position: absolute; top: -8px; right: -8px; min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: 999px; background: var(--red); color: var(--bg); font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; line-height: 1;
  border: 2px solid var(--surface2);
}
/* Deliberately NOT a circle like .credential-badge above — a distinct
   pill shape (plus its own icon and severity-driven color) so the two
   badges read as two different kinds of signal at a glance, not one
   restyled twice. Top-left, so it never collides with the credential
   badge's top-right position when a node carries both. */
.policy-risk-badge {
  position: absolute; top: -8px; left: -8px; height: 18px; padding: 0 5px 0 4px;
  border-radius: 999px; color: var(--bg); font-size: 9.5px; font-weight: 800;
  display: flex; align-items: center; gap: 2px; line-height: 1;
  border: 2px solid var(--surface2);
}

.legend-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; font-size: 11px; color: var(--text3); }
.legend-item { display: flex; align-items: center; gap: 5px; }
.legend-swatch { display: inline-block; width: 16px; height: 0; border-top: 2px dashed var(--text3); }
.legend-swatch.active { border-top-color: var(--amber); }
.legend-swatch.chokepoint { border-top-color: var(--accent); border-top-width: 3px; }
.legend-swatch.severed { border-top-color: var(--border); opacity: 0.7; }
.legend-swatch.will-close { border-top-color: var(--green); border-top-width: 3px; border-top-style: solid; }
.legend-swatch.dimmed { border-top-color: var(--text3); opacity: 0.3; }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.legend-dot.exposed { background: var(--red); }
.legend-dot.contained { background: var(--green); }
.legend-shield-icon { color: var(--red); flex-shrink: 0; }

/* ── Real findings with no mapped path yet — VPS/host + cloud
   misconfiguration findings, deliberately rendered outside the leveled
   canvas so nothing here reads as part of a verified escalation chain. ── */
.orphan-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.orphan-head { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; }
.orphan-sub { font-weight: 400; text-transform: none; color: var(--text3); letter-spacing: 0; margin-left: 6px; }
.orphan-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.orphan-card {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px;
  background: var(--surface2); border: 1px solid var(--border); border-left-width: 3px; cursor: pointer;
}
.orphan-card:hover { border-color: var(--text3); }
.orphan-icon { color: var(--text3); flex-shrink: 0; }
.orphan-body { flex: 1; min-width: 0; }
.orphan-label { font-size: 12.5px; font-weight: 700; color: var(--text); overflow-wrap: break-word; }
.orphan-sub-label { font-size: 10.5px; color: var(--text3); text-transform: capitalize; }
.orphan-badge {
  flex-shrink: 0; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px; border: 1px solid;
  font-family: 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap;
}

/* ── Simulate-the-Fix banner, inline on the graph itself ── */
.simulate-banner {
  background: color-mix(in srgb, var(--green) 7%, var(--surface)); border: 1px solid color-mix(in srgb, var(--green) 45%, var(--border));
  border-radius: 12px; padding: 16px 18px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px;
}
.simulate-banner-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.simulate-banner-badge {
  font-size: 10px; font-weight: 800; letter-spacing: 0.05em; color: var(--green); border: 1px solid color-mix(in srgb, var(--green) 50%, transparent);
  background: color-mix(in srgb, var(--green) 16%, transparent); border-radius: 6px; padding: 4px 9px; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.simulate-banner-note { font-size: 12px; color: var(--text3); }
.simulate-exit {
  margin-left: auto; display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: var(--text2);
  cursor: pointer; padding: 4px 9px; border-radius: 6px; border: 1px solid var(--border);
}
.simulate-exit:hover { color: var(--text); border-color: var(--text3); }
.simulate-loading { font-size: 13px; color: var(--text2); }
.simulate-error { font-size: 13px; color: var(--red); }

.simulate-plan { display: flex; flex-direction: column; gap: 6px; }
.simulate-plan-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.simulate-plan-entry { font-size: 13px; color: var(--text); line-height: 1.55; }
.simulate-plan-actions { font-family: 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); font-size: 12px; }

.simulate-result-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.simulate-result-chip {
  font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; border: 1px solid;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.simulate-result-chip.closed { color: var(--green); border-color: color-mix(in srgb, var(--green) 45%, transparent); background: color-mix(in srgb, var(--green) 14%, transparent); }
.simulate-result-chip.remain { color: var(--text3); border-color: var(--border); background: var(--surface2); }
.simulate-result-hint { font-size: 11.5px; color: var(--text3); }

.simulate-selector-toggle { align-self: flex-start; font-size: 11.5px; font-weight: 700; color: var(--accent); cursor: pointer; }
.simulate-selector-toggle:hover { text-decoration: underline; }
.simulate-selector { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; border-top: 1px solid var(--border); }
.simulate-selector-row {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 7px; background: var(--surface2);
  border: 1px solid transparent; cursor: pointer; font-size: 12.5px;
}
.simulate-selector-row:hover { border-color: var(--border); }
.simulate-selector-label { flex: 1; color: var(--text); overflow-wrap: anywhere; }
.simulate-selector-count { color: var(--text3); font-size: 11px; font-family: 'IBM Plex Mono', ui-monospace, monospace; flex-shrink: 0; }
.simulate-run-btn {
  align-self: flex-start; margin-top: 4px; padding: 8px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700;
  cursor: pointer; background: var(--green); color: var(--bg); border: 1px solid var(--green);
}
.simulate-run-btn.disabled { background: var(--surface2); color: var(--text3); border-color: var(--border); cursor: default; }

/* ── Verified Findings ledger ── */
.ledger { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
.ledger-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; font-size: 13px; font-weight: 700; }
.ledger-sub { font-size: 11px; font-weight: 400; color: var(--text3); }
.ledger-link { margin-left: auto; font-size: 11.5px; font-weight: 700; color: var(--accent); text-decoration: none; }
.ledger-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 4px; border-top: 1px solid var(--border); cursor: pointer; }
.ledger-row:first-of-type { border-top: none; }
.ledger-row:hover { background: var(--surface2); border-radius: 8px; }
.ledger-pill {
  flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; border: 1px solid;
  text-transform: uppercase; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.ledger-main { flex: 1; min-width: 0; }
.ledger-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ledger-reach-tag {
  font-size: 9px; font-weight: 800; letter-spacing: 0.03em; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent); border-radius: 4px; padding: 2px 6px; font-family: 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
}
.ledger-meta { font-size: 11px; color: var(--text3); margin-top: 2px; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.ledger-status { flex-shrink: 0; font-size: 11px; color: var(--text3); text-transform: uppercase; }
.ledger-status.resolved { color: var(--green); }
</style>
