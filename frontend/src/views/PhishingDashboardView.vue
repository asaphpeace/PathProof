<template>
  <div class="dash-page">
    <h1 class="title">Dashboard</h1>
    <p class="subtitle">Tenant-wide posture across every simulation you've ever run — real numbers only, never estimated.</p>

    <div v-if="loading" class="empty">Loading…</div>
    <div v-else-if="loadError" class="error">{{ loadError }}</div>

    <template v-else-if="dashboard">
      <div v-if="dashboard.sent === 0" class="empty-state">
        No campaigns have been sent yet — this fills in once a real simulation has actually gone out. <RouterLink to="/phishing">Start one →</RouterLink>
      </div>

      <template v-else>
        <div class="top-grid">
          <div class="risk-card">
            <div class="gauge-wrap">
              <svg viewBox="0 0 200 118" class="gauge-svg">
                <path
                  v-for="band in GAUGE_BANDS" :key="band.grade" :d="band.path"
                  fill="none" stroke-width="14" stroke-linecap="round" :style="{ stroke: band.color }"
                />
                <line
                  v-if="needlePoint" :x1="100" :y1="100" :x2="needlePoint.x" :y2="needlePoint.y"
                  class="gauge-needle"
                />
                <circle cx="100" cy="100" r="5" class="gauge-hub" />
              </svg>
              <div class="gauge-ticks"><span>F</span><span>D</span><span>C</span><span>B</span><span>A</span></div>
              <div class="gauge-readout">
                <span class="risk-grade" :class="gradeTone">{{ dashboard.human_risk_grade }}</span>
                <span class="risk-score">{{ Math.round(dashboard.human_risk_score!) }}</span>
              </div>
            </div>
            <div class="risk-body">
              <div class="risk-label">Human risk score</div>
              <p class="risk-note">Blends real click rate, credential-entry rate, report rate, and training completion across every campaign this tenant has ever run — the same figure that already feeds the composite ZoneProof Score on Overview, shown here on its own for the first time.</p>
              <p v-if="riskInsight" class="insight-line">{{ riskInsight }}</p>
            </div>
          </div>

          <div class="component-cards">
            <!-- Real, separately-graded slices of the score above (Phishing
                 Simulation roadmap Phase 30a) — not "Human Error / Engagement
                 / Knowledge / Sentiment" the way a competitor dashboard might
                 show it, because this product has no real graded knowledge-
                 check anywhere; showing a "Knowledge" grade would be the
                 first fabricated number this dashboard has ever displayed.
                 These 4 are exactly the real signals that already exist. -->
            <div v-for="c in dashboard.risk_components" :key="c.label" class="component-chip">
              <span class="chip-label">{{ c.label }}</span>
              <span class="chip-grade" :class="chipTone(c.grade)">{{ c.grade ?? '—' }}</span>
              <span class="chip-detail">{{ c.score === null ? 'Not enough data yet' : `${Math.round(c.score)} / 100` }}</span>
            </div>
            <!-- Always-reachable path into the course library, even before
                 anything's assigned — the dedicated "Course-based training"
                 section below carries its own link once course_training_assigned
                 is real, so this one only shows when that section is hidden
                 (avoids showing "Manage courses →" twice at once). -->
            <RouterLink v-if="!dashboard.course_training_assigned" :to="{ name: 'phishing-training' }" class="link-btn components-link">Manage courses →</RouterLink>
          </div>
        </div>

        <div v-if="dashboard.watchlist.length" class="section-block">
          <div class="section-head">
            <div class="section-title">Watchlist</div>
            <span class="section-sub">{{ dashboard.watchlist.length }} recipient{{ dashboard.watchlist.length === 1 ? '' : 's' }} with a real risky history, ranked worst first — pseudonymous until admin unmask</span>
          </div>
          <div class="watchlist-rows">
            <div v-for="(w, i) in dashboard.watchlist" :key="w.recipient_hash" class="watch-row" @click="openWatchlistEntry(i)">
              <span class="rr-hash mono">{{ shortHash(w.recipient_hash) }}</span>
              <span class="rr-outcome" :class="worstOutcome(w).tone">{{ worstOutcome(w).label }}</span>
              <span v-if="w.repeat_click_count > 1" class="rr-repeat">{{ w.repeat_click_count }}× CLICKED ACROSS CAMPAIGNS</span>
              <span v-if="w.training_status" class="rr-training" :class="w.training_status">
                {{ w.training_status === 'completed' ? 'TRAINING DONE' : 'TRAINING ASSIGNED' }}
              </span>
              <span class="rr-count">{{ w.campaigns.length }} campaign{{ w.campaigns.length === 1 ? '' : 's' }}</span>
              <span class="rr-open">Open ›</span>
            </div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-head">
            <div class="section-title">Training completion by department</div>
            <div class="section-sub">Real, server-side aggregation — the recipient ↔ department mapping never leaves the backend, only these counts.</div>
          </div>
          <div v-if="dashboard.department_training.length" class="dept-list">
            <div v-for="d in dashboard.department_training" :key="d.department" class="dept-row">
              <span class="dept-name">{{ d.department }}</span>
              <div class="dept-bar-track"><div class="dept-bar-fill" :style="{ width: pct(d.assigned ? d.completed / d.assigned : null) }" /></div>
              <span class="dept-pct">{{ pct(d.assigned ? d.completed / d.assigned : null) }}</span>
              <span class="dept-sub">{{ d.completed }} of {{ d.assigned }} completed</span>
            </div>
          </div>
          <p v-else class="empty-note">No target-list entries have a department recorded yet, so there's nothing to break down. Add a department when editing a target list to unlock this.</p>
        </div>

        <div v-if="dashboard.course_training_assigned > 0" class="section-block">
          <div class="section-head">
            <div class="section-title">Course-based training</div>
            <RouterLink :to="{ name: 'phishing-training' }" class="link-btn">Manage courses →</RouterLink>
          </div>
          <p class="section-sub">A separate, additional signal from the micro-lesson above — someone can complete one without the other, so these are never blended into one rate.</p>
          <div class="dept-row">
            <span class="dept-name">Course completion</span>
            <div class="dept-bar-track"><div class="dept-bar-fill" :style="{ width: pct(dashboard.course_training_completion_rate) }" /></div>
            <span class="dept-pct">{{ pct(dashboard.course_training_completion_rate) }}</span>
            <span class="dept-sub">{{ dashboard.course_training_completed }} of {{ dashboard.course_training_assigned }} completed</span>
          </div>
        </div>

        <div v-if="surveyResults.length" class="section-block">
          <div class="section-head">
            <div class="section-title">Security culture survey</div>
            <span class="section-sub">Aggregate only — never attributable to a named individual</span>
          </div>
          <div class="survey-list">
            <div v-for="r in surveyResults" :key="r.question_key" class="survey-row">
              <p class="survey-question">{{ r.question_label }}</p>
              <div class="survey-bars">
                <div v-for="opt in ['agree', 'neutral', 'disagree']" :key="opt" class="survey-bar-item">
                  <span class="survey-opt-label">{{ opt }}</span>
                  <div class="dept-bar-track"><div class="dept-bar-fill" :style="{ width: pct((r.counts[opt] || 0) / r.response_count) }" /></div>
                  <span class="dept-pct">{{ r.counts[opt] || 0 }}</span>
                </div>
              </div>
              <span class="dept-sub">{{ r.response_count }} response{{ r.response_count === 1 ? '' : 's' }}</span>
            </div>
          </div>
        </div>

        <div class="section-block muted-block">
          <div class="section-title">Company vs. industry benchmark</div>
          <p class="empty-note">Not shown — there's no honest source for this yet. It needs real aggregate data across enough tenants to mean anything, and faking a comparison number would be worse than not showing one at all.</p>
        </div>

        <div class="section-block">
          <div class="section-head">
            <div class="section-title">Recent campaigns</div>
            <RouterLink to="/phishing" class="link-btn">All simulations →</RouterLink>
          </div>
          <p class="section-sub">Full table, filters, and per-simulation actions live on the main Phishing Simulation screen.</p>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'
