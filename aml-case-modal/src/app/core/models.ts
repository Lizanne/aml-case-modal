/**
 * Domain model for the AML Case modal prototype.
 *
 * Business rule references (rule N) map to PROTOTYPE.md "Business rules".
 */
import mockCase from './mock-case.json';

/** Rule 2. IDLE appears in the spec but is undefined there (open question 1) - not implemented. */
export type CaseStatus = 'OPEN' | 'RESOLVED';

export type Severity = 'AML' | 'EDD' | 'COMPLIANCE';

/** Rule 3. */
export type LockState = 'unlocked' | 'locked-to-me' | 'locked-to-other';

/**
 * The lock status sentence. ONE implementation, used by the panel band, both
 * widgets and the force-unlock dialog.
 *
 * It was written out separately in the header and in the widget, which is how
 * "Locked to you" and "Locked by you" ended up on screen at the same time,
 * one of them with a full stop. Copy that appears on four surfaces is not four
 * strings.
 */
export function lockStatusLine(
  state: LockState,
  ownerName: string | null | undefined,
  options: { since?: string; resolved?: boolean } = {},
): string {
  if (options.resolved) return 'Resolved - read-only';
  const since = options.since ? ` since ${options.since}` : '';
  switch (state) {
    case 'locked-to-me':
      return `Locked to you${since}`;
    case 'locked-to-other':
      return `Locked to ${ownerName ?? 'another agent'}${since}`;
    default:
      return 'Unassigned';
  }
}

export type ActionTypeId =
  | 'open-source-searches'
  | 'player-contact'
  | 'note'
  | 'decision';

/**
 * Rule 4. The two mandatory actions. Order is presentation order only -
 * they are completable in ANY order and Submit checks set membership.
 */
export const REQUIRED_ACTIONS: readonly ActionTypeId[] = [
  'open-source-searches',
  'player-contact',
] as const;

/** Rule 5, open question 5. Single source of truth for the per-file size cap. */
export const ATTACHMENT_MAX_MB = 10;
export const ATTACHMENT_MAX_KB = ATTACHMENT_MAX_MB * 1024;

/** Rule 5. PDF and images only. */
export type AttachmentKind = 'pdf' | 'image' | 'other';
export const ALLOWED_ATTACHMENT_KINDS: readonly AttachmentKind[] = ['pdf', 'image'] as const;

/**
 * Collapsed strip: at or below this many triggers there is nothing worth
 * hiding, so every row shows and no overflow badge appears.
 */
export const TRIGGER_COLLAPSE_THRESHOLD = 3;

/** Above the threshold, the collapsed strip previews this many rows. */
export const TRIGGER_PREVIEW_ROWS = 2;

/** Expanded strip shows at most this many rows before it scrolls internally. */
export const TRIGGER_EXPANDED_ROWS = 10;

/**
 * Below this MODAL width the two-panel split becomes a segmented control.
 *
 * Measured on the modal, not the window, and not conditioned on how many
 * modals are open: one rule serves dual-modal mode and small screens alike.
 */
export const NARROW_BREAKPOINT_PX = 720;

/** Widest a single modal gets, per the layout brief (1000x820, resizable). */

/** Gutter between two docked modals. */
export const MODAL_GAP_PX = 16;

/**
 * Below this stage width there is no room for two modals side by side, so
 * opening the second auto-minimises the first to its dock bar.
 */
export const STACK_AUTO_MINIMISE_PX = 1200;

/** Reflow duration. Kept here so the CSS and any timing logic agree. */
export const REFLOW_MS = 300;

export interface Agent {
  id: string;
  name: string;
  isMe: boolean;
}

export interface Player {
  id: string;
  name: string;
  status: string;
}

export interface ActionTypeDef {
  id: ActionTypeId;
  label: string;
  hint: string;
}

export interface Trigger {
  id: string;
  name: string;
  detail: string;
  at: string;
  /** Rule 11. Persists until resync (open question 6). */
  isNew?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  sizeKb: number;
}

/** Rule 5. Per-file inline error. Never removes files that did validate. */
export interface AttachmentError {
  id: string;
  file: string;
  reason: 'type' | 'size';
  message: string;
}

