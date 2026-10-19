// The Starting XI + Bench, mirrored from BUILD_PLAN.md's Feature Roster —
// single source of truth for the Coverage Map and the Overview coverage
// preview. Status strings reflect actual build state, updated as features
// ship; this is project status (documentation), not live scan output.

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

export interface RosterEntry {
  pos: Position
  feature: string
  desc: string
  status: string
}

export const STARTING_XI: RosterEntry[] = [
  { pos: 'FWD', feature: 'Phishing Simulation', desc: 'Two tiers — Spoof Proof (domain-level) + Human Simulation, correlated with live DMARC posture', status: 'Done' },
  { pos: 'FWD', feature: 'Simulate-the-Fix', desc: 'Interactive graph — click a fix, see paths close instantly', status: 'Done' },
  { pos: 'FWD', feature: 'MSP Portfolio Rollup', desc: 'Aggregate exposure across all managed client accounts', status: 'Done — visible on the MSP/Enterprise plan' },
  { pos: 'MID', feature: 'IAM Privilege-Escalation Graph', desc: 'Cloudsplaining — finds paths to account-admin', status: 'Done' },
  { pos: 'MID', feature: 'Third-Party OAuth App Risk', desc: 'OAuth grants as a new node/edge type on the same Attack Path Graph as IAM — unified cloud + SaaS privilege mapping', status: 'Microsoft 365 backend done, no frontend trigger yet. Google Workspace is a designed, unbuilt fast-follow.' },
  { pos: 'DEF', feature: 'Cloud Misconfiguration Defense', desc: 'Prowler (live config) — IaC pre-deploy scanning is planned, not yet built', status: 'Prowler done' },
  { pos: 'DEF', feature: 'External Exposure & DNS Hygiene', desc: 'Subdomain takeover, open ports, cert monitoring', status: 'Subdomain takeover + open ports done. Cert monitoring already covered by V1.' },
  { pos: 'DEF', feature: 'Email Authentication Defense', desc: 'DMARC/SPF/MTA-STS', status: 'Done (V1)' },
  { pos: 'DEF', feature: 'Identity & Credential Hygiene', desc: 'Breach-credential monitoring + MFA/password-policy audit', status: 'MFA/password audit done (real AWS IAM credential report). Breach monitoring designed, waiting on an HIBP API key.' },
  { pos: 'DEF', feature: 'Host & Server Security', desc: 'Amazon Inspector for EC2, Lynis-over-SSH for any VPS with no cloud API', status: 'Done' },
  { pos: 'GK', feature: 'Detection Coverage', desc: "Flags whether you'd actually detect each attack path, not just whether it exists", status: 'Done' },
]

export interface BenchEntry {
  name: string
  trigger: string
}

export const BENCH: BenchEntry[] = [
  { name: 'Container/Kubernetes scanning', trigger: 'Promote when a customer asks for EKS/AKS/GKE' },
  { name: 'Ransomware Readiness score', trigger: 'Promote once the graph has data-store nodes' },
  { name: 'SAST/SCA/SBOM/license compliance', trigger: 'Blocked on repo-access being designed as its own connection type' },
  { name: 'Automated audit evidence collection', trigger: 'Promote if redesigned to attach to graph nodes, not a standalone tab' },
  { name: 'Backlog ideas', trigger: '"What changed?" timeline, DNS rollback/undo, WhatsApp ambient updates, AI Vendor/SaaS Terms Auditor, CISA KEV tagging' },
]

export const CATEGORY_LABEL: Record<Position, string> = { GK: 'DETECT', DEF: 'DEFEND', MID: 'GRAPH', FWD: 'ACT' }

export type StatusKind = 'not-started' | 'partial' | 'done'

export function statusKind(status: string): StatusKind {
  const low = status.toLowerCase()
  if (low.includes('not started') || low.includes('queued')) return 'not-started'
  if (low.includes('in progress')) return 'partial'
  return 'done'
}

export function statusLabel(kind: StatusKind): string {
  return { 'not-started': 'Not started', partial: 'In progress', done: 'Live' }[kind]
}
