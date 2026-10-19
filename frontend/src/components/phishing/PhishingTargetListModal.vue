<template>
  <div class="overlay" @click.self="$emit('cancel')">
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="modal-title">Target list · {{ list ? list.name : 'New list' }}</div>
        </div>
        <div class="head-right">
          <span class="counter">{{ rows.length }} row{{ rows.length === 1 ? '' : 's' }}<template v-if="invalidCount"> · {{ invalidCount }} needs attention</template></span>
          <button class="icon-btn" @click="$emit('cancel')">×</button>
        </div>
      </div>

      <div class="name-row">
        <span class="label">List name</span>
        <input v-model="listName" class="name-input" placeholder="Finance & AP" />
      </div>

      <!-- CSV re-upload + diff review (Phishing Simulation roadmap Phase
           25) — only meaningful once a list actually exists to diff
           against; a brand-new list just gets the CSV as its starting rows. -->
      <div v-if="csvDiff" class="diff-review">
        <div class="diff-summary">
          <span class="diff-chip added">+{{ csvDiff.added.length }} added</span>
          <span class="diff-chip removed">−{{ csvDiff.removed.length }} removed</span>
          <span class="diff-chip changed">{{ csvDiff.changed.length }} changed</span>
          <span class="diff-chip unchanged">{{ csvDiff.unchanged_count }} unchanged</span>
        </div>
        <div class="diff-list">
          <div v-for="e in csvDiff.added" :key="'a-' + e.email" class="diff-row add">+ {{ e.email }}</div>
          <div v-for="e in csvDiff.removed" :key="'r-' + e.email" class="diff-row rem">− {{ e.email }}</div>
          <div v-for="c in csvDiff.changed" :key="'c-' + c.email" class="diff-row chg">
            ~ {{ c.email }} — {{ changedFieldsSummary(c.before, c.after) }}
          </div>
          <p v-if="!csvDiff.added.length && !csvDiff.removed.length && !csvDiff.changed.length" class="hint">No real differences from the current list.</p>
        </div>
        <div class="diff-actions">
          <div class="secondary-btn" @click="cancelCsvDiff">Cancel</div>
          <div class="primary-btn" @click="applyCsvDiff">Apply — replace rows below with this CSV</div>
        </div>
      </div>

      <div class="table-wrap" v-if="!csvDiff">
        <div class="table-head">
          <div>Email</div>
          <div>Display name</div>
          <div>Job title</div>
          <div>Department</div>
          <div></div>
        </div>
        <div v-for="(row, i) in rows" :key="row._key" class="table-row" :class="{ invalid: !!rowError(row) }">
          <div class="row-fields">
            <input v-model="row.email" class="cell" placeholder="jane@company.com" @paste="onPaste($event, i)" />
            <input v-model="row.display_name" class="cell" placeholder="Jane Doe" />
            <input v-model="row.job_title" class="cell" placeholder="AP Approver" />
            <input v-model="row.department" class="cell" placeholder="Finance" />
            <button class="row-del" @click="rows.splice(i, 1)">×</button>
          </div>
          <p v-if="rowError(row)" class="row-error">{{ rowError(row) }}</p>
        </div>
        <button class="add-row" @click="addRow">+ Add recipient</button>
      </div>

      <div v-if="!csvDiff" class="hint-row">
        <div class="hint">Paste a block of <code>email, name, title, department</code> lines into the email field to bulk-add — validated per row.<template v-if="list"> Or re-upload a CSV to review exactly what it would change before applying it.</template></div>
        <div v-if="list" class="ghost-btn small" @click="fileInputRef?.click()">Upload CSV</div>
        <input ref="fileInputRef" type="file" accept=".csv,text/csv" class="hidden-file-input" @change="onCsvFileSelected" />
      </div>
      <p v-if="csvError" class="error">{{ csvError }}</p>
      <p v-if="error" class="error">{{ error }}</p>

      <div class="modal-actions">
        <div class="secondary-btn" @click="$emit('cancel')">Cancel</div>
        <div class="primary-btn" :class="{ disabled: !canSave }" @click="canSave && save()">
          {{ saving ? 'Saving…' : 'Save list' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { api } from '@/api/client'

const props = defineProps<{ list: { id: string; name: string; entries: any[] } | null }>()
const emit = defineEmits<{ cancel: []; save: [name: string, entries: any[]] }>()

let keySeq = 0
function blankRow() {
  return { _key: keySeq++, email: '', display_name: '', job_title: '', department: '' }
}

const listName = ref(props.list?.name ?? '')
const rows = ref<any[]>(
  props.list?.entries?.length
    ? props.list.entries.map((e: any) => ({ _key: keySeq++, email: e.email ?? '', display_name: e.display_name ?? '', job_title: e.job_title ?? '', department: e.department ?? '' }))
    : [blankRow()]
)
const error = ref('')
const saving = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function rowError(row: any): string {
  if (!row.email.trim()) return ''
  return EMAIL_RE.test(row.email.trim()) ? '' : 'Not a valid address — missing @ or a top-level domain'
}

const invalidCount = computed(() => rows.value.filter(r => r.email.trim() && rowError(r)).length)

const canSave = computed(() => {
  const withEmail = rows.value.filter(r => r.email.trim())
  return !saving.value && listName.value.trim().length > 0 && withEmail.length > 0 && invalidCount.value === 0
})

function addRow() {
  rows.value.push(blankRow())
}

function onPaste(ev: ClipboardEvent, index: number) {
  const text = ev.clipboardData?.getData('text') ?? ''
  if (!text.includes('\n') && !text.includes(',')) return // a single plain address — let the browser handle it normally
  ev.preventDefault()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const parsed = lines.map(line => {
    const [email, display_name, job_title, department] = line.split(',').map(s => s.trim())
    return { _key: keySeq++, email: email ?? '', display_name: display_name ?? '', job_title: job_title ?? '', department: department ?? '' }
  })
  if (parsed.length === 0) return
  const target = rows.value[index]
  if (!target.email && !target.display_name && !target.job_title && !target.department) {
    rows.value.splice(index, 1, ...parsed)
  } else {
    rows.value.splice(index + 1, 0, ...parsed)
  }
}

// ── CSV re-upload + diff review (Phishing Simulation roadmap Phase 25) ────
// Same comma-per-line shape as the existing paste parser above, just from
// a File instead of the clipboard, plus an optional leading header row.
function parseCsvText(text: string): { email: string; display_name?: string; job_title?: string; department?: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const firstCell = (lines[0].split(',')[0] ?? '').trim()
  const startIndex = EMAIL_RE.test(firstCell) ? 0 : 1 // skip a header row like "email,name,title,department"
  return lines.slice(startIndex)
    .map(line => {
      const [email, display_name, job_title, department] = line.split(',').map(s => s.trim())
      return { email: email ?? '', display_name: display_name || undefined, job_title: job_title || undefined, department: department || undefined }
    })
    .filter(e => e.email)
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const csvDiff = ref<Awaited<ReturnType<typeof api.diffPhishingTargetList>> | null>(null)
const csvError = ref('')
const pendingCsvEntries = ref<{ email: string; display_name?: string; job_title?: string; department?: string }[]>([])

async function onCsvFileSelected(ev: Event) {
  csvError.value = ''
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const entries = parseCsvText(await file.text())
    if (entries.length === 0) {
      csvError.value = 'No valid rows found in that file.'
      return
    }
    pendingCsvEntries.value = entries
    // Preview-only server call — nothing is written until "Apply", and
    // even then only once the modal's own "Save list" is clicked.
    if (props.list) csvDiff.value = await api.diffPhishingTargetList(props.list.id, entries)
  } catch (e: any) {
    csvError.value = e.message ?? 'Failed to read that file'
  } finally {
    input.value = '' // allow re-selecting the same file again later
  }
}

function cancelCsvDiff() {
  csvDiff.value = null
  pendingCsvEntries.value = []
}

function applyCsvDiff() {
  rows.value = pendingCsvEntries.value.map(e => ({
    _key: keySeq++, email: e.email, display_name: e.display_name ?? '', job_title: e.job_title ?? '', department: e.department ?? '',
  }))
  csvDiff.value = null
  pendingCsvEntries.value = []
}

function changedFieldsSummary(before: any, after: any): string {
  const fields: [string, string][] = [['display_name', 'name'], ['job_title', 'title'], ['department', 'department']]
  const diffs = fields
    .filter(([key]) => (before[key] || '') !== (after[key] || ''))
    .map(([key, label]) => `${label}: ${before[key] || '—'} → ${after[key] || '—'}`)
  return diffs.join(', ') || 'other field changed'
}

function save() {
  saving.value = true
  error.value = ''
  const entries = rows.value
    .filter(r => r.email.trim())
    .map(r => ({
      email: r.email.trim(),
      display_name: r.display_name.trim() || undefined,
      job_title: r.job_title.trim() || undefined,
      department: r.department.trim() || undefined,
    }))
  emit('save', listName.value.trim(), entries)
}

defineExpose({ setSaving: (v: boolean) => { saving.value = v }, setError: (msg: string) => { error.value = msg; saving.value = false } })
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 90; }
.modal {
  width: 680px; max-width: 94vw; max-height: 88vh; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px 24px;
}
.modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.modal-title { font-size: 15px; font-weight: 700; }
.head-right { display: flex; align-items: center; gap: 12px; }
.counter { font-family: var(--font-label); font-size: 11px; color: var(--text2); white-space: nowrap; }
.icon-btn { background: transparent; border: none; color: var(--text2); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 4px; }
.icon-btn:hover { color: var(--text); }

.name-row { margin: 16px 0 14px; display: flex; flex-direction: column; gap: 6px; }
.label { font-family: var(--font-label); font-size: 10px; letter-spacing: .05em; color: var(--text3); text-transform: uppercase; }
.name-input {
  height: 36px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 13px; font-family: var(--font-body);
}
.name-input:focus { outline: none; border-color: var(--accent); }

.table-wrap { display: flex; flex-direction: column; gap: 6px; }
.table-head {
  display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 26px; gap: 8px;
  font-family: var(--font-label); font-size: 9.5px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--text3); padding: 0 4px 4px;
}
.table-row { background: var(--surface2); border: 1px solid var(--border); border-radius: 7px; padding: 6px; }
.table-row.invalid { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface2)); }
.row-fields { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 26px; gap: 8px; align-items: center; }
.cell {
  height: 30px; padding: 0 9px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-size: 12px; font-family: var(--font-body); min-width: 0;
}
.cell:focus { outline: none; border-color: var(--accent); }
.row-del { background: transparent; border: none; color: var(--text3); font-size: 15px; cursor: pointer; width: 26px; height: 26px; }
.row-del:hover { color: var(--red); }
.row-error { font-size: 10.5px; color: var(--red); margin: 4px 2px 0; }
.add-row {
  align-self: flex-start; margin-top: 4px; background: transparent; border: 1px dashed var(--border);
  color: var(--accent); font-size: 12px; font-weight: 600; padding: 7px 14px; border-radius: 7px; cursor: pointer;
}
.add-row:hover { border-color: var(--accent); }

