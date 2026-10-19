<template>
  <div class="panel-page">
    <div class="panel-header">
      <RouterLink to="/phishing" class="rail-close">‹ Cancel</RouterLink>
      <div class="rail-title"><span class="tier-chip">TIER B</span> New phishing simulation</div>
      <div v-if="engagement && authNote" class="rail-save" @click="saveAndClose">Save and close — resume later from the simulation list</div>
    </div>

    <!-- Section A: What gets sent — compact recap once the engagement is
         created, since editing after that point was never actually
         supported (the scope is already persisted server-side either
         way; this restructure doesn't add or remove that capability,
         only how it's presented). -->
    <section class="panel-section">
      <div class="section-num" :class="{ done: !!engagement }"><span v-if="engagement">✓</span><span v-else>1</span></div>
      <div class="section-body">
        <div class="section-label">What gets sent</div>

        <div v-if="!engagement" class="step1-grid">
          <div class="compose-col">
            <div class="mode-grid">
              <div class="mode-card" :class="{ active: mode === 'ai' }" @click="mode = 'ai'">
                <div class="mode-head"><span class="radio" :class="{ on: mode === 'ai' }" /><b>AI-generated per send</b><span class="default-tag">DEFAULT</span></div>
                <p>Fresh subject and body every cycle, written against this tenant's DMARC posture{{ roleContext ? " and each recipient's job title" : '' }}. Nothing repeats, so awareness can't be gamed.</p>
                <div class="mode-foot">REQUIRES HUMAN CONTENT REVIEW · SAFETY-CHECKED AGAINST SCAFFOLD</div>
              </div>
              <div class="mode-card" :class="{ active: mode === 'static' }" @click="mode = 'static'">
                <div class="mode-head"><span class="radio" :class="{ on: mode === 'static' }" /><b>Static template</b></div>
                <p>One fixed subject and HTML body you write yourself, sent identically on every cycle. Predictable, and repeat recipients learn to recognise it.</p>
                <div class="mode-foot">YOU AUTHOR THE SUBJECT AND BODY · NO GENERATION STEP</div>
              </div>
            </div>

            <div class="callout">
              {{ mode === 'ai'
                ? 'Because content changes every send, you review it once per cycle before dispatch — the last section below will not let you launch unread.'
                : 'A static body still goes to real inboxes. You will confirm the exact HTML before launch.' }}
            </div>

            <div class="field">
              <span class="label">{{ mode === 'static' ? 'Start from a template' : 'Lure category — optional, shapes tone' }}</span>
              <div class="template-gallery">
                <div
                  v-for="t in galleryTemplates" :key="t.id" class="template-card"
                  :class="{ active: templateId === t.id, locked: t.eligible === false }" @click="selectTemplate(t)"
                >
                  <div class="tc-cat-row">
                    <span class="tc-cat">{{ t.category }}{{ t.difficulty ? ` · ${t.difficulty}` : '' }}</span>
                    <span v-if="t.body_html?.includes('{qr_code}')" class="tc-qr" title="This lure embeds a scannable QR code">▦ QR</span>
                  </div>
                  <span class="tc-label">{{ t.label }}</span>
                  <span class="tc-subject">"{{ t.subject }}"</span>
                  <span v-if="lureStatFor(t.id)" class="tc-stat">{{ formatClickRate(lureStatFor(t.id)) }} clicked · {{ lureStatFor(t.id).sent_count }} sent before</span>
                  <span v-if="t.eligible === false" class="tc-locked">🔒 Needs completed training on this list first — {{ t.difficulty }} lure</span>
                  <span v-else class="tc-edit" @click.stop="editTemplate(t)">✎ Edit subject &amp; body</span>
                </div>
              </div>
            </div>

            <template v-if="mode === 'static'">
              <div class="field"><span class="label">Email subject</span>
                <input v-model="subject" class="input" placeholder="Subject line" /></div>
              <div class="field"><span class="label">Email body (HTML) — include {click_url} where the tracked link should sit</span>
                <textarea v-model="bodyHtml" class="input code-area" placeholder="<p>...</p>"></textarea></div>
            </template>

            <div class="field">
              <span class="label">Target list</span>
              <div class="select-wrap">
                <select v-model="targetListId" class="input select-styled">
                  <option value="" disabled>Choose a target list</option>
                  <option v-for="tl in targetLists" :key="tl.id" :value="tl.id">{{ tl.name }} — {{ tl.entries.length }} real inboxes</option>
                </select>
                <span class="select-chevron">⌄</span>
              </div>
            </div>

            <div v-if="targetListId" class="field">
              <span class="label">Audience — who this cycle actually reaches</span>
              <div class="audience-toggle">
                <button class="toggle-btn" :class="{ active: audienceType === 'everyone' }" @click="audienceType = 'everyone'">Everyone ({{ selectedTargetList?.entries.length ?? 0 }})</button>
                <button
                  v-if="availableDepartments.length" class="toggle-btn" :class="{ active: audienceType === 'department' }"
                  @click="audienceType = 'department'; audienceDepartment = audienceDepartment || availableDepartments[0]"
                >By department</button>
              </div>
              <div v-if="audienceType === 'department'" class="field">
                <div class="select-wrap">
                  <select v-model="audienceDepartment" class="input select-styled">
                    <option v-for="d in availableDepartments" :key="d" :value="d">{{ d }} ({{ departmentCount(d) }})</option>
                  </select>
                  <span class="select-chevron">⌄</span>
                </div>
              </div>
              <p v-if="!availableDepartments.length" class="signals-note">No department is recorded for anyone on this list yet, so only "Everyone" is available — add a department when editing the target list to unlock scoped targeting.</p>
            </div>

            <div class="field">
              <span class="label">Send timing</span>
              <div class="timing-card">
                <div class="timing-toggle">
                  <button class="toggle-btn" :class="{ active: recurring }" @click="recurring = true">Recurring</button>
                  <button class="toggle-btn" :class="{ active: !recurring }" @click="recurring = false">One-time</button>
                </div>
                <div class="timing-row">
                  <div v-if="recurring" class="stepper">
                    <button class="step-btn" @click="cadenceDays = Math.max(1, cadenceDays - 1)">–</button>
                    <span class="step-val">Every {{ cadenceDays }} days</span>
                    <button class="step-btn" @click="cadenceDays = cadenceDays + 1">+</button>
                  </div>
                  <div class="field start-field">
                    <span class="sub-label">Start sending {{ recurring ? '(first cycle)' : '' }} — blank sends on launch</span>
                    <input v-model="scheduledStartAt" type="datetime-local" class="input" />
                  </div>
                </div>
                <div class="timing-note">{{ timingSummary }}</div>
              </div>
            </div>

            <div v-if="landingPages.length" class="field">
              <span class="label">Landing page shown after a click</span>
              <div class="landing-grid">
                <div
                  v-for="lp in landingPages" :key="lp.id" class="landing-card"
                  :class="{ active: landingPageId === lp.id }" @click="landingPageId = lp.id"
                >
                  <span class="radio" :class="{ on: landingPageId === lp.id }" /> {{ lp.label }}
                </div>
              </div>
            </div>

            <template v-if="mode === 'ai'">
              <div v-if="signals.length" class="signals">
                <div class="section-label small">Signals feeding the lure</div>
                <p class="signals-note">Real infrastructure signal, not a guess — most simulation platforms personalize by job title or public OSINT. This one is grounded in your domain's actual DMARC posture.</p>
                <div v-for="s in signals" :key="s.tag" class="signal-row">
                  <span class="signal-tag" :class="s.tone">{{ s.tag }}</span>
                  <span class="signal-text">{{ s.text }}</span>
                </div>
              </div>
            </template>

            <p v-if="stepError" class="error">{{ stepError }}</p>

            <div class="section-footer">
              <span class="footer-summary">{{ recipientSummary }}</span>
              <div class="primary-btn" :class="{ disabled: !canCreateEngagement }" @click="canCreateEngagement && createEngagement()">
                {{ creatingEngagement ? 'Creating…' : 'Create simulation' }}
              </div>
            </div>
          </div>

          <div class="preview-col">
            <div class="preview-sticky">
              <PhishingEmailPreview
                mode="draft"
                :subject="previewSubject"
                :body-html="previewBodyHtml"
                :from-label="meta?.sending_identity ?? 'PathProof'"
                :to-label="previewToLabel"
                :title="mode === 'ai' ? 'Example scaffold — regenerated fresh at launch' : 'What this will actually send'"
                :footer-note="mode === 'ai'
                  ? 'AI mode writes fresh content at launch time; this shows the selected lure\'s starting scaffold so you can gauge tone now.'
                  : 'This is exactly what will send — edit the subject/body on the left to change it.'"
              />

              <div v-if="availableDepartments.length" class="context-block">
                <div class="context-label">Audience breakdown</div>
                <div v-for="d in availableDepartments" :key="d" class="dept-bar-row">
                  <span class="dept-name">{{ d }}</span>
                  <div class="dept-bar-track"><div class="dept-bar-fill" :style="{ width: deptBarWidth(d) }" /></div>
                  <span class="dept-count">{{ departmentCount(d) }}</span>
                </div>
              </div>

              <div class="context-block">
                <div class="context-label">Send schedule</div>
                <div v-for="(c, i) in cadenceTimeline" :key="i" class="cadence-row">
                  <span class="cadence-dot" />
                  <span class="cadence-label">{{ c.label }}</span>
                  <span class="cadence-date">{{ c.dateLabel }}</span>
                </div>
              </div>

              <div v-if="targetListId" class="context-block">
                <div class="context-label">Previous cycle on this list</div>
                <div v-if="previousCycle" class="prev-cycle-stats">
                  <div class="prev-stat"><b>{{ previousCycle.clickRate }}</b><span>clicked</span></div>
                  <div class="prev-stat"><b>{{ previousCycle.credRate }}</b><span>submitted</span></div>
                  <div class="prev-stat"><b>{{ previousCycle.reportRate }}</b><span>reported</span></div>
                </div>
                <p v-else class="context-empty">No previous cycle on this list yet — this would be the first real evidence.</p>
              </div>

              <div v-if="currentTeachableSignals.length" class="context-block">
                <div class="context-label">Teachable signals{{ mode === 'ai' ? ' (example)' : '' }}</div>
                <ul class="signal-list">
                  <li v-for="(s, i) in currentTeachableSignals" :key="i">{{ s }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="recap-row">
          <span>{{ recipientSummary }}</span>
          <span class="recap-sep">·</span>
          <span>{{ selectedTemplate?.label ?? templateId }}{{ mode === 'ai' ? ' (AI-generated per send)' : ' (static)' }}</span>
          <span class="recap-sep">·</span>
          <span>{{ timingSummary }}</span>
        </div>
      </div>
    </section>

    <!-- Section B: Authorization -->
    <section class="panel-section" :class="{ locked: !engagement }">
      <div class="section-num" :class="{ done: authComplete }"><span v-if="authComplete">✓</span><span v-else>2</span></div>
      <div class="section-body">
        <div class="section-label">Authorization to email {{ selectedTargetList?.entries.length ?? 0 }} real people</div>

        <template v-if="!engagement">
          <p class="locked-note">Create the simulation above first — authorization applies to the specific engagement you just configured, not a blank form.</p>
        </template>
        <template v-else-if="!authComplete">
          <div class="auth-card">
            <div class="auth-head"><span class="lock">🔒</span><b>Rules of Engagement signature</b><span class="req-tag">REQUIRED PATH</span></div>
            <p>A countersigned ROE is what makes this legal and auditable. PathProof sends the document via Dropbox Sign, blocks all dispatch until it returns signed, and files the executed copy against every campaign this engagement produces.</p>
            <div class="signer-row">
              <span class="signer-label">SIGNER</span>
              <input v-model="signerEmail" class="input" :placeholder="signerPlaceholder" />
              <button class="cyan-btn" :class="{ disabled: requestingSig }" @click="requestSignature">{{ requestingSig ? 'Sending…' : 'Request real signature' }}</button>
            </div>
          </div>

          <div class="bypass-toggle" @click="showBypass = !showBypass">
            <span class="chev" :class="{ open: showBypass }">▸</span> Development bypass — skip the signature <span class="danger-tag">NOT FOR REAL RECIPIENTS</span>
          </div>
          <div v-if="showBypass" class="bypass-box">
            <p>This dispatches live mail to {{ selectedTargetList?.entries.length ?? 0 }} named employees with no signed authorization on file. The action is written to the tenant audit log under your name and cannot be redacted. Type <b>BYPASS</b> to unlock it.</p>
            <div class="bypass-row">
              <input v-model="bypassConfirm" class="input mono" placeholder="type BYPASS" />
              <button class="danger-btn" :class="{ disabled: bypassConfirm !== 'BYPASS' || skippingSig }" @click="skipSignature">{{ skippingSig ? 'Activating…' : 'Skip signature' }}</button>
            </div>
          </div>

          <p v-if="authNote" class="auth-note">{{ authNote }}</p>
          <p v-if="stepError" class="error">{{ stepError }}</p>
        </template>
        <template v-else>
          <div class="recap-row"><span>{{ authSummary }}</span></div>
        </template>
      </div>
    </section>

    <!-- Section C: Review & launch -->
    <section class="panel-section" :class="{ locked: !authComplete }">
      <div class="section-num"><span>3</span></div>
      <div class="section-body">
        <div class="section-label">Content review before anything sends</div>

        <template v-if="!authComplete">
          <p class="locked-note">Held until authorization resolves — nothing can generate a real preview until the engagement is active.</p>
        </template>
        <template v-else>
          <div class="review-copy">
            <b>Read what {{ selectedTargetList?.entries.length ?? 0 }} people are about to receive</b>
            <p>There is no review gate after this one. Approval records your name and timestamp against <code>body_html_sent</code>, so the exact content is reproducible in an audit.</p>
            <div class="approve-row" :class="{ approved: approved }">
              <span class="approve-dot" />
              {{ approved ? `Content approved by you · ${approvedAt}` : 'Not yet reviewed — read the preview below to unlock launch' }}
            </div>
            <div class="safety-note">✓ SAFETY CHECK: {{ preview?.llm_generated ? 'OUTPUT MATCHED THE APPROVED SCAFFOLD — NO OFF-BRAND CLAIMS' : 'N/A — STATIC TEMPLATE, AUTHORED BY YOU' }}</div>
          </div>

          <div class="inline-preview">
            <PhishingEmailPreview
              mode="draft"
              :subject="preview?.subject ?? 'Loading…'"
              :body-html="preview?.body_html ?? ''"
              :from-label="meta?.sending_identity ?? 'PathProof'"
              :to-label="`${selectedTargetList?.name ?? ''} · ${selectedTargetList?.entries.length ?? 0} recipients`"
              title="Review before they receive this"
              footer-note="Generated from the approved scaffold using this tenant's DMARC posture. Approving records your name against this exact HTML."
            />
            <div class="preview-actions">
              <div class="primary-btn" :class="{ disabled: approved }" @click="!approved && approveContent()">
                {{ approved ? '✓ Approved' : "I've read it — approve content" }}
              </div>
            </div>
          </div>

          <div class="on-launch">
            <div class="ol-label">ON LAUNCH</div>
            <div class="ol-row"><span>RECIPIENTS</span><b>{{ audienceSummary }}</b></div>
            <div class="ol-row"><span>AUTHORIZATION</span><b>{{ authSummary }}</b></div>
            <div class="ol-row"><span>CADENCE</span><b>{{ timingSummary }}</b></div>
            <div class="ol-row"><span>EVIDENCE</span><b>Per-recipient events, hashed identities, immutable body_html_sent</b></div>
          </div>

          <p v-if="stepError" class="error">{{ stepError }}</p>

          <div class="section-footer">
            <span class="footer-summary">{{ canLaunch ? '' : (approved ? 'Held until authorization resolves' : 'Launch locked until the content is read') }}</span>
            <div class="primary-btn launch" :class="{ disabled: !canLaunch }" @click="canLaunch && launch()">{{ launching ? 'Launching…' : 'Launch simulation' }}</div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { api } from '@/api/client'
import PhishingEmailPreview from '@/components/phishing/PhishingEmailPreview.vue'

const router = useRouter()

// ── Data this page needs, loaded independently since it's a real route now
// rather than a modal fed by PhishingView.vue's already-loaded state ──────
const templates = ref<any[]>([])
// Tenant-owned custom templates (Phishing Simulation roadmap Phase 23) —
// only offered in Static mode, never AI mode: AI-mode tone-shaping only
// understands the built-in lure categories, and the backend rejects the
// combination outright rather than silently substituting a different
// category (see resolve_campaign_content's fallback comment).
const customTemplates = ref<any[]>([])
const landingPages = ref<any[]>([])
const meta = ref<any | null>(null)
const domains = ref<any[]>([])
const targetLists = ref<any[]>([])
const campaignCountByTargetList = ref<Record<string, number>>({})
const lureStats = ref<any[]>([])
// One real most-recent campaign id per target list, across every engagement
// that has ever used it (Phishing Simulation roadmap Phase 16) — lets the
// compose step show real "previous cycle" evidence before an engagement
// for *this* launch even exists yet.
const mostRecentCampaignByTargetList = ref<Record<string, { id: string; launchedAt: string }>>({})

async function loadCustomTemplates(targetListId?: string) {
  try { customTemplates.value = await api.phishingCustomTemplates(targetListId || undefined) }
  catch { customTemplates.value = [] }
}

async function loadPageData() {
  const [t, lp, m, d, tl, ls] = await Promise.all([
    api.phishingTemplates().catch(() => []),
    api.phishingLandingPages().catch(() => []),
    api.phishingMeta().catch(() => null),
    api.domains().catch(() => []),
    api.phishingTargetLists().catch(() => []),
    api.phishingLureStats().catch(() => []),
  ])
  templates.value = t
  landingPages.value = lp
  meta.value = m
  domains.value = d
  targetLists.value = tl
  lureStats.value = ls
  if (t.length) templateId.value = t[0].id
  if (lp.length) landingPageId.value = lp[0].id
  await loadCustomTemplates()

  try {
    const engagements = (await api.engagements()).filter((e: any) => e.tier === 'phishing')
    const counts: Record<string, number> = {}
    const mostRecent: Record<string, { id: string; launchedAt: string }> = {}
    await Promise.all(engagements.map(async (e: any) => {
      const tlId = e.scope?.target_list_id
      if (!tlId) return
      const campaigns = await api.phishingCampaigns(e.id).catch(() => [])
      counts[tlId] = (counts[tlId] ?? 0) + campaigns.length
      for (const c of campaigns) {
        const existing = mostRecent[tlId]
        if (!existing || c.launched_at > existing.launchedAt) mostRecent[tlId] = { id: c.id, launchedAt: c.launched_at }
      }
    }))
    campaignCountByTargetList.value = counts
    mostRecentCampaignByTargetList.value = mostRecent
  } catch { /* the HISTORY signal and previous-cycle stats just stay absent */ }
}

function lureStatFor(templateId: string): any | null {
  return lureStats.value.find((s: any) => s.template_id === templateId) ?? null
}
function formatClickRate(stat: any): string {
  return `${Math.round(stat.click_rate * 100)}%`
}

const mode = ref<'ai' | 'static'>('ai')
const targetListId = ref('')
const templateId = ref('')
const landingPageId = ref('')
const cadenceDays = ref(90)
const recurring = ref(true)
const scheduledStartAt = ref('')
const subject = ref('')
const bodyHtml = ref('')
const stepError = ref('')

function selectTemplate(t: any) {
  if (t.eligible === false) return  // greyed out for a real reason — see the card's own locked note
  templateId.value = t.id
  if (mode.value === 'static') {
    subject.value = t.subject
    bodyHtml.value = t.body_html
  }
}

// The subject/body textareas only render in Static mode (selectTemplate()
// above only pre-fills them when mode is already 'static') — but AI mode
// is the default, so from the gallery alone there was no visible way to
// reach editable content without first knowing to flip the mode toggle
// above. This gives every card its own explicit "edit" affordance that
// switches mode and pre-fills in one step, regardless of current mode.
function editTemplate(t: any) {
  mode.value = 'static'
  selectTemplate(t)
}

const timingSummary = computed(() => {
  const startPart = scheduledStartAt.value
    ? `starting ${new Date(scheduledStartAt.value).toLocaleString()}`
    : 'starting on launch'
  return recurring.value ? `${startPart}, then every ${cadenceDays.value} days` : `One-time send, ${startPart}`
})

const selectedTargetList = computed(() => targetLists.value.find(tl => tl.id === targetListId.value))
const roleContext = computed(() => (selectedTargetList.value?.entries ?? []).some((e: any) => e.job_title))

// Audience scoping (Phishing Simulation roadmap Phase 15) — a fresh
// engagement has no click history yet, so only "Everyone"/"Department" are
// offered here; "Individual" re-targeting lives on the People view instead,
// where repeat-clicker history actually exists to pick from.
const audienceType = ref<'everyone' | 'department'>('everyone')
const audienceDepartment = ref('')
const availableDepartments = computed(() => {
  const entries = selectedTargetList.value?.entries ?? []
  return [...new Set(entries.map((e: any) => e.department).filter(Boolean))] as string[]
})
function departmentCount(dept: string): number {
  return (selectedTargetList.value?.entries ?? []).filter((e: any) => e.department === dept).length
}
const audienceSummary = computed(() => {
  const total = selectedTargetList.value?.entries.length ?? 0
  const listName = selectedTargetList.value?.name ?? ''
  if (audienceType.value === 'department' && audienceDepartment.value) {
    return `${departmentCount(audienceDepartment.value)} of ${total} real inboxes on ${listName} — ${audienceDepartment.value} department only`
  }
  return `${total} real inboxes on ${listName}`
})
// Compact recap line once section A collapses (Phishing Simulation roadmap
// — design adoption pass, single-panel restructure) — same real numbers as
// audienceSummary, just phrased for a one-line footer/recap rather than a
// full sentence.
const recipientSummary = computed(() => {
  if (!targetListId.value) return 'Choose a target list to continue'
  return audienceSummary.value
})

const primaryDomain = computed(() => domains.value.find((d: any) => d.ownership_verified) ?? domains.value[0])
function dmarcSignalText(d: any): string {
  if (!d) return ''
  if (d.dmarc_stage === 'reject') return `${d.domain} enforces DMARC at p=reject — lures should rely on plausibility rather than sender-address spoofing.`
  if (d.dmarc_stage === 'quarantine' || d.dmarc_stage === 'monitor') return `${d.domain}'s DMARC policy is ${d.dmarc_stage} — partial enforcement.`
  return `${d.domain} publishes p=none — lures may use the exact corporate domain, raising plausibility.`
}

const signals = computed(() => {
  const out: { tag: string; tone: string; text: string }[] = []
  if (primaryDomain.value) out.push({ tag: 'DMARC', tone: 'crit', text: dmarcSignalText(primaryDomain.value) })
  const list = selectedTargetList.value
  if (list) {
    const mapped = list.entries.filter((e: any) => e.job_title).length
    if (mapped > 0) out.push({ tag: 'ROLES', tone: 'accent', text: `${mapped} of ${list.entries.length} recipients have a job title mapped — the pretext may draw on these roles in general terms.` })
    const priorCount = campaignCountByTargetList.value[list.id] ?? 0
    if (priorCount > 0) out.push({ tag: 'HISTORY', tone: 'accent', text: `${priorCount} prior campaign${priorCount === 1 ? '' : 's'} already ran against this list.` })
  }
  return out
})

// ── Live preview pane (Phishing Simulation roadmap Phase 16) ──────────────
// Static mode: the real subject/body about to be sent — genuinely live.
// AI mode: no engagement exists yet at this point in the flow, so there is
// no real generated content to show — the selected lure's own scaffold is
// shown instead, honestly labeled as an example, never presented as if it
// were the literal content that will actually be generated at launch.
const selectedTemplate = computed(() => templates.value.find((t: any) => t.id === templateId.value))
const previewSubject = computed(() => {
  if (mode.value === 'static') return subject.value || 'Subject line…'
  return selectedTemplate.value?.subject ?? 'Select a lure to preview'
})
const previewBodyHtml = computed(() => {
  if (mode.value === 'static') return bodyHtml.value
  return selectedTemplate.value?.body_html ?? ''
})
const previewToLabel = computed(() => {
  const list = selectedTargetList.value
  return list ? `${list.name} · ${list.entries.length} recipients` : 'Choose a target list'
})

// ── Department sizing bars ─────────────────────────────────────────────────
const maxDepartmentCount = computed(() => Math.max(1, ...availableDepartments.value.map(d => departmentCount(d))))
function deptBarWidth(dept: string): string {
  return `${Math.round((departmentCount(dept) / maxDepartmentCount.value) * 100)}%`
}

// ── Cadence timeline — real computed future dates, not a text string ──────
const cadenceTimeline = computed(() => {
  const start = scheduledStartAt.value ? new Date(scheduledStartAt.value) : new Date()
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (!recurring.value) return [{ label: 'One-time send', dateLabel: fmt(start) }]
  const cycles = [{ label: 'Launch', dateLabel: fmt(start) }]
  for (let i = 2; i <= 4; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + cadenceDays.value * (i - 1))
    cycles.push({ label: `Cycle ${i}`, dateLabel: fmt(d) })
  }
  return cycles
})

// Re-evaluate custom-template eligibility whenever the audience changes —
// a target list without a training track record only unlocks 'low'
// difficulty lures (compute_department_training_completion-style, but
// per-list, not tenant-wide — see is_target_list_training_ready).
watch(targetListId, (tlId) => { loadCustomTemplates(tlId) })

// Switching to AI mode while a custom template is selected would silently
// 400 at launch (the backend correctly refuses that combination) — reset
// to a real built-in instead of leaving a submission that's guaranteed to
// fail.
watch(mode, (m) => {
  if (m === 'ai' && !templates.value.some(t => t.id === templateId.value) && templates.value.length) {
    templateId.value = templates.value[0].id
  }
})

// ── Custom templates only ever show up in Static mode (see customTemplates
// ref's own comment) — merged into the same gallery so selectTemplate()'s
// existing pre-fill logic works unchanged for either kind. ────────────────
const galleryTemplates = computed(() => (
  mode.value === 'static' ? [...templates.value, ...customTemplates.value] : templates.value
))

// ── Previous-cycle stats for the selected target list — real evidence from
// its most recent real campaign, across any engagement that used it ───────
const previousCycle = ref<{ clickRate: string; credRate: string; reportRate: string } | null>(null)
watch(targetListId, async (tlId) => {
  previousCycle.value = null
  const recent = mostRecentCampaignByTargetList.value[tlId]
  if (!recent) return
  try {
    const counts = await api.phishingCampaignEvents(recent.id)
    const sent = counts.sent || 0
    if (!sent) return
    const pct = (n: number) => `${Math.round((n / sent) * 100)}%`
    previousCycle.value = { clickRate: pct(counts.clicked ?? 0), credRate: pct(counts.credential_entered ?? 0), reportRate: pct(counts.reported ?? 0) }
  } catch { /* honestly show nothing rather than a stale/wrong number */ }
})

// ── Teachable signals — the real generic_flags a recipient would actually
// fall back to (phishing_lesson_content.py), not an invented panel ────────
const currentTeachableSignals = computed(() => selectedTemplate.value?.teachable_signals ?? [])

const canCreateEngagement = computed(() => {
  if (!targetListId.value) return false
  if (recurring.value && !cadenceDays.value) return false
  if (mode.value === 'static' && (!subject.value.trim() || !bodyHtml.value.trim())) return false
  return true
})

const engagement = ref<any | null>(null)
const creatingEngagement = ref(false)

async function createEngagement() {
  stepError.value = ''
  creatingEngagement.value = true
  try {
    engagement.value = await api.createEngagement('phishing', [], [], {
      target_list_id: targetListId.value,
      template_id: templateId.value || (templates.value[0]?.id ?? 'password-expiry'),
      subject_override: mode.value === 'static' ? subject.value : null,
      body_html_override: mode.value === 'static' ? bodyHtml.value : null,
      cadence_days: cadenceDays.value,
      llm_generate_fresh: mode.value === 'ai',
      landing_page_id: landingPageId.value || undefined,
      recurring: recurring.value,
      scheduled_start_at: scheduledStartAt.value ? new Date(scheduledStartAt.value).toISOString() : undefined,
    })
    clearDraft() // a real Engagement row now exists — PhishingView.vue's own
    // resumable pending_approval card takes over from here, so the
    // localStorage-only draft for the pre-engagement phase is no longer needed.
  } catch (e: any) {
    stepError.value = e.message ?? 'Failed to create simulation'
  } finally {
    creatingEngagement.value = false
  }
}

// Section B — authorization
const signerEmail = ref('')
const signerPlaceholder = 'defaults to your account email'
const requestingSig = ref(false)
const skippingSig = ref(false)
const showBypass = ref(false)
const bypassConfirm = ref('')
const authNote = ref('')
const authComplete = computed(() => engagement.value?.status === 'active')

async function requestSignature() {
  if (!engagement.value) return
  requestingSig.value = true
  stepError.value = ''
  try {
    engagement.value = await api.requestSignature(engagement.value.id, signerEmail.value.trim() || undefined)
    authNote.value = `Rules of Engagement sent for signature${signerEmail.value ? ` to ${signerEmail.value}` : ''}. Once it's signed, the review section below unlocks automatically.`
  } catch (e: any) {
    stepError.value = e.message ?? 'Failed to request signature'
  } finally {
    requestingSig.value = false
  }
}

async function skipSignature() {
  if (!engagement.value || bypassConfirm.value !== 'BYPASS') return
  skippingSig.value = true
  stepError.value = ''
  try {
    engagement.value = await api.approveEngagement(engagement.value.id)
    authNote.value = 'Activated directly — dev bypass, no real signature on file.'
    loadPreview()
  } catch (e: any) {
    stepError.value = e.message ?? 'Dev bypass is disabled on this deployment — use Request real signature instead'
  } finally {
    skippingSig.value = false
  }
}

const authSummary = computed(() => {
  if (engagement.value?.status === 'active') return 'Activated (dev bypass) — dispatch not held'
  return `ROE requested${signerEmail.value ? ` from ${signerEmail.value}` : ''} · dispatch held until signed`
})

// Section C — preview + launch. Loads automatically the moment authComplete
// flips true (dev-bypass path above calls it directly; the real signature
// path has no client-side moment to react to since the webhook that flips
// status to 'active' happens server-side while this tab may not even be
// open — PhishingView.vue's resumable card is the real way back in for
// that path, same as before this restructure).
const preview = ref<any | null>(null)
const approved = ref(false)
const approvedAt = ref('')
const launching = ref(false)

async function loadPreview() {
  if (!engagement.value) return
  try {
    preview.value = await api.phishingContentPreview(engagement.value.id)
  } catch (e: any) {
    stepError.value = e.message ?? 'Failed to generate a preview'
  }
}

function approveContent() {
  approved.value = true
  approvedAt.value = new Date().toLocaleString()
}

const canLaunch = computed(() => approved.value && engagement.value?.status === 'active' && !!preview.value)

async function launch() {
  if (!engagement.value || !preview.value) return
  launching.value = true
  stepError.value = ''
  try {
    await api.launchPhishingCampaign(
      engagement.value.id,
      {
        subject: preview.value.subject, body_html: preview.value.body_html,
        llm_generated: preview.value.llm_generated, dmarc_context: preview.value.dmarc_context ?? null,
      },
      audienceType.value === 'department' && audienceDepartment.value
        ? { audience_type: 'department', department: audienceDepartment.value }
        : undefined,
    )
    router.push('/phishing')
  } catch (e: any) {
    stepError.value = e.message ?? 'Failed to launch simulation'
  } finally {
    launching.value = false
  }
}

function saveAndClose() {
  // Once an Engagement exists it's already a real, persisted row —
  // PhishingView.vue renders it as a resumable pending_approval card with
  // a working "Resume signature" action, so there's nothing further to
  // save here beyond just navigating away.
  router.push('/phishing')
}

// ── Pre-engagement draft persistence ("Save and close" before the
// engagement is created — there's no server-side row yet to resume from,
// so the in-progress fields are kept in localStorage instead) ─────────────
const DRAFT_KEY = 'phishing-wizard-draft'
function saveDraft() {
  if (engagement.value) return // a real row exists now; stop shadowing it
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    mode: mode.value, targetListId: targetListId.value, templateId: templateId.value,
    landingPageId: landingPageId.value, cadenceDays: cadenceDays.value, recurring: recurring.value,
    scheduledStartAt: scheduledStartAt.value, subject: subject.value, bodyHtml: bodyHtml.value,
  }))
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const d = JSON.parse(raw)
    mode.value = d.mode ?? mode.value
    targetListId.value = d.targetListId ?? targetListId.value
    if (d.templateId) templateId.value = d.templateId
    if (d.landingPageId) landingPageId.value = d.landingPageId
    cadenceDays.value = d.cadenceDays ?? cadenceDays.value
    recurring.value = d.recurring ?? recurring.value
    scheduledStartAt.value = d.scheduledStartAt ?? scheduledStartAt.value
    subject.value = d.subject ?? subject.value
    bodyHtml.value = d.bodyHtml ?? bodyHtml.value
  } catch { /* a corrupt draft is no worse than no draft */ }
}
function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}
watch(
  [mode, targetListId, templateId, landingPageId, cadenceDays, recurring, scheduledStartAt, subject, bodyHtml],
  saveDraft,
)
watch(authComplete, (done) => { if (done && !preview.value) loadPreview() })