/** Rule 6. Immutable once saved; carries its own snapshot reference. */
export interface OutcomeItem {
  kind: 'outcome';
  id: string;
  actionType: ActionTypeId;
  title: string;
  actor: string;
  at: string;
  note: string;
  attachments: Attachment[];
  snapshotAt: string;
}

export interface SeverityChangeEvent {
  kind: 'event';
  id: string;
  type: 'severity-change';
  from: Severity;
  to: Severity;
  direction: 'escalation' | 'de-escalation';
  actor: string;
  at: string;
  reason: string;
}

/**
 * Lock and unlock are NOT stream items. They are case-history facts and live in
 * the Timeline tab only, per the spec's Case Timeline definition.
 *
 * The union below is deliberately narrow so the stream cannot represent one:
 * the workflow stream carries outcomes (including the decision) and severity
 * changes, and nothing else.
 */
export type EventItem = SeverityChangeEvent;
export type StreamItem = OutcomeItem | EventItem;

export interface TimelineEntry {
  at: string;
  what: string;
  who: string;
}

export interface PastCase {
  caseId: string;
  status: CaseStatus;
  severity: Severity;
  dateCreated: string;
}

export interface StarredCommentary {
  at: string;
  tag: string;
  text: string;
  who: string;
}

/** Rule 5. The in-progress record-form. Lives in the store so a new trigger
 *  arriving mid-draft can disable Save without destroying the draft (open question 2). */
export interface Draft {
  actionType: ActionTypeId;
  title: string;
  note: string;
  attachments: Attachment[];
  errors: AttachmentError[];
  /** Rule 5: the agent must choose explicitly. `null` = nothing chosen yet, no default. */
  lockAfter: 'keep' | 'release' | null;
  /** Set on a failed Save so validation messages only appear after an attempt. */
  attempted: boolean;
  /** True when the form replaced a required-action placeholder. */
  fromPlaceholder: boolean;
}

export type DialogId = 'severity' | 'decision' | 'confirm-unlock' | null;
export type InfoTab = 'snapshot' | 'past-cases' | 'starred' | 'timeline';

export interface SnapshotView {
  outcomeId: string;
  title: string;
  at: string;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  AML: 'AML',
  EDD: 'EDD',
  COMPLIANCE: 'Compliance',
};

/**
 * Abbreviated chip labels for the narrow / dual-modal layout, where the full
 * labels do not fit on one row (Figma frame 09).
 */
export const SHORT_ACTION_LABEL: Partial<Record<ActionTypeId, string>> = {
  'open-source-searches': 'Searches',
  'player-contact': 'Contact',
};

export function isOutcome(item: StreamItem): item is OutcomeItem {
  return item.kind === 'outcome';
}

export function isEvent(item: StreamItem): item is EventItem {
  return item.kind === 'event';
}

/**
 * Severity ordering, most severe first, taken straight from
 * `mock-case.json > severityRanking.order` so the two cannot drift.
 *
 * Confirmed by compliance: high to low is COMPLIANCE, EDD, AML - so lowest to
 * highest is AML, EDD, COMPLIANCE. This is NOT alphabetical and NOT the order
 * you would guess, which is exactly why no direction is ever written down
 * anywhere: derive it from SEVERITY_RANK via severityDirection().
 *
 * Any direction of change is allowed. Nothing gates which severity you may move
 * to; the ranking only decides what the change is CALLED.
 */
export const SEVERITY_ORDER = mockCase.severityRanking.order as readonly Severity[];

/** Higher number = more severe. */
export const SEVERITY_RANK: Record<Severity, number> = SEVERITY_ORDER.reduce(
  (acc, severity, index) => {
    acc[severity] = SEVERITY_ORDER.length - index;
    return acc;
  },
  {} as Record<Severity, number>,
);

/** Rule 8. The UI must state escalation vs de-escalation; this is the source. */
export function severityDirection(
  from: Severity,
  to: Severity,
): 'escalation' | 'de-escalation' {
  return SEVERITY_RANK[to] > SEVERITY_RANK[from] ? 'escalation' : 'de-escalation';
}
