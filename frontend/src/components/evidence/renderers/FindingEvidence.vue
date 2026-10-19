<template>
  <div class="finding-evidence">
    <div class="block">
      <div class="block-label">Description</div>
      <div class="block-text">{{ data.detail || 'No description recorded for this finding.' }}</div>
    </div>

    <!-- Real, explained attribution — same two-tier account+resource split
         AWS's own Security Hub finding format and OCSF both use. Only
         present when this finding came from the tenant-wide GET /findings
         (the per-engagement endpoint's own findings won't carry these two
         fields, since the caller already knows which engagement/connection
         it asked for) — degrades to nothing rather than a blank block. -->
    <div v-if="data.connection_label" class="block">
      <div class="block-label">Connection</div>
      <div class="block-text">
        <template v-if="data.connection_display_name">
          <strong>{{ data.connection_display_name }}</strong>
          <span class="muted-text"> — {{ data.connection_label }}</span>
        </template>
        <template v-else>{{ data.connection_label }}</template>
      </div>
    </div>

    <div v-if="data.extra?.risk" class="block">
      <div class="block-label">Risk</div>
      <div class="block-text">{{ data.extra.risk }}</div>
    </div>

    <div v-if="data.extra?.vulnerability_id || data.extra?.cvss" class="block">
      <div class="block-label">Vulnerability</div>
      <div class="vuln-row">
        <span v-if="data.extra.vulnerability_id" class="mono vuln-id">{{ data.extra.vulnerability_id }}</span>
        <span
          v-if="data.extra.cvss?.base_score != null"
          class="cvss-pill"
          :style="{ color: severityColor(cvssSeverity), borderColor: severityColor(cvssSeverity), background: `color-mix(in srgb, ${severityColor(cvssSeverity)} 16%, transparent)` }"
        >CVSS {{ data.extra.cvss.base_score }}</span>
        <span v-if="data.extra.exploit_available === 'YES'" class="tag tag-danger">Exploit available</span>
        <span v-if="data.extra.fix_available" class="tag" :class="{ 'tag-ok': data.extra.fix_available === 'YES' }">
          Fix {{ data.extra.fix_available === 'YES' ? 'available' : data.extra.fix_available === 'PARTIAL' ? 'partially available' : 'not available' }}
        </span>
        <span v-if="data.extra.network_reachable" class="tag tag-danger">Network reachable</span>
      </div>
      <div v-if="data.extra.vulnerable_packages?.length" class="affected-list">
        <div v-for="p in data.extra.vulnerable_packages" :key="p.name" class="mono affected-row">
          {{ p.name }} {{ p.version }}{{ p.fixed_in_version ? ` → fix in ${p.fixed_in_version}` : '' }}
        </div>
      </div>
      <div v-if="data.extra.epss_score != null" class="block-text muted-text">EPSS (exploit probability): {{ (data.extra.epss_score * 100).toFixed(1) }}%</div>
    </div>

    <div v-if="data.occurrence_count > 1" class="block">
      <div class="block-label">Affected resources ({{ data.occurrence_count }})</div>
      <div class="block-text">
        This is one gap — the same check found across {{ data.occurrence_count }} regions/resources, shown here as a
        single finding instead of {{ data.occurrence_count }} near-identical rows.
      </div>
      <div class="affected-list">
        <div v-for="uid in data.affected_resources" :key="uid" class="mono affected-row">{{ uid }}</div>
      </div>
    </div>
    <div v-else-if="data.resource_uid" class="block">
      <div class="block-label">Resource</div>
      <div class="block-clickable" @click="drillResource">
        <span v-if="resourceDisplayName" class="resource-friendly-name">{{ resourceDisplayName }}</span>
        <span class="mono">{{ data.resource_uid }}</span>
        <span class="drill-hint">See every finding on this resource →</span>
      </div>
    </div>

    <div v-if="data.remediation_guidance" class="block">
      <div class="block-label">Remediation</div>
      <div class="block-text">{{ data.remediation_guidance }}</div>
    </div>

    <div v-if="hasRemediationCode" class="block">
      <div class="block-label">Remediation code</div>
      <pre v-if="data.extra.remediation_code.terraform" class="code-block"><span class="code-lang">Terraform</span>{{ data.extra.remediation_code.terraform }}</pre>
      <pre v-if="data.extra.remediation_code.cli" class="code-block"><span class="code-lang">CLI</span>{{ data.extra.remediation_code.cli }}</pre>
      <pre v-if="data.extra.remediation_code.native_iac" class="code-block"><span class="code-lang">CloudFormation</span>{{ data.extra.remediation_code.native_iac }}</pre>
    </div>

    <div v-if="hasResourceMeta" class="block">
      <div class="block-label">Resource</div>
      <div class="tag-row">
        <span v-if="data.extra?.resource_type" class="tag">{{ data.extra.resource_type }}</span>
        <span v-if="data.extra?.service_name" class="tag">{{ data.extra.service_name }}</span>
        <span v-if="data.region" class="tag">{{ data.region }}</span>
        <!-- data.resource_tags (live, read from CloudAsset at request time)
             takes priority over data.extra.resource_tags (a snapshot from
             whenever this Finding row was first created, which can be
             permanently stale — see finding_reconciliation.py's own
             asset_id-staleness fix for the identical problem). Falls back
             to the old field only when the live one has nothing, so an
             older finding that never got an asset_id link still shows
             whatever it originally captured rather than nothing. -->
        <span v-for="(v, k) in (Object.keys(data.resource_tags || {}).length ? data.resource_tags : (data.extra?.resource_tags || {}))" :key="k" class="tag">{{ k }}={{ v }}</span>
      </div>
    </div>

    <div v-if="data.check_id" class="block">
      <div class="block-label">Check ID</div>
      <div class="block-text mono">{{ data.check_id }}</div>
    </div>

    <div v-if="(data.cis_controls?.length || data.attack_techniques?.length || complianceEntries.length)" class="block">
      <div class="block-label">Framework mapping</div>
      <div class="tag-row">
        <span v-for="c in data.cis_controls" :key="c" class="tag">CIS {{ c }}</span>
        <span v-for="[framework, ref] in complianceEntries" :key="framework" class="tag">{{ framework }}: {{ ref }}</span>
        <a
          v-for="t in data.attack_techniques" :key="t.id"
          class="tag tag-link"
          :href="`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}/`"
          target="_blank" rel="noopener"
        >{{ t.id }}{{ t.name ? ` — ${t.name}` : '' }}</a>
      </div>
    </div>

    <div v-if="data.extra?.related_url" class="block">
      <div class="block-label">Reference</div>
      <a class="block-text" :href="data.extra.related_url" target="_blank" rel="noopener">{{ data.extra.related_url }}</a>
    </div>

    <div class="block meta-row">
      <span>{{ data.severity?.toUpperCase() }}</span>
      <span v-if="data.status && data.status !== 'open'" class="resolved">{{ data.status }}</span>
      <span v-if="data.extra?.muted" class="muted-pill">muted in source scanner</span>
      <span v-if="data.discovered_at">Discovered {{ formatDate(data.discovered_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'
import { severityColor } from '@/data/colors'

const props = defineProps<{ data: any }>()
const panels = usePanelStore()

const hasRemediationCode = computed(() => {
  const c = props.data.extra?.remediation_code
  return !!(c && (c.terraform || c.cli || c.native_iac))
})

const hasResourceMeta = computed(() => {
  const e = props.data.extra
  return !!(
    props.data.region || e?.resource_type || e?.service_name
    || Object.keys(props.data.resource_tags || {}).length || (e?.resource_tags && Object.keys(e.resource_tags).length)
  )
})

// Same "explain the cryptic stuff" ARN parsing as FindingsView.vue's own
// (duplicated locally rather than a shared composable — small enough that
// the duplication costs less than the indirection, matching this
// codebase's existing convention elsewhere for genuinely small helpers).
const FRIENDLY_RESOURCE_TYPE: Record<string, string> = {
  instance: 'EC2 instance', role: 'IAM role', user: 'IAM user', policy: 'IAM policy',
  group: 'IAM group', stack: 'CloudFormation stack', 'security-group': 'security group',
  bucket: 'S3 bucket', trail: 'CloudTrail trail', function: 'Lambda function',
  'db-instance': 'RDS instance', volume: 'EBS volume', 'payment-instrument': 'payment instrument',
}
function humanizeResourceUid(uid: string): string | null {
  if (!uid.startsWith('arn:')) return null // already plain (hostname/IP) — the raw mono value below is enough
  const m = uid.match(/^arn:aws:([a-z0-9-]+):([a-z0-9-]*):(\d*):(.+)$/)
  if (!m) return null
  const [, service, region, , rest] = m
  const sepIdx = rest.includes('/') ? rest.indexOf('/') : rest.indexOf(':')
  const resourceType = sepIdx > -1 ? rest.slice(0, sepIdx) : null
  const resourceId = sepIdx > -1 ? rest.slice(sepIdx + 1) : rest
  const typeLabel = (resourceType && FRIENDLY_RESOURCE_TYPE[resourceType]) || resourceType || service
  return region ? `${typeLabel} ${resourceId} (${region})` : `${typeLabel} ${resourceId}`
}
const resourceDisplayName = computed(() => {
  const tagName = props.data.resource_tags?.Name || props.data.resource_tags?.name
  if (tagName) return tagName
  return props.data.resource_uid ? humanizeResourceUid(props.data.resource_uid) : null
})

const complianceEntries = computed(() => Object.entries(props.data.extra?.compliance || {}))

const cvssSeverity = computed(() => {
  const score = props.data.extra?.cvss?.base_score
  if (score == null) return 'medium'
  if (score >= 9) return 'critical'
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

async function drillResource() {
  const all = await api.findings(props.data.engagement_id)
  const related = all.filter((f: any) => f.resource_uid === props.data.resource_uid && f.id !== props.data.id)
  panels.push({
    type: 'resource-findings',
    title: props.data.resource_uid,
    data: { resourceUid: props.data.resource_uid, findings: related },
  })
}
</script>

<style scoped>
.finding-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; white-space: pre-wrap; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.block-clickable {
  display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 8px;
  background: var(--surface2); border: 1px solid var(--border); cursor: pointer;
}
.block-clickable:hover { border-color: var(--accent); }
.block-clickable .mono { font-size: 12px; color: var(--text); overflow-wrap: break-word; }
.resource-friendly-name { font-size: 13px; font-weight: 700; color: var(--text); }
.drill-hint { font-size: 11px; color: var(--accent); }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  font-size: 11px; padding: 3px 8px; border-radius: 6px; background: var(--surface2);
  border: 1px solid var(--border); color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace; text-decoration: none;
}
.tag-link { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
.tag-link:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.tag-danger { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); background: color-mix(in srgb, var(--red) 12%, transparent); }
.tag-ok { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); background: color-mix(in srgb, var(--green) 12%, transparent); }
.vuln-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.vuln-id { font-size: 13px; color: var(--text); font-weight: 600; }
.cvss-pill { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid; }
.muted-text { color: var(--text3); font-size: 12px; }
.affected-list { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; }
.affected-row { font-size: 11.5px; color: var(--text2); padding: 5px 8px; border-radius: 6px; background: var(--surface2); overflow-wrap: break-word; }
.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }
.meta-row .resolved { color: var(--green); }
.meta-row .muted-pill { color: var(--amber, #d9a441); }
.code-block {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11.5px; line-height: 1.5; color: var(--text);
  background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px;
  overflow-x: auto; white-space: pre; margin: 0;
}
.code-block + .code-block { margin-top: 6px; }
.code-lang {
  display: block; font-family: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text3); margin-bottom: 4px;
}
</style>
