<template>
  <div class="phishing-campaign-evidence">
    <div class="block">
      <div class="block-label">Sent</div>
      <div class="block-text">{{ formatDate(data.launched_at) }} — template <span class="mono">{{ data.template_id }}</span></div>
      <div v-if="data.llm_generated" class="llm-note">AI-generated content, fresh for this send — not the static template library.</div>
    </div>

    <div v-if="data.subject_sent" class="block">
      <div class="block-label">Subject line</div>
      <div class="block-text subject">"{{ data.subject_sent }}"</div>
    </div>

    <div v-if="data.dmarc_context" class="block">
      <div class="block-label">DMARC posture used to write this</div>
      <div class="block-text">{{ data.dmarc_context }}</div>
    </div>

    <div class="block">
      <div class="block-label">Results</div>
      <div v-if="loadingCounts" class="block-text muted">Loading…</div>
      <div v-else class="stat-row">
        <div class="stat"><div class="stat-val">{{ counts.sent ?? 0 }}</div><div class="stat-lbl">Sent</div></div>
        <div class="stat"><div class="stat-val">{{ counts.opened ?? 0 }}</div><div class="stat-lbl">Opened</div></div>
        <div class="stat"><div class="stat-val">{{ counts.clicked ?? 0 }}</div><div class="stat-lbl">Clicked</div></div>
        <div class="stat crit"><div class="stat-val">{{ counts.credential_entered ?? 0 }}</div><div class="stat-lbl">Entered creds</div></div>
      </div>
    </div>

    <div class="block">
      <div class="block-label">Recipients ({{ recipients.length }})</div>
      <p v-if="!isAdmin" class="muted small">Only a tenant admin can reveal a recipient's identity.</p>
      <div v-if="loadingRecipients" class="block-text muted">Loading…</div>
      <div v-else-if="recipients.length === 0" class="block-text muted">No recipient activity recorded for this campaign yet.</div>
      <div v-else class="recipient-list">
        <div v-for="r in recipients" :key="r.recipient_hash" class="recipient-block">
          <div class="recipient-row" @click="toggleRecipient(r.recipient_hash)">
            <span class="chevron" :class="{ open: expanded === r.recipient_hash }">▸</span>
            <span class="mono hash">{{ r.recipient_hash.slice(0, 12) }}…</span>
            <span class="badges">
              <span v-for="t in r.event_types" :key="t" class="badge" :class="{ crit: t === 'credential_entered' }">{{ t }}</span>
            </span>
            <span v-if="unmasked[r.recipient_hash]" class="unmasked">{{ unmasked[r.recipient_hash] }}</span>
            <div v-else-if="isAdmin" class="unmask-btn" @click.stop="unmask(r.recipient_hash)">
              {{ unmasking === r.recipient_hash ? 'Unmasking…' : 'Unmask' }}
            </div>
          </div>
          <div v-if="expanded === r.recipient_hash" class="event-list">
            <div v-for="(e, i) in r.events" :key="i" class="event-row">
              <span class="badge" :class="{ crit: e.event_type === 'credential_entered' }">{{ e.event_type }}</span>
              <span class="event-text">{{ formatDate(e.occurred_at) }}</span>
              <span v-if="e.ip_address" class="event-text mono">{{ e.ip_address }}</span>
              <span v-if="e.destination_url" class="event-text mono">{{ e.destination_url }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ data: any }>()
const auth = useAuthStore()
const isAdmin = computed(() => auth.role === 'admin')

const counts = ref<Record<string, number>>({})
const loadingCounts = ref(true)
const recipients = ref<any[]>([])
const loadingRecipients = ref(true)
const expanded = ref<string | null>(null)
const unmasked = ref<Record<string, string>>({})
const unmasking = ref<string | null>(null)

function toggleRecipient(hash: string) {
  expanded.value = expanded.value === hash ? null : hash
}

async function unmask(recipientHash: string) {
  unmasking.value = recipientHash
  try {
    const identity = await api.unmaskPhishingRecipient(props.data.id, recipientHash)
    unmasked.value[recipientHash] = identity.display_name ? `${identity.email} (${identity.display_name})` : identity.email
  } catch {
    unmasked.value[recipientHash] = '(could not resolve — list may have changed)'
  } finally {
    unmasking.value = null
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

onMounted(async () => {
  try {
    counts.value = await api.phishingCampaignEvents(props.data.id)
  } catch {
    counts.value = {}
  } finally {
    loadingCounts.value = false
  }
  try {
    recipients.value = await api.phishingCampaignEventsByRecipient(props.data.id)
  } catch {
    recipients.value = []
  } finally {
    loadingRecipients.value = false
  }
})
</script>

<style scoped>
.phishing-campaign-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }
.block-text.subject { font-style: italic; }
.muted { color: var(--text2); }
.muted.small { font-size: 11.5px; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; }
.llm-note { font-size: 11.5px; color: var(--accent); }

.stat-row { display: flex; gap: 10px; flex-wrap: wrap; }
.stat { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; flex: 1 1 70px; }
.stat.crit { border-color: color-mix(in srgb, var(--red) 40%, transparent); }
.stat-val { font-size: 17px; font-weight: 700; }
.stat.crit .stat-val { color: var(--red); }
.stat-lbl { font-size: 10px; color: var(--text2); text-transform: uppercase; letter-spacing: .03em; margin-top: 2px; }

.recipient-list { display: flex; flex-direction: column; gap: 6px; }
.recipient-block { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.recipient-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; flex-wrap: wrap; }
.chevron { font-size: 10px; color: var(--text3); transition: transform .15s; flex-shrink: 0; }
.chevron.open { transform: rotate(90deg); }
.hash { color: var(--text2); }
.badges { display: flex; gap: 4px; flex-wrap: wrap; }
.badge {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; padding: 2px 7px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--border); color: var(--text2); font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
.badge.crit { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); background: color-mix(in srgb, var(--red) 10%, transparent); }
.unmasked { font-size: 11px; font-family: 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); margin-left: auto; }
.unmask-btn {
  font-size: 11px; font-weight: 700; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid var(--accent); border-radius: 6px; padding: 3px 9px; margin-left: auto; white-space: nowrap;
}
.event-list { display: flex; flex-direction: column; gap: 4px; padding: 0 10px 10px 28px; }
.event-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.event-text { font-size: 11.5px; color: var(--text2); }
</style>
