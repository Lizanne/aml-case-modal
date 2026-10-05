/**
 * Domain model for the AML Case modal prototype.
 *
 * Business rule references (rule N) map to PROTOTYPE.md "Business rules".
 */
import mockCases from './mock-cases.json';

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
  options: {
    since?: string;
    sinceIso?: string;
    /**
     * Drop the words the lock GLYPH already carries.
     *
     * For the narrow header, where the lock shares one row with the title, two
     * pills, a button and two window controls, and "Locked to M. Torres · 15d"
     * is 40px more than the row has. Compact keeps every fact - who holds it,
     * for how long - and drops only "Locked to", which the icon beside it says
     * in 20px instead of 60.
     *
     * An option on THIS function rather than a second string built in the
     * header: rule 5 is that there is one source for the lock sentence, and a
     * shorter one composed elsewhere is exactly the drift that rule exists to
     * stop. Only the state that overflows is shortened; the other two are
     * already inside the row and stay as they are, so compact never changes a
     * line that had room.
     */
    compact?: boolean;
  } = {},
): string {
  /**
   * No resolved branch. It returned "Resolved - read-only" for a header that
   * no longer renders a lock line on a resolved case at all - the pill says
   * Resolved, and read-only is carried by the absent controls. Both callers
   * now avoid asking: the header does not render the line, and the widget's
   * lockChip returns null.
   */
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
      const who = ownerName ?? 'another agent';
      return `${options.compact ? '' : 'Locked to '}${who}${age ? ` · ${age}` : ''}`;
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

/**
 * Rule 5. IMAGES ONLY.
 *
 * PDFs were accepted until they were not: the type, the accept attribute, the
 * error copy, the fixtures and the preview's iframe viewer all went together.
 * 'other' stays, because it is what an unacceptable file IS - the kind the
 * error is raised about - and removing it would leave nothing to reject.
 */
export type AttachmentKind = 'image' | 'other';
export const ALLOWED_ATTACHMENT_KINDS: readonly AttachmentKind[] = ['image'] as const;

/**
 * Collapsed strip: exactly this many rows, always. Two, and it is not a cap.
 *
 * The collapsed strip is a PAIR, not a preview of the top of the list: the
 * oldest trigger and the newest one, with everything between them withheld.
 * The oldest is why the case exists and the newest is what just happened, and
 * those are the two questions a collapsed strip is asked. A slice off either
 * end answers one of them and pads the rest.
 *
 * It is also the point at which a toggle starts being worth offering: at or
 * below two rows the pair IS the whole history, so there is no middle to
 * reveal and no control to offer.
 *
 * Not a max-height, unlike the expanded number below. The collapsed strip
 * renders exactly two rows and never scrolls - what it withholds is absent,
 * not below a fold, which is the difference the toggle is for.
 */
export const TRIGGER_COLLAPSED_ROWS = 2;

/**
 * Expanded strip: every trigger is in the DOM, this many are on screen.
 *
 * A window, not a limit on what is rendered. The strip sits above the workflow
 * and must never push it down the page, so past five rows it scrolls inside
 * itself and the header stays put above the scroll region.
 */
export const TRIGGER_EXPANDED_ROWS = 5;

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
 * A lone widget card stops here, and docks to the panel's right edge.
 *
 * Separate from SOLO_MAX_PX and much smaller, because they are capping
 * different things. A panel at 1080 is full of content; a card at 1080 is an
 * icon, two short lines and several hundred pixels of nothing before the
 * buttons. Below this width there is no cap to apply and the card fills the
 * content area between the gutters.
 *
 * It does NOT apply to two cards sharing the row - there the split is the
 * panels' own, and each card stands over the one it belongs to.
 */
export const WIDGET_SOLO_MAX_PX = 640;

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
  /**
   * What the preview loads.
   *
   * DELIBERATE, not a bug: every PDF fixture points at the same sample PDF and
   * every image fixture at the same sample PNG. The prototype ships two real
   * assets and reuses them; the names and sizes stay distinct so the list still
   * reads as separate files, which is what the UI is here to demonstrate.
   * Anything real would carry a per-file URL from the upload service.
   */
  url: string;
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
 * How the case came into being. Only a MANUAL case carries a motivation, so
 * only a manual case has a creation event to show.
 */
export type CaseOrigin = 'manual' | 'system';

/** The closed set of reasons an agent can raise a case under. */
export const CREATION_REASONS = ['Referral', 'OGMS', 'CCMM'] as const;
export type CreationReason = (typeof CREATION_REASONS)[number];

/**
 * The case being opened, rendered as the first thing in the stream.
 *
 * An event and not an outcome: nobody DID this as part of the investigation,
 * it is the fact the investigation starts from. So it takes the event row's
 * unboxed treatment rather than a card, exactly as a severity change does.
 *
 * SYSTEM-CREATED CASES DO NOT HAVE ONE. A system case has no motivation text
 * to put on line two, and an event whose second line is empty would be a
 * heading pretending to be a record. If a system equivalent is ever specified,
 * it gets its own label rather than reusing this one with a blank description.
 */
export interface CaseCreatedEvent {
  kind: 'event';
  id: string;
  type: 'case-created';
  reason: CreationReason;
  /** Free text. Line two, clamped to two lines with the full text on hover. */
  description: string;
  actor: string;
  at: string;
}

/**
 * Lock and unlock are NOT stream items. They are case-history facts and live in
 * the Timeline tab only, per the spec's Case Timeline definition.
 *
 * The union below is deliberately narrow so the stream cannot represent one:
 * the workflow stream carries outcomes (including the decision), severity
 * changes and the case's own creation, and nothing else.
 */
export type EventItem = SeverityChangeEvent | CaseCreatedEvent;
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

export function isSeverityChange(item: StreamItem): item is SeverityChangeEvent {
  return item.kind === 'event' && item.type === 'severity-change';
}

export function isCaseCreated(item: StreamItem): item is CaseCreatedEvent {
  return item.kind === 'event' && item.type === 'case-created';
}

/**
 * Severity ordering, most severe first, taken straight from
 * `mock-cases.json > severityRanking.order` so the two cannot drift.
 *
 * Confirmed by compliance: high to low is COMPLIANCE, EDD, AML - so lowest to
 * highest is AML, EDD, COMPLIANCE. This is NOT alphabetical and NOT the order
 * you would guess, which is exactly why no direction is ever written down
 * anywhere: derive it from SEVERITY_RANK via severityDirection().
 *
 * Any direction of change is allowed. Nothing gates which severity you may move
 * to; the ranking only decides what the change is CALLED.
 */
export const SEVERITY_ORDER = mockCases.severityRanking.order as readonly Severity[];

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

/* ==========================================================================
 * Global AML Cases table - PROTOTYPE-TABLE.md
 *
 * The table and the modal are two views of one store, so everything the table
 * needs lives here beside the modal's own types rather than in a parallel set.
 * ========================================================================== */

/** Which queue a case sits in. Decided by severity alone, rule 1. */
export type CaseQueue = 'active' | 'compliance';

/**
 * Severity decides the queue, and nothing else does.
 *
 * Derived, never stored: a case that escalates must leave one tab and join the
 * other in the same tick, and a stored queue field is a second place for that
 * to be wrong.
 */
export function queueFor(severity: Severity): CaseQueue {
  return severity === 'COMPLIANCE' ? 'compliance' : 'active';
}

export type PriorityBand = 'low' | 'medium' | 'high' | 'urgent';

/**
 * The tiers from the scoring matrix. Higher is more urgent, and the band and
 * its label are stated once here so they cannot disagree.
 *
 * These replaced placeholder thresholds (75/50/25/0) invented before the
 * document existed. Open question 19 is closed.
 */
export const PRIORITY_BANDS: readonly { band: PriorityBand; min: number; label: string }[] = [
  { band: 'urgent', min: 150, label: 'Urgent' },
  { band: 'high', min: 60, label: 'High' },
  { band: 'medium', min: 30, label: 'Medium' },
  // The matrix floor is 10, not 0: AML risk is scored on every case and its
  // lowest tier is 10, so nothing can total less. 0 here rather than 10 so the
  // lookup below can never miss - a band that returns undefined for an
  // impossible score is still a crash waiting for a data change.
  { band: 'low', min: 0, label: 'Low' },
];

/**
 * Derived from the score, never read from the fixture.
 *
 * The fixture used to carry a band too, and a stored band is a label free to
 * contradict the number printed next to it - the same reason severity
 * direction is computed from SEVERITY_RANK rather than stored.
 */
export function priorityBand(score: number): PriorityBand {
  return PRIORITY_BANDS.find((b) => score >= b.min)!.band;
}

export function priorityLabel(score: number): string {
  return PRIORITY_BANDS.find((b) => score >= b.min)!.label;
}

/* ---- the scoring matrix -------------------------------------------------
 *
 * "EDD overhaul ticket priority scoring". Four categories, each a fixed tier
 * rather than a curve, totalling 10 to 200.
 *
 * The four INPUTS are what the fixture stores. Points, breakdown and total are
 * all computed here, so a case cannot carry a score that its own factors do
 * not add up to - which the previous hand-authored breakdowns could, and the
 * verifier had to check for.
 *
 * Two deliberate departures from the source document, both recorded in
 * PROTOTYPE-TABLE.md:
 *
 *  1. High runs to 149, not 99. As written the tiers leave 100-149 in no band
 *     at all, while Low/Medium and Medium/High are contiguous - and 100 is
 *     trivially reachable (a £2,000+ withdrawal on a high-risk player). The 99
 *     reads as a leftover from an earlier 100-point scale.
 *  2. SG vulnerabilities and player complaint are marked in the document as
 *     fields that do not exist yet. They are modelled here as booleans so the
 *     matrix can be shown whole; they are prototype data, not live data.
 */
export type AmlRisk = 'low' | 'medium' | 'high';

/** What a case stores. Everything else about priority is derived from this. */
export interface CaseScoring {
  /** Pending withdrawals, in whole pounds. */
  pendingWithdrawals: number;
  amlRisk: AmlRisk;
  sgVulnerability: boolean;
  complaint: boolean;
}

/** Descending, so the first tier a value clears is its tier. */
export const WITHDRAWAL_TIERS: readonly { min: number; points: number }[] = [
  { min: 2000, points: 50 },
  { min: 1000, points: 30 },
  { min: 500, points: 20 },
  { min: 100, points: 10 },
  { min: 1, points: 5 },
  { min: 0, points: 0 },
];

export const AML_RISK_POINTS: Readonly<Record<AmlRisk, number>> = {
  low: 10,
  medium: 25,
  high: 50,
};

export const SG_VULNERABILITY_POINTS = 50;
export const COMPLAINT_POINTS = 50;

/** The lowest and highest a case can score, per the matrix. */
export const PRIORITY_MIN = 10;
export const PRIORITY_MAX = 200;

export function withdrawalPoints(amount: number): number {
  return WITHDRAWAL_TIERS.find((t) => amount >= t.min)!.points;
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const AML_RISK_LABEL: Readonly<Record<AmlRisk, string>> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
};

/**
 * The score, the band and the four breakdown lines, from the four inputs.
 *
 * Always four lines, in the matrix's own order, including the ones worth
 * nothing: "SG vulnerabilities - None - 0" is information. Dropping the zeroes
 * would leave the reader unable to tell a factor that was checked and cleared
 * from one that was never assessed.
 */
export function priorityOf(s: CaseScoring): Priority {
  const breakdown: PriorityLine[] = [
    {
      label: 'Withdrawals pending',
      amount: GBP.format(s.pendingWithdrawals),
      points: withdrawalPoints(s.pendingWithdrawals),
    },
    {
      label: 'AML risk level',
      amount: AML_RISK_LABEL[s.amlRisk],
      points: AML_RISK_POINTS[s.amlRisk],
    },
    {
      label: 'SG vulnerabilities',
      amount: s.sgVulnerability ? 'Detected' : 'None',
      points: s.sgVulnerability ? SG_VULNERABILITY_POINTS : 0,
    },
    {
      label: 'Player complaint',
      amount: s.complaint ? 'Yes' : 'No',
      points: s.complaint ? COMPLAINT_POINTS : 0,
    },
  ];
  const score = breakdown.reduce((n, line) => n + line.points, 0);
  return { score, band: priorityBand(score), breakdown };
}

/** One line of the priority popover. Always four per case. */
export interface PriorityLine {
  label: string;
  amount: string;
  points: number;
}

export interface Priority {
  score: number;
  band: PriorityBand;
  breakdown: PriorityLine[];
}

/** A Work chip. Nothing in that column is actionable. */
export type WorkState = 'todo' | 'done';

export interface WorkItem {
  type: string;
  state: WorkState;
  /** When it was recorded. Set on done items; a to-do has not happened yet. */
  at?: string;
  /** Who recorded it. */
  by?: string;
}

export interface WorkTypeDef {
  id: string;
  label: string;
  /**
   * Rafal (2 Oct): the row shows only the required actions, and for now that
   * set is fixed - Contact player, Open source searches, EDD report, in the
   * fixture's order. Everything else is custom and counts toward +N.
   */
  required?: boolean;
}

/**
 * SLA bands, rule 6 of the table spec. Four bands, one traffic light.
 *
 * `breached` is not a fifth colour: it stays red and switches from outline to
 * solid fill with the time in bold.
 */
export type SlaBand = 'fresh' | 'warn' | 'late' | 'breached';

export const SLA_THRESHOLDS_H: readonly { band: SlaBand; underH: number }[] = [
  { band: 'fresh', underH: 12 },
  { band: 'warn', underH: 36 },
  { band: 'late', underH: 48 },
];

export function slaBand(elapsedMs: number): SlaBand {
  const hours = elapsedMs / 3_600_000;
  return SLA_THRESHOLDS_H.find((t) => hours < t.underH)?.band ?? 'breached';
}

/** `Xh Ym`, the only format the SLA column uses. */
export function formatElapsed(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 60_000));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/** A case as the table holds it. The modal reads one of these by id. */
export interface CaseRecord {
  id: string;
  player: Player;
  status: CaseStatus;
  severity: Severity;
  /** Materialised at seed time - see CasesStore on why the fixture stores an offset. */
  createdAt: string;
  lock: { state: LockState; owner: Agent | null; since: string | null };
  /** The four inputs the matrix scores. The only authored priority data. */
  scoring: CaseScoring;
  /**
   * Derived from `scoring` by priorityOf(), at seed time and again whenever a
   * factor changes. Never authored, never edited in place: a score and the
   * lines that are supposed to add up to it cannot be allowed to drift apart.
   */
  priority: Priority;
  /**
   * What the case is about, and how much has happened since.
   *
   * Ordered oldest first, so [0] is the INITIATING trigger - the one the case
   * was opened for. The table shows that one and a count; the rest belong in
   * the case, not in the queue.
   */
  triggers: TriggerRef[];
  linkedAccounts: number;
  actions: WorkItem[];
  /**
   * Dev only. The stress fixture tags each edge case with the edge it is for,
   * and verify:stress finds its rows by this. Absent on authored cases; read
   * by nothing in the product.
   */
  stress?: { n: number; name: string; slaMinutes?: number };
}

/**
 * A trigger as the TABLE needs it: what fired and when.
 *
 * Deliberately thinner than the modal's trigger - no detail, no isNew - which
 * is the difference between the queue and the case. The queue says a case
 * exists and roughly how loud it is; what each trigger actually said is a
 * reason to open it.
 */
export interface TriggerRef {
  id: string;
  name: string;
  /**
   * The modal's own trigger copy, carried through unchanged.
   *
   * Not a second string written for the table: the strip and the row have to
   * describe the same event the same way, and the fixture already had this.
   */
  detail: string;
  /** Materialised at seed time, like createdAt. */
  at: string;
}

/** Sort choice, rule 6. Persists for the session. */
export type TableSort = 'priority' | 'sla';
