<template>
  <div class="oauth-grant-evidence">
    <div class="block">
      <div class="block-label">Granted by</div>
      <div class="block-text mono">{{ data.grantee_principal }}</div>
    </div>

    <div class="block">
      <div class="block-label">Publisher</div>
      <div class="publisher-row" :class="{ verified: data.publisher_verified }">
        <span class="publisher-icon">{{ data.publisher_verified ? '✓' : '⚠' }}</span>
        <span>{{ data.publisher_verified ? `Verified — ${data.publisher_name}` : 'Not a verified publisher' }}</span>
      </div>
    </div>

    <div class="block">
      <div class="block-label">Scopes granted</div>
      <div class="scope-list">
        <div v-for="s in data.scopes" :key="s" class="scope-row">
          <span class="scope-name">{{ s }}</span>
          <span v-if="scopeExplanation(s)" class="scope-explain">{{ scopeExplanation(s) }}</span>
        </div>
      </div>
    </div>

    <div class="block meta-row">
      <span>{{ data.risk_tier?.toUpperCase() }}</span>
      <span v-if="data.granted_at">Granted {{ formatDate(data.granted_at) }}</span>
      <span v-else>Grant date not reported by Microsoft Graph</span>
      <span>Discovered {{ formatDate(data.discovered_at) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ data: any }>()

// A small curated lookup for the most common Graph scopes — Microsoft's
// own scope names are terse ("Mail.ReadWrite") and don't explain blast
// radius on their own.
const SCOPE_EXPLANATIONS: Record<string, string> = {
  'Directory.ReadWrite.All': 'Full read/write access to your entire Entra ID directory — users, groups, and roles.',
  'Mail.ReadWrite': 'Can read and modify every email in this mailbox.',
  'Mail.Read': 'Can read every email in this mailbox.',
  'Files.ReadWrite.All': 'Can read and modify every file this user can access across OneDrive/SharePoint.',
  'Files.Read.All': 'Can read every file this user can access across OneDrive/SharePoint.',
  'User.Read.All': 'Can read every user profile in the directory.',
  'User.ReadWrite.All': 'Can read and modify every user profile in the directory.',
  'Sites.ReadWrite.All': 'Can read and modify every SharePoint site this user can access.',
}

function scopeExplanation(scope: string): string | undefined {
  return SCOPE_EXPLANATIONS[scope]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<style scoped>
.oauth-grant-evidence { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 6px; }
.block-label { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: 0.04em; }
.block-text { font-size: 13px; color: var(--text); line-height: 1.55; overflow-wrap: break-word; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; }

.publisher-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--red); }
.publisher-row.verified { color: var(--green); }
.publisher-icon { font-weight: 700; }

.scope-list { display: flex; flex-direction: column; gap: 6px; }
.scope-row {
  display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px;
  background: var(--surface2); border: 1px solid var(--border);
}
.scope-name { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; color: var(--accent); }
.scope-explain { font-size: 11.5px; color: var(--text2); line-height: 1.4; }

.meta-row { flex-direction: row; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); flex-wrap: wrap; }
</style>