onMounted(async () => {
  restoreDraft()
  await loadPageData()
})
</script>

<style scoped>
.panel-page { display: flex; flex-direction: column; gap: 0; max-width: 1020px; margin: 0 auto; padding-bottom: 60px; }

.panel-header { display: flex; align-items: center; gap: 14px; padding: 4px 0 20px; flex-wrap: wrap; }
.rail-close { font-size: 12.5px; color: var(--text2); text-decoration: none; width: fit-content; }
.rail-close:hover { color: var(--accent); }
.rail-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 700; }
.tier-chip {
  font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: .04em;
  color: var(--bg); background: var(--amber); padding: 3px 8px; border-radius: 5px;
}
.rail-save { margin-left: auto; font-size: 11.5px; color: var(--text3); line-height: 1.5; cursor: pointer; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; }
.rail-save:hover { color: var(--accent); border-color: var(--accent); }

/* One continuous panel, three sections stacked instead of three separate
   full-screen steps (Phishing Simulation roadmap — design adoption pass,
   single-panel restructure). Each section keeps the real sequential
   backend requirement it always had (an engagement must exist before
   authorization; authorization must resolve before a real preview can
   generate) — what changed is presentation, not the underlying safety
   gates, which is why "locked" sections show a real reason, not just a
   greyed-out block. */
