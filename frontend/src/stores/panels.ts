import { defineStore } from 'pinia'
import { ref } from 'vue'

// The one shared drill-down panel stack every "evidence-on-click" feature
// pushes onto — see EvidencePanel.vue (the shell) and evidence/registry.ts
// (the per-feature content renderers). A click inside one panel pushes a
// new entry rather than navigating, so a chain of drills (Finding ->
// resource -> other findings on that resource) reads as one continuous
// stack with a breadcrumb back-trail, not a maze of separate popovers.
export interface PanelEntry {
  type: string        // key into evidence/registry.ts
  title: string        // shown in the header + breadcrumb
  data: any            // passed straight through to the renderer as a prop
}

export const usePanelStore = defineStore('panels', () => {
  const stack = ref<PanelEntry[]>([])

  function push(entry: PanelEntry) {
    stack.value.push(entry)
  }
  function pop() {
    stack.value.pop()
  }
  // Jump back to a specific breadcrumb step (index into stack).
  function popTo(index: number) {
    stack.value.splice(index + 1)
  }
  function close() {
    stack.value = []
  }
  // Swap the data of the currently-open panel in place — for paging
  // between siblings (e.g. Prev/Next recipient) that shouldn't grow the
  // breadcrumb trail, unlike push(), which is for a genuine drill from a
  // list into a detail.
  function updateTop(data: any) {
    const top = stack.value[stack.value.length - 1]
    if (top) top.data = data
  }

  return { stack, push, pop, popTo, close, updateTop }
})
