<template>
  <div class="lib-page">
    <!-- List mode -->
    <template v-if="!editing">
      <div class="lib-head">
        <div>
          <h1 class="title">Template Library</h1>
          <p class="subtitle">Templates you've written and saved for reuse — separate from the built-in catalog every tenant starts with.</p>
        </div>
        <div class="primary-btn" @click="startNew">+ New template</div>
      </div>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <div v-if="loading" class="empty">Loading…</div>
      <div v-else-if="customTemplates.length === 0" class="empty">No custom templates yet — create one to build a reusable, editable lure.</div>

      <div v-else class="template-list">
        <div v-for="t in customTemplates" :key="t.id" class="lib-row">
          <div class="lib-row-main">
            <div class="lib-row-top">
              <span class="cat-tag">{{ t.category }}</span>
              <span class="diff-tag" :class="`diff-${t.difficulty}`">{{ t.difficulty }}</span>
              <span class="lib-label">{{ t.label }}</span>
            </div>
            <div class="lib-subject">"{{ t.subject }}"</div>
          </div>
          <div class="lib-row-actions">
            <div class="ghost-btn" @click="startEdit(t)">Edit</div>
            <div class="ghost-btn danger" @click="confirmDelete(t)">Delete</div>
          </div>
        </div>
      </div>

      <div class="builtin-section">
        <div class="section-label">Built-in catalog (read-only, {{ builtInTemplates.length }})</div>
        <p class="section-note">The shared starting set every tenant gets — read-only since it's one resource every tenant reads from the same source, not your tenant's own data. "Copy to custom template" below forks one into something you can actually edit and reuse; "Edit subject &amp; body" in the wizard changes one for a single launch only, without saving anything.</p>
        <div class="builtin-grid">
          <div v-for="t in builtInTemplates" :key="t.id" class="builtin-chip">
            <span class="cat-tag">{{ t.category }}</span>
            <span class="lib-label">{{ t.label }}</span>
            <div class="ghost-btn small" @click="copyBuiltIn(t)">Copy to custom template →</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Editor mode -->
    <template v-else>
      <div class="editor-toolbar">
        <div>
          <h1 class="title">{{ isNewTemplate ? 'Create Custom Template' : 'Edit Custom Template' }}</h1>
          <p class="subtitle">Build a template to reuse across campaigns — nothing here sends to a real recipient until it's picked in the wizard.</p>
        </div>
        <div class="toolbar-actions">
          <div class="ghost-btn" @click="editing = false">Cancel</div>
          <div class="secondary-btn" :class="{ disabled: !canSendTest || sendingTest }" @click="sendTest">
            {{ sendingTest ? 'Sending…' : 'Send test email' }}
          </div>
          <div class="primary-btn" :class="{ disabled: !canSave || saving }" @click="save">{{ saving ? 'Saving…' : 'Save' }}</div>
        </div>
      </div>
      <p v-if="testSendResult" class="test-result" :class="testSendResult.ok ? 'ok' : 'fail'">{{ testSendResult.message }}</p>
      <p v-if="saveError" class="error">{{ saveError }}</p>

      <div class="editor-grid">
        <div class="editor-form">
          <div class="field">
            <span class="label">Template title</span>
            <input v-model="form.label" class="input" placeholder="e.g. 401k Information — copy" maxlength="200" />
          </div>
          <div class="field-row">
            <div class="field">
              <span class="label">Category</span>
              <input v-model="form.category" class="input" placeholder="Finance, HR, IT…" maxlength="50" />
            </div>
            <div class="field">
              <span class="label">Difficulty</span>
              <div class="select-wrap">
                <select v-model="form.difficulty" class="input select-styled">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <span class="select-chevron">⌄</span>
              </div>
            </div>
          </div>
          <div class="field">
            <span class="label">Subject</span>
            <input v-model="form.subject" class="input" placeholder="Subject line" maxlength="500" />
          </div>
          <div class="field">
            <div class="body-field-head">
              <span class="label">Email body — include {click_url} where the tracked link should sit, {qr_code} for a scannable QR</span>
              <div class="editor-mode-toggle">
                <button type="button" class="mode-btn" :class="{ active: editorMode === 'visual' }" @click="setEditorMode('visual')">Visual</button>
                <button type="button" class="mode-btn" :class="{ active: editorMode === 'html' }" @click="setEditorMode('html')">HTML</button>
              </div>
            </div>
            <template v-if="editorMode === 'visual'">
              <div class="wysiwyg-toolbar">
                <!-- mousedown.prevent is load-bearing: without it, clicking a
                     toolbar button blurs the contenteditable FIRST (default
                     button focus behavior), collapsing/losing the real text
                     selection before the click handler's execCommand ever
                     runs — the classic contenteditable-toolbar bug. -->
                <button type="button" class="wtb-btn" title="Bold" @mousedown.prevent @click="exec('bold')"><b>B</b></button>
                <button type="button" class="wtb-btn" title="Italic" @mousedown.prevent @click="exec('italic')"><i>I</i></button>
                <button type="button" class="wtb-btn" title="Underline" @mousedown.prevent @click="exec('underline')"><u>U</u></button>
                <button type="button" class="wtb-btn" title="Bulleted list" @mousedown.prevent @click="exec('insertUnorderedList')">• List</button>
                <button type="button" class="wtb-btn" title="Link" @mousedown.prevent @click="insertLink">🔗</button>
                <button type="button" class="wtb-btn wtb-wide" title="Insert the tracked click link" @mousedown.prevent @click="insertTrackedLink">+ Tracked link</button>
                <button type="button" class="wtb-btn wtb-wide" title="Insert a scannable QR code encoding the tracked link" @mousedown.prevent @click="insertQrCode">+ QR code</button>
              </div>
              <div
                ref="bodyEditorRef" class="input code-area wysiwyg-area" contenteditable="true"
                @input="onVisualInput" @blur="onVisualInput"
              ></div>
            </template>
            <textarea v-else v-model="form.body_html" class="input code-area" placeholder="<p>...</p>"></textarea>
          </div>
          <p class="sender-note">Sends from <b>{{ sendingIdentity || '…' }}</b> — every simulated send uses PathProof's own verified identity, never the tenant's domain, so this isn't editable per template.</p>
        </div>

        <div class="editor-preview">
          <PhishingEmailPreview
            mode="draft"
            :subject="form.subject || '(no subject yet)'"
            :body-html="form.body_html || '<p><em>Nothing written yet.</em></p>'"
            :from-label="sendingIdentity || 'PathProof'"
            to-label="Preview only — not a real recipient"
            title="Live preview"
            footer-note="Updates as you type. Use Send test email to see real inbox rendering before saving."
            :show-foot-tag="false"
          />
        </div>
      </div>
    </template>

    <div v-if="deleteTarget" class="overlay" @click.self="deleteTarget = null">
      <div class="confirm-modal">
        <h3>Delete "{{ deleteTarget.label }}"?</h3>
        <p>This removes it from the template library. Campaigns already launched from it keep their own recorded evidence — this only affects future launches.</p>
        <div class="confirm-actions">
          <div class="ghost-btn" @click="deleteTarget = null">Cancel</div>
          <div class="ghost-btn danger" @click="doDelete">Delete</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { api } from '@/api/client'
