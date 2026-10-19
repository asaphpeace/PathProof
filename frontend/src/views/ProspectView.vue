<template>
  <div>
    <h1 class="title">One-Click Prospect Assessment</h1>
    <p class="subtitle">Type a prospect's domain for a real, passive DNS/email-security check — no login or account access needed on their side.</p>

    <div class="input-row">
      <input v-model="domain" placeholder="prospect-company.com" class="domain-input" @keyup.enter="generate" />
      <div class="generate-btn" :class="{ disabled: loading }" @click="!loading && generate()">
        {{ loading ? 'Checking…' : 'Generate Report' }}
      </div>
    </div>
    <p v-if="error" class="error-note">{{ error }}</p>

    <div v-if="result" class="report-card">
      <div class="report-head">
        <div>
          <div class="report-kicker">Risk Report Card</div>
          <div class="report-domain">{{ result.domain }}</div>
        </div>
        <div class="grade-block">
          <div class="grade" :style="{ color: result.grade_color }">{{ result.grade }}</div>
          <div class="grade-label">Preview Grade</div>
        </div>
      </div>

      <div class="checks">
        <div v-for="c in result.checks" :key="c.label" class="check-row">
          <span class="check-icon" :class="c.found ? 'found' : 'missing'">{{ c.found ? '✓' : '✗' }}</span>
          <div class="check-body">
            <div class="check-label">{{ c.label }}</div>
            <div class="check-detail">{{ c.detail }}</div>
          </div>
        </div>
      </div>

      <div v-if="result.not_assessed.length" class="not-assessed">
        <div class="not-assessed-title">Not shown in this preview — requires a connected account:</div>
        <div class="not-assessed-list">{{ result.not_assessed.join(' · ') }}</div>
      </div>

      <div class="report-footer">
        <div class="footer-note">Based on publicly observable DNS records only — not a full audit.</div>
        <div class="cta-btn">Book Remediation Call</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api/client'

interface ProspectCheck { label: string; found: boolean; detail: string }
interface ProspectResult { domain: string; score: number; grade: string; grade_color: string; checks: ProspectCheck[]; not_assessed: string[] }

const domain = ref('')
const result = ref<ProspectResult | null>(null)
const loading = ref(false)
const error = ref('')

async function generate() {
  const d = domain.value.trim()
  if (!d) { error.value = 'Enter a domain first.'; return }
  error.value = ''
  loading.value = true
  try {
    result.value = await api.assessProspect(d)
  } catch (e: any) {
    error.value = e.message ?? 'Could not assess this domain.'
    result.value = null
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 28px; color: var(--text2); font-size: 14px; }

.input-row { display: flex; gap: 10px; margin-bottom: 12px; max-width: 520px; }
.domain-input {
  flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px;
  color: var(--text); font-size: 14px; font-family: 'IBM Plex Mono', ui-monospace, monospace; outline: none;
}
.domain-input:focus { border-color: var(--accent); }
.generate-btn {
  padding: 12px 22px; border-radius: 8px; background: var(--accent); color: var(--ink);
  font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.generate-btn.disabled { opacity: 0.6; cursor: default; }
.error-note { color: var(--red); font-size: 12px; margin-bottom: 16px; }

.report-card { max-width: 640px; background: var(--surface); border: 1px solid var(--accent); border-radius: 14px; padding: 32px; margin-top: 16px; }
.report-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.report-kicker { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.report-domain { font-size: 22px; font-weight: 800; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.grade-block { text-align: center; }
.grade { font-size: 40px; font-weight: 800; }
.grade-label { font-size: 11px; color: var(--text2); }

.checks { display: flex; flex-direction: column; gap: 14px; }
.check-row { display: flex; gap: 12px; align-items: flex-start; }
.check-icon { font-weight: 700; font-size: 15px; flex-shrink: 0; margin-top: 1px; }
.check-icon.found { color: var(--green); }
.check-icon.missing { color: var(--red); }
.check-body { flex: 1; min-width: 0; }
.check-label { font-size: 13px; font-weight: 600; }
.check-detail { font-size: 12px; color: var(--text2); margin-top: 2px; }

.not-assessed { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.not-assessed-title { font-size: 11px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
.not-assessed-list { font-size: 12px; color: var(--text3); }

.report-footer {
  margin-top: 26px; padding-top: 20px; border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
}
.footer-note { font-size: 12px; color: var(--text2); }
.cta-btn { padding: 10px 18px; border-radius: 8px; background: var(--accent); color: var(--bg); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
</style>
