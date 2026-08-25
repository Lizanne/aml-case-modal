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
/**
 * A relative age in the widget's own shorthand: 3d, 2mo, 1mo.
 *
 * Same vocabulary as the meta lines beside it ("Opened 12d ago", "Last trigger
 * 1mo ago") so the lock age reads as one more of those rather than a second
 * time format. Rounded DOWN at every step - a lock 29 days old is "4w" worth of
 * stale, and calling it "1mo" would overstate it.
 */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function lockStatusLine(
  state: LockState,
  ownerName: string | null | undefined,
  options: { since?: string; sinceIso?: string; resolved?: boolean } = {},
): string {
  if (options.resolved) return 'Resolved - read-only';
  switch (state) {
    case 'locked-to-me':
      // Your own lock needs no age - you know when you took it. The band still
      // shows the absolute stamp when it is given one.
      return `Locked to you${options.since ? ` since ${options.since}` : ''}`;
    case 'locked-to-other': {
      /**
       * The age is REQUIRED information, not decoration: it is how an agent
       * judges whether someone else's lock is stale enough to take. Computed
       * here rather than passed in as text, so the widget and the panel band
       * cannot show two different ages for one lock.
       */
      const age = options.sinceIso ? relativeAge(options.sinceIso) : '';
      return `Locked to ${ownerName ?? 'another agent'}${age ? ` · ${age}` : ''}`;
    }
    default:
      return 'Not locked';
  }
}

/**
 * The lock vocabulary, in full. Exactly three states, everywhere:
 * "Locked to you", "Locked to [name]", "Not locked".
 *
 * "Unassigned" was a fourth word for the third state, used only by the panel
 * band, and it did not say what to do about it either.
 */
export const NOT_LOCKED_HINT = 'Not locked. Lock the case to record outcomes.';

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
/** A single open panel stops here; two still split the whole row. */
export const SOLO_MAX_PX = 1080;

/**
 * The width a right-docked solo element takes: the panel when one is open, and
 * the widget row when none is. ONE string, used by both, so their left and
 * right edges are the same edges rather than two expressions that happen to
 * agree today.
 */
export const SOLO_WIDTH_CSS = `min(100%, ${SOLO_MAX_PX}px)`;

/** The narrowest a docked modal may be before two of them stop being useful. */
export const MIN_DUAL_PANEL_PX = 560;

/**
 * Below this STAGE width there is no room for two modals side by side, so
 * opening the second auto-minimises the first to its dock bar.
 *
 * Derived, not chosen. It was a flat 1200, picked when the stage was the whole
 * page; the frame 09 composition then put a 256px nav beside it, which left the
 * stage at 1144 on a 1440 desktop - so the dual layout auto-collapsed at the
 * very width frame 09 is drawn at. Deriving it from the panel minimum means the
 * nav, the gutters and the gap are all already accounted for: the stage is what
 * is measured, and the stage is what the panels actually get.
 */
export const STACK_AUTO_MINIMISE_PX = MIN_DUAL_PANEL_PX * 2 + MODAL_GAP_PX;

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
  /** Why the case was raised. The row's second line. */
  reason: string;
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
