<template>
  <div class="recipient-evidence">
    <div v-if="data.recipients && data.recipients.length > 1" class="pager">
      <button class="pager-btn" :disabled="data.index <= 0" @click="go(-1)">‹ Prev</button>
      <span class="pager-pos">{{ data.index + 1 }} of {{ data.recipients.length }}</span>
      <button class="pager-btn" :disabled="data.index >= data.recipients.length - 1" @click="go(1)">Next ›</button>
    </div>

    <div class="block">
      <div class="block-label">Recipient</div>
      <div class="rr-hash mono">{{ shortHash(current.recipient_hash) }}</div>
      <div class="rr-badges">
        <span class="rr-outcome" :class="outcome.tone">{{ outcome.label }}</span>
        <span v-if="current.training_status" class="rr-training" :class="current.training_status">
          {{ current.training_status === 'completed' ? 'TRAINING DONE' : 'TRAINING ASSIGNED' }}
        </span>
      </div>
    </div>

    <div v-if="isCrossCampaign" class="block">
      <div class="block-label">Campaigns ({{ current.campaigns.length }})</div>
      <p v-if="current.repeat_click_count > 1" class="dwell-note">Clicked on {{ current.repeat_click_count }} separate campaigns on this engagement.</p>
      <div class="campaign-list">
        <div v-for="c in current.campaigns" :key="c.campaign_id" class="campaign-row">
          <span class="event-text mono">{{ formatDate(c.launched_at) }}</span>
          <span v-for="t in c.event_types" :key="t" class="event-tag" :class="eventTone(t)">{{ t }}</span>
        </div>
      </div>
    </div>

    <div v-else class="block">
      <div class="block-label">Event timeline</div>
      <p v-if="typeof current.dwell_seconds === 'number'" class="dwell-note">
        {{ formatDwell(current.dwell_seconds) }} between opening the email and acting on it.
      </p>
      <div class="event-list">
        <div v-for="(e, i) in current.events" :key="i" class="event-row">
          <span class="event-tag" :class="eventTone(e.event_type)">{{ e.event_type }}</span>
          <span class="event-text mono">{{ formatDate(e.occurred_at) }}</span>
          <span v-if="e.ip_address" class="event-text mono">{{ e.ip_address }}</span>
          <span v-if="e.destination_url" class="event-text mono trunc">{{ e.destination_url }}</span>
        </div>
        <p v-if="!current.events || current.events.length === 0" class="block-text muted">No events recorded.</p>
      </div>
    </div>

    <div class="block">
      <div class="block-label">Identity</div>
      <div v-if="!data.isAdmin" class="block-text muted">Only a tenant admin can reveal a recipient's identity.</div>
      <template v-else-if="unmaskResult">
        <div class="block-text">{{ unmaskResult.email }}<template v-if="unmaskResult.display_name"> ({{ unmaskResult.display_name }})</template></div>

        <div class="priv-check">
          <div class="priv-check-head">Cloud privilege check</div>
          <template v-if="!unmaskResult.open_privesc_paths || unmaskResult.open_privesc_paths.length === 0">
            <p class="priv-empty">
              <template v-if="unmaskResult.cloud_identity_provenance">
                AWS identity resolved ({{ provenanceLabel(unmaskResult.cloud_identity_provenance) }}) — no open escalation paths for it.
              </template>
              <template v-else>No cloud identity resolved for this person.</template>
            </p>
          </template>
          <template v-else>
            <div class="priv-provenance">Matched via {{ provenanceLabel(unmaskResult.cloud_identity_provenance) }}</div>
            <div v-for="p in unmaskResult.open_privesc_paths" :key="p.id" class="priv-path">
              <span class="sev-pill" :style="pillStyle(severityColor(p.severity))">{{ p.severity }}</span>
              <span class="priv-arn mono trunc">{{ p.source_principal_arn }} → {{ p.target_principal_arn }}</span>
            </div>
            <RouterLink :to="{ name: 'graph' }" class="priv-graph-link">View in Simulation Engine →</RouterLink>
          </template>
        </div>
      </template>
      <div v-else class="unmask-row">
        <button class="unmask-btn" :disabled="unmasking" @click="unmask">{{ unmasking ? 'Unmasking…' : 'Unmask' }}</button>
        <p v-if="unmaskError" class="block-text muted">{{ unmaskError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { usePanelStore } from '@/stores/panels'
import { severityColor, pillStyle } from '@/data/colors'
import { worstOutcome, eventTone, shortHash, provenanceLabel, formatDwell } from '@/data/phishingOutcomes'

// campaignId is given directly for a single-campaign drill-down (Phase
// 11); the cross-campaign People view (Phase 13) omits it since one
// recipient row spans many campaigns — any campaign on the engagement
// resolves the same identity (unmask only ever needs the shared target
// list, never the specific campaign), so the most recent one is used.
const props = defineProps<{ data: { recipients: any[]; index: number; campaignId?: string; isAdmin: boolean } }>()
const panels = usePanelStore()

const current = computed(() => props.data.recipients[props.data.index])
const outcome = computed(() => worstOutcome(current.value))
const isCrossCampaign = computed(() => Array.isArray(current.value?.campaigns))
const effectiveCampaignId = computed(() => {
  if (props.data.campaignId) return props.data.campaignId
  const campaigns = current.value?.campaigns
  return campaigns && campaigns.length ? campaigns[campaigns.length - 1].campaign_id : null
})

const unmaskResult = ref<any | null>(null)
const unmasking = ref(false)
const unmaskError = ref('')

async function unmask() {
  if (!effectiveCampaignId.value) return
  unmasking.value = true
  unmaskError.value = ''
  try {
    unmaskResult.value = await api.unmaskPhishingRecipient(effectiveCampaignId.value, current.value.recipient_hash)
  } catch {
    unmaskError.value = 'Could not resolve — list may have changed.'
  } finally {
    unmasking.value = false
  }
}

// Paging to a different recipient starts that recipient's identity fresh —
// unmasking one person never carries over and silently reveals the next.
watch(() => props.data.index, () => {
  unmaskResult.value = null
  unmaskError.value = ''
})

function go(delta: number) {
  const nextIndex = props.data.index + delta
  if (nextIndex < 0 || nextIndex >= props.data.recipients.length) return
  panels.updateTop({ ...props.data, index: nextIndex })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.recipient-evidence { display: flex; flex-direction: column; gap: 18px; }

.pager { display: flex; align-items: center; gap: 10px; }
.pager-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.pager-btn:disabled { opacity: .4; cursor: default; }
.pager-pos { font-size: 11px; color: var(--text3); font-family: 'IBM Plex Mono', ui-monospace, monospace; }

.block { display: flex; flex-direction: column; gap: 8px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; }
.muted { color: var(--text2); }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }

.rr-hash { font-size: 13px; color: var(--text); }
.rr-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.rr-outcome, .rr-training {
  font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .03em; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--text2);
}
.rr-outcome.crit { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); background: color-mix(in srgb, var(--red) 10%, transparent); }
.rr-outcome.warn { color: var(--amber); border-color: color-mix(in srgb, var(--amber) 40%, transparent); background: color-mix(in srgb, var(--amber) 10%, transparent); }
.rr-outcome.good { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); background: color-mix(in srgb, var(--green) 10%, transparent); }
.rr-outcome.info { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.rr-training.completed { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }

.dwell-note { font-size: 11.5px; color: var(--text3); line-height: 1.5; margin: 0; }
.event-list { display: flex; flex-direction: column; gap: 6px; }
.campaign-list { display: flex; flex-direction: column; gap: 6px; }
.campaign-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 8px; background: var(--surface2); border-radius: 6px; }
.event-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.event-tag { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; }
.event-tag.crit { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.event-tag.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.event-tag.info { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.event-tag.muted { color: var(--text3); background: var(--surface2); }
.event-tag.good { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.event-text { font-size: 11px; color: var(--text2); }
.event-text.trunc { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.unmask-row { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.unmask-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; }
.unmask-btn:hover { border-color: var(--accent); color: var(--accent); }
.unmask-btn:disabled { opacity: .6; cursor: default; }

.priv-check { margin-top: 4px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface2); display: flex; flex-direction: column; gap: 6px; }
.priv-check-head { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--text3); }
.priv-empty { font-size: 12px; color: var(--text2); margin: 0; }
.priv-provenance { font-size: 11px; color: var(--text3); }
.priv-path { display: flex; align-items: center; gap: 8px; }
.priv-arn { font-size: 11px; color: var(--text2); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.priv-graph-link { font-size: 11px; color: var(--accent); text-decoration: none; align-self: flex-start; }
.priv-graph-link:hover { text-decoration: underline; }
</style>
