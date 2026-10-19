<template>
  <div class="email-preview">
    <div class="preview-bar">
      <span class="preview-tag" :class="mode">{{ mode === 'draft' ? 'DRAFT · NOT YET SENT' : 'EXACTLY WHAT WAS DELIVERED' }}</span>
      <span class="preview-title">{{ title }}</span>
      <span class="safety-tag">SAFETY CHECK PASSED</span>
    </div>

    <div class="email-card">
      <div class="email-head">
        <div class="head-top">
          <div class="sender-avatar">{{ senderInitial }}</div>
          <div class="head-identity">
            <div class="head-row"><span>{{ fromLabel }}</span></div>
            <div class="head-row muted"><span class="head-label">to</span><span>{{ toLabel }}</span></div>
          </div>
        </div>
        <h2 class="head-subject">{{ subject }}</h2>
      </div>
      <div class="email-body" v-html="displayHtml"></div>
    </div>

    <div class="preview-foot">
      <p>{{ footerNote }}</p>
      <span v-if="showFootTag" class="foot-tag">body_html_sent · immutable</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  mode: 'draft' | 'sent'
  subject: string
  bodyHtml: string
  fromLabel: string
  toLabel: string
  title: string
  footerNote: string
  showFootTag?: boolean
}>(), { showFootTag: true })

// Real email clients lead with a sender avatar — first letter of the
// display name (the part before "<", e.g. "Sentinel" in
// "Sentinel <noreply@mailsentry.co.za>"), falling back to "?" for a
// same-reason honesty pattern as everywhere else in this module: never
// guess at something not actually there.
const senderInitial = computed(() => {
  const name = props.fromLabel.split('<')[0].trim()
  return name ? name[0].toUpperCase() : '?'
})

// A real QR can only be generated from a real per-recipient click_url,
// which doesn't exist yet at draft time — this is a plain grey placeholder
// SVG labeled "generated at send", never a real (or fake-scannable) code,
// so nothing in a preview could ever be mistaken for the genuine QR a
// recipient will actually receive (Phishing Simulation roadmap Phase 27).
const QR_PREVIEW_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">' +
  '<rect width="160" height="160" fill="#e2e4e9"/>' +
  '<text x="80" y="76" font-family="sans-serif" font-size="13" fill="#8a8f9c" text-anchor="middle">QR code</text>' +
  '<text x="80" y="94" font-family="sans-serif" font-size="10" fill="#8a8f9c" text-anchor="middle">(generated at send)</text>' +
  '</svg>',
)

// Draft content still carries the literal {click_url}/{qr_code} placeholders
// (real per-recipient substitution only happens at actual send time) —
// render a clearly-labeled, non-functional stand-in for each rather than a
// raw token or a broken-image icon, and strip the invisible open-tracking
// pixel so it doesn't render as a broken image icon in the preview.
const displayHtml = computed(() => {
  let html = props.bodyHtml
  if (props.mode === 'draft') {
    html = html.replace(/\{click_url\}/g, '#preview-link')
    html = html.replace(/\{qr_code\}/g, QR_PREVIEW_PLACEHOLDER)
  }
  html = html.replace(/<img[^>]*width="1"[^>]*>/gi, '')
  return html
})
</script>

<style scoped>
.email-preview { display: flex; flex-direction: column; gap: 12px; }
.preview-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.preview-tag {
  font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: .04em;
  padding: 3px 8px; border-radius: 999px; white-space: nowrap;
}
.preview-tag.draft { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); border: 1px solid color-mix(in srgb, var(--amber) 40%, transparent); }
.preview-tag.sent { color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); border: 1px solid color-mix(in srgb, var(--green) 40%, transparent); }
.preview-title { font-size: 13px; font-weight: 700; flex: 1; min-width: 120px; }
.safety-tag { font-family: var(--font-label); font-size: 10px; font-weight: 700; color: var(--green); white-space: nowrap; }

/* Sized to actually read like an inbox reading pane, not a cramped
   preview snippet (was a 280px-tall scroll box before) — real webmail
   clients give the body the great majority of the available height. */
.email-card { background: #f4f5f7; border-radius: 12px; overflow: hidden; color: #1a1c22; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 10px 30px rgba(0,0,0,.12); }
.email-head { padding: 18px 24px 16px; border-bottom: 1px solid #e2e4e9; }
.head-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sender-avatar {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; background: #5b6472; color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700;
}
.head-identity { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.head-row { font-size: 13px; color: #1a1c22; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-row.muted { font-size: 12px; color: #8a8f9c; font-weight: 400; display: flex; gap: 5px; }
.head-label { color: #8a8f9c; }
.head-subject { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.3; color: #1a1c22; }
.email-body { padding: 26px 24px; font-size: 14.5px; line-height: 1.65; max-height: 520px; overflow-y: auto; }
.email-body :deep(a) { color: #2a5bd7; }
.email-body :deep(p) { margin: 0 0 14px; }

.preview-foot { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.preview-foot p { font-size: 11px; color: var(--text3); line-height: 1.5; margin: 0; max-width: 70%; }
.foot-tag { font-family: var(--font-label); font-size: 10px; color: var(--text3); white-space: nowrap; }
</style>
