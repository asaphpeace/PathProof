<template>
  <div class="ui-card" :class="{ 'ui-card--accent': accent }">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ accent?: boolean }>()
</script>

<style scoped>
.ui-card {
  background: var(--ui-bg-panel);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-lg);
  padding: var(--sp-4) var(--sp-5);
}
.ui-card--accent {
  border-color: var(--ui-accent);
}
</style>