.hint { font-size: 11px; color: var(--text3); margin-top: 12px; line-height: 1.5; }
.hint code { font-family: var(--font-label); }
.error { color: var(--red); font-size: 12px; margin-top: 8px; }

.hint-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hint-row .hint { margin-top: 12px; flex: 1; }
.hidden-file-input { display: none; }
.ghost-btn.small {
  flex-shrink: 0; margin-top: 10px; background: transparent; border: 1px solid var(--border); color: var(--text2);
  font-size: 11.5px; padding: 6px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap;
}
.ghost-btn.small:hover { border-color: var(--accent); color: var(--accent); }

.diff-review { background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; padding: 12px 14px; margin: 4px 0 0; }
.diff-summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.diff-chip { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.diff-chip.added { color: var(--green, #34e0a1); background: color-mix(in srgb, var(--green, #34e0a1) 14%, transparent); }
.diff-chip.removed { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.diff-chip.changed { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.diff-chip.unchanged { color: var(--text3); background: var(--surface); }
.diff-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.diff-row { font-size: 12px; font-family: var(--font-mono); padding: 4px 8px; border-radius: 5px; background: var(--surface); }
.diff-row.add { color: var(--green, #34e0a1); }
.diff-row.rem { color: var(--red); text-decoration: line-through; opacity: .8; }
.diff-row.chg { color: var(--text); }
.diff-actions { display: flex; justify-content: flex-end; gap: 10px; }

.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.primary-btn, .secondary-btn { padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.primary-btn { background: var(--accent); color: var(--bg); }
.primary-btn.disabled { opacity: .5; cursor: default; }
.secondary-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); }
.secondary-btn:hover { color: var(--text); border-color: var(--text3); }
</style>
