// Shared color/style helpers, matching Command_New_face.html's
// pillStyle/severityColor/hueColor functions.

export const COLORS = {
  accent: 'var(--accent)',
  violet: 'var(--violet)',
  amber: 'var(--amber)',
  red: 'var(--red)',
  green: 'var(--green)',
}

export function severityColor(sev: string): string {
  const map: Record<string, string> = {
    // Demo/mockup vocabulary (Overview's seeded alerts, Portal status pills)
    critical: COLORS.red,
    warning: COLORS.amber,
    resolved: COLORS.green,
    info: COLORS.accent,
    healthy: COLORS.green,
    'at risk': COLORS.amber,
    // Real backend vocabulary (Finding.severity / CloudPrivEscPath.severity:
    // critical | high | medium | low — see cloud_scan_service.py)
    high: COLORS.amber,
    medium: COLORS.accent,
    low: COLORS.green,
  }
  return map[sev.toLowerCase()] || COLORS.accent
}

export function hueColor(hue: string): string {
  const map: Record<string, string> = {
    cyan: COLORS.accent,
    violet: COLORS.violet,
    amber: COLORS.amber,
    red: COLORS.red,
    green: COLORS.green,
  }
  return map[hue] || COLORS.accent
}

export function riskVerdictColor(verdict: string): string {
  const map: Record<string, string> = {
    likely_safe: COLORS.green,
    uncertain: COLORS.amber,
    likely_dangerous: COLORS.red,
  }
  return map[verdict] || COLORS.accent
}

export function pillStyle(color: string): string {
  return `display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font:700 10px 'IBM Plex Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:0.03em;color:${color};border:1px solid ${color};background:color-mix(in srgb, ${color} 16%, transparent);width:fit-content;white-space:nowrap;flex-shrink:0;`
}
