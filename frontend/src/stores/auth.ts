import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, setToken, clearToken, getToken } from '@/api/client'

const SESSION_KEY = 'command_session'

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
function saveSession(data: Record<string, string>) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data))
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

const _saved = loadSession()

export const useAuthStore = defineStore('auth', () => {
  const token         = ref<string | null>(getToken())
  const userId        = ref<string | null>(_saved?.userId ?? null)
  const tenantId      = ref<string | null>(_saved?.tenantId ?? null)
  const fullName      = ref<string>(_saved?.fullName ?? '')
  const role          = ref<string>(_saved?.role ?? '')
  const isAuthenticated = ref(!!getToken())

  function _applyLoginData(data: any) {
    setToken(data.access_token)
    token.value           = data.access_token
    userId.value          = data.user_id
    tenantId.value        = data.tenant_id
    fullName.value        = data.full_name
    role.value            = data.role
    isAuthenticated.value = true
    saveSession({
      userId:   data.user_id,
      tenantId: data.tenant_id,
      fullName: data.full_name,
      role:     data.role,
    })
  }

  async function login(email: string, password: string) {
    const res = await api.login(email, password)
    _applyLoginData(res)
  }

  // Entry point for /auth/callback?code=... — see ARCHITECTURE.md Section
  // 9 and BUILD_PLAN.md Phase 0 step 3 for why this is a short-lived
  // exchange rather than a shared cookie/localStorage: V1 and Command are
  // different origins, and V1's existing auth store is localStorage-based,
  // not cookie-based, so there's nothing to share automatically.
  async function completeHandoff(code: string) {
    const res = await api.exchangeHandoffCode(code)
    _applyLoginData(res)
  }

  function logout() {
    clearToken()
    clearSession()
    token.value           = null
    userId.value          = null
    tenantId.value        = null
    fullName.value        = ''
    role.value            = ''
    isAuthenticated.value = false
  }

  return { token, userId, tenantId, fullName, role, isAuthenticated, login, completeHandoff, logout }
})
