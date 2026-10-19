<template>
  <div class="training-page">
    <!-- List mode -->
    <template v-if="!editing">
      <div class="head-row">
        <div>
          <h1 class="title">Training Courses</h1>
          <p class="subtitle">Real, multi-module security training — assignable on its own, or automatically after a real phishing failure.</p>
        </div>
        <div class="head-actions">
          <RouterLink :to="{ name: 'phishing-dashboard' }" class="link-btn">Completion & assignment stats →</RouterLink>
          <div class="primary-btn" @click="startNew">+ New course</div>
        </div>
      </div>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <div v-if="!loading && courses.length === 0" class="empty">No courses yet — create one to start assigning real training.</div>
      <div class="course-grid">
        <div v-for="c in courses" :key="c.id" class="course-card">
          <div class="cc-clickarea" @click="openPreview(c)">
            <span class="cc-cat">{{ c.category }}</span>
            <span class="cc-title">{{ c.title }}</span>
            <p class="cc-desc">{{ c.description || 'No description.' }}</p>
            <span class="cc-modules">{{ c.modules.length }} module{{ c.modules.length === 1 ? '' : 's' }}</span>
          </div>
          <div class="cc-actions">
            <div class="ghost-btn small" @click="openPreview(c)">Preview</div>
            <div class="ghost-btn small" @click="openCourse(c)">Edit</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Editor mode -->
    <template v-else>
      <div class="head-row">
        <h1 class="title">{{ isNew ? 'Create Course' : 'Edit Course' }}</h1>
        <div class="head-actions">
          <div class="ghost-btn" @click="editing = false">Cancel</div>
          <div class="primary-btn" :class="{ disabled: !canSave }" @click="canSave && save()">{{ saving ? 'Saving…' : 'Save' }}</div>
        </div>
      </div>
      <p v-if="saveError" class="error">{{ saveError }}</p>

      <div class="field">
        <span class="label">Title</span>
        <input v-model="form.title" class="input" placeholder="e.g. Phishing Awareness Basics" />
      </div>
      <div class="two-col">
        <div class="field">
          <span class="label">Category</span>
          <input v-model="form.category" class="input" placeholder="General" />
        </div>
        <div class="field">
          <span class="label">Description</span>
          <input v-model="form.description" class="input" placeholder="One line describing this course" />
        </div>
      </div>

      <div class="field">
        <span class="label">Modules</span>
        <div v-if="form.modules.length === 0" class="empty small">No modules yet — add one below.</div>
        <div v-for="(m, i) in form.modules" :key="m._key" class="module-row">
          <div class="module-row-head">
            <select v-model="m.format" class="input select-styled small">
              <option value="article">Article</option>
              <option value="video_embed">Video (external link)</option>
              <option value="survey">Culture survey (fixed questions)</option>
            </select>
            <input v-model="m.title" class="input small" placeholder="Module title" />
            <input v-model.number="m.duration_minutes" type="number" min="1" class="input small duration" placeholder="min" />
            <div class="module-actions">
              <button type="button" class="mini-icon-btn" :disabled="i === 0" @click="moveModule(i, -1)">↑</button>
              <button type="button" class="mini-icon-btn" :disabled="i === form.modules.length - 1" @click="moveModule(i, 1)">↓</button>
              <button type="button" class="mini-icon-btn danger" @click="removeModule(i)">✕</button>
            </div>
          </div>
          <textarea
            v-if="m.format === 'article'" v-model="m.content" class="input code-area small"
            placeholder="<p>Article HTML — include {click_url}-style content isn't needed here, this is training content, not a lure.</p>"
          ></textarea>
          <input v-else-if="m.format === 'video_embed'" v-model="m.content" class="input" placeholder="https://... (Loom, YouTube, etc.)" />
          <p v-else class="signals-note">Fixed questions — see the module docstring. Never admin-authored free text, and answers are aggregate-only, never shown per recipient.</p>
        </div>
        <div class="ghost-btn" @click="addModule">+ Add module</div>
      </div>

      <!-- Assignment + roster, only for an already-saved course -->
      <template v-if="!isNew">
        <div class="card">
          <div class="header-row"><h2>Assign to an audience</h2></div>
          <div class="assign-row">
            <div class="select-wrap">
              <select v-model="assignTargetListId" class="input select-styled">
                <option value="" disabled>Choose a target list</option>
                <option v-for="tl in targetLists" :key="tl.id" :value="tl.id">{{ tl.name }} — {{ tl.entries.length }} real inboxes</option>
              </select>
              <span class="select-chevron">⌄</span>
            </div>
            <div class="toggle-mini">
              <button type="button" class="toggle-btn small" :class="{ active: assignAudienceType === 'everyone' }" @click="assignAudienceType = 'everyone'">Everyone</button>
              <button
                type="button" class="toggle-btn small" :disabled="!assignDepartments.length"
                :class="{ active: assignAudienceType === 'department' }" @click="assignAudienceType = 'department'; assignDepartment = assignDepartment || assignDepartments[0]"
              >Department</button>
            </div>
            <div v-if="assignAudienceType === 'department' && assignDepartments.length" class="select-wrap">
              <select v-model="assignDepartment" class="input select-styled">
                <option v-for="d in assignDepartments" :key="d" :value="d">{{ d }}</option>
              </select>
              <span class="select-chevron">⌄</span>
            </div>
            <div class="mini-btn primary" :class="{ disabled: !assignTargetListId || assigning }" @click="assignTargetListId && assign()">
              {{ assigning ? '…' : 'Assign' }}
            </div>
          </div>
          <p v-if="assignError" class="error">{{ assignError }}</p>
          <p v-if="assignResult" class="hint">{{ assignResult }}</p>
        </div>

        <div class="card">
          <div class="header-row">
            <h2>Assignments</h2>
            <a :href="exportUrl" class="link-btn">Export CSV →</a>
          </div>
          <div v-if="assignmentsLoading" class="empty small">Loading…</div>
          <div v-else-if="assignments.length === 0" class="empty small">Nobody assigned yet.</div>
          <div v-for="a in assignments" :key="a.id" class="assignment-row">
            <span class="ar-hash mono">{{ a.recipient_hash.slice(0, 12) }}…</span>
            <span class="status-pill" :style="a.status === 'completed' ? completedStyle : assignedStyle">{{ a.status }}</span>
            <span class="ar-progress">{{ a.modules_completed }} / {{ a.modules_total }} modules</span>
            <span class="ar-source">{{ a.source === 'phishing_failure' ? 'auto (failed sim)' : 'assigned' }}</span>
          </div>
        </div>
      </template>
    </template>

    <PhishingCoursePreview v-if="previewingCourse" :course="previewingCourse" @close="closePreview" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import PhishingCoursePreview from '@/components/phishing/PhishingCoursePreview.vue'

