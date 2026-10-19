// Shared recipient-outcome helpers — used by PhishingCampaignView.vue's
// recipient list and PhishingRecipientEvidence.vue's drill-down panel, so
// "what counts as this person's worst outcome" is defined exactly once.

export function worstOutcome(r: { event_types: string[] }): { label: string; tone: string } {
  // credential_entered always wins, regardless of a later report — handing
  // over a password is the one outcome nothing else offsets. Below that,
  // a report is treated as a genuinely good outcome (report rate matters
  // more than click rate — a click-then-report is a training success, not
  // a failure), which is why it outranks a bare click/open even though a
  // click happened first.
  if (r.event_types.includes('credential_entered')) return { label: 'ENTERED CREDS', tone: 'crit' }
  if (r.event_types.includes('reported')) {
    return r.event_types.includes('clicked')
      ? { label: 'CLICKED, THEN REPORTED', tone: 'good' }
      : { label: 'REPORTED', tone: 'good' }
  }
  if (r.event_types.includes('clicked')) return { label: 'CLICKED', tone: 'warn' }
  if (r.event_types.includes('opened')) return { label: 'OPENED', tone: 'info' }
  // A real transport failure (Phishing Simulation roadmap Phase 17) —
  // never delivered, so "no interaction" would misleadingly imply the
  // recipient saw it and did nothing.
  if (r.event_types.includes('send_failed') && !r.event_types.includes('sent')) return { label: 'DELIVERY FAILED', tone: 'crit' }
  return { label: 'NO INTERACTION', tone: 'muted' }
}

export function eventTone(t: string): string {
  return { credential_entered: 'crit', clicked: 'warn', opened: 'info', reported: 'good', sent: 'muted', send_failed: 'crit' }[t] ?? 'muted'
}

export function shortHash(h: string): string {
  return `sha256:${h.slice(0, 8)}…`
}

export function provenanceLabel(provenance: string | null): string {
  if (provenance === 'sso_session') return 'SSO session identity'
  if (provenance === 'iam_tag') return 'IAM Email tag'
  return 'unknown provenance'
}

// Factual only — a short gap doesn't prove recklessness and a long one
// doesn't prove hesitation, so this reports the real elapsed time and
// nothing more (Phishing Simulation roadmap Phase 12's honesty constraint).
export function formatDwell(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${minutes}m ${rest}s` : `${minutes} minute${minutes === 1 ? '' : 's'}`
}
