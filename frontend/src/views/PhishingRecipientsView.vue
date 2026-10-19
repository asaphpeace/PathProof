<template>
  <div class="recipients-view">
    <div v-if="loading" class="loading">Loading recipients…</div>
    <div v-else-if="loadError" class="error-block">{{ loadError }}</div>
    <template v-else>
      <h1 class="page-title">People</h1>
      <p class="page-sub">{{ targetListLabel }} · every campaign this simulation has ever run, aggregated per person</p>

      <div v-if="recipients.length === 0" class="empty">No recipients yet — nothing has been sent on this simulation.</div>
      <template v-else>
        <div class="recipients-table">
          <div v-for="(r, i) in recipients" :key="r.recipient_hash" class="recipient-row">
            <input
              type="checkbox" class="rr-check" :checked="selected.has(r.recipient_hash)"
              @click.stop="toggleSelected(r.recipient_hash)"
            />
            <div class="rr-main" @click="openRecipient(i)">
              <span class="rr-hash mono">{{ shortHash(r.recipient_hash) }}</span>
              <span class="rr-outcome" :class="worstOutcome(r).tone">{{ worstOutcome(r).label }}</span>
              <span v-if="r.repeat_click_count > 1" class="rr-repeat">{{ r.repeat_click_count }}× CLICKED ACROSS CAMPAIGNS</span>
              <span v-if="r.training_status" class="rr-training" :class="r.training_status">
                {{ r.training_status === 'completed' ? 'TRAINING DONE' : 'TRAINING ASSIGNED' }}
              </span>
              <span class="rr-count">{{ r.campaigns.length }} campaign{{ r.campaigns.length === 1 ? '' : 's' }}</span>
              <span class="rr-open">Open ›</span>
            </div>
          </div>
        </div>

        <div v-if="selected.size > 0" class="retarget-bar">
          <span>{{ selected.size }} recipient{{ selected.size === 1 ? '' : 's' }} selected</span>
          <div class="ghost-btn" @click="selected.clear()">Clear</div>
          <div class="mini-btn primary" @click="openRetargetPreview">Re-target selected →</div>
        </div>
      </template>
    </template>

    <div v-if="previewModal" class="overlay" @click.self="previewModal = null">
      <div class="preview-modal">
        <PhishingEmailPreview
          mode="draft" :subject="previewModal.subject" :body-html="previewModal.bodyHtml"
          :to-label="previewModal.toLabel" title="Review before re-targeting"
          footer-note="This is exactly what will send if you approve — nothing is regenerated after this point."
          from-label="Sentinel"
        />
        <p v-if="retargetError" class="error-inline">{{ retargetError }}</p>
        <div class="preview-launch-actions">
          <div class="ghost-btn" @click="previewModal = null">Cancel</div>
          <div class="mini-btn primary" @click="confirmRetarget">
            {{ retargeting ? 'Launching…' : `Approve & send to ${selected.size}` }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'
import { worstOutcome, shortHash } from '@/data/phishingOutcomes'
import { useAuthStore } from '@/stores/auth'
import PhishingEmailPreview from '@/components/phishing/PhishingEmailPreview.vue'

const route = useRoute()
const panels = usePanelStore()
const auth = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const recipients = ref<any[]>([])
const targetListLabel = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const engagementId = route.params.engagementId as string
    recipients.value = await api.phishingEngagementRecipients(engagementId)

    try {
      const [engagements, lists] = await Promise.all([api.engagements(), api.phishingTargetLists()])
      const engagement = engagements.find((e: any) => e.id === engagementId)
      const tl = engagement ? lists.find((l: any) => l.id === engagement.scope?.target_list_id) : null
      targetListLabel.value = tl ? `${tl.name} · ${tl.entries.length} recipients tracked` : 'Simulation'
    } catch { targetListLabel.value = 'Simulation' }
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load recipients'
  } finally {
    loading.value = false
  }
}