const courses = ref<any[]>([])
const loading = ref(false)
const loadError = ref('')
async function loadCourses() {
  loading.value = true
  try { courses.value = await api.trainingCourses() }
  catch (e: any) { loadError.value = e.message ?? 'Failed to load courses' }
  finally { loading.value = false }
}

const targetLists = ref<any[]>([])
async function loadTargetLists() {
  try { targetLists.value = await api.phishingTargetLists() } catch { /* assign section just stays empty */ }
}

// ── Preview ──────────────────────────────────────────────────────────────
const previewingCourse = ref<any | null>(null)
function openPreview(c: any) { previewingCourse.value = c }
function closePreview() { previewingCourse.value = null }

// ── Editor state ─────────────────────────────────────────────────────────
const editing = ref(false)
const isNew = ref(true)
const editingId = ref<string | null>(null)
const saving = ref(false)
const saveError = ref('')
let moduleKeySeq = 0

function blankForm() {
  return { title: '', description: '', category: 'General', modules: [] as any[] }
}
const form = ref(blankForm())

function startNew() {
  form.value = blankForm()
  isNew.value = true
  editingId.value = null
  saveError.value = ''
  editing.value = true
}

function openCourse(c: any) {
  form.value = {
    title: c.title, description: c.description || '', category: c.category,
    modules: c.modules.map((m: any) => ({ ...m, _key: moduleKeySeq++ })),
  }
  isNew.value = false
  editingId.value = c.id
  saveError.value = ''
  editing.value = true
  loadAssignments(c.id)
}

