<template>
  <div class="graph-node-evidence">
    <div class="block">
      <div class="block-label">{{ kindLabel }}</div>
      <div class="block-text mono">{{ data.detail }}</div>
    </div>
    <div class="block">
      <div class="block-label">Discovered</div>
      <div class="block-text">{{ data.discovered }}</div>
    </div>

    <!-- Real findings with no edge in or out (graph_service.py's own
         standalone-node design, VPS/host + cloud misconfiguration
         findings) — the honest reason this node has no attack path drawn
         to it yet. -->
    <div v-if="data.open_findings > 0" class="block risk-block">
      <div class="block-label">Open findings</div>
      <div class="block-text">
        {{ data.open_findings }} open finding{{ data.open_findings === 1 ? '' : 's' }} for this
        {{ data.kind === 'host' ? 'server' : 'resource' }} — not yet connected to an attack path on this graph.
      </div>
      <RouterLink :to="findingsLink" class="evidence-link">
        View {{ data.open_findings === 1 ? 'this finding' : 'these findings' }} →
      </RouterLink>
    </div>

    <!-- Primary, shown first: just as catastrophic as a privesc path but
         not one (no source->target chain to draw), so this is the only
         place it's explained rather than left as a bare badge count. -->
    <div v-if="data.open_policy_risk_findings > 0" class="block risk-block">
      <div class="block-label">Catastrophic capability (not escalation)</div>
      <div class="block-text">
        {{ data.open_policy_risk_findings }} open finding{{ data.open_policy_risk_findings === 1 ? '' : 's' }}
        — this principal can act catastrophically (data exfiltration, resource exposure, unconstrained service
        access, or credentials exposure) without ever escalating privileges.
      </div>
      <RouterLink :to="{ name: 'findings', query: { tier: 'credential', resource_uid: data.id } }" class="evidence-link">
        View {{ data.open_policy_risk_findings === 1 ? 'this finding' : 'these findings' }} →
      </RouterLink>
    </div>

    <div v-if="data.open_credential_findings > 0" class="block">
      <div class="block-label">Identity &amp; credential findings</div>
      <div class="block-text">
        {{ data.open_credential_findings }} open finding{{ data.open_credential_findings === 1 ? '' : 's' }} for this principal
        <template v-if="data.open_policy_risk_findings > 0">
          (includes the catastrophic-capability finding{{ data.open_policy_risk_findings === 1 ? '' : 's' }} above,
          plus any routine password/MFA/access-key hygiene findings).
        </template>
        <template v-else>(routine password/MFA/access-key hygiene, not catastrophic-capability risk).</template>
      </div>
      <RouterLink :to="{ name: 'findings', query: { tier: 'credential', resource_uid: data.id } }" class="evidence-link">
        View all →
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
const props = defineProps<{ data: any }>()

const kindLabel = computed(() => {
  if (props.data.kind === 'third_party_app') return 'Third-party app'
  if (props.data.kind === 'host') return 'Server'
  if (props.data.kind === 'cloud_resource') return 'Cloud resource'
  return 'Identity'
})

// Host findings key on the raw hostname (data.detail — data.id is
// prefixed "host:..." to keep it collision-safe as a graph node id, but
// Finding.resource_uid never carries that prefix); cloud_resource findings
// key on the real ARN (data.id itself).
const findingsLink = computed(() => ({
  name: 'findings',
  query: {
    tier: props.data.kind === 'host' ? 'host' : 'cloud',
    resource_uid: props.data.kind === 'host' ? props.data.detail : props.data.id,
  },
}))
</script>

<style scoped>
.graph-node-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; }
</style>