function openRecipient(index: number) {
  panels.push({
    type: 'phishing-recipient',
    title: shortHash(recipients.value[index].recipient_hash),
    data: { recipients: recipients.value, index, isAdmin: auth.role === 'admin' },
  })
}

// Re-targeting (Phishing Simulation roadmap Phase 15) — the "Individual"
// audience path. Operates purely on recipient_hash, same as everything
// else on this page, so it needs no unmask/admin gate of its own; only
// viewing someone's real identity (inside the drill-down panel above)
// does.
const selected = ref<Set<string>>(new Set())
function toggleSelected(hash: string) {
  if (selected.value.has(hash)) selected.value.delete(hash)
  else selected.value.add(hash)
}

const previewModal = ref<{ subject: string; bodyHtml: string; toLabel: string; llmGenerated: boolean; dmarcContext: string | null } | null>(null)
const retargeting = ref(false)
const retargetError = ref('')

async function openRetargetPreview() {
  retargetError.value = ''
  try {
    const engagementId = route.params.engagementId as string
    const preview = await api.phishingContentPreview(engagementId)
    previewModal.value = {
      subject: preview.subject, bodyHtml: preview.body_html,
      toLabel: `${selected.value.size} individually selected recipient${selected.value.size === 1 ? '' : 's'}`,
      llmGenerated: preview.llm_generated, dmarcContext: preview.dmarc_context ?? null,
    }
  } catch (e: any) {
    retargetError.value = e.message ?? 'Failed to generate a preview'
  }
}

async function confirmRetarget() {
  if (!previewModal.value) return
  retargeting.value = true
  retargetError.value = ''
  try {
    const engagementId = route.params.engagementId as string
    await api.launchPhishingCampaign(
      engagementId,
      {
        subject: previewModal.value.subject, body_html: previewModal.value.bodyHtml,
        llm_generated: previewModal.value.llmGenerated, dmarc_context: previewModal.value.dmarcContext,
      },
      { audience_type: 'individual', recipient_hashes: [...selected.value] },
    )
    previewModal.value = null
    selected.value = new Set()
    await load()
  } catch (e: any) {
    retargetError.value = e.message ?? 'Failed to launch — the selection may no longer match the target list'
  } finally {
    retargeting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.recipients-view { display: flex; flex-direction: column; gap: 14px; max-width: 1000px; }
.page-title { font-size: 22px; font-weight: 700; margin: 0; }
.page-sub { font-size: 12.5px; color: var(--text2); margin: -8px 0 0; }
.loading, .error-block, .empty { font-size: 13px; color: var(--text2); padding: 20px 0; }
.error-block { color: var(--red); }

.recipients-table { display: flex; flex-direction: column; gap: 6px; }
.recipient-row { display: flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.rr-check { margin-left: 14px; flex-shrink: 0; cursor: pointer; }
.rr-main { flex: 1; display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer; flex-wrap: wrap; min-width: 0; }
.rr-main:hover { background: var(--surface2); }

.retarget-bar {
  position: sticky; bottom: 12px; display: flex; align-items: center; gap: 12px; margin-top: 4px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px;
  font-size: 12.5px; color: var(--text2); box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.retarget-bar .mini-btn { margin-left: auto; }
.mini-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 11px; font-weight: 600; padding: 6px 11px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
.mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.mini-btn.primary { background: var(--amber); color: var(--bg); border-color: var(--amber); }
.ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 11px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
.ghost-btn:hover { border-color: var(--text3); color: var(--text); }

.overlay { position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.preview-modal { width: 700px; max-width: 92vw; max-height: 88vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.preview-launch-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.error-inline { color: var(--red); font-size: 12px; margin: 10px 0 0; }
.rr-hash { font-size: 12px; color: var(--text2); flex-shrink: 0; }
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
.rr-main:hover .rr-open { color: var(--accent); }
</style>
