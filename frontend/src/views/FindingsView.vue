<template>
  <div>
    <div class="header-row">
      <div>
        <h1 class="title">Findings</h1>
        <p class="subtitle">Every real finding behind a Live module — filter, search, and open one for full remediation detail.</p>
      </div>
      <div class="report-btn" :class="{ busy: reportDownloading }" @click="downloadReport">
        {{ reportDownloading ? 'Generating…' : 'Download Report' }}
      </div>
    </div>
    <p v-if="reportError" class="report-error">{{ reportError }}</p>

    <div v-if="resourceUidFilter" class="resource-filter-chip">
      Filtered to <span class="mono">{{ resourceUidFilter }}</span>
      <span class="clear-filter" @click="resourceUidFilter = null">Clear ×</span>
    </div>

    <div class="controls">
      <select v-if="availableTierOptions.length > 0" class="tier-filter-select" :value="tierFilter ?? ''" @change="onTierFilterChange(($event.target as HTMLSelectElement).value)">
        <option value="">All findings</option>
        <option v-for="t in availableTierOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <!-- Real fix, not a guess: every connected cloud account AND host in
           one picker, each labeled with its real identity (account/role for
           cloud, hostname for host) resolved server-side by GET /findings —
           replaces the host-only, deep-link-only version this used to be.
           Shows the human display_name when set, technical identity always
           in parentheses so nothing is ever hidden behind a name someone
           else assigned. -->
      <select
        v-if="connectionsCatalog.length > 1" class="tier-filter-select"
        :value="connectionFilter ?? ''" @change="connectionFilter = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">All connections ({{ connectionsCatalog.length }})</option>
        <option v-for="c in connectionsCatalog" :key="c.id" :value="c.id">
          {{ c.tier === 'host' ? 'Host' : 'Cloud' }}: {{ c.display_name ? `${c.display_name} (${c.label})` : c.label }}
        </option>
      </select>
      <input
        v-model="search"
        class="search-input"
        type="text"
        placeholder="Search title or check id…"
      />
      <select class="sort-select" v-model="sortBy">
        <option value="severity">Sort: Severity</option>
        <option value="newest">Sort: Newest</option>
        <option value="oldest">Sort: Oldest</option>
      </select>
      <label class="resolved-toggle">
        <input type="checkbox" v-model="showResolved" />
        Show resolved ({{ resolvedCount }})
      </label>
    </div>

    <!-- "Explain the cryptic stuff": the account_id · role_name / hostname
         format below is real AWS/SSH identity, not a fabricated label, but
         it doesn't mean anything at a glance unless you already know it.
         Named once here rather than repeated as a tooltip on every row. -->
    <p v-if="hasUnnamedConnections" class="connection-hint">
      Cloud findings are labeled by AWS account ID and the IAM role assumed to scan it; host findings by hostname or IP.
      <RouterLink :to="{ name: 'settings' }">Give a connection a real name in Settings</RouterLink> to make this page clearer.
    </p>

    <div class="stats-row">
      <button
        v-for="s in severityStats"
        :key="s.severity"
        class="stat-box"
        :class="{ active: activeSeverityFilter === s.severity }"
        :style="{ borderColor: activeSeverityFilter === s.severity ? severityColor(s.severity) : 'var(--border)' }"
        @click="toggleSeverityFilter(s.severity)"
      >
        <div class="stat-value" :style="{ color: severityColor(s.severity) }">{{ s.count }}</div>
        <div class="stat-label">{{ s.severity }}</div>
      </button>
      <div class="stat-box total">
        <div class="stat-value">{{ visibleFindings.length }}</div>
        <div class="stat-label">total</div>
      </div>
    </div>

    <div v-if="loading" class="empty">Loading findings…</div>
    <div v-else-if="loadError" class="empty error">{{ loadError }}</div>
    <div v-else-if="filteredFindings.length === 0" class="empty">
      {{ findings.length === 0 ? 'No findings yet — connect an account or host and run a scan to populate this.' : 'No findings match your filters.' }}
    </div>

    <div v-else class="finding-list">
      <div v-for="{ f, meta } in displayFindings" :key="f.id" class="finding-card" :class="{ resolved: f.status !== 'open' }">
        <div class="finding-row" @click="openEvidence(f)">
          <div class="pill" :style="{ color: severityColor(f.severity), borderColor: severityColor(f.severity), background: `color-mix(in srgb, ${severityColor(f.severity)} 16%, transparent)` }">
            {{ f.severity }}
          </div>
          <div v-if="f.status !== 'open'" class="pill resolved-pill">{{ f.status }}</div>
          <div class="finding-main">
            <div class="finding-title">
              {{ f.title }}
              <span v-if="f.occurrence_count > 1" class="occurrence-badge">× {{ f.occurrence_count }} regions</span>
            </div>
            <!-- Real facts, explained: resourceLabel is a real AWS tag or a
                 parsed-plain-English ARN (raw value in the tooltip, never
                 hidden); connectionText is the connection's human name if
                 set, else the real technical identity (account/role or
                 hostname) — the SAME two-tier account+resource split AWS's
                 own Security Hub finding format and OCSF both use. -->
            <div class="finding-meta">
              {{ f.check_id || 'no check id' }}
              <template v-if="meta.resourceLabel"> · <span class="meta-explained" :title="meta.resourceTooltip">{{ meta.resourceLabel }}</span></template>
              <template v-if="f.region"> · {{ f.region }}</template>
              <template v-if="meta.connectionText"> · <span class="meta-explained" :title="meta.connectionTooltip">{{ meta.connectionText }}</span></template>
              · {{ formatDate(f.discovered_at) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { severityColor } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

interface AttackTechnique { id: string; name?: string; tactics: string[] }
interface FindingItem {
  id: string; engagement_id: string; tier: string; severity: string; title: string
  status: string; check_id: string | null; resource_uid: string | null; detail: string | null; remediation_guidance: string | null
  discovered_at: string; cis_controls: string[]; attack_techniques: AttackTechnique[]
  occurrence_count: number; affected_resources: string[] | null
  region: string | null; extra: Record<string, any> | null
  connection_id: string | null; connection_label: string | null
  connection_display_name: string | null; resource_tags: Record<string, string>
}
interface ConnectionOption { id: string; tier: string; label: string; display_name: string | null }

const route = useRoute()
const router = useRouter()
const panels = usePanelStore()

const findings = ref<FindingItem[]>([])
const connectionsCatalog = ref<ConnectionOption[]>([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')
const sortBy = ref<'severity' | 'newest' | 'oldest'>('severity')
const activeSeverityFilter = ref<string | null>(null)
const showResolved = ref(false)
// Tier-aware filtering (Coverage Map roadmap Phase 35a) — Cloud
// Misconfiguration Defense / Identity & Credential Hygiene / Host & Server
// Security, deep-linkable via ?tier=. Used to require picking an
// engagement first and only worked within that one engagement's already-
// loaded findings; now filters the one real tenant-wide set from GET
// /findings (app/routers/findings.py), so it's never scoped to just
// whichever engagement happened to be selected.
const tierFilter = ref<string | null>(null)
// Deep-link only (no UI control) — IamPathEvidence.vue links here with a
// principal's ARN so "N open identity/credential findings" resolves to the
// real rows instead of staying a bare count (Coverage Map roadmap Phase 36f).
const resourceUidFilter = ref<string | null>(null)
// Real fix (was host-only and deep-link-only before): a UI-driven filter by
// the actual connection (any cloud account or host) a finding came from,
// backed by GET /findings' own connection_id resolution — never guessed.
const connectionFilter = ref<string | null>(null)
const reportDownloading = ref(false)
const reportError = ref('')

async function downloadReport() {
  if (reportDownloading.value) return
  reportDownloading.value = true
  reportError.value = ''
  try {
    await api.downloadCommandReportPdf()
  } catch (e: any) {
    reportError.value = e.message?.includes('feature_not_available')
      ? 'Downloadable reports require the Starter plan or above — upgrade to unlock this.'
      : (e.message ?? 'Report generation failed')
  } finally {
    reportDownloading.value = false
  }
}

function openEvidence(f: FindingItem) {
  panels.push({ type: 'finding', title: f.title, data: f })
}

const TIER_LABELS: Record<string, string> = {
  cloud: 'Cloud Misconfiguration Defense',
  host: 'Host & Server Security',
  exposure: 'External Exposure & DNS Hygiene',
  oauth_risk: 'Third-Party OAuth App Risk',
  impersonation: 'Phishing — Spoof Proof',
  phishing: 'Phishing — Human Simulation',
  credential: 'Identity & Credential Hygiene',
  threat: 'Identity Threat Detection',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

// Tier dropdown options, built from whichever tiers are actually present in
// the real tenant-wide set (not a fixed hardcoded list) — 'cloud-misconfig'
// stays a synthetic client-side split of tier='cloud' (below), same
// predicate CoverageView.vue's openFeatureDrill() already uses; 'credential'
// and every other tier are now real backend tier values filtered directly.
const availableTierOptions = computed(() => {
  const tiersPresent = new Set(findings.value.map(f => f.tier))
  const opts: { value: string; label: string }[] = []
  if (tiersPresent.has('cloud')) opts.push({ value: 'cloud-misconfig', label: 'Cloud Misconfiguration Defense' })
  if (tiersPresent.has('credential')) opts.push({ value: 'credential', label: 'Identity & Credential Hygiene' })
  if (tiersPresent.has('host') || [...tiersPresent].some(t => t === 'cloud')) opts.push({ value: 'host', label: 'Host & Server Security' })
  for (const t of tiersPresent) {
    if (t === 'cloud' || t === 'credential' || t === 'host') continue
    opts.push({ value: t, label: TIER_LABELS[t] ?? t })
  }
  return opts
})

// Resolved findings stay queryable (matches this codebase's history-
// preserving convention elsewhere — DmarcRecord/TlsReport/CloudPrivEscPath
// keep history instead of overwriting), but default to hidden here so a
// fixed issue doesn't keep inflating what looks like the current count.
const resolvedCount = computed(() => findings.value.filter(f => f.status !== 'open').length)
// Tier categorization predicates copied word-for-word from CoverageView.vue's
// openFeatureDrill() (Cloud Misconfiguration Defense / Identity & Credential
// Hygiene / Host & Server Security branches) — status==='open' is handled
// generally by showResolved above, not re-applied here. Host & Server
// Security's own real scope spans two backend tiers (host-tier findings
// plus the arn-prefixed subset of cloud-tier findings), which is exactly
// why this has to be a filter over the one real tenant-wide set rather than
// a server-side tier= param — no single tier value means that.
const visibleFindings = computed(() => {
  let list = showResolved.value ? findings.value : findings.value.filter(f => f.status === 'open')
  if (tierFilter.value === 'cloud-misconfig') list = list.filter(f => f.tier === 'cloud' && !(f.check_id || '').startsWith('arn:'))
  else if (tierFilter.value === 'host') list = list.filter(f => f.tier === 'host' || (f.tier === 'cloud' && (f.check_id || '').startsWith('arn:')))
  else if (tierFilter.value) list = list.filter(f => f.tier === tierFilter.value)
  if (resourceUidFilter.value) list = list.filter(f => f.resource_uid === resourceUidFilter.value)
  if (connectionFilter.value) list = list.filter(f => f.connection_id === connectionFilter.value)
  return list
})

// ── "Explain the cryptic stuff" — an AWS ARN like
// "arn:aws:ec2:eu-north-1:131189842899:instance/i-01d8efdf537574bda" is
// only meaningful if you already know AWS's ARN grammar. Parsed into its
// real parts (service, region, account, resource type/id) and rendered as
// a plain sentence fragment — the raw ARN is never hidden, just moved to a
// hover tooltip instead of leading the row.
interface ParsedArn { service: string; region: string | null; accountId: string | null; resourceType: string | null; resourceId: string }
const FRIENDLY_RESOURCE_TYPE: Record<string, string> = {
  instance: 'EC2 instance', role: 'IAM role', user: 'IAM user', policy: 'IAM policy',
  group: 'IAM group', stack: 'CloudFormation stack', 'security-group': 'security group',
  bucket: 'S3 bucket', trail: 'CloudTrail trail', function: 'Lambda function',
  'db-instance': 'RDS instance', volume: 'EBS volume', 'payment-instrument': 'payment instrument',
}
function parseArn(arn: string): ParsedArn | null {
  const m = arn.match(/^arn:aws:([a-z0-9-]+):([a-z0-9-]*):(\d*):(.+)$/)
  if (!m) return null
  const [, service, region, accountId, rest] = m
  let resourceType: string | null = null
  let resourceId = rest
  const sepIdx = rest.includes('/') ? rest.indexOf('/') : rest.indexOf(':')
  if (sepIdx > -1) {
    resourceType = rest.slice(0, sepIdx)
    resourceId = rest.slice(sepIdx + 1)
  }
  return { service, region: region || null, accountId: accountId || null, resourceType, resourceId }
}
function humanizeResourceUid(uid: string): string {
  if (!uid.startsWith('arn:')) return uid // already plain — a hostname/IP, or Prowler's own resource id
  const parsed = parseArn(uid)
  if (!parsed) return uid
  const typeLabel = (parsed.resourceType && FRIENDLY_RESOURCE_TYPE[parsed.resourceType]) || parsed.resourceType || parsed.service
  return parsed.region ? `${typeLabel} ${parsed.resourceId} (${parsed.region})` : `${typeLabel} ${parsed.resourceId}`
}

interface MetaDisplay { resourceLabel: string | null; resourceTooltip: string; connectionText: string | null; connectionTooltip: string }
function metaFor(f: FindingItem): MetaDisplay {
  // Real resource identity, most-human-first: an actual AWS tag (Name) the
  // account owner assigned beats a parsed ARN, which beats nothing. For
  // host-tier findings, resource_uid and connection_label are the same
  // hostname already — showing both would just repeat the same fact twice.
  const tagName = f.resource_tags?.Name || f.resource_tags?.name || null
  const humanized = f.resource_uid ? humanizeResourceUid(f.resource_uid) : null
  const resourceLabel = tagName || (f.tier !== 'host' ? humanized : null)
  const connectionText = f.connection_display_name || f.connection_label
  return {
    resourceLabel,
    resourceTooltip: f.resource_uid || '',
    connectionText,
    connectionTooltip: f.connection_display_name && f.connection_label ? `Technical identity: ${f.connection_label}` : '',
  }
}
// Precomputed once per render pass rather than called 3x per row inline in
// the template — same filtered/sorted list, paired with its own display facts.
const displayFindings = computed(() => filteredFindings.value.map(f => ({ f, meta: metaFor(f) })))

// Shown only while some connection genuinely has no human name yet — once
// everything is named, the hint about the raw account_id/hostname format
// stops being relevant to point out.
const hasUnnamedConnections = computed(() => connectionsCatalog.value.some(c => !c.display_name))

const severityStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const f of visibleFindings.value) counts[f.severity] = (counts[f.severity] || 0) + 1
  return SEVERITY_ORDER.filter(s => counts[s]).map(s => ({ severity: s, count: counts[s] }))
})

function toggleSeverityFilter(sev: string) {
  activeSeverityFilter.value = activeSeverityFilter.value === sev ? null : sev
}

const filteredFindings = computed(() => {
  let list = visibleFindings.value
  if (activeSeverityFilter.value) list = list.filter(f => f.severity === activeSeverityFilter.value)
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter(f => f.title.toLowerCase().includes(q) || (f.check_id || '').toLowerCase().includes(q))
  }
  const sorted = [...list]
  if (sortBy.value === 'severity') {
    sorted.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  } else if (sortBy.value === 'newest') {
    sorted.sort((a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime())
  } else {
    sorted.sort((a, b) => new Date(a.discovered_at).getTime() - new Date(b.discovered_at).getTime())
  }
  return sorted
})

// One real tenant-wide fetch (GET /findings) replaces the old per-
// engagement-selection + bespoke host-merge-function model entirely — no
// re-fetch on filter change, tier/connection/severity/search/sort are all
// pure client-side filters over this one already-complete set.
async function loadFindings() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await api.allFindings()
    findings.value = data.findings
    connectionsCatalog.value = data.connections
  } catch (e: any) {
    loadError.value = e.message ?? 'Could not load findings.'
    findings.value = []
    connectionsCatalog.value = []
  } finally {
    loading.value = false
  }
}