.panel-section { display: flex; gap: 16px; padding: 22px 0; border-top: 1px solid var(--border); }
.panel-section:first-child { border-top: none; }
.panel-section.locked { opacity: .55; }
.section-num {
  width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--border); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--text3); margin-top: 2px;
}
.section-num.done { border-color: var(--green); color: var(--green); }
.section-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.section-label { font-family: var(--font-body); font-size: 17px; font-weight: 700; color: var(--text); }
.section-label.small { font-family: var(--font-label); font-size: 10px; font-weight: 400; letter-spacing: .05em; text-transform: uppercase; color: var(--text3); margin-bottom: -4px; }
.locked-note { font-size: 12.5px; color: var(--text3); line-height: 1.55; margin: 0; }

.recap-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--text2); background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }
.recap-sep { color: var(--text3); }

.section-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px; flex-wrap: wrap; }
.footer-summary { font-size: 11.5px; color: var(--text3); }

.step1-grid {
  display: grid; grid-template-columns: minmax(320px, 520px) minmax(340px, 600px); gap: 32px;
  width: 100%;
}
/* Same overflow lesson as the Campaigns table: a fixed breakpoint checked
   against the raw viewport misses the real available width once the
   sidebar/padding are subtracted. Preview column widened (Phishing
   Simulation roadmap — template content fill-out pass) so the preview
   genuinely mimics a real email reading pane; breakpoint bumped up from
   1300px to keep the same margin this file's own comment originally
   accounted for, now that the grid needs more total width before it's
   safe to collapse to one column. */
