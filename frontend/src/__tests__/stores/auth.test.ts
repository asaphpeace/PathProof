import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import * as client from '@/api/client'

vi.mock('@/api/client', () => ({
  api: {
    login: vi.fn(),
    exchangeHandoffCode: vi.fn(),
    cloudConnections: vi.fn(),
    createCloudConnection: vi.fn(),
    verifyCloudConnection: vi.fn(),
    revokeCloudConnection: vi.fn(),
    engagements: vi.fn(),
    findings: vi.fn(),
    privEscPaths: vi.fn(),
  },
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(() => null),
}))

const mockLogin = vi.mocked(client.api.login)
const mockExchange = vi.mocked(client.api.exchangeHandoffCode)
const mockSetToken = vi.mocked(client.setToken)
const mockClearToken = vi.mocked(client.clearToken)

const loginResponse = {
  access_token: 'jwt-abc',
  user_id: 'u1',
  tenant_id: 't1',
  full_name: 'Ada Lovelace',
  role: 'admin',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('auth store', () => {
  it('login() stores the session and marks authenticated', async () => {
    mockLogin.mockResolvedValue(loginResponse)
    const auth = useAuthStore()

    await auth.login('ada@example.com', 'hunter2')

    expect(mockLogin).toHaveBeenCalledWith('ada@example.com', 'hunter2')
    expect(mockSetToken).toHaveBeenCalledWith('jwt-abc')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.tenantId).toBe('t1')
    expect(JSON.parse(localStorage.getItem('command_session')!)).toMatchObject({ tenantId: 't1' })
  })

  // The core deliverable of the V1 -> Command handoff: a code minted by V1
  // exchanges for a real session here, via the same _applyLoginData path
  // as a direct login — no separate, divergent state-setting logic.
  it('completeHandoff() exchanges a code and applies the resulting session identically to login()', async () => {
    mockExchange.mockResolvedValue(loginResponse)
    const auth = useAuthStore()

    await auth.completeHandoff('one-time-code-123')

    expect(mockExchange).toHaveBeenCalledWith('one-time-code-123')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.userId).toBe('u1')
    expect(auth.fullName).toBe('Ada Lovelace')
  })

  it('logout() clears token, session, and store state', async () => {
    mockLogin.mockResolvedValue(loginResponse)
    const auth = useAuthStore()
    await auth.login('ada@example.com', 'hunter2')

    auth.logout()

    expect(mockClearToken).toHaveBeenCalled()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.tenantId).toBeNull()
    expect(localStorage.getItem('command_session')).toBeNull()
  })
})
