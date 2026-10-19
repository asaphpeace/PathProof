<template>
  <div class="iam-path-evidence">
    <!-- Point (c): one synthesized, plain-language statement leads the
         panel — "X can be escalated to Y because of Z" — with its MITRE
         justification link right there, instead of making the reader
         piece the story together from separate Path/Escalation/Actions/
         Policy blocks further down (which still exist below, as supporting
         detail for anyone who wants to verify the claim). -->
    <div class="block narrative-block">
      <div class="block-label">What this means</div>
      <div class="narrative-text">
        <span class="narrative-node">{{ sourceLabel }}</span> can be escalated to
        <span class="narrative-node target">{{ targetLabel }}</span> because it can
        {{ plainReason }}{{ data.policy_name ? `, granted by the policy “${data.policy_name}.”` : '.' }}
      </div>
      <a
        v-if="primaryTechnique"
        class="narrative-mitre" :href="`https://attack.mitre.org/techniques/${primaryTechnique.id.replace('.', '/')}/`"
        target="_blank" rel="noopener"
      >MITRE ATT&amp;CK {{ primaryTechnique.id }} — {{ primaryTechnique.name }} ↗</a>
    </div>

    <div class="block">
      <div class="block-label">Path</div>
      <div class="path-chain">
        <span class="path-node">{{ shortArn(data.source_principal_arn) }}</span>
        <span class="path-arrow">→</span>
        <span class="path-node target">{{ shortArn(data.target_principal_arn) }}</span>
      </div>
    </div>

    <!-- Real security-group rule evidence for exposed_to_internet edges —
         EVERY real matched port/protocol/CIDR rule, not just one (a real
         gap found this session: keeping only the worst-severity match
         silently dropped an instance's other real open ports). Gated on
         a non-empty list — [] for every other edge type, and for a
         Finding-only exposure with no matching raw-internet SG rule.
         This is the concrete, inspectable proof buyers look for instead
         of just a color-coded severity. -->
    <div v-if="data.exposed_ports?.length" class="block port-evidence-block">
      <div class="block-label">Open port evidence</div>
      <div v-for="(p, idx) in data.exposed_ports" :key="idx" class="block-text">
        {{ p.port ? `Port ${p.port}` : 'All ports' }}
        ({{ p.protocol === '-1' ? 'all protocols' : p.protocol }})
        open to <span class="mono">{{ p.cidr }}</span>
      </div>
    </div>

    <div v-if="data.escalation_type" class="block">
      <div class="block-label">Escalation technique</div>
      <div class="block-text">{{ escalationLabel(data.escalation_type) }}</div>
    </div>

    <div class="block">
      <div class="block-label">IAM actions in this chain</div>
      <div class="action-list">
        <span v-for="a in data.technique_chain" :key="a" class="action-tag">{{ a }}</span>
      </div>
    </div>

    <div v-if="data.policy_name" class="block">
      <div class="block-label">Granting policy</div>
      <div class="block-text mono">{{ data.policy_name }}</div>
      <div v-if="data.policy_arn" class="block-text mono policy-arn">{{ data.policy_arn }}</div>
    </div>

    <!-- The actual "what do I do about it" — previously this panel only
         explained what the risk was and offered a read-only simulation of
         closing it, with no concrete instruction for the real fix. Real,
         curated text from privesc_remediation_mapping.py, not invented
         client-side, so it's the same for every place this panel opens
         from (Graph view, Simulate-the-Fix). -->
    <div v-if="data.remediation" class="block remediation-block">
      <div class="block-label">How to fix this</div>
      <div class="block-text">{{ data.remediation }}</div>
    </div>

    <div v-if="canSimulate" class="block">
      <div class="simulate-btn" @click="simulateFromHere">Simulate fixing this</div>
    </div>

    <div v-if="identityRiskLinks.length" class="block">
      <div class="block-label">Related identity risk</div>
      <RouterLink v-for="l in identityRiskLinks" :key="l.arn" :to="l.to" class="identity-risk-link">
        {{ l.label }}
      </RouterLink>
    </div>

    <div v-if="data.attack_techniques?.length" class="block">
      <div class="block-label">MITRE ATT&amp;CK techniques</div>
      <div class="attack-badges">
        <a
          v-for="t in data.attack_techniques" :key="t.id"
          class="attack-badge" :href="`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`"
          target="_blank" rel="noopener"
        >{{ t.id }} — {{ t.name }}</a>
      </div>
    </div>

    <div class="block meta-row">
      <span>{{ data.severity?.toUpperCase() }}</span>
      <span v-if="discoveredLabel">Discovered {{ discoveredLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { usePanelStore } from '@/stores/panels'

const props = defineProps<{ data: any }>()
const router = useRouter()
const panels = usePanelStore()

// The Graph view's edges already carry a human-readable relative time
// ("2h ago", computed server-side); the priv-esc-paths list endpoint gives
// a raw ISO discovered_at instead — this renderer is shared by both.
const discoveredLabel = computed(() => props.data._discoveredLabel ?? (props.data.discovered_at ? formatDate(props.data.discovered_at) : null))

// Only real IAM privilege-escalation paths can be simulated — OAuth-grant
// edges (which also render via this component from the Graph view) never
// carry a policy_arn or a priv-esc-path id, so this naturally excludes them.
const canSimulate = computed(() => Boolean(props.data.policy_arn || props.data.id))

// Simulate-the-Fix now lives inline on the Attack Path Graph itself, not a
// separate page (direct user request) — closes this panel and pushes the
// same query GraphView.vue's own Fix Queue/chokepoint entry points use, so
// the fix happens at the exact point admins discover this feature, right
// on the graph they're already looking at, not a page transition away.
function simulateFromHere() {
  const query: Record<string, string> = {}
  if (props.data.policy_arn) query.policy_arn = props.data.policy_arn
  else if (props.data.id) query.priv_esc_path_id = props.data.id
  panels.close()
  router.push({ name: 'graph', query })
}

// Real, narrow cross-link (Coverage Map roadmap Phase 36f) — the graph
// itself stays edges-only; this just surfaces the credential-tier findings
// that already ARN-match this path's own principals, via a link into the
// Findings page rather than duplicating a findings list inside this panel.
// Counts are only known when opened from the Graph view (its node objects
// already carry open_credential_findings); other callers (Simulate-the-Fix,
// the Coverage Map drill panel) show an uncounted link instead of a
// fabricated number. No engagement id is threaded through here, so the
// Findings page falls back to its default engagement — for a tenant with
// more than one connected AWS account this can point at the wrong one, in
// which case the resource_uid filter correctly shows zero results rather
// than the wrong account's findings (a safe degrade, not a silent error).
const identityRiskLinks = computed(() => {
  const candidates: [string | undefined, number | undefined, number | undefined][] = [
    [props.data.source_principal_arn, props.data.source_open_credential_findings, props.data.source_policy_risk_findings],
    [props.data.target_principal_arn, props.data.target_open_credential_findings, props.data.target_policy_risk_findings],
  ]
  const links: { arn: string; label: string; to: any }[] = []
  const seen = new Set<string>()
  for (const [arn, count, policyRiskCount] of candidates) {
    if (!arn || !arn.startsWith('arn:') || seen.has(arn)) continue
    seen.add(arn)
    // The policy-risk sub-count is broken out inline so a reader doesn't
    // have to click through just to learn whether this is routine hygiene
    // or the same catastrophic-capability risk the graph's node badge
    // already flagged (real "can act without escalating" risk, not
    // privesc).
    const riskNote = policyRiskCount && policyRiskCount > 0 ? `, ${policyRiskCount} catastrophic-capability` : ''
    const label = typeof count === 'number'
      ? (count > 0 ? `${count} open identity/credential finding${count === 1 ? '' : 's'} for ${shortArn(arn)}${riskNote} →` : null)
      : `View identity/credential findings for ${shortArn(arn)} →`
    if (label) links.push({ arn, label, to: { name: 'findings', query: { tier: 'credential', resource_uid: arn } } })
  }
  return links
})

const ESCALATION_LABELS: Record<string, string> = {
  CreateNewPolicyVersion: 'Create a new default version of a policy already attached to this principal — the fastest path to granting itself any permission.',
  SetExistingDefaultPolicyVersion: 'Switch an attached policy to a previously-created version with broader permissions.',
  CreateEC2WithExistingIP: 'Launch an EC2 instance using an existing instance profile that grants broader access than this principal has directly.',
  PassExistingRoleToNewLambdaThenInvoke: 'Pass an over-permissioned role to a newly created Lambda function, then invoke it to inherit that role\'s access.',
}

function escalationLabel(type: string): string {
  return ESCALATION_LABELS[type] ?? type
}

// Point (c) plain-English "why", used to build the lead narrative sentence
// when there's no escalation_type (e.g. iam:CreateAccessKey-only paths, or
// OAuth-grant edges whose technique_chain holds Graph scopes instead of IAM
// actions) — same idea as ESCALATION_LABELS above but keyed on the raw
// action/scope string rather than Cloudsplaining's escalation_type, since
// that field is null for those cases even though the edge is still real.
const ACTION_REASONS: Record<string, string> = {
  'iam:passrole': 'pass an IAM role with broader permissions to a service it controls, then act with that role\'s access',
  'iam:createaccesskey': 'create a new access key for another IAM user, gaining that user\'s full permissions',
  'iam:createloginprofile': 'set a console password for another IAM user who has none, gaining that user\'s full permissions',
  'iam:updateloginprofile': 'reset another IAM user\'s console password, gaining that user\'s full permissions',
  'sts:assumerole': 'assume a role with broader permissions than it has directly',
  'iam:createpolicyversion': 'create a new default policy version, granting itself any permission it wants',
  'iam:setdefaultpolicyversion': 'switch an attached policy to a previously-created, more permissive version',
  'iam:attachuserpolicy': 'attach a more permissive managed policy directly to itself or another user',
  'iam:attachrolepolicy': 'attach a more permissive managed policy to a role it controls',
  'iam:attachgrouppolicy': 'attach a more permissive managed policy to a group it belongs to',
  'iam:putuserpolicy': 'inline a more permissive policy directly onto itself or another user',
  'iam:putrolepolicy': 'inline a more permissive policy onto a role it controls',
  'iam:updateassumerolepolicy': 'modify a role\'s trust policy so it can assume that role itself',
  'lambda:createfunction': 'create a Lambda function that runs with a more permissive execution role',
  'lambda:invokefunction': 'invoke an existing Lambda function that runs with a more permissive execution role',
  'lambda:updatefunctioncode': 'overwrite an existing Lambda function\'s code so it runs attacker logic with that function\'s role',
  'ec2:runinstances': 'launch an EC2 instance with an instance profile that grants broader access than it has directly',
  'cloudformation:createstack': 'create a CloudFormation stack that provisions resources with a more permissive role',
  'mail.read': 'read this account\'s mailbox',
  'mail.readwrite': 'read and modify this account\'s mailbox',
  'mail.send': 'send mail as this account, e.g. for internal spearphishing',
  'files.readwrite.all': 'read and modify every file this account can access',
  'sites.readwrite.all': 'read and modify every SharePoint site this account can access',
  'directory.readwrite.all': 'read and modify the entire directory, including other users\' accounts',
  'user.readwrite.all': 'read and modify any user account in the directory',
}

function plainReasonFor(chain: string[] | null | undefined): string {
  const action = chain?.[0]?.toLowerCase()
  if (action && ACTION_REASONS[action]) return ACTION_REASONS[action]
  if (action) return `use the ${chain![0]} permission to gain broader access`
  return 'reach it through this chain'
}

const sourceLabel = computed(() => shortArn(props.data.source_principal_arn))
const targetLabel = computed(() => {
  const arn = props.data.target_principal_arn
  // "account-admin" is Cloudsplaining's own synthetic placeholder target
  // (PMapper was dropped — see ARCHITECTURE.md — so real target resolution
  // isn't available yet); spelling that out beats echoing the raw string,
  // which would read as a literal resource named "account-admin".
  if (arn === 'account-admin') return 'full administrative control of the AWS account'
  return shortArn(arn)
})
// ESCALATION_LABELS entries are written as full, capitalized, period-
// terminated sentences (they're also shown verbatim in the "Escalation
// technique" block below) — normalized here so they read naturally as the
// tail of "...because it can {reason}" instead of doubling punctuation or
// capitalization when spliced into that lead sentence.
const plainReason = computed(() => {
  const raw = props.data.escalation_type ? escalationLabel(props.data.escalation_type) : plainReasonFor(props.data.technique_chain)
  const trimmed = raw.replace(/\.$/, '')
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
})
const primaryTechnique = computed(() => props.data.attack_techniques?.[0] ?? null)

function shortArn(arn: string): string {
  return arn?.split('/').pop() ?? arn
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.iam-path-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; }
.policy-arn { color: var(--text2); }

.narrative-block {
  padding: 14px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent); gap: 10px;
}
.narrative-text { font-size: 14px; line-height: 1.6; color: var(--text); }
.narrative-node { font-weight: 700; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 13px; }
.narrative-node.target { color: var(--red); }
.narrative-mitre {
  display: inline-block; width: fit-content; font-size: 11.5px; font-weight: 600; color: var(--accent);
  text-decoration: none; border-bottom: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
}
.narrative-mitre:hover { border-bottom-style: solid; }

.remediation-block {
  padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--green) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--green) 28%, transparent);
}
.remediation-block .block-label { color: var(--green); }