@media (max-width: 1400px) { .step1-grid { grid-template-columns: 1fr; } }
.compose-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.preview-col { min-width: 0; }
.preview-sticky { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 20px; }

.tc-stat { font-size: 10px; color: var(--accent); font-family: var(--font-label); margin-top: 2px; }

.select-wrap { position: relative; }
.select-styled { appearance: none; -webkit-appearance: none; padding-right: 32px; cursor: pointer; }
.select-chevron { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 13px; pointer-events: none; }

.context-block { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 13px 15px; display: flex; flex-direction: column; gap: 8px; }
.context-label { font-family: var(--font-label); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); }
.context-empty { font-size: 11.5px; color: var(--text3); line-height: 1.5; margin: 0; }

.dept-bar-row { display: flex; align-items: center; gap: 8px; }
.dept-name { font-size: 11.5px; color: var(--text2); width: 88px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dept-bar-track { flex: 1; height: 7px; border-radius: 4px; background: var(--surface); overflow: hidden; }
.dept-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.dept-count { font-size: 11px; color: var(--text3); font-family: var(--font-label); width: 18px; text-align: right; flex-shrink: 0; }

.cadence-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.cadence-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.cadence-label { color: var(--text2); width: 70px; flex-shrink: 0; }
.cadence-date { color: var(--text3); font-family: var(--font-label); font-size: 11px; margin-left: auto; }

.prev-cycle-stats { display: flex; gap: 10px; }
.prev-stat { flex: 1; background: var(--surface); border-radius: 8px; padding: 8px; text-align: center; }
.prev-stat b { display: block; font-size: 15px; }
.prev-stat span { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: .02em; }

.signal-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.signal-list li { font-size: 11.5px; color: var(--text2); line-height: 1.5; }

.mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 600px) { .mode-grid { grid-template-columns: 1fr; } }
.mode-card { border: 1px solid var(--border); border-radius: 9px; padding: 13px 14px; cursor: pointer; background: var(--surface2); }
.mode-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface2)); }
.mode-head { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 6px; }
.radio { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid var(--text3); flex-shrink: 0; }
.radio.on { border-color: var(--accent); background: radial-gradient(circle, var(--accent) 0 40%, transparent 42%); }
.default-tag {
  margin-left: auto; font-family: var(--font-label); font-size: 9px; font-weight: 700; color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent); padding: 1px 6px; border-radius: 4px;
}
.mode-card p { font-size: 11.5px; color: var(--text2); line-height: 1.5; margin: 0 0 8px; }
.mode-foot { font-family: var(--font-label); font-size: 9px; color: var(--text3); letter-spacing: .02em; }

