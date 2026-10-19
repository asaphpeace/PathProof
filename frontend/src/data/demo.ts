// Demo/illustrative data for screens with no backend yet (Multi-Tenant
// Portfolio, Attack Path Graph, What Changed, Prospect Assessment) — per
// the explicit decision to wire real data only where it exists (Findings,
// Cloud Posture score, Connections) and keep these realistic-but-synthetic
// for now. Mirrors Command_New_face.html's seeded content.

export interface DemoTenant {
  id: number
  name: string
  domain: string
  score: number
  sla: string
  plan: string
  alerts: number
  status: 'Healthy' | 'At Risk' | 'Critical'
}

export const DEMO_TENANTS: DemoTenant[] = [
  { id: 1, name: 'Meridian Logistics', domain: 'meridianlog.com', score: 82, sla: '12m', plan: 'Growth', alerts: 2, status: 'Healthy' },
  { id: 2, name: 'Halcyon Dental Group', domain: 'halcyondental.com', score: 54, sla: '41m', plan: 'Core', alerts: 7, status: 'At Risk' },
  { id: 3, name: 'Fenwick & Bly Law', domain: 'fenwickbly.com', score: 91, sla: '8m', plan: 'Growth', alerts: 0, status: 'Healthy' },
  { id: 4, name: 'Cobalt Manufacturing', domain: 'cobaltmfg.com', score: 38, sla: '2h 10m', plan: 'Core', alerts: 11, status: 'Critical' },
  { id: 5, name: 'Northwind Realty', domain: 'northwindrealty.com', score: 76, sla: '19m', plan: 'Growth', alerts: 3, status: 'Healthy' },
  { id: 6, name: 'Iron Gate Financial', domain: 'irongatefin.com', score: 63, sla: '34m', plan: 'Enterprise', alerts: 5, status: 'At Risk' },
]

export interface GraphNodeRaw {
  id: string
  type: string
  detail: string
  xPct: number
  y: number
  hue: 'cyan' | 'violet' | 'amber' | 'red' | 'green'
  discovered: string
}

export interface TenantGraph {
  tenantName: string
  domain: string
  sources: string[]
  nodes: GraphNodeRaw[]
}

export const GRAPH_BY_TENANT: Record<number, TenantGraph> = {
  4: {
    tenantName: 'Cobalt Manufacturing', domain: 'cobaltmfg.com',
    sources: [
      'Email Authentication Defense (DMARC/SPF check, 2 days ago)',
      'IAM Privilege-Escalation Graph (Cloudsplaining, 1 day ago)',
      'Cloud Misconfiguration Defense (Prowler, 6 hours ago)',
    ],
    nodes: [
      { id: 'n1', type: 'Spoofed Email to cfo@cobaltmfg.com', detail: 'Inbound message spoofing the CFO display name; SPF softfail let it through because cobaltmfg.com publishes ~all instead of -all.', xPct: 8, y: 210, hue: 'cyan', discovered: '2 days ago' },
      { id: 'n2', type: 'OAuth Token: j.reyes@cobaltmfg.com', detail: 'Token issued from a clicked link remained valid for 14 days with no re-auth challenge.', xPct: 29, y: 90, hue: 'violet', discovered: '2 days ago' },
      { id: 'n3', type: 'IAM Role: ec2-deploy-role', detail: 'Cloudsplaining found this role carries iam:PassRole across all production resources.', xPct: 50, y: 260, hue: 'amber', discovered: '1 day ago' },
      { id: 'n4', type: 'S3 Bucket: cobalt-prod-exports', detail: 'Prowler flagged this bucket public-read; it holds customer PII exports.', xPct: 71, y: 100, hue: 'amber', discovered: '6 hours ago' },
      { id: 'n5', type: 'Production DB: cobalt-orders-db', detail: 'Terminal node — the exports bucket has a direct network path to this database.', xPct: 92, y: 230, hue: 'red', discovered: 'Just now' },
    ],
  },
  1: {
    tenantName: 'Meridian Logistics', domain: 'meridianlog.com',
    sources: [
      'Email Authentication Defense (DMARC/SPF check, 1 hour ago)',
      'IAM Privilege-Escalation Graph (Cloudsplaining, 1 hour ago)',
    ],
    nodes: [
      { id: 'm1', type: 'Spoofed Email attempt', detail: 'Blocked at the gateway — DMARC is enforced at p=reject for meridianlog.com.', xPct: 15, y: 150, hue: 'green', discovered: '1 hour ago' },
      { id: 'm2', type: 'IAM Role: reporting-readonly', detail: 'Cloudsplaining confirms this role is scoped correctly — no privilege-escalation edges found.', xPct: 50, y: 220, hue: 'green', discovered: '1 hour ago' },
      { id: 'm3', type: 'No reachable production asset', detail: 'No path currently connects an external vector to a production asset for this tenant.', xPct: 85, y: 150, hue: 'green', discovered: '1 hour ago' },
    ],
  },
}

export interface TimelineEventRaw {
  time: string
  actor: string
  change: string
  impact: string
  severity: 'critical' | 'resolved' | 'warning' | 'info'
}

export const TIMELINE_EVENTS: TimelineEventRaw[] = [
  { time: 'Today, 9:42 AM', actor: 'T. Alvarez (MSP)', change: 'Disabled MFA enforcement on 3 admin accounts', impact: 'Opened path: Session Token → IAM Role', severity: 'critical' },
  { time: 'Yesterday, 4:15 PM', actor: 'Automation', change: 'Rotated DKIM key for meridianlog.com', impact: 'Closed a spoofing path on primary domain', severity: 'resolved' },
  { time: 'Yesterday, 11:03 AM', actor: 'J. Kim (Client IT)', change: 'Added new S3 bucket policy: public-read', impact: 'Opened path: IAM Role → Exposed Bucket', severity: 'critical' },
  { time: '2 days ago, 6:30 PM', actor: 'Automation', change: 'Ingested new dark-web credential dump match', impact: 'Flagged 2 identities as compromised', severity: 'warning' },
  { time: '3 days ago, 1:12 PM', actor: 'System', change: 'Baseline snapshot committed to ledger', impact: 'No drift detected', severity: 'info' },
]

export interface SeededAlert {
  severity: 'critical' | 'warning' | 'resolved' | 'info'
  module: string
  text: string
  tenant: string
  time: string
}

export const SEEDED_ALERTS: SeededAlert[] = [
  { severity: 'critical', module: 'IAM Privilege-Escalation Graph', text: 'New privilege-escalation loop detected: session token → prod IAM role', tenant: 'cobaltmfg.com', time: '4m ago' },
  { severity: 'warning', module: 'Cloud Misconfiguration Defense', text: 'Prowler flagged a public S3 bucket with customer PII exposure', tenant: 'halcyondental.com', time: '38m ago' },
  { severity: 'resolved', module: 'Email Authentication Defense', text: 'DKIM key rotation completed successfully', tenant: 'meridianlog.com', time: '2h ago' },
  { severity: 'warning', module: 'Host & Server Security', text: 'Amazon Inspector found an unpatched CVE on a public-facing EC2 host', tenant: 'irongatefin.com', time: '5h ago' },
]

// RUN_RESULT_POOL (the simulated-scan-result pool for lineup features
// without a real pipeline) was removed once Coverage Map plan Phase 8
// wired every remaining fake "Run Scan" fallback to a real call, a real
// navigation, or an honest "no trigger exists" message.
