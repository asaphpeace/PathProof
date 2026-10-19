<template>
  <button class="ui-btn" :class="`ui-btn--${variant}`" :disabled="disabled">
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>(), {
  variant: 'secondary',
})
</script>

<style scoped>
.ui-btn {
  height: 34px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  font-family: var(--ui-font-body);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.12s, border-color 0.12s, color 0.12s;
}
.ui-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ui-btn--primary {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
  border: none;
}
.ui-btn--primary:hover:not(:disabled) {
  filter: brightness(1.06);
}
.ui-btn--secondary {
  background: transparent;
  color: var(--ui-text-secondary);
  border: 1px solid var(--ui-border);
}
.ui-btn--secondary:hover:not(:disabled) {
  border-color: var(--ui-accent);
  color: var(--ui-accent);
}
</style>