import PhishingEmailPreview from '@/components/phishing/PhishingEmailPreview.vue'

const customTemplates = ref<any[]>([])
const builtInTemplates = ref<any[]>([])
const loading = ref(false)
const loadError = ref('')
const sendingIdentity = ref('')

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    const [custom, builtIn, meta] = await Promise.all([
      api.phishingCustomTemplates(), api.phishingTemplates(), api.phishingMeta(),
    ])
    customTemplates.value = custom
    builtInTemplates.value = builtIn
    sendingIdentity.value = meta.sending_identity
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load templates'
  } finally { loading.value = false }
}

// ── Editor state ──────────────────────────────────────────────────────
const editing = ref(false)
const isNewTemplate = ref(true)
const editingId = ref<string | null>(null)
const saving = ref(false)
const saveError = ref('')
const sendingTest = ref(false)
const testSendResult = ref<{ ok: boolean; message: string } | null>(null)

function blankForm() {
  return { label: '', category: 'General', subject: '', body_html: '', difficulty: 'medium' }
}
const form = ref(blankForm())

function startNew() {
  form.value = blankForm()
  isNewTemplate.value = true
  editingId.value = null
  saveError.value = ''
  testSendResult.value = null
  editing.value = true
  nextTick(syncVisualFromForm)
}

function startEdit(t: any) {
  form.value = { label: t.label, category: t.category, subject: t.subject, body_html: t.body_html, difficulty: t.difficulty }
  isNewTemplate.value = false
  editingId.value = t.id
  saveError.value = ''
  testSendResult.value = null
  editing.value = true
  nextTick(syncVisualFromForm)
}