import { useAuthStore } from '@/stores/auth'
import { worstOutcome, shortHash } from '@/data/phishingOutcomes'

const panels = usePanelStore()
const auth = useAuthStore()

const dashboard = ref<Awaited<ReturnType<typeof api.phishingDashboard>> | null>(null)
const loading = ref(true)
const loadError = ref('')
const surveyResults = ref<Awaited<ReturnType<typeof api.trainingSurveyResults>>>([])

async function load() {
  loading.value = true
  loadError.value = ''
  try { dashboard.value = await api.phishingDashboard() }
  catch (e: any) { loadError.value = e.message ?? 'Failed to load dashboard' }
  finally { loading.value = false }
  try { surveyResults.value = await api.trainingSurveyResults() } catch { /* section just stays hidden */ }
}

function pct(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

// Same semantic-coloring principle as the Campaigns table's stat row: a
// falling click/credential rate is good, a rising report/training rate is
// good — never the same rule applied blindly to "the number is high".
function rateTone(rate: number | null, direction: 'lower-is-better' | 'higher-is-better'): string {
  if (rate === null) return ''
  const good = direction === 'lower-is-better' ? rate < 0.1 : rate > 0.5
  const bad = direction === 'lower-is-better' ? rate > 0.25 : rate < 0.2
  return bad ? 'tone-bad' : good ? 'tone-good' : ''
}

const gradeTone = computed(() => {
  const grade = dashboard.value?.human_risk_grade
  if (!grade) return ''
  if (grade === 'A' || grade === 'B') return 'tone-good'
  if (grade === 'D' || grade === 'F') return 'tone-bad'
  return ''
})

// Semicircle gauge (Phishing Simulation roadmap Phase 30b) — the app's
// existing "score circle" pattern (this dashboard's old risk ring, and
// Overview's Composite Sentinel Score) is a full-circle conic-gradient;
// neither is a semicircle, so this is genuinely new SVG arc math, not a
// copy of an existing component. Center (100,100), radius 80, top half
// only: angle 180° = score 0 (far left), angle 0° = score 100 (far
// right), traced through the top (y = cy - r·sin θ moves upward).
const GAUGE_CX = 100, GAUGE_CY = 100, GAUGE_R = 80
function arcPoint(score: number): { x: number; y: number } {
  const angle = (Math.PI / 180) * (180 - (score / 100) * 180)
  return { x: GAUGE_CX + GAUGE_R * Math.cos(angle), y: GAUGE_CY - GAUGE_R * Math.sin(angle) }
}
function arcPath(fromScore: number, toScore: number): string {
  const p1 = arcPoint(fromScore), p2 = arcPoint(toScore)
  return `M ${p1.x} ${p1.y} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${p2.x} ${p2.y}`
}
// Same 5 real grade boundaries _score_to_grade uses on the backend
// (phishing.py/phishing_service.py) — the gauge's color bands mean
// exactly what the letter grade means, not an independently-invented scale.
const GAUGE_BANDS = [
  { grade: 'F', path: arcPath(0, 40), color: 'var(--red)' },
  { grade: 'D', path: arcPath(40, 60), color: 'color-mix(in srgb, var(--red) 45%, var(--amber))' },
  { grade: 'C', path: arcPath(60, 75), color: 'var(--amber)' },
  { grade: 'B', path: arcPath(75, 90), color: 'color-mix(in srgb, var(--amber) 45%, var(--green))' },
  { grade: 'A', path: arcPath(90, 100), color: 'var(--green)' },
]
const needlePoint = computed(() => {
  const score = dashboard.value?.human_risk_score
  if (score === null || score === undefined) return null
  return arcPoint(score)
})

function chipTone(grade: string | null): string {
  if (!grade) return ''
  if (grade === 'A' || grade === 'B') return 'tone-good'
  if (grade === 'D' || grade === 'F') return 'tone-bad'
  return ''
}

// Reuses the exact same evidence panel the per-engagement People view
// opens (PhishingRecipientsView.vue) — the Watchlist's tenant-wide entries
// are deliberately shaped identically to that view's recipients array, so
// no new drill-down UI was needed for this.
function openWatchlistEntry(index: number) {
  if (!dashboard.value) return
  panels.push({
    type: 'phishing-recipient',
    title: shortHash(dashboard.value.watchlist[index].recipient_hash),
    data: { recipients: dashboard.value.watchlist, index, isAdmin: auth.role === 'admin' },
  })
}

// One honest, specific sentence pointing at whichever real component is
// actually dragging the score down — same "don't leave every number
// equally weighted" principle as the Campaigns table's insight line.
const riskInsight = computed(() => {
  const d = dashboard.value
  if (!d) return ''
  const candidates: { label: string; value: number }[] = [
    { label: `credential entry (${pct(d.credential_rate)} of everyone sent)`, value: (d.credential_rate ?? 0) * 3 },
    { label: `click rate (${pct(d.click_rate)})`, value: d.click_rate ?? 0 },
  ]
  if (d.training_completion_rate !== null && d.training_completion_rate < 0.5 && d.training_assigned > 0) {
    candidates.push({ label: `unfinished training (only ${d.training_completed} of ${d.training_assigned} assigned lessons completed)`, value: 1 - d.training_completion_rate })
  }
  const worst = candidates.reduce((a, b) => (b.value > a.value ? b : a))
  if (worst.value <= 0) return ''
  return `The biggest driver of this score right now is ${worst.label}.`
})

onMounted(load)
</script>

<style scoped>
.dash-page { display: flex; flex-direction: column; gap: 20px; max-width: 1100px; }
.title { margin: 4px 0 2px; font-size: 24px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 13px; }
.empty, .empty-state, .empty-note { color: var(--text2); font-size: 13px; }
.error { color: var(--red); font-size: 13px; }
.empty-state { background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.empty-state a { color: var(--accent); text-decoration: none; }

.top-grid { display: grid; grid-template-columns: minmax(280px, 400px) 1fr; gap: 20px; align-items: stretch; }
@media (max-width: 800px) { .top-grid { grid-template-columns: 1fr; } }

.risk-card { background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 12px; padding: 20px; display: flex; gap: 18px; align-items: flex-start; }

.gauge-wrap { position: relative; width: 168px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; }
.gauge-svg { width: 100%; height: auto; overflow: visible; }
.gauge-needle { stroke: var(--text); stroke-width: 2.5; stroke-linecap: round; }
.gauge-hub { fill: var(--text); }
.gauge-ticks {
  width: 100%; display: flex; justify-content: space-between; margin-top: -6px; padding: 0 2px;
  font-family: var(--font-label, inherit); font-size: 9px; font-weight: 700; color: var(--text3);
}
.gauge-readout { display: flex; flex-direction: column; align-items: center; margin-top: 2px; }
.risk-grade { font-size: 24px; font-weight: 800; line-height: 1; }
.risk-grade.tone-good { color: var(--green); }
.risk-grade.tone-bad { color: var(--red); }
.risk-score { font-size: 11px; color: var(--text3); font-variant-numeric: tabular-nums; margin-top: 2px; }
.risk-body { min-width: 0; }
.risk-label { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); margin-bottom: 6px; }
.risk-note { font-size: 12px; color: var(--text2); line-height: 1.55; margin: 0; }
.insight-line {
  font-size: 12px; color: var(--text2); background: color-mix(in srgb, var(--red) 7%, transparent);
  border-left: 2px solid var(--red); padding: 7px 10px; border-radius: 0 6px 6px 0; margin: 10px 0 0; line-height: 1.5;
}

.component-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; }
.component-chip { background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.chip-label { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); }
.chip-grade { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.2; }
.chip-grade.tone-good { color: var(--green); }
.chip-grade.tone-bad { color: var(--red); }
.chip-detail { font-size: 10.5px; color: var(--text3); }
.components-link { grid-column: 1 / -1; text-align: center; padding-top: 2px; }