.port-evidence-block {
  padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--red) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--red) 28%, transparent);
}
.port-evidence-block .block-label { color: var(--red); }

.path-chain { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.path-node {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; padding: 6px 10px;
  border-radius: 6px; background: var(--surface2); border: 1px solid var(--border);
}
.path-node.target { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); }
.path-arrow { color: var(--text3); }

.action-list { display: flex; flex-direction: column; gap: 4px; }
.action-tag {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 6px; padding: 6px 9px; width: fit-content;
}

.attack-badges { display: flex; flex-direction: column; gap: 6px; }
.attack-badge {
  font-size: 11px; color: var(--accent); text-decoration: none; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.attack-badge:hover { border-color: var(--accent); }

.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }

.simulate-btn {
  display: block; padding: 10px 14px; border-radius: 8px; text-align: center; cursor: pointer;
  background: color-mix(in srgb, var(--accent) 14%, transparent); border: 1px solid var(--accent);
  color: var(--accent); font-size: 13px; font-weight: 700; text-decoration: none;
}
.identity-risk-link {
  display: block; padding: 8px 10px; border-radius: 6px; font-size: 12.5px; text-decoration: none;
  color: var(--red); background: color-mix(in srgb, var(--red) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
}
.identity-risk-link + .identity-risk-link { margin-top: 6px; }
</style>