.landing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.landing-card {
  display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px;
  padding: 9px 12px; cursor: pointer; background: var(--surface2); font-size: 12.5px;
}
.landing-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface2)); color: var(--text); }

.callout {
  background: color-mix(in srgb, var(--accent) 9%, transparent); border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0; padding: 9px 12px; font-size: 12px; color: var(--text2); line-height: 1.5;
}

.field { display: flex; flex-direction: column; gap: 5px; }
.label { font-family: var(--font-label); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); }
.input {
  height: 36px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 12.5px; font-family: var(--font-body); width: 100%;
}
.input:focus { outline: none; border-color: var(--accent); }
.input.mono { font-family: var(--font-label); }
.code-area { height: 90px; padding: 10px 12px; font-family: var(--font-mono); font-size: 11px; resize: vertical; white-space: pre-wrap; }

.stepper { display: flex; align-items: center; gap: 10px; height: 36px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 0 10px; flex-shrink: 0; }
.step-btn { width: 22px; height: 22px; border-radius: 5px; background: var(--surface); border: 1px solid var(--border); color: var(--text); cursor: pointer; font-size: 14px; line-height: 1; }
.step-val { flex: 1; text-align: center; font-size: 12px; font-family: var(--font-label); white-space: nowrap; padding: 0 6px; }

