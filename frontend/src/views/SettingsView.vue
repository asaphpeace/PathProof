<template>
  <div class="settings">
    <h1 class="title">Settings</h1>
    <p class="subtitle">Cloud accounts, hosts, and domains that authorize PathProof's scan modules.</p>

    <div class="card">
      <div class="header-row">
        <h2>Cloud Account Connections</h2>
        <div class="connect-btn" :class="{ disabled: connecting }" @click="!connecting && startConnectFlow()">
          + Connect AWS account
        </div>
      </div>

      <p v-if="loadError" class="error">{{ loadError }}</p>

      <div v-if="connections.length === 0 && !loading" class="empty">
        No cloud accounts connected yet.
      </div>

      <div v-for="c in connections" :key="c.id" class="connection-row">
        <!-- Real "environment" identity (Production / Staging / a client's
             sandbox) — nothing in the AWS API can tell us this, it's a
             human judgment call, so it's the one field an admin sets
             directly. The technical identity (account ID + role name)
             below is never hidden once a name is set — explicit, not
             ambiguous: you always see both what YOU called it and what it
             actually IS in AWS. -->
        <div v-if="renamingConnectionId === c.id" class="rename-row">
          <input v-model="renameInput" class="rename-input" placeholder="e.g. Production — Client X" @keyup.enter="saveRename('cloud', c.id)" @keyup.esc="cancelRename" />
          <div class="rename-save" @click="saveRename('cloud', c.id)">Save</div>
          <div class="rename-cancel" @click="cancelRename">Cancel</div>
        </div>
        <div v-else class="connection-name-row">
          <span v-if="c.display_name" class="connection-display-name" @click="startRename(c.id, c.display_name)">{{ c.display_name }}</span>
          <span v-else class="add-name-link" @click="startRename(c.id, '')">+ Name this connection</span>
          <span v-if="c.display_name" class="rename-edit" @click="startRename(c.id, c.display_name)">Rename</span>
        </div>
        <div class="connection-top">
          <div class="connection-main">
            <span class="provider-badge">{{ c.provider.toUpperCase() }}</span>
            <span class="status-pill" :style="statusPillStyle(c.status)">{{ statusLabel(c.status) }}</span>
            <span class="role-arn" v-if="c.role_arn" :title="arnExplainer(c.role_arn)">{{ c.role_arn }}</span>
          </div>
          <div class="connection-meta">
            <span v-if="c.last_scan_status === 'failed'" class="scan-status-failed">⚠ Scan failed</span>
            <span v-else-if="c.last_scanned_at">Last scanned {{ formatDate(c.last_scanned_at) }}</span>
            <span v-else-if="c.status === 'connected'">Not scanned yet</span>
            <button class="revoke-btn" @click="revoke(c.id)" :disabled="c.status === 'revoked'">Revoke</button>
          </div>
        </div>
        <div v-if="c.last_scan_results && Object.keys(c.last_scan_results).length" class="scan-pass-list">
          <div v-for="(result, pass) in c.last_scan_results" :key="pass" class="scan-pass-row">
            <span class="scan-pass-icon" :class="result.status">{{ passIcon(result.status) }}</span>
            <span class="scan-pass-name">{{ passLabel(pass) }}</span>
            <span v-if="result.status === 'not_enabled'" class="scan-pass-note">Not enabled on this account — optional</span>
            <span v-else-if="result.status === 'failed' && result.error" class="scan-pass-error">{{ result.error }}</span>
          </div>
        </div>
        <div v-else-if="c.last_scan_status === 'failed' && c.last_scan_error" class="scan-error-detail">{{ c.last_scan_error }}</div>
      </div>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Host Connections (SSH)</h2>
        <div class="connect-btn" @click="startHostConnectFlow()">
          + Connect a host
        </div>
      </div>
      <p class="section-note">Any VPS, any provider, no cloud API needed — we generate an SSH keypair and you install only the public key.</p>

      <p v-if="hostLoadError" class="error">{{ hostLoadError }}</p>

      <div v-if="hostConnections.length === 0 && !hostLoading" class="empty">
        No hosts connected yet.
      </div>

      <div v-for="c in hostConnections" :key="c.id" class="connection-row">
        <div v-if="renamingConnectionId === c.id" class="rename-row">
          <input v-model="renameInput" class="rename-input" placeholder="e.g. Mail server — Production" @keyup.enter="saveRename('host', c.id)" @keyup.esc="cancelRename" />
          <div class="rename-save" @click="saveRename('host', c.id)">Save</div>
          <div class="rename-cancel" @click="cancelRename">Cancel</div>
        </div>
        <div v-else class="connection-name-row">
          <span v-if="c.display_name" class="connection-display-name" @click="startRename(c.id, c.display_name)">{{ c.display_name }}</span>
          <span v-else class="add-name-link" @click="startRename(c.id, '')">+ Name this connection</span>
          <span v-if="c.display_name" class="rename-edit" @click="startRename(c.id, c.display_name)">Rename</span>
        </div>
        <div class="connection-top">
          <div class="connection-main">
            <span class="provider-badge">{{ c.hostname_or_ip }}:{{ c.ssh_port }}</span>
            <span class="status-pill" :style="statusPillStyle(c.status)">{{ statusLabel(c.status) }}</span>
            <!-- Real gap found live: a connection can be genuinely SSH-
                 verified while its own Engagement is still stuck at draft
                 (e.g. a Dropbox Sign request never completed) — this row
                 previously gave no visible sign of that, and "Run Scan"
                 elsewhere in the app just 400'd with an unexplained
                 "Engagement is not active". -->
            <span v-if="c.status === 'connected' && c.engagement_status && c.engagement_status !== 'active'" class="status-pill auth-pending-pill">NEEDS AUTHORIZATION</span>
            <span class="role-arn">{{ c.ssh_username }}</span>
          </div>
          <div class="connection-meta">
            <span v-if="c.last_scan_status === 'failed'" class="scan-status-failed">⚠ Scan failed</span>
            <button
              v-else-if="c.status === 'connected' && c.engagement_status && c.engagement_status !== 'active'"
              class="resume-btn" @click="resumeHostAuthorization(c)"
            >Resume authorization</button>
            <span v-else-if="c.last_scanned_at">Last scanned {{ formatDate(c.last_scanned_at) }}</span>
            <span v-else-if="c.status === 'connected'">Not scanned yet</span>
            <button class="revoke-btn" @click="revokeHost(c.id)" :disabled="c.status === 'revoked'">Revoke</button>
          </div>
        </div>
        <div v-if="c.last_scan_status === 'failed' && c.last_scan_error" class="scan-error-detail">{{ c.last_scan_error }}</div>
      </div>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>External Exposure &amp; DNS Hygiene</h2>
      </div>
      <p class="section-note">Subdomain takeover risk and internet-facing ports on your ownership-verified domains — read-only, no employees targeted.</p>

      <p v-if="domainsError" class="error">{{ domainsError }}</p>
      <div v-if="verifiedDomains.length === 0 && !loadingDomains" class="empty">
        No ownership-verified domains yet — verify a domain in ZoneProof first.
      </div>

      <div v-for="d in verifiedDomains" :key="d.id" class="connection-row">
        <div class="connection-top">
          <div class="connection-main">
            <span class="role-arn">{{ d.domain }}</span>
            <span v-if="exposureFindings[d.id]" class="provider-badge">
              {{ exposureFindings[d.id].length }} finding{{ exposureFindings[d.id].length === 1 ? '' : 's' }}
            </span>
          </div>
          <div class="connection-meta">
            <div class="connect-btn small" @click="runExposure(d.id)">
              {{ exposureScanning === d.id ? 'Scanning…' : 'Run Scan' }}
            </div>
          </div>
        </div>
        <p v-if="exposureScanError[d.id]" class="scan-error-detail">{{ exposureScanError[d.id] }}</p>
        <div v-if="exposureFindings[d.id]?.length" class="findings-list">
          <div v-for="f in exposureFindings[d.id]" :key="f.id" class="finding-row">
            <span :style="pillStyle(severityColor(f.severity))">{{ f.severity }}</span>
            <div class="finding-body">
              <div class="finding-title">{{ f.title }}</div>
              <div class="finding-detail">{{ f.detail }}</div>
            </div>
          </div>
        </div>
        <p v-else-if="exposureScanned[d.id]" class="section-note finding-empty-note">No exposure findings — clean.</p>
      </div>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Third-Party OAuth App Risk (Microsoft 365)</h2>
        <div class="connect-btn" :class="{ disabled: oauthConnecting }" @click="!oauthConnecting && startOAuthConnectFlow()">
          + Connect Microsoft 365
        </div>
      </div>
      <p class="section-note">Read-only Microsoft Graph access — which third-party apps your users have granted access to, and what they can do.</p>

      <p v-if="oauthLoadError" class="error">{{ oauthLoadError }}</p>
      <div v-if="oauthConnections.length === 0 && !oauthLoading" class="empty">
        No Microsoft 365 tenant connected yet.
      </div>

      <div v-for="c in oauthConnections" :key="c.id" class="connection-row">
        <div class="connection-top">
          <div class="connection-main">
            <span class="provider-badge">M365</span>
            <span class="status-pill" :style="statusPillStyle(c.status)">{{ statusLabel(c.status) }}</span>
            <span class="role-arn">{{ c.ms_tenant_id }}</span>
          </div>
          <div class="connection-meta">
            <span v-if="c.last_scan_status === 'failed'" class="scan-status-failed">⚠ Scan failed</span>
            <span v-else-if="c.last_scanned_at">Last scanned {{ formatDate(c.last_scanned_at) }}</span>
            <span v-else-if="c.status === 'connected'">Not scanned yet</span>
            <div v-if="c.status === 'connected'" class="connect-btn small" @click="runOAuthScan(c.id)">
              {{ oauthScanning === c.id ? 'Scanning…' : 'Run Scan' }}
            </div>
            <button class="revoke-btn" @click="revokeOAuth(c.id)" :disabled="c.status === 'revoked'">Revoke</button>
          </div>
        </div>
        <p v-if="oauthScanError[c.id]" class="scan-error-detail">{{ oauthScanError[c.id] }}</p>
        <div v-if="oauthGrantsByConnection[c.id]?.length" class="findings-list">
          <div v-for="g in oauthGrantsByConnection[c.id]" :key="g.id" class="finding-row oauth-grant-row" @click="openOAuthGrant(g)">
            <span :style="pillStyle(severityColor(g.risk_tier))">{{ g.risk_tier }}</span>
            <div class="finding-body">
              <div class="finding-title">{{ g.app_name }} — granted by {{ g.grantee_principal }}</div>
              <div class="finding-detail">{{ g.scopes.join(', ') }}</div>
            </div>
          </div>
        </div>
        <p v-else-if="oauthScanned[c.id]" class="section-note finding-empty-note">No OAuth grant findings — clean.</p>
      </div>
    </div>

    <!-- Connect-account modal -->
    <div v-if="setup" class="overlay" @click.self="cancelConnectFlow">
      <div class="modal card">
        <h3>Connect an AWS account</h3>
        <ol class="instructions">
          <li v-for="(step, i) in setup.instructions" :key="i">{{ step }}</li>
        </ol>

        <span class="label">CloudFormation template</span>
        <pre class="code-block">{{ setup.cloudformation_template }}</pre>
        <div class="copy-btn" @click="copyTemplate">{{ copyLabel }}</div>

        <template v-if="!signatureSent">
          <span class="label">Role ARN (from the stack's output, once it finishes creating)</span>
          <input
            v-model="roleArnInput"
            class="role-input"
            placeholder="arn:aws:iam::123456789012:role/SentinelCommandReadOnly"
          />

          <p v-if="verifyError" class="error">{{ verifyError }}</p>
          <p class="dev-note">
            Verifying sends a Rules of Engagement signature request to your email via
            Dropbox Sign. Scanning starts automatically once it's signed — nothing runs
            against this account before then.
          </p>

          <div class="modal-actions">
            <div class="primary-btn" :class="{ disabled: verifying || !roleArnInput }" @click="!(verifying || !roleArnInput) && verifyAndActivate()">
              {{ verifying ? 'Verifying…' : 'Verify & Request Signature' }}
            </div>
            <div class="secondary-btn" @click="cancelConnectFlow">Cancel</div>
          </div>
        </template>

        <template v-else>
          <p class="signature-sent">
            ✓ Connection verified. We've sent a Rules of Engagement signature request to
            your email — scanning begins automatically once it's signed.
          </p>
          <div class="modal-actions">
            <div class="primary-btn" @click="cancelConnectFlow">Done</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Connect-host modal -->
    <div v-if="hostSetup" class="overlay" @click.self="cancelHostConnectFlow">
      <div class="modal card">
        <h3 v-if="!hostSetupResult">Connect a host over SSH</h3>
        <template v-if="!hostSetupResult">
          <span class="label">Hostname or IP</span>
          <input v-model="hostForm.hostnameOrIp" class="role-input" placeholder="203.0.113.10" />
          <span class="label">SSH Port</span>
          <input v-model.number="hostForm.sshPort" type="number" class="role-input" placeholder="22" />
          <span class="label">Audit username (a scoped, unprivileged user you create)</span>
          <input v-model="hostForm.sshUsername" class="role-input" placeholder="sentinel-audit" />
          <p v-if="hostSetupError" class="error">{{ hostSetupError }}</p>
          <div class="modal-actions">
            <div class="primary-btn" :class="{ disabled: creatingHost || !hostForm.hostnameOrIp || !hostForm.sshUsername }" @click="!(creatingHost || !hostForm.hostnameOrIp || !hostForm.sshUsername) && submitHostForm()">
              {{ creatingHost ? 'Generating keypair…' : 'Generate Keypair' }}
            </div>
            <div class="secondary-btn" @click="cancelHostConnectFlow">Cancel</div>
          </div>
        </template>

        <template v-else>
          <template v-if="!hostEngagement">
            <h3>Install this public key</h3>
            <ol class="instructions">
              <li v-for="(step, i) in hostSetupResult.instructions" :key="i">{{ step }}</li>
            </ol>

            <span class="label">Public key ({{ hostSetupResult.public_key_fingerprint }})</span>
            <pre class="code-block">{{ hostSetupResult.public_key }}</pre>
            <div class="copy-btn" @click="copyHostKey">{{ hostCopyLabel }}</div>

            <p v-if="hostVerifyError" class="error">{{ hostVerifyError }}</p>

            <div class="modal-actions">
              <div class="primary-btn" :class="{ disabled: hostVerifying }" @click="!hostVerifying && verifyHost()">
                {{ hostVerifying ? 'Verifying…' : 'Verify connection' }}
              </div>
              <div class="secondary-btn" @click="cancelHostConnectFlow">Cancel</div>
            </div>
          </template>

          <template v-else-if="!hostSignatureSent">
            <h3>Authorize scanning</h3>
            <div class="auth-card">
              <div class="auth-head"><span class="lock">🔒</span><b>Rules of Engagement signature</b><span class="req-tag">REQUIRED PATH</span></div>
              <p class="dev-note">
                Sends a Rules of Engagement PDF to your email via Dropbox Sign. Scanning
                starts automatically once it's signed — nothing runs against this host
                before then.
              </p>
              <p v-if="hostVerifyError" class="error">{{ hostVerifyError }}</p>
              <div class="modal-actions">
                <div class="primary-btn" :class="{ disabled: hostRequestingSig }" @click="!hostRequestingSig && requestHostSignature()">
                  {{ hostRequestingSig ? 'Sending…' : 'Request real signature' }}
                </div>
                <div class="secondary-btn" @click="cancelHostConnectFlow">Cancel</div>
              </div>
            </div>

            <!-- Dev-bypass — mirrors PhishingCampaignWizardView.vue's own
                 skip-signature flow exactly. Server-side gated behind
                 command_allow_direct_engagement_approval (False in any real
                 deployment, per app/routers/engagement.py's own docstring)
                 and audit-logged under engagement.approved_dev_bypass, so a
                 misconfigured production instance never gets a silent hole
                 just because this button exists in the DOM. -->
            <div class="bypass-toggle" @click="showHostBypass = !showHostBypass">
              <span class="chev" :class="{ open: showHostBypass }">▸</span> Development bypass — skip the signature <span class="danger-tag">NOT FOR PRODUCTION HOSTS</span>
            </div>
            <div v-if="showHostBypass" class="bypass-box">
              <p>This authorizes scanning against this host with no signed Rules of Engagement on file. The action is written to the tenant audit log under your name and cannot be redacted. Type <b>BYPASS</b> to unlock it.</p>
              <div class="bypass-row">
                <input v-model="hostBypassConfirm" class="role-input" placeholder="type BYPASS" />
                <div class="danger-btn" :class="{ disabled: hostBypassConfirm !== 'BYPASS' || hostSkippingSig }" @click="hostBypassConfirm === 'BYPASS' && !hostSkippingSig && skipHostSignature()">
                  {{ hostSkippingSig ? 'Activating…' : 'Skip signature' }}
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="signature-sent">
              ✓ {{ hostBypassed ? 'Activated directly — dev bypass, no real signature on file.' : "Host verified. We've sent a Rules of Engagement signature request to your email — scanning begins automatically once it's signed." }}
            </p>
            <div class="modal-actions">
              <div class="primary-btn" @click="cancelHostConnectFlow">Done</div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Connect-M365 modal -->
    <div v-if="oauthSetup" class="overlay" @click.self="cancelOAuthConnectFlow">
      <div class="modal card">
        <h3>Connect a Microsoft 365 tenant</h3>
        <ol class="instructions">
          <li v-for="(step, i) in oauthInstructions" :key="i">{{ step }}</li>
        </ol>

        <span class="label">Directory (tenant) ID</span>
        <input v-model="oauthForm.tenantId" class="role-input" placeholder="00000000-0000-0000-0000-000000000000" />
        <span class="label">Application (client) ID</span>
        <input v-model="oauthForm.clientId" class="role-input" placeholder="00000000-0000-0000-0000-000000000000" />
        <span class="label">Client secret</span>
        <input v-model="oauthForm.clientSecret" type="password" class="role-input" placeholder="Client secret value" />

        <p v-if="oauthFormError" class="error">{{ oauthFormError }}</p>
        <p class="dev-note">
          Read-only — grants PathProof visibility into which third-party apps have been
          authorized in this tenant. No signature required: no employees are targeted and
          nothing beyond reading Graph API data happens here.
        </p>

        <div class="modal-actions">
          <div
            class="primary-btn"
            :class="{ disabled: oauthSubmitting || !oauthForm.tenantId || !oauthForm.clientId || !oauthForm.clientSecret }"
            @click="!(oauthSubmitting || !oauthForm.tenantId || !oauthForm.clientId || !oauthForm.clientSecret) && submitOAuthConnect()"
          >
            {{ oauthSubmitting ? 'Connecting…' : 'Connect & Verify' }}
          </div>
          <div class="secondary-btn" @click="cancelOAuthConnectFlow">Cancel</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { severityColor, pillStyle } from '@/data/colors'
import { usePanelStore } from '@/stores/panels'

const panels = usePanelStore()
const connections = ref<any[]>([])
const loading = ref(false)
const loadError = ref('')

const connecting = ref(false)
const setup = ref<any | null>(null)
const roleArnInput = ref('')
const verifying = ref(false)
const verifyError = ref('')
const copyLabel = ref('Copy')
const signatureSent = ref(false)

async function loadConnections() {
  loading.value = true
  loadError.value = ''
  try {
    connections.value = await api.cloudConnections()
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to load connections'
  } finally {
    loading.value = false
  }
}

async function startConnectFlow() {
  connecting.value = true
  verifyError.value = ''
  roleArnInput.value = ''
  signatureSent.value = false
  try {
    setup.value = await api.createCloudConnection('aws')
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to start connection setup'
  } finally {
    connecting.value = false
  }
}

function cancelConnectFlow() {
  setup.value = null
  signatureSent.value = false
}

async function copyTemplate() {
  if (!setup.value) return
  try {
    await navigator.clipboard.writeText(setup.value.cloudformation_template)
    copyLabel.value = 'Copied ✓'
    setTimeout(() => (copyLabel.value = 'Copy'), 1500)
  } catch {
    // clipboard access denied — non-fatal, user can still select-and-copy manually
  }
}

async function verifyAndActivate() {
  if (!setup.value) return
  verifying.value = true
  verifyError.value = ''
  try {
    await api.verifyCloudConnection(setup.value.id, roleArnInput.value.trim())
    const engagement = await api.createEngagement('cloud', [setup.value.id])
    await api.requestSignature(engagement.id)
    signatureSent.value = true
    await loadConnections()
  } catch (e: any) {
    verifyError.value = e.message ?? 'Verification failed — check the role ARN and trust policy'
  } finally {
    verifying.value = false
  }
}

async function revoke(id: string) {
  try {
    await api.revokeCloudConnection(id)
    await loadConnections()
  } catch (e: any) {
    loadError.value = e.message ?? 'Failed to revoke connection'
  }
}

// ── Connection display names — the one piece of real "environment"
// identity nothing in the AWS API or a hostname can supply on its own
// (Production vs. Staging vs. a specific client's sandbox is a human
// judgment call, not something derivable from a role ARN or an IP). The
// technical identity (account ID + role name, or hostname/IP) is never
// hidden once a name is set — both render together, explicit rather than
// one replacing the other. Shared between the cloud and host connection
// lists below: identical interaction, just a different rename endpoint.
const renamingConnectionId = ref<string | null>(null)
const renameInput = ref('')

function startRename(id: string, current: string) {
  renamingConnectionId.value = id
  renameInput.value = current
}
function cancelRename() {
  renamingConnectionId.value = null
  renameInput.value = ''
}
async function saveRename(kind: 'cloud' | 'host', id: string) {
  const value = renameInput.value.trim() || null
  try {
    if (kind === 'cloud') await api.renameCloudConnection(id, value)
    else await api.renameHostConnection(id, value)
    renamingConnectionId.value = null
    renameInput.value = ''
    if (kind === 'cloud') await loadConnections()
    else await loadHostConnections()
  } catch (e: any) {
    const target = kind === 'cloud' ? loadError : hostLoadError
    target.value = e.message ?? 'Failed to rename connection'
  }
}

// Plain-language breakdown of an IAM role ARN for the tooltip on the raw
// technical identity string — "arn:aws:iam::123456789012:role/X" says a
// lot if you already know AWS's ARN grammar, nothing at all if you don't.
function arnExplainer(arn: string): string {
  const match = arn.match(/^arn:aws:iam::(\d+):role\/(.+)$/)
  if (!match) return arn
  const [, accountId, roleName] = match
  return `AWS account ${accountId} — the IAM role "${roleName}" was assumed (temporarily borrowed, read-only) to run this scan.`
}

// ── Host connections (SSH/Lynis) ──────────────────────────────────────────
const hostConnections = ref<any[]>([])
const hostLoading = ref(false)
const hostLoadError = ref('')

const hostSetup = ref(false)
const hostSetupResult = ref<any | null>(null)
const hostForm = ref({ hostnameOrIp: '', sshPort: 22, sshUsername: '' })
const hostSetupError = ref('')
const creatingHost = ref(false)
const hostVerifying = ref(false)
const hostVerifyError = ref('')
const hostCopyLabel = ref('Copy')
const hostSignatureSent = ref(false)
// The draft Engagement created once verification succeeds — split out from
// the old single verifyAndActivateHost() so a Dropbox Sign failure (e.g.
// this deployment has no dropbox_sign_api_key configured) doesn't strand
// the user on a generic "verification failed" error after the host itself
// already verified fine. Real bug found live: the host-connect flow had no
// dev-bypass fallback at all, unlike PhishingCampaignWizardView.vue's own
// engagement-authorization step.
const hostEngagement = ref<any | null>(null)
const hostRequestingSig = ref(false)
const showHostBypass = ref(false)
const hostBypassConfirm = ref('')
const hostSkippingSig = ref(false)
const hostBypassed = ref(false)

async function loadHostConnections() {
  hostLoading.value = true
  hostLoadError.value = ''
  try {
    hostConnections.value = await api.hostConnections()
  } catch (e: any) {
    hostLoadError.value = e.message ?? 'Failed to load host connections'
  } finally {
    hostLoading.value = false
  }
}

function startHostConnectFlow() {
  hostSetup.value = true
  hostSetupResult.value = null
  hostSetupError.value = ''
  hostVerifyError.value = ''
  hostSignatureSent.value = false
  hostEngagement.value = null
  showHostBypass.value = false
  hostBypassConfirm.value = ''
  hostBypassed.value = false
  hostForm.value = { hostnameOrIp: '', sshPort: 22, sshUsername: '' }
}

function cancelHostConnectFlow() {
  hostSetup.value = false
  hostSetupResult.value = null
  hostSignatureSent.value = false
  hostEngagement.value = null
}

async function submitHostForm() {
  creatingHost.value = true
  hostSetupError.value = ''
  try {
    hostSetupResult.value = await api.createHostConnection(
      hostForm.value.hostnameOrIp.trim(), hostForm.value.sshUsername.trim(), hostForm.value.sshPort,
    )
  } catch (e: any) {
    hostSetupError.value = e.message ?? 'Failed to start connection setup'
  } finally {
    creatingHost.value = false
  }
}

async function copyHostKey() {
  if (!hostSetupResult.value) return
  try {
    await navigator.clipboard.writeText(hostSetupResult.value.public_key)
    hostCopyLabel.value = 'Copied ✓'
    setTimeout(() => (hostCopyLabel.value = 'Copy'), 1500)
  } catch {
    // clipboard access denied — non-fatal, user can still select-and-copy manually
  }
}

async function verifyHost() {
  if (!hostSetupResult.value) return
  hostVerifying.value = true
  hostVerifyError.value = ''
  try {
    await api.verifyHostConnection(hostSetupResult.value.id)
    // Reuses the existing engagement if one was already created by a prior
    // attempt (createEngagement's own dedup logic, app/routers/engagement.py)
    // rather than orphaning it — matters here specifically because a failed
    // requestSignature below leaves a real draft engagement behind.
    hostEngagement.value = await api.createEngagement('host', [], [hostSetupResult.value.id])
    await loadHostConnections()
  } catch (e: any) {
    hostVerifyError.value = e.message ?? 'Verification failed — confirm the public key was installed and lynis is available'
  } finally {
    hostVerifying.value = false
  }
}

async function requestHostSignature() {
  if (!hostEngagement.value) return
  hostRequestingSig.value = true
  hostVerifyError.value = ''
  try {
    await api.requestSignature(hostEngagement.value.id)
    hostBypassed.value = false
    hostSignatureSent.value = true
    await loadHostConnections()
  } catch (e: any) {
    hostVerifyError.value = e.message ?? 'Failed to request signature'
  } finally {
    hostRequestingSig.value = false
  }
}

async function skipHostSignature() {
  if (!hostEngagement.value || hostBypassConfirm.value !== 'BYPASS') return
  hostSkippingSig.value = true
  hostVerifyError.value = ''
  try {
    await api.approveEngagement(hostEngagement.value.id)
    hostBypassed.value = true
    hostSignatureSent.value = true
    await loadHostConnections()
  } catch (e: any) {
    hostVerifyError.value = e.message ?? 'Dev bypass is disabled on this deployment — use Request real signature instead'
  } finally {
    hostSkippingSig.value = false
  }
}

// Opens the same authorization modal, jumped straight to its step-3
// (Request real signature / dev bypass) screen for a host that's already
// SSH-verified with a real draft/pending Engagement — the resume path for
// exactly the stuck state a HostConnectionOut with engagement_status !==
// 'active' represents. Reuses hostSetup/hostEngagement/etc. unchanged
// rather than a parallel "resume mode" — the auth-card template block only
// ever reads hostEngagement.value.id, so a synthetic hostSetupResult with
// just enough shape to make the v-if chain skip steps 1-2 is sufficient.
function resumeHostAuthorization(c: any) {
  hostSetup.value = true
  hostSetupResult.value = { id: c.id, public_key: '', public_key_fingerprint: '', instructions: [] }
  hostEngagement.value = { id: c.engagement_id, status: c.engagement_status }
  hostSignatureSent.value = false
  hostVerifyError.value = ''
  showHostBypass.value = false
  hostBypassConfirm.value = ''
  hostBypassed.value = false
}

async function revokeHost(id: string) {
  try {
    await api.revokeHostConnection(id)
    await loadHostConnections()
  } catch (e: any) {
    hostLoadError.value = e.message ?? 'Failed to revoke connection'
  }
}

// ── External Exposure & DNS Hygiene (Tier 1) ──────────────────────────────
const verifiedDomains = ref<any[]>([])
const loadingDomains = ref(false)
const domainsError = ref('')
const exposureFindings = ref<Record<string, any[]>>({})
const exposureScanned = ref<Record<string, boolean>>({})
const exposureScanning = ref<string | null>(null)
const exposureScanError = ref<Record<string, string>>({})

async function loadDomains() {
  loadingDomains.value = true
  domainsError.value = ''
  try {
    const all = await api.domains()
    verifiedDomains.value = all.filter((d: any) => d.ownership_verified)
    await loadExistingExposureFindings()
  } catch (e: any) {
    domainsError.value = e.message ?? 'Failed to load domains'
  } finally {
    loadingDomains.value = false
  }
}

async function loadExistingExposureFindings() {
  // No dedicated "findings for this domain's exposure history" endpoint —
  // reuses the general engagements list + per-engagement findings lookup,
  // same as everything else that already knows how to fetch this.
  try {
    const engagements = await api.engagements()
    for (const d of verifiedDomains.value) {
      const engagement = engagements.find((e: any) => e.tier === 'exposure' && e.domain_id === d.id)
      if (!engagement) continue
      const findings = await api.findings(engagement.id)
      exposureFindings.value[d.id] = findings
      exposureScanned.value[d.id] = true
    }
  } catch {
    // Non-fatal — the scan button still works even if history can't be pre-loaded.
  }
}

async function runExposure(domainId: string) {
  exposureScanning.value = domainId
  delete exposureScanError.value[domainId]
  try {
    const findings = await api.runExposureScan(domainId)
    exposureFindings.value[domainId] = findings
    exposureScanned.value[domainId] = true
  } catch (e: any) {
    exposureScanError.value[domainId] = e.message ?? 'Exposure scan failed'
  } finally {
    exposureScanning.value = null
  }
}

// ── Third-Party OAuth App Risk (Microsoft 365) ────────────────────────────
const oauthConnections = ref<any[]>([])
const oauthLoading = ref(false)
const oauthLoadError = ref('')
const oauthInstructions = ref<string[]>([])

const oauthSetup = ref(false)
const oauthConnecting = ref(false)
const oauthForm = ref({ tenantId: '', clientId: '', clientSecret: '' })
const oauthFormError = ref('')
const oauthSubmitting = ref(false)

const oauthGrantsByConnection = ref<Record<string, any[]>>({})
const oauthScanned = ref<Record<string, boolean>>({})
const oauthScanning = ref<string | null>(null)
const oauthScanError = ref<Record<string, string>>({})

async function loadOAuthConnections() {
  oauthLoading.value = true
  oauthLoadError.value = ''
  try {
    oauthConnections.value = await api.oauthAppConnections()
    await loadExistingOAuthGrants()
  } catch (e: any) {
    oauthLoadError.value = e.message ?? 'Failed to load Microsoft 365 connections'
  } finally {
    oauthLoading.value = false
  }
}

async function loadExistingOAuthGrants() {
  // Same "reuse engagements + findings" pattern as Exposure above — no
  // dedicated per-connection grants-history endpoint exists, but the OAuth
  // engagement is 1:1 with the connection (auto-created on verify).
  try {
    const engagements = await api.engagements()
    for (const c of oauthConnections.value) {
      const engagement = engagements.find((e: any) => e.tier === 'oauth_risk' && e.status === 'active')
      if (!engagement || !c.last_scanned_at) continue
      const grants = await api.oauthGrants(engagement.id)
      oauthGrantsByConnection.value[c.id] = grants
      oauthScanned.value[c.id] = true
    }
  } catch {
    // Non-fatal — the scan button still works even if history can't be pre-loaded.
  }
}

async function startOAuthConnectFlow() {
  oauthConnecting.value = true
  oauthFormError.value = ''
  oauthForm.value = { tenantId: '', clientId: '', clientSecret: '' }
  try {
    if (oauthInstructions.value.length === 0) {
      oauthInstructions.value = await api.oauthAppSetupInstructions()
    }
    oauthSetup.value = true
  } catch (e: any) {
    oauthLoadError.value = e.message ?? 'Failed to load setup instructions'
  } finally {
    oauthConnecting.value = false
  }
}

function cancelOAuthConnectFlow() {
  oauthSetup.value = false
}

async function submitOAuthConnect() {
  oauthSubmitting.value = true
  oauthFormError.value = ''
  try {
    const connection = await api.createOAuthAppConnection(
      oauthForm.value.tenantId.trim(), oauthForm.value.clientId.trim(), oauthForm.value.clientSecret.trim(),
    )
    await api.verifyOAuthAppConnection(connection.id)
    oauthSetup.value = false
    await loadOAuthConnections()
  } catch (e: any) {
    oauthFormError.value = e.message ?? 'Verification failed — check the tenant/client id, secret, and that admin consent was granted'
  } finally {
    oauthSubmitting.value = false
  }
}

async function runOAuthScan(id: string) {
  oauthScanning.value = id
  delete oauthScanError.value[id]
  try {
    const grants = await api.scanOAuthAppConnection(id)
    oauthGrantsByConnection.value[id] = grants
    oauthScanned.value[id] = true
    await loadOAuthConnections()
  } catch (e: any) {
    oauthScanError.value[id] = e.message ?? 'OAuth risk scan failed'
  } finally {
    oauthScanning.value = null
  }
}

async function revokeOAuth(id: string) {
  try {
    await api.revokeOAuthAppConnection(id)
    await loadOAuthConnections()
  } catch (e: any) {
    oauthLoadError.value = e.message ?? 'Failed to revoke connection'
  }
}

function openOAuthGrant(g: any) {
  panels.push({ type: 'oauth-grant', title: g.app_name, data: g })
}

function statusLabel(status: string): string {
  return { pending_verification: 'Pending Verification', connected: 'Connected', revoked: 'Revoked', error: 'Error' }[status] ?? status
}

function statusPillStyle(status: string) {
  const sevMap: Record<string, string> = { connected: 'healthy', pending_verification: 'warning', error: 'critical', revoked: 'critical' }
  const color = severityColor(sevMap[status] ?? 'info')
  return { color, borderColor: color, background: `color-mix(in srgb, ${color} 16%, transparent)` }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function passIcon(status: string): string {
  return { success: '✓', not_enabled: '○' }[status] ?? '✗'
}

function passLabel(pass: string | number): string {
  const key = String(pass)
  const labels: Record<string, string> = {
    prowler: 'Prowler (config checks)',
    cloudsplaining: 'Cloudsplaining (privilege escalation)',
    inspector: 'Amazon Inspector (EC2 vulnerabilities)',
    credential: 'Credential Hygiene (MFA/password audit)',
    breach_monitoring: 'Breach Monitoring (HaveIBeenPwned)',
  }
  return labels[key] ?? key
}

onMounted(() => {
  loadConnections()
  loadHostConnections()
  loadDomains()
  loadOAuthConnections()
})
</script>

<style scoped>
.settings { display: flex; flex-direction: column; gap: 16px; }
.title { margin: 0 0 4px; font-size: 26px; font-weight: 700; }
.subtitle { margin: 0 0 8px; color: var(--text2); font-size: 14px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px; }
.header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
h2 { font-size: 15px; }
h3 { font-size: 14px; margin-bottom: 4px; }
.empty { color: var(--text2); font-size: 13px; padding: 12px 0; }
.section-note { font-size: 12px; color: var(--text2); margin-bottom: 12px; }
.error { color: var(--red); font-size: 12px; margin: 6px 0; }

.connect-btn {
  padding: 9px 16px; border-radius: 8px; background: var(--accent); color: var(--bg);
  font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.connect-btn.disabled { opacity: .5; cursor: default; }
.connect-btn.small { padding: 5px 10px; font-size: 11.5px; }

.connection-row {
  display: flex; flex-direction: column; gap: 8px;
  padding: 11px 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; margin-bottom: 8px;
}
.connection-top { display: flex; align-items: center; justify-content: space-between; }
.connection-main { display: flex; align-items: center; gap: 10px; min-width: 0; }

/* ── Connection display name — the human "environment" label, shown above
   the always-present technical identity (never one replacing the other). ── */
.connection-name-row { display: flex; align-items: center; gap: 10px; }
.connection-display-name { font-size: 13.5px; font-weight: 700; color: var(--text); cursor: pointer; }
.connection-display-name:hover { text-decoration: underline; }
.add-name-link { font-size: 11.5px; color: var(--accent); cursor: pointer; }
.add-name-link:hover { text-decoration: underline; }
.rename-edit { font-size: 10.5px; color: var(--text3); cursor: pointer; }
.rename-edit:hover { color: var(--text2); }
.rename-row { display: flex; align-items: center; gap: 8px; }
.rename-input {
  flex: 1 1 auto; min-width: 0; height: 32px; padding: 0 10px; background: var(--bg);
  border: 1px solid var(--accent); border-radius: 6px; color: var(--text); font-size: 12.5px; font-family: var(--font-body);
}
.rename-input:focus { outline: none; }
.rename-save, .rename-cancel { font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; padding: 4px 2px; }
.rename-save { color: var(--accent); }
.rename-cancel { color: var(--text3); }
.provider-badge {
  font-family: var(--font-mono); font-size: 10px; color: var(--text2);
  background: var(--bg); border: 1px solid var(--border);
  padding: 2px 6px; border-radius: 4px;
}
.status-pill {
  display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px;
  font: 700 10px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase;
  letter-spacing: 0.03em; border: 1px solid; white-space: nowrap;
}
.role-arn {
  font-family: var(--font-mono); font-size: 11px; color: var(--text2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.connection-meta {
  display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text3);
  font-family: var(--font-mono); flex-shrink: 0;
}
.scan-status-failed { color: var(--red); font-weight: 600; white-space: nowrap; }
.scan-error-detail {
  font-size: 11px; color: var(--red); font-family: var(--font-mono);
  background: color-mix(in srgb, var(--red) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
  border-radius: 6px; padding: 6px 9px; line-height: 1.4;
}
.scan-pass-list { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.scan-pass-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; font-size: 11px; }
.scan-pass-icon { font-family: var(--font-mono); font-weight: 700; flex-shrink: 0; }
.scan-pass-icon.success { color: var(--green); }
.scan-pass-icon.failed { color: var(--red); }
.scan-pass-icon.not_enabled { color: var(--text3); }
.scan-pass-note { font-size: 11px; color: var(--text3); }
.scan-pass-name { color: var(--text2); flex-shrink: 0; }
.scan-pass-error { color: var(--red); font-family: var(--font-mono); }
.revoke-btn {
  background: transparent; border: 1px solid var(--border); color: var(--text2);
  font-size: 11px; padding: 4px 9px; border-radius: 6px; cursor: pointer; font-family: var(--font-body);
}
.revoke-btn:hover:not(:disabled) { border-color: var(--red); color: var(--red); }
.revoke-btn:disabled { opacity: .4; cursor: not-allowed; }
.auth-pending-pill { color: var(--amber); border-color: var(--amber); background: color-mix(in srgb, var(--amber) 16%, transparent); }
.resume-btn {
  background: color-mix(in srgb, var(--amber) 14%, transparent); border: 1px solid var(--amber); color: var(--amber);
  font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 6px; cursor: pointer; font-family: var(--font-body);
}
.resume-btn:hover { background: color-mix(in srgb, var(--amber) 22%, transparent); }

.findings-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.finding-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
.oauth-grant-row { cursor: pointer; border-radius: 6px; margin: 0 -6px; padding: 8px 6px; }
.oauth-grant-row:hover { background: var(--bg); }
.finding-row:first-child { border-top: none; padding-top: 0; }
.finding-body { min-width: 0; }
.finding-title { font-size: 12.5px; font-weight: 600; color: var(--text); }
.finding-detail { font-size: 11.5px; color: var(--text2); margin-top: 2px; line-height: 1.4; }
.finding-empty-note { margin: 0; color: var(--green); }

.overlay {
  position: fixed; inset: 0; background: rgba(6,9,16,.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 80;
}
.modal { width: 560px; max-width: 92vw; max-height: 85vh; overflow-y: auto; }
.instructions { margin: 10px 0 16px 18px; font-size: 12.5px; color: var(--text2); line-height: 1.6; }
.label {
  display: block; font-family: var(--font-mono); font-size: 10px; letter-spacing: .05em;
  color: var(--text3); text-transform: uppercase; margin: 14px 0 6px;
}
.code-block {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 12px; font-family: var(--font-mono); font-size: 10.5px; line-height: 1.5;
  color: var(--accent); white-space: pre-wrap; overflow-x: auto; max-height: 200px; overflow-y: auto;
}
.copy-btn {
  margin-top: 8px; display: inline-block; background: transparent; border: 1px solid var(--border); color: var(--text2);
  font-family: var(--font-mono); font-size: 10.5px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
}
.copy-btn:hover { border-color: var(--accent); color: var(--accent); }
.role-input {
  width: 100%; height: 38px; padding: 0 12px; background: var(--surface2); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-family: var(--font-mono); font-size: 12px;
}
.role-input:focus { outline: none; border-color: var(--accent); }
.dev-note {
  margin-top: 12px; font-size: 11px; color: var(--text3); line-height: 1.5;
  background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px;
}
.dev-note code { font-family: var(--font-mono); color: var(--text2); }
.signature-sent {
  margin: 8px 0 4px; font-size: 13px; color: var(--text); line-height: 1.6;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 8px; padding: 12px 14px;
}
.modal-actions { display: flex; gap: 10px; margin-top: 16px; }
.primary-btn, .secondary-btn {
  padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.primary-btn { background: var(--accent); color: var(--bg); }
.primary-btn.disabled { opacity: .5; cursor: default; }
.secondary-btn { background: transparent; border: 1px solid var(--border); color: var(--text2); }
.secondary-btn:hover { color: var(--text); border-color: var(--text3); }

/* ── Host-connect authorization step — mirrors PhishingCampaignWizardView.vue's
   own Rules-of-Engagement + dev-bypass UI exactly, so the two engagement-
   authorization flows in this app look and behave the same way. ── */
.auth-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.auth-head { display: flex; align-items: center; gap: 8px; font-size: 13.5px; margin-bottom: 7px; }
.lock { font-size: 13px; }
.req-tag { margin-left: auto; font-size: 9px; font-weight: 700; color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); padding: 1px 6px; border-radius: 4px; }
.auth-card .dev-note { margin-top: 0; }

.bypass-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text3); cursor: pointer; margin-bottom: 8px; }
.chev { font-size: 9px; transition: transform .15s; }
.chev.open { transform: rotate(90deg); }
.danger-tag { font-size: 9px; font-weight: 700; color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
.bypass-box { background: color-mix(in srgb, var(--red) 8%, transparent); border: 1px solid color-mix(in srgb, var(--red) 35%, transparent); border-radius: 9px; padding: 12px 14px; }
.bypass-box p { font-size: 11.5px; color: var(--text2); line-height: 1.55; margin: 0 0 10px; }
.bypass-box b { color: var(--red); }
.bypass-row { display: flex; gap: 8px; }
.bypass-row .role-input { flex: 1; }
.danger-btn { background: var(--red); color: var(--bg); border: none; border-radius: 8px; padding: 0 14px; height: 38px; display: flex; align-items: center; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.danger-btn.disabled { opacity: .4; cursor: default; }
</style>
