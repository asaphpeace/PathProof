<template>
  <div class="callback">
    <span v-if="error" class="error">{{ error }}</span>
    <span v-else>Signing you in…</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const error = ref('')

onMounted(async () => {
  const code = route.query.code
  if (typeof code !== 'string') {
    error.value = 'Missing handoff code'
    return
  }
  try {
    await auth.completeHandoff(code)
    router.replace('/')
  } catch (e: any) {
    error.value = e.message ?? 'Sign-in failed'
  }
})
</script>

<style scoped>
.callback {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  font-family: var(--font-mono);
  color: var(--text2);
}
.error { color: var(--red); }
</style>