function onTierFilterChange(value: string) {
  tierFilter.value = value || null
  router.replace({ query: { ...route.query, tier: tierFilter.value ?? undefined } })
}

onMounted(async () => {
  const queryTier = typeof route.query.tier === 'string' ? route.query.tier : null
  resourceUidFilter.value = typeof route.query.resource_uid === 'string' ? route.query.resource_uid : null
  tierFilter.value = queryTier
  await loadFindings()
})
</script>

<style scoped>
.header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 24px; color: var(--text2); font-size: 14px; }
.report-btn {
  padding: 9px 16px; border-radius: 8px; background: var(--accent); color: var(--bg);
  font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.report-btn.busy { opacity: .6; pointer-events: none; }
.report-error { color: var(--red); font-size: 12.5px; margin: -16px 0 16px; }

.resource-filter-chip {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--text2);
  background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin-bottom: 14px;
}
.resource-filter-chip .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; color: var(--text); overflow-wrap: break-word; }
.clear-filter { color: var(--accent); cursor: pointer; font-weight: 600; white-space: nowrap; }

.connection-hint {
  font-size: 11.5px; color: var(--text3); line-height: 1.5; margin: -8px 0 16px;
}
.connection-hint a { color: var(--accent); }

.controls { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.tier-filter-select, .sort-select, .search-input {
  height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-family: var(--font-body); font-size: 13px;
}
.tier-filter-select:focus, .sort-select:focus, .search-input:focus { outline: none; border-color: var(--accent); }
.search-input { flex: 1 1 220px; min-width: 0; }
.tier-filter-select { flex: 1 1 220px; min-width: 0; }
.sort-select { flex: 0 1 160px; min-width: 0; }
.resolved-toggle {
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2);
  white-space: nowrap; cursor: pointer; user-select: none;
}

