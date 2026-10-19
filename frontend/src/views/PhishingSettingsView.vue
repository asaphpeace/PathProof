<template>
  <div class="p-settings">
    <div class="head-row">
      <div>
        <h1 class="title">Phishing Settings</h1>
        <p class="subtitle">Sending identity, who can launch a simulation, and who's permanently exempt.</p>
      </div>
    </div>

    <div class="card">
      <div class="header-row"><h2>Sending &amp; domain</h2></div>
      <p v-if="metaError" class="error">{{ metaError }}</p>
      <div v-else-if="meta" class="kv-list">
        <div class="kv-row"><span class="kv-label">Sending identity</span><span class="kv-value mono">{{ meta.sending_identity }}</span></div>
        <div class="kv-row"><span class="kv-label">Tracking domain</span><span class="kv-value mono">{{ meta.tracking_domain }}</span></div>
        <div class="kv-row"><span class="kv-label">Credential capture</span><span class="kv-value">{{ meta.credential_capture_policy }}</span></div>
        <div class="kv-row"><span class="kv-label">Recipient privacy</span><span class="kv-value">{{ meta.recipient_privacy_policy }}</span></div>
        <div class="kv-row"><span class="kv-label">Report suspicious email to</span><span class="kv-value mono">{{ meta.report_suspicious_email_address }}</span></div>
      </div>
      <p class="hint">Every simulation sends from PathProof's own verified identity — never your domain. This isn't per-tenant configurable, so there's nothing to set here; if your mail gateway blocks it, allowlist the sending identity and tracking domain above. The report address above is real and separate from simulations — anyone can forward a real suspicious email there for your security team to triage. <RouterLink :to="{ name: 'phishing-triage' }" class="link-btn">Open the triage queue →</RouterLink></p>
      <p class="hint">Sends and reports intentionally come from different addresses, not a typo: sends always come from PathProof's own verified identity above, and reports go to your tenant's own dedicated inbox on a separate domain — so a compromised sending identity could never intercept the reports meant to catch it.</p>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Spoof Proof</h2>
        <span class="count-badge">{{ verifiedDomains.length }} VERIFIED DOMAIN{{ verifiedDomains.length === 1 ? '' : 'S' }}</span>
      </div>
      <p class="hint">Can someone send mail as you, and are lookalike domains already live?</p>
      <p v-if="domainsError" class="error">{{ domainsError }}</p>
      <div v-if="allDomains.length === 0 && !loadingDomains" class="empty">No domains monitored yet.</div>

      <div v-for="d in verifiedDomains" :key="d.id" class="domain-row">
        <div class="domain-top">
          <span class="domain-name">{{ d.domain }}</span>
          <span class="dmarc-pill">p={{ d.dmarc_stage }}</span>
          <span v-if="impersonationFindings[d.id]?.length" class="count-badge warn">{{ impersonationFindings[d.id].length }} FINDING{{ impersonationFindings[d.id].length === 1 ? '' : 'S' }}</span>
          <span v-else-if="impersonationScanned[d.id]" class="count-badge good">CLEAN</span>
        </div>
        <div v-if="!impersonationScanned[d.id]" class="spoof-input-row">
          <span class="to-label">TO</span>
          <input v-model="spoofRecipientInput[d.id]" class="mini-input" :placeholder="`security@${d.domain}`" />
          <button class="mini-btn" @click="runSpoofTest(d)">{{ spoofScanning === d.id ? 'Testing…' : 'Re-run' }}</button>
        </div>
        <div v-else class="spoof-input-row">
          <span class="to-label">TO</span>
          <span class="rerun-target mono">{{ spoofRecipientInput[d.id] || `security@${d.domain}` }}</span>
          <button class="mini-btn" @click="runSpoofTest(d)">{{ spoofScanning === d.id ? 'Testing…' : 'Re-run' }}</button>
        </div>
        <p v-if="spoofScanError[d.id]" class="error">{{ spoofScanError[d.id] }}</p>

        <div v-if="impersonationFindings[d.id]?.length" class="finding-list">
          <div v-for="f in impersonationFindings[d.id]" :key="f.id" class="finding-row">
            <span class="sev-pill" :style="pillStyle(severityColor(f.severity))">{{ f.severity }}</span>
            <div class="finding-body">
              <div class="finding-title">{{ f.title }}</div>
              <div class="finding-detail">{{ f.detail }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-for="d in unverifiedDomains" :key="d.id" class="domain-row unverified">
        <div class="domain-top">
          <span class="domain-name">{{ d.domain }}</span>
          <span class="count-badge muted">NOT VERIFIED</span>
        </div>
        <div class="spoof-input-row">
          <span class="to-label">TO</span>
          <span class="verify-hint">name a mailbox to receive the spoof</span>
          <span class="mini-btn disabled">Verify in ZoneProof first</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="header-row"><h2>Scheduled reports</h2></div>
      <p class="hint">Automatically email the phishing &amp; Human Risk PDF report to a tenant admin.</p>
      <div class="sched-opts">
        <button
          v-for="opt in (['off', 'weekly', 'monthly'] as const)" :key="opt"
          class="sched-btn" :class="{ active: meta?.phishing_report_schedule === opt }"
          :disabled="schedSaving"
          @click="setReportSchedule(opt)"
        >{{ opt === 'off' ? 'Off' : opt === 'weekly' ? 'Weekly' : 'Monthly' }}</button>
      </div>
      <p v-if="schedError" class="error">{{ schedError }}</p>
      <p v-if="meta?.last_phishing_report_sent_at" class="hint small">Last sent {{ new Date(meta.last_phishing_report_sent_at).toLocaleDateString() }}</p>
    </div>

    <div class="card">
      <div class="header-row"><h2>Approval &amp; roles</h2></div>
      <p class="hint">Who can create, sign, launch, revoke, or edit the schedule of a real phishing simulation. <strong>Admin</strong> and <strong>Approver</strong> can do all of that; only <strong>Admin</strong> can also halt/resume all sending or unmask a recipient's identity. <strong>Viewer</strong> can see everything but launch nothing.</p>
      <p v-if="teamError" class="error">{{ teamError }}</p>
      <div v-if="team.length === 0 && !teamLoading" class="empty">No team members found.</div>
      <div v-for="m in team" :key="m.id" class="team-row">
        <div class="team-main">
          <span class="team-email">{{ m.email }}</span>
          <span v-if="!m.is_active" class="inactive-tag">inactive</span>
        </div>
        <select
          class="input select-styled role-select"
          :value="m.role"
          :disabled="m.id === auth.userId || roleSaving === m.id"
          @change="setRole(m, ($event.target as HTMLSelectElement).value)"
        >
          <option value="admin">Admin</option>
          <option value="approver">Approver</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <p v-if="team.some(m => m.id === auth.userId)" class="hint small">You can't change your own role here.</p>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Target Lists</h2>
        <div class="link-btn" @click="openTargetListModal(null)">+ New list</div>
      </div>
      <p class="hint">Who a simulation is allowed to email. Editing a list never sends anything.</p>
      <p v-if="targetListError" class="error">{{ targetListError }}</p>
      <div v-if="targetLists.length === 0 && !loadingTargetLists" class="empty">No target lists yet.</div>
      <div v-for="tl in targetLists" :key="tl.id" class="list-row">
        <div class="list-main">
          <span class="list-name">{{ tl.name }}</span>
          <span class="list-meta">{{ tl.entries.length }} recipients · last edited {{ relativeTime(tl.created_at) }}</span>
        </div>
        <span class="count-badge" :class="rolesMappedCount(tl) ? 'good' : 'muted'">
          {{ rolesMappedCount(tl) ? `${rolesMappedCount(tl)} ROLES MAPPED` : 'NO ROLES' }}
        </span>
        <button class="ghost-btn" @click="openTargetListModal(tl)">Edit</button>
      </div>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Exemptions</h2>
        <div class="connect-btn" :class="{ disabled: !newExemptEmail }" @click="addExemption">+ Add exemption</div>
      </div>
      <p class="hint">Addresses here are excluded from every future campaign, on every target list, until removed — a real legal/policy exclusion, kept separate from ordinary list editing.</p>
      <div class="exempt-form">
        <input v-model="newExemptEmail" class="input" placeholder="person@company.com" @keydown.enter="addExemption" />
        <input v-model="newExemptReason" class="input" placeholder="Reason (optional)" @keydown.enter="addExemption" />
      </div>
      <p v-if="exemptError" class="error">{{ exemptError }}</p>
      <div v-if="exemptions.length === 0 && !exemptLoading" class="empty">No exemptions on record.</div>
      <div v-for="ex in exemptions" :key="ex.id" class="exempt-row">
        <div class="exempt-main">
          <span class="mono">{{ ex.email }}</span>
          <span v-if="ex.reason" class="exempt-reason">{{ ex.reason }}</span>
        </div>
        <button class="revoke-btn" @click="removeExemption(ex.id)">Remove</button>
      </div>
    </div>

    <div class="card">
      <div class="header-row"><h2>Landing page branding</h2></div>
      <p class="hint">Not yet configurable — every campaign uses PathProof's generic built-in landing pages (Generic sign-in / IT service portal / Document sign-in). Custom branding for these, and cloning a real company login page, are both deliberately out of scope for now — the latter for real brand-impersonation-risk reasons, not an oversight.</p>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Training defaults</h2>
        <RouterLink :to="{ name: 'phishing-training' }" class="link-btn">Manage courses →</RouterLink>
      </div>
      <p class="hint">The single post-click micro-lesson always fires immediately after a real click or credential entry — that's unconditional. Optionally, ALSO auto-assign a full course from the library on the same failure.</p>
      <div class="kv-row training-course-row">
        <span class="kv-label">Auto-assign on failure</span>
        <div class="select-wrap">
          <select class="input select-styled" :value="meta?.auto_assign_training_course_id || ''" @change="setAutoAssignCourse(($event.target as HTMLSelectElement).value)">
            <option value="">Off — micro-lesson only</option>
            <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
          <span class="select-chevron">⌄</span>
        </div>
      </div>
      <div class="reminder-row">
        <div class="field">
          <span class="label">Remind every (days)</span>
          <input type="number" min="1" class="input" :value="meta?.training_reminder_interval_days ?? 14" @change="setReminderInterval(($event.target as HTMLInputElement).value)" />
        </div>
        <div class="field">
          <span class="label">Max reminders</span>
          <input type="number" min="0" class="input" :value="meta?.training_reminder_max_count ?? 2" @change="setReminderMaxCount(($event.target as HTMLInputElement).value)" />
        </div>
      </div>
      <p v-if="trainingDefaultsError" class="error">{{ trainingDefaultsError }}</p>
    </div>

    <div class="card">
      <div class="header-row"><h2>Data &amp; retention</h2></div>
      <p class="hint">Recipient identity is pseudonymized by construction (an HMAC-SHA256 hash, never a plaintext email, on every tracking event) and only ever revealed through the audited Unmask action, admin-only. The audit trail itself is enforced immutable at the database level, independent of this product's own code.</p>
    </div>

    <PhishingTargetListModal
      v-if="targetListModalOpen"
      :list="editingTargetList"
      @cancel="targetListModalOpen = false"
      @save="saveTargetList"
      ref="targetListModalRef"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { severityColor, pillStyle } from '@/data/colors'
import PhishingTargetListModal from '@/components/phishing/PhishingTargetListModal.vue'

const auth = useAuthStore()

// ── Spoof Proof (moved from PhishingView.vue, Phishing Simulation
// roadmap Phase 33 — a recon-only domain check, not a simulation
// action, so it belongs alongside the rest of this module's setup). ───
const allDomains = ref<any[]>([])
const loadingDomains = ref(false)
const domainsError = ref('')
const impersonationFindings = ref<Record<string, any[]>>({})
const impersonationScanned = ref<Record<string, boolean>>({})
const spoofScanning = ref<string | null>(null)
const spoofScanError = ref<Record<string, string>>({})
const spoofRecipientInput = ref<Record<string, string>>({})

const verifiedDomains = computed(() => allDomains.value.filter((d: any) => d.ownership_verified))
const unverifiedDomains = computed(() => allDomains.value.filter((d: any) => !d.ownership_verified))

async function loadDomains() {
  loadingDomains.value = true
  domainsError.value = ''
  try {
    allDomains.value = await api.domains()
    await loadExistingImpersonationFindings()
  } catch (e: any) {
    domainsError.value = e.message ?? 'Failed to load domains'
  } finally { loadingDomains.value = false }
}

async function loadExistingImpersonationFindings() {
  try {
    const engagements = await api.engagements()
    for (const d of verifiedDomains.value) {
      const engagement = engagements.find((e: any) => e.tier === 'impersonation' && e.domain_id === d.id)
      if (!engagement) continue
      impersonationFindings.value[d.id] = await api.findings(engagement.id)
      impersonationScanned.value[d.id] = true
    }
  } catch { /* the test button still works even if history can't be pre-loaded */ }
}

async function runSpoofTest(d: any) {
  spoofScanning.value = d.id
  delete spoofScanError.value[d.id]
  try {
    const findings = await api.runImpersonationScan(d.id, spoofRecipientInput.value[d.id]?.trim() || undefined)
    impersonationFindings.value[d.id] = findings
    impersonationScanned.value[d.id] = true
  } catch (e: any) {
    spoofScanError.value[d.id] = e.message ?? 'Impersonation test failed'
  } finally { spoofScanning.value = null }
}

// ── Target lists (moved from PhishingView.vue, Phase 33 — PhishingView
// keeps its own read-only copy of targetLists/targetListName/
// targetListCount to label the simulations table; this is the full
// create/edit surface). ─────────────────────────────────────────────────
const targetLists = ref<any[]>([])
const loadingTargetLists = ref(false)
const targetListError = ref('')
const targetListModalOpen = ref(false)
const editingTargetList = ref<any | null>(null)
const targetListModalRef = ref<any>(null)

function rolesMappedCount(tl: any): number {
  return tl.entries.filter((e: any) => e.job_title).length
}
function relativeTime(iso: string): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

async function loadTargetLists() {
  loadingTargetLists.value = true
  targetListError.value = ''
  try { targetLists.value = await api.phishingTargetLists() }
  catch (e: any) { targetListError.value = e.message ?? 'Failed to load target lists' }
  finally { loadingTargetLists.value = false }
}

function openTargetListModal(tl: any | null) {
  editingTargetList.value = tl
  targetListModalOpen.value = true
}

async function saveTargetList(name: string, entries: any[]) {
  try {
    if (editingTargetList.value) await api.updatePhishingTargetList(editingTargetList.value.id, name, entries)
    else await api.createPhishingTargetList(name, entries)
    targetListModalOpen.value = false
    await loadTargetLists()
  } catch (e: any) {
    targetListModalRef.value?.setError(e.message ?? 'Failed to save target list')
  }
}

const meta = ref<any | null>(null)
const metaError = ref('')
async function loadMeta() {
  try { meta.value = await api.phishingMeta() }
  catch (e: any) { metaError.value = e.message ?? 'Failed to load sending identity' }
}

const schedSaving = ref(false)
const schedError = ref('')
async function setReportSchedule(schedule: 'off' | 'weekly' | 'monthly') {
  if (meta.value?.phishing_report_schedule === schedule) return
  schedSaving.value = true
  schedError.value = ''
  try { meta.value = await api.updatePhishingReportSchedule(schedule) }
  catch (e: any) { schedError.value = e.message ?? 'Failed to update report schedule' }
  finally { schedSaving.value = false }
}

const courses = ref<any[]>([])
async function loadCourses() {
  try { courses.value = await api.trainingCourses() } catch { /* dropdown just stays empty */ }
}

const trainingDefaultsError = ref('')
async function setAutoAssignCourse(courseId: string) {
  trainingDefaultsError.value = ''
  try { meta.value = await api.updateTrainingDefaults({ auto_assign_training_course_id: courseId || null }) }
  catch (e: any) { trainingDefaultsError.value = e.message ?? 'Failed to update training default' }
}
async function setReminderInterval(value: string) {
  const n = parseInt(value, 10)
  if (!n || n < 1) return
  trainingDefaultsError.value = ''
  try { meta.value = await api.updateTrainingDefaults({ training_reminder_interval_days: n }) }
  catch (e: any) { trainingDefaultsError.value = e.message ?? 'Failed to update reminder interval' }
}
async function setReminderMaxCount(value: string) {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 0) return
  trainingDefaultsError.value = ''
  try { meta.value = await api.updateTrainingDefaults({ training_reminder_max_count: n }) }
  catch (e: any) { trainingDefaultsError.value = e.message ?? 'Failed to update reminder cap' }
}

