<template>
  <Teleport to="body">
    <div v-if="panels.stack.length" class="overlay" @click.self="panels.close()">
      <div class="panel">
        <div class="breadcrumb">
          <template v-for="(entry, i) in panels.stack" :key="i">
            <span
              class="crumb"
              :class="{ active: i === panels.stack.length - 1 }"
              @click="panels.popTo(i)"
            >{{ entry.title }}</span>
            <span v-if="i < panels.stack.length - 1" class="crumb-sep">/</span>
          </template>
        </div>

        <div class="panel-head">
          <div class="panel-title">{{ current.title }}</div>
          <div class="panel-actions">
            <div v-if="panels.stack.length > 1" class="back-btn" @click="panels.pop()">← Back</div>
            <div class="close-btn" @click="panels.close()">✕</div>
          </div>
        </div>

        <div class="panel-body">
          <component :is="renderer" v-if="renderer" :data="current.data" />
          <div v-else class="no-renderer">No evidence view registered for type "{{ current.type }}".</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePanelStore } from '@/stores/panels'
import { rendererFor } from './registry'

const panels = usePanelStore()
const current = computed(() => panels.stack[panels.stack.length - 1])
const renderer = computed(() => current.value && rendererFor(current.value.type))
</script>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(6, 9, 16, 0.6); backdrop-filter: blur(2px);
  display: flex; justify-content: flex-end; z-index: 120;
}
.panel {
  width: 460px; max-width: 92vw; height: 100%; background: var(--surface);
  border-left: 1px solid var(--border); display: flex; flex-direction: column;
  animation: slide-in 0.18s ease;
}
@keyframes slide-in {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.breadcrumb {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 14px 24px 0;
  font-size: 11px; color: var(--text3);
}
.crumb { cursor: pointer; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crumb:hover { color: var(--text2); }
.crumb.active { color: var(--text2); cursor: default; }
.crumb-sep { color: var(--text3); }

.panel-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 8px 24px 18px; border-bottom: 1px solid var(--border);
}
.panel-title { font-size: 17px; font-weight: 700; line-height: 1.35; overflow-wrap: break-word; }
.panel-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.back-btn, .close-btn {
  font-size: 12px; color: var(--text2); cursor: pointer; padding: 5px 10px; border-radius: 6px;
  border: 1px solid var(--border); white-space: nowrap;
}
.back-btn:hover, .close-btn:hover { color: var(--text); border-color: var(--text3); }

.panel-body { flex: 1; overflow-y: auto; padding: 22px 24px; }
.no-renderer { font-size: 13px; color: var(--text2); }
</style>