// Built-ins are read-only by design — one shared resource every tenant
// reads from the same source, not a per-tenant row, so there's nothing to
// PATCH (see the Template Library's own "fork, don't mutate the shared
// original" note). This is the direct fork action: pre-fills a genuinely
// NEW custom template (isNewTemplate stays true, no editingId) with the
// built-in's real content, saved only once the user hits Save — copying
// never silently creates anything on its own.
function copyBuiltIn(t: any) {
  form.value = { label: `${t.label} (copy)`, category: t.category, subject: t.subject, body_html: t.body_html, difficulty: 'medium' }
  isNewTemplate.value = true
  editingId.value = null
  saveError.value = ''
  testSendResult.value = null
  editing.value = true
  nextTick(syncVisualFromForm)
}

// ── Lightweight WYSIWYG (Phishing Simulation roadmap Phase 23) — a small
// contenteditable + document.execCommand toolbar, not a full rich-text
// library: execCommand is a deprecated browser API, but still broadly
// functional in Chromium, and pulling in a real editor dependency (Tiptap/
// Quill/etc.) for "bold/italic/link on an admin-only template editor" was
// judged more than this feature needs. Raw HTML mode stays available as
// an escape hatch for anything the toolbar can't express. ─────────────────
const editorMode = ref<'visual' | 'html'>('visual')
const bodyEditorRef = ref<HTMLDivElement | null>(null)

function syncVisualFromForm() {
  if (bodyEditorRef.value && bodyEditorRef.value.innerHTML !== form.value.body_html) {
    bodyEditorRef.value.innerHTML = form.value.body_html
  }
}

function setEditorMode(m: 'visual' | 'html') {
  editorMode.value = m
  if (m === 'visual') nextTick(syncVisualFromForm)
}

function onVisualInput() {
  if (bodyEditorRef.value) form.value.body_html = bodyEditorRef.value.innerHTML
}

function exec(cmd: string, value?: string) {
  bodyEditorRef.value?.focus()
  document.execCommand('defaultParagraphSeparator', false, 'p')
  document.execCommand(cmd, false, value)
  onVisualInput()
}

function insertLink() {
  const url = window.prompt('Link URL')
  if (!url) return
  exec('createLink', url)
}

function insertTrackedLink() {
  exec('insertHTML', '<a href="{click_url}">click here</a>')
}

// Phishing Simulation roadmap Phase 27 — {qr_code} is resolved server-side
// at send time in _render_content() (phishing_service.py), the same
// per-recipient substitution {click_url}/{report_url} already get, into a
// real base64 PNG data URI. Nothing to configure beyond dropping the
// placeholder into an <img src>.
function insertQrCode() {
  exec('insertHTML', '<img src="{qr_code}" alt="Scan to continue" width="160" height="160">')
}

const canSave = computed(() => form.value.label.trim() && form.value.subject.trim() && form.value.body_html.trim())
const canSendTest = computed(() => form.value.subject.trim() && form.value.body_html.trim())

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    if (isNewTemplate.value) await api.createPhishingCustomTemplate(form.value)
    else await api.updatePhishingCustomTemplate(editingId.value!, form.value)
    editing.value = false
    await loadAll()
  } catch (e: any) {
    saveError.value = e.message ?? 'Failed to save template'
  } finally { saving.value = false }
}

async function sendTest() {
  if (!canSendTest.value || sendingTest.value) return
  sendingTest.value = true
  testSendResult.value = null
  try {
    await api.sendTestTemplateEmail(form.value.subject, form.value.body_html)
    testSendResult.value = { ok: true, message: 'Sent — check your own inbox. Tracked links are replaced with an inert placeholder, so nothing here counts as a real campaign event.' }
  } catch (e: any) {
    testSendResult.value = { ok: false, message: e.message ?? 'Test send failed' }
  } finally { sendingTest.value = false }
}

const deleteTarget = ref<any | null>(null)
function confirmDelete(t: any) { deleteTarget.value = t }
async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await api.deletePhishingCustomTemplate(deleteTarget.value.id)
    deleteTarget.value = null
    await loadAll()
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to delete template'
    deleteTarget.value = null
  }
}

onMounted(loadAll)
</script>

<style scoped>
.lib-page { display: flex; flex-direction: column; gap: 16px; max-width: 1260px; }

.lib-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.title { margin: 4px 0 4px; font-size: 24px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 13px; max-width: 620px; }
.error { color: var(--red); font-size: 12px; }
.empty { color: var(--text2); font-size: 13px; padding: 10px 0; }

.primary-btn, .secondary-btn, .ghost-btn {
  padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.primary-btn { background: var(--accent); color: var(--bg); }
.primary-btn.disabled { opacity: .5; cursor: default; }
.secondary-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text); }
.secondary-btn.disabled { opacity: .5; cursor: default; }
.ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); }
.ghost-btn:hover { border-color: var(--text3); color: var(--text); }
.ghost-btn.danger { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, var(--border)); }
.ghost-btn.danger:hover { background: color-mix(in srgb, var(--red) 10%, transparent); }
.ghost-btn.small { padding: 5px 9px; font-size: 11px; font-weight: 600; width: fit-content; }