const team = ref<any[]>([])
const teamLoading = ref(false)
const teamError = ref('')
const roleSaving = ref<string | null>(null)
async function loadTeam() {
  teamLoading.value = true
  try { team.value = await api.team() }
  catch (e: any) { teamError.value = e.message ?? 'Failed to load team members' }
  finally { teamLoading.value = false }
}
async function setRole(member: any, role: string) {
  if (role === member.role) return
  roleSaving.value = member.id
  teamError.value = ''
  try {
    const updated = await api.updateTeamMember(member.id, { role })
    member.role = updated.role
  } catch (e: any) {
    teamError.value = e.message ?? 'Failed to update role'
  } finally {
    roleSaving.value = null
  }
}

const exemptions = ref<any[]>([])
const exemptLoading = ref(false)
const exemptError = ref('')
const newExemptEmail = ref('')
const newExemptReason = ref('')
async function loadExemptions() {
  exemptLoading.value = true
  try { exemptions.value = await api.phishingExemptions() }
  catch (e: any) { exemptError.value = e.message ?? 'Failed to load exemptions' }
  finally { exemptLoading.value = false }
}
async function addExemption() {
  if (!newExemptEmail.value.trim()) return
  exemptError.value = ''
  try {
    await api.createPhishingExemption(newExemptEmail.value.trim(), newExemptReason.value.trim() || undefined)
    newExemptEmail.value = ''
    newExemptReason.value = ''
    await loadExemptions()
  } catch (e: any) {
    exemptError.value = e.message ?? 'Failed to add exemption'
  }
}
async function removeExemption(id: string) {
  exemptError.value = ''
  try { await api.deletePhishingExemption(id); await loadExemptions() }
  catch (e: any) { exemptError.value = e.message ?? 'Failed to remove exemption' }
}