function addModule() {
  form.value.modules.push({ _key: moduleKeySeq++, format: 'article', title: '', content: '', duration_minutes: 3 })
}
function removeModule(i: number) {
  form.value.modules.splice(i, 1)
}
function moveModule(i: number, dir: 1 | -1) {
  const j = i + dir
  if (j < 0 || j >= form.value.modules.length) return
  const arr = form.value.modules
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

const canSave = computed(() => form.value.title.trim() && form.value.modules.every((m: any) => m.title.trim() && (m.format === 'survey' || m.content?.trim())))

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    if (isNew.value) {
      const payload = {
        title: form.value.title, description: form.value.description || undefined, category: form.value.category,
        modules: form.value.modules.map((m: any) => ({ format: m.format, title: m.title, content: m.content || undefined, duration_minutes: m.duration_minutes || undefined })),
      }
      const created = await api.createTrainingCourse(payload)
      editingId.value = created.id
      isNew.value = false
    } else {
      await api.updateTrainingCourse(editingId.value!, {
        title: form.value.title, description: form.value.description || undefined, category: form.value.category,
      })
      // Modules: reconcile by diffing against what's already saved —
      // existing rows (real ids) just get their order persisted; new rows
      // (no real id yet) get created. Editing an existing module's title/
      // content in place isn't wired yet — delete and re-add instead, a
      // deliberate v1 scope trim.
      const existingIds: string[] = []
      for (const m of form.value.modules) {
        if (m.id) {
          existingIds.push(m.id)
        } else {
          const created = await api.addTrainingCourseModule(editingId.value!, {
            format: m.format, title: m.title, content: m.content || undefined, duration_minutes: m.duration_minutes || undefined,
          })
          m.id = created.id
          existingIds.push(created.id)
        }
      }
      await api.reorderTrainingCourseModules(editingId.value!, existingIds)
    }
    await loadCourses()
    editing.value = false
  } catch (e: any) {
    saveError.value = e.message ?? 'Failed to save course'
  } finally {
    saving.value = false
  }
}

// ── Assignment ───────────────────────────────────────────────────────────
const assignTargetListId = ref('')
const assignAudienceType = ref<'everyone' | 'department'>('everyone')
const assignDepartment = ref('')
const assigning = ref(false)
const assignError = ref('')
const assignResult = ref('')

const assignDepartments = computed(() => {
  const tl = targetLists.value.find((t: any) => t.id === assignTargetListId.value)
  const entries = tl?.entries ?? []
  return [...new Set(entries.map((e: any) => e.department).filter(Boolean))] as string[]
})

async function assign() {
  assigning.value = true
  assignError.value = ''
  assignResult.value = ''
  try {
    const result = await api.assignTrainingCourse(
      editingId.value!, assignTargetListId.value, assignAudienceType.value,
      assignAudienceType.value === 'department' ? assignDepartment.value : undefined,
    )
    assignResult.value = `${result.newly_assigned} newly assigned, ${result.already_assigned} already had it.`
    await loadAssignments(editingId.value!)
  } catch (e: any) {
    assignError.value = e.message ?? 'Failed to assign course'
  } finally {
    assigning.value = false
  }
}

const assignments = ref<any[]>([])
const assignmentsLoading = ref(false)
async function loadAssignments(courseId: string) {
  assignmentsLoading.value = true
  try { assignments.value = await api.trainingCourseAssignments(courseId) }
  catch { assignments.value = [] }
  finally { assignmentsLoading.value = false }
}
const exportUrl = computed(() => editingId.value ? `/api/training-courses/${editingId.value}/assignments/export.csv` : '')

const assignedStyle = { color: 'var(--text2)', background: 'var(--surface2)' }
const completedStyle = { color: '#34e0a1', background: 'color-mix(in srgb, #34e0a1 14%, transparent)' }

onMounted(() => {
  loadCourses()
  loadTargetLists()
})
</script>