.template-list { display: flex; flex-direction: column; gap: 8px; }
.lib-row {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  background: rgba(19,27,46,0.35); border: 1px solid var(--border); border-radius: 10px; padding: 13px 16px;
}
.lib-row-main { min-width: 0; }
.lib-row-top { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; flex-wrap: wrap; }
.cat-tag { font-family: var(--font-label); font-size: 9px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 2px 7px; border-radius: 4px; }
.diff-tag { font-family: var(--font-label); font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; color: var(--text3); background: var(--surface2); }
.diff-tag.diff-high { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.diff-tag.diff-medium { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
.diff-tag.diff-low { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.lib-label { font-size: 13px; font-weight: 600; }
.lib-subject { font-size: 11.5px; color: var(--text3); font-style: italic; }
.lib-row-actions { display: flex; gap: 8px; flex-shrink: 0; }

.builtin-section { margin-top: 10px; padding-top: 16px; border-top: 1px solid var(--border); }
.section-label { font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: .04em; color: var(--text3); text-transform: uppercase; margin-bottom: 4px; }
.section-note { font-size: 12px; color: var(--text2); margin: 0 0 12px; max-width: 640px; }
.builtin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
/* No longer dimmed (opacity was .8) now that each chip holds a real
   action, not just read-only info — a faded "Copy" button read as
   disabled. */
.builtin-chip { display: flex; flex-direction: column; gap: 6px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; }
.builtin-chip .cat-tag, .builtin-chip .lib-label { opacity: .8; }

.editor-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.toolbar-actions { display: flex; gap: 8px; flex-shrink: 0; }
.test-result { font-size: 12px; padding: 8px 11px; border-radius: 7px; line-height: 1.5; }
.test-result.ok { color: var(--green); background: color-mix(in srgb, var(--green) 10%, transparent); }
.test-result.fail { color: var(--red); background: color-mix(in srgb, var(--red) 10%, transparent); }

/* Preview column widened (Phishing Simulation roadmap — template content
   fill-out pass) so the preview genuinely mimics a real email reading
   pane rather than a cramped 440px-wide snippet. */
.editor-grid { display: grid; grid-template-columns: minmax(320px, 480px) minmax(340px, 600px); gap: 28px; align-items: start; }
@media (max-width: 1230px) { .editor-grid { grid-template-columns: 1fr; } }
.editor-form { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.editor-preview { position: sticky; top: 20px; min-width: 0; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.label { font-family: var(--font-label); font-size: 10px; letter-spacing: .03em; color: var(--text3); text-transform: uppercase; }
.input { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; color: var(--text); font-size: 13px; width: 100%; }
.input:focus { outline: none; border-color: var(--accent); }
.code-area { min-height: 220px; font-family: var(--font-mono); font-size: 12px; resize: vertical; line-height: 1.5; }

.body-field-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.editor-mode-toggle { display: flex; gap: 4px; flex-shrink: 0; }
.mode-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 10.5px; padding: 3px 9px; border-radius: 5px; cursor: pointer; }
.mode-btn.active { border-color: var(--accent); color: var(--accent); }
.wysiwyg-toolbar { display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; }
.wtb-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--text); font-size: 11.5px; width: 28px; height: 26px; border-radius: 5px; cursor: pointer; }
.wtb-btn:hover { border-color: var(--accent); }
.wtb-wide { width: auto; padding: 0 10px; font-size: 10.5px; }
.wysiwyg-area {
  min-height: 220px; font-size: 13px; line-height: 1.6; overflow-y: auto;
}
.wysiwyg-area :deep(a) { color: var(--accent); }
.wysiwyg-area :deep(p) { margin: 0 0 10px; }
.select-wrap { position: relative; }
.select-styled { appearance: none; cursor: pointer; padding-right: 28px; }
.select-chevron { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 11px; pointer-events: none; }
.sender-note { font-size: 11.5px; color: var(--text3); line-height: 1.5; margin: 0; }
.sender-note b { color: var(--text2); font-weight: 600; }

.overlay { position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.confirm-modal { width: 380px; max-width: 90vw; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.confirm-modal h3 { margin: 0 0 8px; font-size: 15px; }
.confirm-modal p { margin: 0 0 16px; font-size: 12.5px; color: var(--text2); line-height: 1.5; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
