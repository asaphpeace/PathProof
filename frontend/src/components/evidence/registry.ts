import type { Component } from 'vue'
import FindingEvidence from './renderers/FindingEvidence.vue'
import ResourceFindingsEvidence from './renderers/ResourceFindingsEvidence.vue'
import IamPathEvidence from './renderers/IamPathEvidence.vue'
import GraphNodeEvidence from './renderers/GraphNodeEvidence.vue'
import FeatureDrillEvidence from './renderers/FeatureDrillEvidence.vue'
import ScoreBreakdownEvidence from './renderers/ScoreBreakdownEvidence.vue'
import OAuthGrantEvidence from './renderers/OAuthGrantEvidence.vue'
import CoverageVerdictEvidence from './renderers/CoverageVerdictEvidence.vue'
import AuditLogEntryEvidence from './renderers/AuditLogEntryEvidence.vue'
import PhishingCampaignEvidence from './renderers/PhishingCampaignEvidence.vue'
import PhishingRecipientEvidence from './renderers/PhishingRecipientEvidence.vue'
import CloudAssetEvidence from './renderers/CloudAssetEvidence.vue'
import ConnectedAccountsEvidence from './renderers/ConnectedAccountsEvidence.vue'

// One entry per evidence type. Each renderer owns its own layout for one
// data shape (a Finding, an IAM privilege-escalation path, a resource's
// other findings, ...) — the shell (EvidencePanel.vue) only knows how to
// open/close/stack panels, never how to render their contents. Adding a
// new "evidence panel" for a future feature means adding one entry here,
// not building a new panel component.
export const EVIDENCE_RENDERERS: Record<string, Component> = {
  finding: FindingEvidence,
  'resource-findings': ResourceFindingsEvidence,
  'iam-path': IamPathEvidence,
  'graph-node': GraphNodeEvidence,
  'feature-drill': FeatureDrillEvidence,
  'score-breakdown': ScoreBreakdownEvidence,
  'oauth-grant': OAuthGrantEvidence,
  'coverage-verdict': CoverageVerdictEvidence,
  'audit-log-entry': AuditLogEntryEvidence,
  'phishing-campaign': PhishingCampaignEvidence,
  'phishing-recipient': PhishingRecipientEvidence,
  'cloud-asset': CloudAssetEvidence,
  'connected-accounts': ConnectedAccountsEvidence,
}

export function rendererFor(type: string): Component | undefined {
  return EVIDENCE_RENDERERS[type]
}