<style scoped>
.training-page { display: flex; flex-direction: column; gap: 16px; max-width: 860px; }
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.head-actions { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.head-actions { display: flex; gap: 8px; }
.title { margin: 0 0 4px; font-size: 24px; font-weight: 700; }
.subtitle { margin: 0; color: var(--text2); font-size: 13px; }
.error { color: var(--red); font-size: 12px; margin: 4px 0; }
.hint { color: var(--text2); font-size: 12.5px; margin: 6px 0 0; }
.empty { color: var(--text2); font-size: 13px; padding: 10px 0; }
.empty.small { font-size: 12px; padding: 6px 0; }

.primary-btn { background: var(--accent); color: #0b0d12; font-size: 12.5px; font-weight: 600; padding: 7px 14px; border-radius: 7px; cursor: pointer; }
.primary-btn.disabled { opacity: .5; cursor: default; }
.ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 12px; padding: 6px 12px; border-radius: 7px; cursor: pointer; width: fit-content; }
.ghost-btn:hover { border-color: var(--text3); color: var(--text); }
.link-btn { color: var(--accent); font-size: 12px; text-decoration: none; }

.course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.course-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.course-card:hover { border-color: var(--accent); }
.cc-clickarea { cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.cc-cat { font-family: var(--font-label); font-size: 9px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--accent); }
.cc-title { font-size: 14px; font-weight: 600; }
.cc-desc { margin: 2px 0; font-size: 12px; color: var(--text2); line-height: 1.4; }
.cc-modules { font-size: 11px; color: var(--text3); }
.cc-actions { display: flex; gap: 6px; margin-top: 8px; }
.ghost-btn.small { padding: 4px 9px; font-size: 11px; }

.field { margin-bottom: 14px; }
.label { display: block; font-family: var(--font-label); font-size: 10px; letter-spacing: .03em; color: var(--text3); text-transform: uppercase; margin-bottom: 6px; }
.two-col { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; }
.input { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; color: var(--text); font-size: 13px; width: 100%; }
.input:focus { outline: none; border-color: var(--accent); }
.input.small { font-size: 12px; padding: 6px 9px; }
.code-area { min-height: 90px; font-family: var(--font-mono); font-size: 11.5px; resize: vertical; line-height: 1.5; }
.select-styled { appearance: none; }
.duration { width: 64px; flex-shrink: 0; }

.module-row { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; }
.module-row-head { display: flex; gap: 8px; align-items: center; }
.module-row-head .select-styled { width: 150px; flex-shrink: 0; }
.module-actions { display: flex; gap: 4px; flex-shrink: 0; }
.mini-icon-btn { width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border); background: var(--surface2); color: var(--text2); cursor: pointer; font-size: 11px; }
.mini-icon-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.mini-icon-btn:disabled { opacity: .35; cursor: default; }
.mini-icon-btn.danger:hover { border-color: var(--red); color: var(--red); }
.signals-note { font-size: 11.5px; color: var(--text3); line-height: 1.5; margin: 0; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.header-row h2 { margin: 0; font-size: 14.5px; }
.assign-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.select-wrap { position: relative; flex: 1; min-width: 160px; }
.select-chevron { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 11px; pointer-events: none; }
.toggle-mini { display: flex; gap: 4px; }
.toggle-btn.small { background: var(--surface2); border: 1px solid var(--border); color: var(--text2); font-size: 11.5px; padding: 7px 12px; border-radius: 7px; cursor: pointer; }
.toggle-btn.small.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.toggle-btn.small:disabled { opacity: .4; cursor: default; }
.mini-btn { font-size: 12px; padding: 7px 14px; border-radius: 7px; cursor: pointer; }
.mini-btn.primary { background: var(--accent); color: #0b0d12; font-weight: 600; }
.mini-btn.disabled { opacity: .5; cursor: default; }

.assignment-row { display: flex; align-items: center; gap: 14px; padding: 9px 0; border-top: 1px solid var(--border); font-size: 12.5px; }
.assignment-row:first-of-type { border-top: none; }
.ar-hash { color: var(--text3); width: 110px; }
.ar-progress { color: var(--text2); }
.ar-source { color: var(--text3); font-size: 11.5px; margin-left: auto; }
.mono { font-family: var(--font-mono); }
.status-pill { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; text-transform: capitalize; }
</style>