.stats-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
.stat-box {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 16px;
  min-width: 76px; cursor: pointer; font-family: var(--font-body); text-align: left;
}
.stat-box.total { cursor: default; }
.stat-box.active { background: var(--surface2); }
.stat-value { font-size: 20px; font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.03em; }

.empty { color: var(--text2); font-size: 14px; padding: 24px 0; }
.empty.error { color: var(--red); }

.finding-list { display: flex; flex-direction: column; gap: 10px; }
.finding-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.finding-card.resolved { opacity: 0.6; }
.resolved-pill { color: var(--green); border-color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
.finding-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 14px 18px; cursor: pointer; }
.pill {
  display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid; width: fit-content; white-space: nowrap; flex-shrink: 0;
}
.finding-main { flex: 1 1 220px; min-width: 0; }
.finding-title { font-size: 14px; font-weight: 600; overflow-wrap: break-word; }
.occurrence-badge {
  font-size: 10.5px; font-weight: 700; color: var(--text2); background: var(--surface2);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; margin-left: 8px;
  font-family: 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap;
}
.finding-meta { font-size: 11px; color: var(--text3); margin-top: 3px; font-family: var(--font-mono); }
.meta-explained { color: var(--text2); border-bottom: 1px dotted var(--text3); cursor: help; }
</style>