.watchlist-rows { display: flex; flex-direction: column; gap: 6px; }
.watch-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; cursor: pointer;
  background: var(--surface2); border-radius: 8px;
}
.watch-row:hover { background: color-mix(in srgb, var(--accent) 8%, var(--surface2)); }
.rr-hash { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; color: var(--text2); flex-shrink: 0; }
.rr-outcome { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
.rr-outcome.crit { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.rr-outcome.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.rr-outcome.info { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.rr-outcome.muted { color: var(--text3); background: var(--surface2); }
.rr-outcome.good { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.rr-repeat { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; color: var(--red); background: color-mix(in srgb, var(--red) 10%, transparent); }
.rr-training { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: .02em; }
.rr-training.assigned { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.rr-training.completed { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.rr-count { font-size: 11px; color: var(--text3); margin-left: auto; }
.rr-open { font-size: 11px; color: var(--text3); }
.watch-row:hover .rr-open { color: var(--accent); }

.section-block { background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.section-block.muted-block { opacity: .8; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.section-title { font-size: 14px; font-weight: 700; }
.section-sub { font-size: 12px; color: var(--text2); margin: 0; }
.link-btn { color: var(--accent); font-size: 12px; font-weight: 600; text-decoration: none; }

.dept-list { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.dept-row { display: grid; grid-template-columns: 130px 1fr 44px; align-items: center; gap: 10px; }
.dept-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dept-bar-track { height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
.dept-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
.dept-pct { font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
.dept-sub { grid-column: 1 / -1; font-size: 10.5px; color: var(--text3); margin-top: -6px; }

.survey-list { display: flex; flex-direction: column; gap: 16px; }
.survey-row { display: flex; flex-direction: column; gap: 6px; }
.survey-question { margin: 0; font-size: 12.5px; font-weight: 600; }
.survey-bars { display: flex; flex-direction: column; gap: 5px; }
.survey-bar-item { display: grid; grid-template-columns: 60px 1fr 28px; align-items: center; gap: 8px; }
.survey-opt-label { font-size: 10.5px; color: var(--text3); text-transform: capitalize; }
</style>