.template-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.template-card {
  display: flex; flex-direction: column; gap: 3px; border: 1px solid var(--border); border-radius: 8px;
  padding: 9px 11px; cursor: pointer; background: var(--surface2);
}
.template-card.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface2)); }
.tc-cat-row { display: flex; align-items: center; gap: 6px; }
.tc-cat { font-family: var(--font-label); font-size: 9px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--accent); }
.tc-qr {
  font-family: var(--font-label); font-size: 8.5px; font-weight: 700; letter-spacing: .02em;
  color: var(--text3); background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
  padding: 1px 5px; white-space: nowrap;
}
.tc-label { font-size: 12.5px; font-weight: 600; }
.tc-subject { font-size: 11px; color: var(--text2); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-edit {
  font-size: 10.5px; color: var(--text3); margin-top: 2px; width: fit-content;
  padding-top: 3px; border-top: 1px dashed var(--border);
}
.tc-edit:hover { color: var(--accent); }
.template-card.locked { cursor: default; opacity: .55; }
.template-card.locked:hover { border-color: var(--border); }
.tc-locked { font-size: 10px; color: var(--text3); margin-top: 2px; line-height: 1.4; }

.timing-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.timing-toggle { display: flex; gap: 6px; }
.audience-toggle { display: flex; gap: 6px; margin-bottom: 8px; }
.toggle-btn {
  flex: 1; padding: 7px 10px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text2); font-size: 12px; font-weight: 600; cursor: pointer;
}
.toggle-btn.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.timing-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
.start-field { flex: 1; min-width: 180px; }
.sub-label { font-family: var(--font-label); font-size: 9.5px; color: var(--text3); margin-bottom: 4px; display: block; }
.timing-note { font-size: 11px; color: var(--text3); }