onMounted(() => {
  loadMeta()
  loadTeam()
  loadExemptions()
  loadCourses()
  loadDomains()
  loadTargetLists()
})
</script>

<style scoped>
.p-settings { display: flex; flex-direction: column; gap: 16px; max-width: 820px; }
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 14px; }
.link-btn { color: var(--accent); font-size: 12.5px; text-decoration: none; white-space: nowrap; }
.link-btn:hover { text-decoration: underline; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; }
.header-row h2 { margin: 0; font-size: 15px; }
.hint { margin: 0 0 4px; font-size: 12.5px; line-height: 1.55; color: var(--text2); }
.hint.small { font-size: 11.5px; margin-top: 8px; }
.empty { color: var(--text2); font-size: 13px; padding: 10px 0; }
.error { color: var(--red); font-size: 12px; margin: 6px 0; }

.kv-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 14px; }
.kv-row { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.training-course-row { align-items: center; border-bottom: none; margin: 10px 0; }
.training-course-row .select-wrap { width: 260px; }
.reminder-row { display: flex; gap: 14px; margin-top: 6px; }
.reminder-row .field { flex: 1; margin-bottom: 0; }
.kv-label { color: var(--text3); }
.kv-value { color: var(--text); text-align: right; }
.mono { font-family: var(--font-mono, monospace); }

.count-badge {
  font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: .02em;
  padding: 2px 8px; border-radius: 5px; color: var(--text3); background: var(--surface2); white-space: nowrap;
}
.count-badge.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.count-badge.good { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.count-badge.muted { color: var(--text3); }

.domain-row { border-top: 1px solid var(--border); padding: 12px 0; }
.domain-row:first-of-type { border-top: none; padding-top: 4px; }
.domain-row.unverified { opacity: .65; }
.domain-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.domain-name { font-family: var(--font-label); font-size: 13px; font-weight: 600; }
.dmarc-pill { font-family: var(--font-label); font-size: 9.5px; color: var(--text2); background: var(--surface2); padding: 1px 6px; border-radius: 4px; }
.spoof-input-row { display: flex; align-items: center; gap: 8px; }
.to-label { font-family: var(--font-label); font-size: 9.5px; color: var(--text3); flex-shrink: 0; }
.mini-input { flex: 1; height: 28px; padding: 0 9px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 11.5px; font-family: var(--font-label); }
.rerun-target { flex: 1; font-size: 11px; color: var(--text3); }
.mini-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 11px; font-weight: 600; padding: 6px 11px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.mini-btn.disabled { opacity: .55; cursor: default; pointer-events: none; }
.verify-hint { flex: 1; font-size: 11px; color: var(--text3); font-style: italic; }

.finding-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.finding-row { display: flex; gap: 10px; align-items: flex-start; background: rgb(15,23,40); border-radius: 7px; padding: 10px 12px; }
.finding-body { min-width: 0; }
.finding-title { font-size: 12px; font-weight: 600; }
.finding-detail { font-size: 11px; color: var(--text2); margin-top: 2px; line-height: 1.45; }

.list-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.list-row:first-of-type { border-top: none; padding-top: 2px; }
.list-main { flex: 1; min-width: 0; }
.list-name { font-size: 12.5px; font-weight: 600; display: block; }
.list-meta { font-size: 11px; color: var(--text3); }
.ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 11px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
.ghost-btn:hover:not(:disabled) { border-color: var(--text3); color: var(--text); }
.ghost-btn:disabled { opacity: .4; cursor: default; }

.team-row, .exempt-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.team-row:first-of-type, .exempt-row:first-of-type { border-top: none; }
.team-main, .exempt-main { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.team-email { color: var(--text); }
.inactive-tag { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--text3); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; }
.exempt-reason { color: var(--text3); font-size: 12px; }
.role-select { width: 130px; height: 32px; font-size: 12.5px; }

.sched-opts { display: flex; gap: 8px; margin: 10px 0; }
.sched-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 12.5px; padding: 7px 16px; border-radius: 7px; cursor: pointer; }
.sched-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--text); }
.sched-btn.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.sched-btn:disabled { opacity: .5; cursor: default; }

.exempt-form { display: flex; gap: 10px; margin: 10px 0 14px; }
.exempt-form .input { flex: 1; }
.input { background: var(--surface2); border: 1px solid var(--border); border-radius: 7px; color: var(--text); font-size: 12.5px; padding: 7px 10px; }
.input:focus { outline: none; border-color: var(--accent); }
.field { display: flex; flex-direction: column; gap: 4px; }
.label { font-family: var(--font-label); font-size: 10px; letter-spacing: .03em; color: var(--text3); text-transform: uppercase; }
.select-wrap { position: relative; }
.select-wrap select { appearance: none; width: 100%; }
.select-chevron { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 11px; pointer-events: none; }

.connect-btn { background: var(--accent); color: var(--ink); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 7px; cursor: pointer; }
.connect-btn.disabled { opacity: .5; cursor: default; }
.revoke-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 11px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
.revoke-btn:hover { border-color: var(--red); color: var(--red); }
</style>
