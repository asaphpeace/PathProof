<template>
  <div class="login">
    <form class="login-card" @submit.prevent="submit">
      <h1>PathProof</h1>
      <input v-model="email" type="email" placeholder="Email" autocomplete="username" required />
      <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" required />
      <span v-if="error" class="error">{{ error }}</span>
      <button type="submit" :disabled="submitting">{{ submitting ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(email.value, password.value)
    router.push('/')
  } catch (e: any) {
    error.value = e.message ?? 'Sign-in failed'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}
.login-card {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
}
h1 {
  font-size: 16px;
  color: var(--text);
  margin-bottom: 8px;
}
input {
  height: 38px;
  padding: 0 12px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 13px;
}
input:focus { outline: none; border-color: var(--accent); }
button {
  height: 38px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: var(--bg);
  font-weight: 600;
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: var(--red); font-size: 12px; }
</style>