.signals { display: flex; flex-direction: column; gap: 7px; background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; padding: 11px 13px; }
.signals-note { font-size: 11px; color: var(--text3); line-height: 1.5; margin: -2px 0 2px; }
.signal-row { display: flex; gap: 10px; align-items: flex-start; }
.signal-tag { font-family: var(--font-label); font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
.signal-tag.crit { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.signal-tag.accent { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.signal-text { font-size: 11.5px; color: var(--text2); line-height: 1.5; }

.auth-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.auth-head { display: flex; align-items: center; gap: 8px; font-size: 13.5px; margin-bottom: 7px; }
.lock { font-size: 13px; }
.req-tag { margin-left: auto; font-family: var(--font-label); font-size: 9px; font-weight: 700; color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); padding: 1px 6px; border-radius: 4px; }
.auth-card p { font-size: 12px; color: var(--text2); line-height: 1.55; margin: 0 0 12px; }
.signer-row { display: grid; grid-template-columns: 60px 1fr auto; gap: 8px; align-items: center; }
.signer-label { font-family: var(--font-label); font-size: 10px; color: var(--text3); }
.cyan-btn { background: var(--accent); color: var(--bg); border: none; border-radius: 8px; padding: 0 14px; height: 36px; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.cyan-btn.disabled { opacity: .5; cursor: default; }

.bypass-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text3); cursor: pointer; }
.chev { font-size: 9px; transition: transform .15s; }
.chev.open { transform: rotate(90deg); }
.danger-tag { font-family: var(--font-label); font-size: 9px; font-weight: 700; color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.bypass-box { background: color-mix(in srgb, var(--red) 8%, transparent); border: 1px solid color-mix(in srgb, var(--red) 35%, transparent); border-radius: 9px; padding: 12px 14px; }
.bypass-box p { font-size: 11.5px; color: var(--text2); line-height: 1.55; margin: 0 0 10px; }
.bypass-box b { color: var(--red); }
.bypass-row { display: flex; gap: 8px; }
.danger-btn { background: var(--red); color: var(--bg); border: none; border-radius: 8px; padding: 0 14px; height: 36px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.danger-btn.disabled { opacity: .4; cursor: default; }
.auth-note { font-size: 12px; color: var(--green); }

.review-copy b { font-size: 14px; }
.review-copy p { font-size: 12px; color: var(--text2); line-height: 1.55; margin: 6px 0 10px; }
.review-copy code { font-family: var(--font-label); }
.approve-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--amber); margin-bottom: 8px; }
.approve-row.approved { color: var(--green); }
.approve-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.safety-note { font-family: var(--font-label); font-size: 10.5px; color: var(--green); }

.on-launch { background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ol-label { font-family: var(--font-label); font-size: 9.5px; letter-spacing: .05em; color: var(--text3); margin-bottom: 2px; }
.ol-row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.ol-row span { color: var(--text3); font-family: var(--font-label); font-size: 10px; text-transform: uppercase; padding-top: 2px; }
.ol-row b { color: var(--text); font-weight: 500; text-align: right; }

.error { color: var(--red); font-size: 12px; }

.primary-btn { padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; background: var(--accent); color: var(--bg); }
.primary-btn.launch { background: var(--amber); }
.primary-btn.disabled { opacity: .5; cursor: default; }

.inline-preview {
  background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px;
  display: flex; flex-direction: column; gap: 14px;
}
.preview-actions { display: flex; justify-content: flex-end; }
</style>
