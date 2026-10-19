<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="preview-modal">
      <div class="preview-sidebar">
        <div class="ps-head">
          <span class="ps-tag">PREVIEW — nothing here is tracked</span>
          <span class="ps-title">{{ course.title }}</span>
        </div>
        <div class="ps-nav">
          <div class="ps-nav-item" :class="{ active: activeModuleId === null }" @click="showHome">Course home</div>
          <div
            v-for="m in course.modules" :key="m.id" class="ps-nav-item"
            :class="{ active: activeModuleId === m.id }" @click="showModule(m)"
          >{{ m.title }}</div>
        </div>
        <div class="ps-close" @click="$emit('close')">Close preview</div>
      </div>
      <div class="preview-main">
        <div v-if="loading" class="pm-status">Loading…</div>
        <p v-else-if="error" class="pm-status error">{{ error }}</p>
        <iframe v-else class="pm-frame" :srcdoc="currentHtml" sandbox="allow-same-origin" title="Course preview"></iframe>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'

const props = defineProps<{ course: any }>()
defineEmits<{ close: [] }>()

const currentHtml = ref('')
const activeModuleId = ref<string | null>(null)
const loading = ref(false)
const error = ref('')

async function showHome() {
  activeModuleId.value = null
  loading.value = true
  error.value = ''
  try { currentHtml.value = await api.previewTrainingCourseHome(props.course.id) }
  catch (e: any) { error.value = e.message ?? 'Failed to load preview' }
  finally { loading.value = false }
}

async function showModule(m: any) {
  activeModuleId.value = m.id
  loading.value = true
  error.value = ''
  try { currentHtml.value = await api.previewTrainingCourseModule(props.course.id, m.id) }
  catch (e: any) { error.value = e.message ?? 'Failed to load preview' }
  finally { loading.value = false }
}

onMounted(showHome)
</script>

<style scoped>
/* Same overlay convention as PhishingTemplateLibraryView.vue's
   .overlay/.confirm-modal, sized to a two-pane modal instead of a small
   confirm box. */
.overlay { position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 100; }
.preview-modal { width: min(920px, 94vw); height: min(680px, 88vh); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; display: flex; overflow: hidden; }

.preview-sidebar { width: 220px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.ps-head { margin-bottom: 10px; }
.ps-tag { display: block; font-family: var(--font-label); font-size: 9px; font-weight: 700; letter-spacing: .04em; color: var(--amber); margin-bottom: 4px; }
.ps-title { font-size: 13px; font-weight: 700; }
.ps-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.ps-nav-item { font-size: 12.5px; color: var(--text2); padding: 8px 10px; border-radius: 7px; cursor: pointer; }
.ps-nav-item:hover { background: var(--surface2); color: var(--text); }
.ps-nav-item.active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-weight: 600; }
.ps-close { margin-top: 10px; text-align: center; background: transparent; border: 1px solid var(--border); color: var(--text2); font-size: 12px; padding: 7px 12px; border-radius: 7px; cursor: pointer; }
.ps-close:hover { border-color: var(--text3); color: var(--text); }

.preview-main { flex: 1; min-width: 0; display: flex; }
.pm-status { margin: auto; color: var(--text2); font-size: 13px; }
.pm-status.error { color: var(--red); }
.pm-frame { width: 100%; height: 100%; border: none; background: #fff; }
</style>
