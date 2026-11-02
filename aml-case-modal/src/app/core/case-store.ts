import { Injectable, computed, signal, inject } from '@angular/core';

import { CasesStore } from './cases-store';
import { DEFAULT_CASE_ID, SHARED, caseFixture } from './case-fixture';
import {
  CaseCreatedEvent,
  CaseOrigin,
  CreationReason,
  ALLOWED_ATTACHMENT_KINDS,
  ATTACHMENT_MAX_KB,
  ATTACHMENT_MAX_MB,
  ActionTypeDef,
  ActionTypeId,
  Agent,
  Attachment,
  AttachmentError,
  AttachmentKind,
  CaseStatus,
  DialogId,
  Draft,
  InfoTab,
  LockState,
  OutcomeItem,
  PastCase,
  Player,
  REQUIRED_ACTIONS,
  SHORT_ACTION_LABEL,
  ResyncCompletedEvent,
  SectionRisk,
  Severity,
  StarredCommentary,
  StreamItem,
  TimelineEntry,
  Trigger,
  TriggerAddedEvent,
  isOutcome,
  isResyncCompleted,
  severityDirection,
} from './models';
import {
  GENERATIONS,
  RISK_FIELDS,
  RISK_SECTIONS,
  RISK_STATUS_LABEL,
  RiskAnswer,
  RiskFieldDef,
  RiskStatus,
  joinLabels,
  riskFieldDef,
  sameValue,
} from './risk-assessment';

/**
 * Why recording is currently impossible. `null` means the agent may record.
 *
 * 'out-of-sync' is gone: a new trigger no longer blocks recording. It is
 * written into the workflow, and the next resync picks up what it changed.
 */
export type RecordBlock = 'resolved' | 'unlocked' | 'locked-to-other' | null;

export interface RequiredActionState {
  /** Unique per item: 'assess:<field id>', the action type, or 'finalize'. */
  key: string;
  actionType: ActionTypeId;
  /** The Risk assessment field, for an assessment. */
  fieldId: string | null;
  label: string;
  /** Abbreviated form, used by the narrow / dual-modal layout. */
  shortLabel: string;
  done: boolean;
  recordedAt: string | null;
  /**
   * An assessment's current status, so the chip and the placeholder can show
   * the same pill the Risk assessment row shows. Null for the other items.
   */
  status: RiskStatus | null;
  /**
   * Whether it can be started yet. False only for Finalize risk assessment
   * while any field is still Action required: it stays in view, disabled.
   */
  available: boolean;
}

/** One field of the Risk assessment section, as it stands now. */
export interface RiskFieldState {
  def: RiskFieldDef;
  value: string[];
  status: RiskStatus;
  /** Set when the agent's assessment is what the status says. */
  assessedBy: string | null;
  assessedAt: string | null;
  /**
   * A required assessment: manual fields always, plus any field a resync sent
   * back to Action required. Once required, it stays on the list - done or not.
   */
  required: boolean;
}

/** How long the simulated resync takes. Long enough to read the overlay. */
export const RESYNC_MS = 1500;

/**
 * The Risk assessment, derived - never stored field by field.
 *
 * The current generation supplies the values and the system's risk. The
 * stream is then replayed in order: an agent's assessment sets a field's
 * status, and a resync that changed a field's risk sends it back to Action
 * required. Deriving it means a seeded stream and a recorded one produce the
 * same panel, and the panel cannot disagree with the workflow beside it.
 */
export function deriveRiskFields(generation: number, stream: StreamItem[]): RiskFieldState[] {
  const readings = GENERATIONS[Math.min(generation, GENERATIONS.length - 1)];
  const state = new Map<string, RiskFieldState>(
    RISK_FIELDS.map((def) => {
      const reading = readings[def.id];
      const status: RiskStatus = def.informational
        ? 'informational'
        : def.manual
          ? 'action-required'
          : (reading.systemRisk ?? 'action-required');
      return [
        def.id,
        { def, value: reading.value, status, assessedBy: null, assessedAt: null, required: !!def.manual },
      ];
    }),
  );
  for (const item of stream) {
    if (isOutcome(item) && item.assessment) {
      const field = state.get(item.assessment.fieldId);
      if (!field) continue;
      field.status = item.assessment.risk;
      field.assessedBy = item.actor;
      field.assessedAt = item.at;
    } else if (isResyncCompleted(item)) {
      for (const id of item.riskChangedIds) {
        const field = state.get(id);
        if (!field) continue;
        field.status = 'action-required';
        field.assessedBy = null;
        field.assessedAt = null;
        field.required = true;
      }
    }
  }
  return RISK_FIELDS.map((def) => state.get(def.id)!);
}

/** The finalize table: every assessed section, risk if any field in it is. */
export function sectionRisksOf(fields: RiskFieldState[]): SectionRisk[] {
  return RISK_SECTIONS.filter((section) =>
    fields.some((f) => f.def.section === section && f.status !== 'informational'),
  ).map((section) => ({
    section,
    risk: fields.some((f) => f.def.section === section && f.status === 'risk'),
  }));
}

/** The modal's own copy of a trigger's detail: the resync sentence no longer applies. */
/**
 * The resync entry's second line, and the announcement. "No changes", or the
 * updated labels followed by the ones whose risk moved.
 */
export function resyncSummary(e: ResyncCompletedEvent): string {
  if (!e.updated.length) return 'No changes.';
  const updated = `Updated values: ${e.updated.join(', ')}.`;
  if (!e.riskChanged.length) return updated;
  return `${updated} Risk associated with ${joinLabels(e.riskChanged)} changed - manual action needed.`;
}

/**
 * The resync rules, field by field, between two generations:
 *   - value unchanged: nothing
 *   - value changed, risk unchanged: listed as updated, nothing else
 *   - value and risk changed: listed as updated AND as risk changed, which
 *     sends the field back to Action required
 * A manual field has no system risk to compare, so a new value is itself a
 * reason to look again. An informational field never carries a risk.
 */
export function resyncDiff(fromGen: number, toGen: number): {
  updated: RiskFieldDef[];
  riskChanged: RiskFieldDef[];
} {
  const from = GENERATIONS[fromGen];
  const to = GENERATIONS[toGen];
  const updated: RiskFieldDef[] = [];
  const riskChanged: RiskFieldDef[] = [];
  for (const def of RISK_FIELDS) {
    if (sameValue(from[def.id].value, to[def.id].value)) continue;
    updated.push(def);
    if (def.informational) continue;
    if (def.manual || from[def.id].systemRisk !== to[def.id].systemRisk) riskChanged.push(def);
  }
  return { updated, riskChanged };
}

export function triggerDetail(detail: string): string {
  return detail.replace(/\s*Snapshot resync required[^.]*\.?/i, '').trim();
}

/** Candidate file handed to the store by the record-form before validation. */
export interface CandidateFile {
  name: string;
  sizeKb: number;
  kind: AttachmentKind;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/**
 * The severity the case OPENED at.
 *
 * Not `case.severity`: in the fixture that field holds the severity of the
 * fully-played-out case (EDD, after the escalation), while the case was opened
 * at AML - the timeline says "Case created (AML)". The first severity-change
 * event is what tells you where it started, so derive it from there and fall
 * back to `case.severity` for a case that never changed severity.
 */
function openingSeverityOf(fx: ReturnType<typeof caseFixture>): Severity {
  const firstChange = (fx.workflow as any[]).find(
    (w) => w.kind === 'event' && w.type === 'severity-change',
  );
  return (firstChange?.from ?? fx.case.severity) as Severity;
}

/** The default case's opening severity. Per-case, use openingSeverityOf(). */
const OPENING_SEVERITY: Severity = openingSeverityOf(caseFixture());

const nowIso = () => new Date().toISOString();

/**
 * The fallback pair, for attachments the prototype ships no document for.
 *
 * Named fixtures do NOT use these - see SAMPLE_BY_NAME below. These are what a
 * file picked in the prototype resolves to, because a file picked here has no
 * bytes behind it: the picker hands over a name and a size, and the File
 * itself is dropped before it reaches the store.
 */
export const SAMPLE_IMAGE = 'assets/samples/promo-catch-a-triple-wave.png';

/**
 * Each named fixture, mapped to its own document. One entry, now that
 * attachments are images only.
 *
 * The three PDF fixtures went with PDF support. They existed to solve a
 * problem that no longer exists: they had all pointed at one shared sample, so
 * our header named the attachment that was clicked while the browser's PDF
 * toolbar named the file actually loaded - a preview captioned
 * "call-log-2026-08-11.pdf" above a viewer reading "adverse-media-results.pdf".
 *
 * The map stays for the one image, and stays a map: it is where a real upload
 * service would hand back a per-file URL, and the next fixture goes in here
 * rather than beside the fallback.
 *
 * The image is the only REAL file in this list. It replaced sanctions-screen.png,
 * which was a drawn-up screening export - plausible, but built to flatter the
 * preview it was displayed in. This is an actual campaign creative, so the
 * image path is exercised against real dimensions, real colour and real text
 * at real sizes rather than against a mock-up sized to fit. Quantised to a
 * 256-colour palette on the way in: 188KB rather than the 912KB a straight PNG
 * costs, and at 1340x1000 the two are indistinguishable.
 */
const SAMPLE_BY_NAME: Readonly<Record<string, string>> = {
  'promo-catch-a-triple-wave.png': 'assets/samples/promo-catch-a-triple-wave.png',
};

/**
 * The document for an attachment, by its own filename.
 *
 * Exported because three construction sites need the same answer - mapAttachment
 * here, addFiles below, and the attachment() seed helper in scenarios.ts - and
 * a preview is only honest if all three resolve identically.
 */
export function sampleUrlFor(name: string): string {
  return SAMPLE_BY_NAME[name] ?? SAMPLE_IMAGE;
}

function mapAttachment(raw: {
  name: string;
  type: string;
  sizeKb: number;
  url?: string;
}): Attachment {
  const kind = (raw.type as AttachmentKind) ?? 'other';
  return {
    id: nextId('att'),
    name: raw.name,
    kind,
    sizeKb: raw.sizeKb,
    url: raw.url ?? sampleUrlFor(raw.name),
  };
}

/**
 * The single in-memory store. Every component reads from here; every mutation
 * goes through a command on here, so the business rules live in one file.
 */
/**
 * Newest first, on the parsed timestamp.
 *
 * Date.parse rather than a string compare: the fixture is all-UTC today, but a
 * string compare mis-sorts the moment an entry carries an offset like +01:00,
 * and array order mis-sorts the moment the fixture is edited.
 */
function newestFirst(a: { at: string }, b: { at: string }): number {
  return Date.parse(b.at) - Date.parse(a.at);
}

/** The trigger the case opened on, for the seeded Timeline entry. */
function oldestTriggerName(fx: ReturnType<typeof caseFixture>): string {
  const first = [...(fx.triggers as { name: string; at: string }[])].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  )[0];
  return first?.name ?? 'Manual - EDD';
}

@Injectable({ providedIn: 'root' })
export class CaseStore {
  /**
   * The case this store is showing, projected from the shared collection.
   *
   * Declared FIRST because the fields below read it during construction, and
   * class fields initialise in declaration order.
   *
   * One store, two views: the table owns the collection and the modal owns one
   * case out of it. loadCase() is the only way this moves.
   */
  private fx = caseFixture();

  /**
   * The collection the table reads. loadCase() takes what has been RECORDED on
   * a case from here, and saveDraft() writes back to it - one truth for the
   * row, the Timeline tab and the table's timeline popover.
   */
  private readonly collection = inject(CasesStore);

  /** Which case the modal is showing. */
  readonly loadedCaseId = signal<string>(DEFAULT_CASE_ID);

  /**
   * Point the modal at another case from the collection.
   *
   * Re-projects the fixture and replays reset(), so every signal below is
   * re-seeded from the new case rather than patched field by field - the same
   * path the dev switcher already uses, which is what keeps this honest.
   */
  loadCase(id: string): void {
    this.fx = caseFixture(id);
    this.loadedCaseId.set(id);

    // Identity first: reset() reads origin and createdAt when it builds the
    // creation event and the seeded Timeline, so those must already be the new
    // case's or it would seed the previous one's.
    this.player.set(this.fx.player as Player);
    this.caseId.set(this.fx.case.id);
    this.createdAt.set(this.fx.case.createdAt);
    this.caseOrigin.set((this.fx.case.origin as CaseOrigin) ?? 'system');
    this.pastCases.set(this.fx.pastCases as PastCase[]);
    this.starred.set(this.fx.starredCommentaries as StarredCommentary[]);

    this.reset();

    // Then the state the case is actually IN. reset() lands every case on the
    // base scenario - open, unlocked, opening severity - which is right for the
    // dev switcher and wrong for a case picked off the table.
    this.status.set(this.fx.case.status as CaseStatus);
    this.severity.set(this.fx.case.severity as Severity);
    this.lockState.set(this.fx.case.lock.state as LockState);
    this.lockOwner.set((this.fx.case.lock.owner as Agent | null) ?? null);
    this.lockedSince.set(this.fx.case.lock.since);

    // What has been recorded on the case, from the collection - the same truth
    // the row shows. reset() seeds the two entries every case has; this adds
    // one per completed action, required or custom, so the Timeline tab, the
    // table's timeline popover and the row agree by construction.
    for (const a of this.collection.byId(id)?.actions ?? []) {
      if (a.state !== 'done' || !a.at) continue;
      this.pushTimeline(a.at, `Outcome recorded: ${this.workTitle(a.type)}`, a.by ?? this.me().name);
    }
  }

  /** The card title for a type the modal records; the work label for one it does not. */
  private workTitle(type: string): string {
    return this.actionTypes().some((t) => t.id === type)
      ? this.outcomeTitleFor(type as ActionTypeId)
      : this.collection.workLabel(type);
  }

  // ---------------------------------------------------------------- reference data
  readonly agents = signal<Agent[]>(SHARED.agents as Agent[]);
  readonly actionTypes = signal<ActionTypeDef[]>(SHARED.actionTypes as ActionTypeDef[]);
  readonly pastCases = signal<PastCase[]>(this.fx.pastCases as PastCase[]);
  readonly starred = signal<StarredCommentary[]>(
    this.fx.starredCommentaries as StarredCommentary[],
  );

  // ---------------------------------------------------------------- case state
  readonly player = signal<Player>(this.fx.player as Player);
  readonly caseId = signal<string>(this.fx.case.id);
  readonly createdAt = signal<string>(this.fx.case.createdAt);
  /**
   * Manual or system. Only a manual case carries a motivation, so this is what
   * decides whether the stream opens with a creation event at all.
   */
  readonly caseOrigin = signal<CaseOrigin>(
    ((this.fx.case as any).origin as CaseOrigin) ?? 'system',
  );
  readonly status = signal<CaseStatus>('OPEN');
  /** Rule 8. Always derived from the ranking, never from a hardcoded direction. */
  readonly severity = signal<Severity>(OPENING_SEVERITY);
  readonly openingSeverity = OPENING_SEVERITY;

  // Rule 3.
  readonly lockState = signal<LockState>('unlocked');
  readonly lockOwner = signal<Agent | null>(null);
  readonly lockedSince = signal<string | null>(null);

  // Rule 11, as revised: the Risk assessment and its resync.
  /** When the values on the Risk assessment were generated. */
  readonly riskGeneratedAt = signal<string>(this.fx.case.snapshot.generatedAt);
  /** Which generation of values the section shows. See risk-assessment.ts. */
  readonly riskGeneration = signal(0);
  /** A trigger has arrived since the last resync, so the next one finds new values. */
  readonly pendingRegeneration = signal(false);
  /** The overlay is up and the section is being regenerated. */
  readonly resyncing = signal(false);
  /** What the last resync found, for the screen-reader announcement. */
  readonly lastResyncSummary = signal('');
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;

  readonly triggers = signal<Trigger[]>([]);
  readonly stream = signal<StreamItem[]>([]);
  readonly timeline = signal<TimelineEntry[]>([]);

  // ---------------------------------------------------------------- ui state
  readonly draft = signal<Draft | null>(null);
  /** Why a new action did not open: there is a draft with work in it. Shown on that draft. */
  readonly draftConflict = signal<string | null>(null);
  readonly openDialog = signal<DialogId>(null);
  readonly addMenuOpen = signal(false);
  readonly triggersExpanded = signal(false);
  readonly infoTab = signal<InfoTab>('risk');
  /** Which past case the agent asked to open from the Past AML cases tab. */
  readonly viewedPastCase = signal<string | null>(null);
  readonly activeSegment = signal<'workflow' | 'player-info'>('workflow');
  /**
   * Published by the modal shell so children can adapt their own density.
   * The narrow layout is not just "hide one panel" - the header, trigger strip,
   * chips, placeholders and footer all take a compact form (Figma frame 09).
   */
  readonly layoutNarrow = signal(false);
  /**
   * Narrower still: below the width at which two panels fit side by side.
   *
   * A SECOND step, not a rename of the first. layoutNarrow is "one panel's
   * worth of width" - the segmented layout, the compact densities. This is
   * "less width than a dual panel gets", which is where the header stops
   * fitting on one row and has to stack.
   *
   * Published rather than left to a CSS container query, because the threshold
   * now decides COPY as well as layout: the header's lock line drops "Locked
   * to" only while it is fighting for a single row, and gets it back the
   * moment the lock has a row of its own. A query in the stylesheet and a
   * computed in TypeScript would be two thresholds to keep in step.
   */
  readonly layoutStacked = signal(false);

  // ---------------------------------------------------------------- reflow survival
  //
  // A reflow (second modal opening, one closing, a minimise) tears down and
  // rebuilds the panels. Everything the agent had going has to live here to
  // come back intact: the draft above, plus where they were looking.

  /** Which panel the agent was last working in, two-panel or not. */
  readonly lastActivePanel = signal<'workflow' | 'player-info'>('workflow');
  /** Scroll offset of the workflow stream. */
  readonly streamScroll = signal(0);
  /** Scroll offset of the player-info body. */
  readonly infoScroll = signal(0);
  /**
   * Whether the Risk assessment's informational block (Account information)
   * is open. Closed by default: it has no status and nothing to do, and open
   * it put six rows between the agent and the first field that needs them.
   */
  readonly accountInfoExpanded = signal(false);

  constructor() {
    this.reset();
  }

  // ---------------------------------------------------------------- derived
  readonly me = computed<Agent>(
    () => this.agents().find((a) => a.isMe) ?? this.agents()[0],
  );

  readonly otherAgent = computed<Agent>(
    () => this.agents().find((a) => !a.isMe) ?? this.agents()[0],
  );

  readonly isResolved = computed(() => this.status() === 'RESOLVED');

  /** Rule 3 + rule 10. Only the lock owner can act, and never once resolved. */
  readonly canAct = computed(() => !this.isResolved() && this.lockState() === 'locked-to-me');

  /** Rule 3 and rule 10. A new trigger no longer blocks recording. */
  readonly recordBlock = computed<RecordBlock>(() => {
    if (this.isResolved()) return 'resolved';
    if (this.lockState() === 'locked-to-other') return 'locked-to-other';
    if (this.lockState() === 'unlocked') return 'unlocked';
    return null;
  });

  readonly canRecord = computed(() => this.recordBlock() === null);

  readonly outcomes = computed<OutcomeItem[]>(() => this.stream().filter(isOutcome));

  // ---------------------------------------------------------------- risk assessment

  readonly riskFields = computed(() => deriveRiskFields(this.riskGeneration(), this.stream()));

  /** The section's fields grouped for display, in the PDF's order. */
  readonly riskSections = computed(() =>
    RISK_SECTIONS.map((section) => ({
      section,
      fields: this.riskFields().filter((f) => f.def.section === section),
    })).filter((g) => g.fields.length),
  );

  readonly actionRequiredFields = computed(() =>
    this.riskFields().filter((f) => f.status === 'action-required'),
  );

  /** Finalize is enabled once every non-informational field is Risk or No risk. */
  readonly canFinalize = computed(() => this.actionRequiredFields().length === 0);

  /** The finalize outcome, once there is one. */
  readonly riskFinalization = computed(
    () => this.outcomes().find((o) => o.actionType === 'finalize-risk-assessment') ?? null,
  );

  readonly isRiskFinalized = computed(() => !!this.riskFinalization());

  readonly sectionRisks = computed(() => sectionRisksOf(this.riskFields()));

  /**
   * Whether a risk status can be clicked to assess it. Needs the lock, and
   * stops once the assessment is finalized or while it is being regenerated.
   */
  readonly canAssessRisk = computed(
    () => this.canRecord() && !this.isRiskFinalized() && !this.resyncing(),
  );

  /** Resync is always visible; this is whether it can be pressed. */
  readonly canResync = computed(
    () => this.canAct() && !this.isRiskFinalized() && !this.resyncing(),
  );

  /** Why Resync is disabled, for its tooltip. Null when it is enabled. */
  readonly resyncBlockReason = computed<string | null>(() => {
    if (this.canResync()) return null;
    if (this.isResolved()) return 'This case is resolved.';
    if (this.isRiskFinalized()) return 'The risk assessment is finalized.';
    if (this.resyncing()) return 'Resyncing.';
    if (this.lockState() === 'locked-to-other') return 'Another agent holds the lock.';
    return 'Lock the case to resync.';
  });

  /**
   * Rule 4. Set membership, not order.
   *
   * Three kinds, in this order: every required assessment (manual fields,
   * plus any field a resync sent back to Action required), the other required
   * actions, then Finalize risk assessment last - it can only be done once
   * every assessment is.
   */
  readonly requiredActions = computed<RequiredActionState[]>(() => {
    const assessments: RequiredActionState[] = this.riskFields()
      .filter((f) => f.required)
      .map((f) => ({
        key: `assess:${f.def.id}`,
        actionType: 'assess-risk' as const,
        fieldId: f.def.id,
        label: `Assess risk - ${f.def.label}`,
        shortLabel: f.def.label,
        done: f.status !== 'action-required',
        recordedAt: f.assessedAt,
        status: f.status,
        available: true,
      }));
    const actions: RequiredActionState[] = REQUIRED_ACTIONS.map((id) => {
      const hit = this.outcomes().find((o) => o.actionType === id);
      return {
        key: id,
        actionType: id,
        fieldId: null,
        label: this.labelFor(id),
        shortLabel: SHORT_ACTION_LABEL[id] ?? this.labelFor(id),
        done: !!hit,
        recordedAt: hit?.at ?? null,
        status: null,
        available: true,
      };
    });
    const finalization = this.riskFinalization();
    const finalize: RequiredActionState = {
      key: 'finalize',
      actionType: 'finalize-risk-assessment',
      fieldId: null,
      label: 'Finalize risk assessment',
      shortLabel: SHORT_ACTION_LABEL['finalize-risk-assessment'] ?? 'Finalize',
      done: !!finalization,
      recordedAt: finalization?.at ?? null,
      status: null,
      available: this.canFinalize(),
    };
    return [...assessments, ...actions, finalize];
  });

  readonly allRequiredRecorded = computed(() => this.requiredActions().every((r) => r.done));

  /** Rule 4 + rule 7. Extra actions never add placeholders and never re-gate Submit. */
  readonly pendingPlaceholders = computed<RequiredActionState[]>(() =>
    this.isResolved() ? [] : this.requiredActions().filter((r) => !r.done),
  );

  /** Rule 9. Enabled only once rule 4 is satisfied - and you still need the lock to save. */
  readonly canSubmitDecision = computed(() => this.canAct() && this.allRequiredRecorded());

  /**
   * A draft the agent has actually put something into.
   *
   * An untouched form is not work in progress - opening one and walking away
   * should not raise a warning about losing something that does not exist.
   * Note and attachments count as content. The lock choice no longer does:
   * it now carries a preselected default, so it is evidence of nothing.
   */
  readonly draftDirty = computed(() => {
    const d = this.draft();
    if (!d) return false;
    return d.note.trim().length > 0 || d.attachments.length > 0;
  });

  /** What to call that draft in the warning. */
  readonly draftLabel = computed(() => this.draft()?.title ?? '');

  /**
   * Rule 8, now gated on the lock like every other act on this case.
   *
   * It was "enabled while the case is open", which let anyone looking at a
   * case someone else held change its severity - the one thing on the panel
   * that could be done without the lock. Adjusting severity IS acting on the
   * case, so it takes the same gate Record takes: canAct.
   *
   * canAct rather than canRecord, deliberately. Recording carries the extra
   * rule 11 block - a snapshot out of sync makes an OUTCOME unsound, because
   * the outcome is a statement about what the triggers said. A severity is a
   * judgement about the case itself and does not go stale with the snapshot.
   */
  readonly canAdjustSeverity = computed(() => this.canAct());

  /** Rule 10. Footer disappears entirely once resolved. */
  readonly showFooter = computed(() => !this.isResolved());

  readonly visibleInfoTabs = computed<InfoTab[]>(() =>
    this.isResolved() ? ['risk', 'timeline'] : ['risk', 'past-cases', 'starred', 'timeline'],
  );

  /**
   * Kept for the trigger strip, which the table's trigger popover also hosts.
   * Always 0 in the modal now: a new trigger is no longer flagged in amber.
   */
  readonly newTriggerCount = computed(() => this.triggers().filter((t) => t.isNew).length);

  /**
   * Newest first, with any rule-11 arrival pinned to the very top.
   *
   * Sorted on the parsed timestamp, never on array order and never on the raw
   * string: the fixture happens to be all-UTC and in roughly the right order,
   * but a string compare would silently mis-sort the moment a trigger arrived
   * with an offset like +01:00, and array order would mis-sort the moment the
   * mock data was edited.
   */
  /**
   * OLDEST first - the order the triggers actually happened in, so the list
   * reads as a history and the newest arrival is at the bottom.
   *
   * The isNew pin is gone with it. It existed to keep an unresynced arrival
   * inside the two-row collapsed preview; that guarantee now lives in the
   * preview itself, which takes the oldest AND the newest rather than the top
   * two. Pinning here as well would have put the newest first, which is the
   * one thing this ordering is meant to stop.
   */
  readonly sortedTriggers = computed<Trigger[]>(() =>
    [...this.triggers()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  );

  /**
   * Starred commentaries, newest first.
   *
   * Date.parse, not a string compare and not array order - the same reasoning
   * as sortedTriggers. The fixture is all-UTC today, but a string compare
   * mis-sorts the moment an entry carries an offset, and array order mis-sorts
   * the moment the fixture is edited.
   */
  readonly sortedStarred = computed<StarredCommentary[]>(() =>
    [...this.starred()].sort(newestFirst),
  );

  /**
   * Past cases and the timeline, newest first.
   *
   * Every time-ordered list in the product reads the same way round. The one
   * deliberate exception is the workflow stream, which is a narrative ending
   * in the decision and is left in the order it happened - see stream().
   */
  readonly sortedPastCases = computed<PastCase[]>(() =>
    [...this.pastCases()].sort((a, b) => Date.parse(b.dateCreated) - Date.parse(a.dateCreated)),
  );

  readonly sortedTimeline = computed<TimelineEntry[]>(() => [...this.timeline()].sort(newestFirst));

  /**
   * Rule 5. A draft may only be saved with a note and a lock choice. An
   * assessment also needs its Risk answer; Finalize needs every field assessed.
   */
  readonly draftValid = computed(() => {
    const d = this.draft();
    if (!d) return false;
    if (d.actionType === 'assess-risk' && !d.risk) return false;
    if (d.actionType === 'finalize-risk-assessment' && !this.canFinalize()) return false;
    return d.note.trim().length > 0 && d.lockAfter !== null && this.canRecord();
  });

  // ---------------------------------------------------------------- lifecycle

  /** Rebuilds the base case: open, unlocked, nothing recorded, no rule-11 arrival yet. */
  reset(): void {
    seq = 0;
    this.status.set('OPEN');
    this.severity.set(openingSeverityOf(this.fx));
    this.lockState.set('unlocked');
    this.lockOwner.set(null);
    this.lockedSince.set(null);
    this.riskGeneratedAt.set(this.fx.case.snapshot.generatedAt);
    this.riskGeneration.set(0);
    this.pendingRegeneration.set(false);
    this.clearResyncTimer();
    this.resyncing.set(false);
    this.lastResyncSummary.set('');
    // The fixture ships the rule-11 arrival inline; the base case predates it.
    this.triggers.set((this.fx.triggers as Trigger[]).filter((t) => !t.isNew));
    // Not empty: a manual case opens with its own creation event, which is the
    // oldest thing that can be in an oldest-first stream.
    this.stream.set(this.withCreation([]));
    const created = this.creationEvent();
    this.timeline.set([
      {
        at: this.fx.case.createdAt,
        what: created
          ? `Manual case created - ${created.reason}`
          : // The LOADED case's opening severity, not the default case's: every
            // case in the collection is openable, and the module constant would
            // caption all of them with 4821's.
            `Case created (${openingSeverityOf(this.fx)})`,
        who: created ? created.actor : this.me().name,
      },
      // The case's OWN oldest trigger, not a copy of 4821's: every case in the
      // collection is openable now, and a hardcoded name would caption all of
      // them with one case's first trigger.
      {
        at: this.fx.case.createdAt,
        what: `Trigger added: ${oldestTriggerName(this.fx)}`,
        who: 'system',
      },
    ]);
    this.draft.set(null);
    this.draftConflict.set(null);
    this.openDialog.set(null);
    this.addMenuOpen.set(false);
    this.triggersExpanded.set(false);
    this.infoTab.set('risk');
    this.viewedPastCase.set(null);
    this.activeSegment.set('workflow');
    this.lastActivePanel.set('workflow');
    this.streamScroll.set(0);
    this.infoScroll.set(0);
    this.accountInfoExpanded.set(false);
  }

  labelFor(id: ActionTypeId): string {
    if (id === 'decision') return 'Decision - case resolved';
    if (id === 'finalize-risk-assessment') return 'Finalize risk assessment';
    if (id === 'assess-risk') return 'Assess risk';
    return this.actionTypes().find((t) => t.id === id)?.label ?? id;
  }

  /** Card titles differ from menu labels: "Contact player" (verb) vs "Player contact" (record). */
  outcomeTitleFor(id: ActionTypeId): string {
    switch (id) {
      case 'player-contact':
        return 'Player contact';
      case 'assess-risk':
        return 'Assess risk';
      case 'finalize-risk-assessment':
        return 'Risk assessment finalized';
      case 'note':
        return 'Note';
      case 'decision':
        return 'Decision - case resolved';
    }
  }

  // ---------------------------------------------------------------- rule 3: lock

  lock(): void {
    if (this.isResolved()) return;
    if (this.lockState() === 'locked-to-other') return; // must go through force unlock
    const at = nowIso();
    this.lockState.set('locked-to-me');
    this.lockOwner.set(this.me());
    this.lockedSince.set(at);
    // Timeline only - a lock is case history, not workflow (see StreamItem).
    this.pushTimeline(at, 'Case locked', this.me().name);
  }

  /** Self-unlock is instant; someone else's lock routes to the confirm dialog. */
  requestUnlock(): void {
    if (this.lockState() === 'locked-to-other') {
      this.openDialog.set('confirm-unlock');
      return;
    }
    if (this.lockState() === 'locked-to-me') this.unlockSelf();
  }

  private unlockSelf(): void {
    const at = nowIso();
    this.lockState.set('unlocked');
    this.lockOwner.set(null);
    this.lockedSince.set(null);
    this.draft.set(null);
    this.pushTimeline(at, 'Case unlocked', this.me().name);
  }

  /**
   * Rule 3, force-unlock path. Open question 4: the previous owner's unsaved
   * draft is lost, and the confirm dialog copy says so.
   */
  forceUnlock(): void {
    const previous = this.lockOwner();
    const at = nowIso();
    this.lockState.set('unlocked');
    this.lockOwner.set(null);
    this.lockedSince.set(null);
    this.draft.set(null);
    this.openDialog.set(null);
    this.pushTimeline(
      at,
      `Lock force-released from ${previous?.name ?? 'another agent'}`,
      this.me().name,
    );
  }

  // ---------------------------------------------------------------- rule 5: recording

  /**
   * Opens the inline record-form. Allowed while out of sync so an in-flight
   * draft is not thrown away (open question 2) - Save is what stays blocked.
   */
  startRecord(
    actionType: ActionTypeId,
    fromPlaceholder = false,
    riskFieldId: string | null = null,
    reveal = false,
  ): boolean {
    if (this.isResolved() || this.lockState() !== 'locked-to-me') return false;
    if (actionType === 'assess-risk' && !this.canAssessRisk()) return false;
    if (actionType === 'finalize-risk-assessment' && !this.canFinalize()) return false;
    this.addMenuOpen.set(false);
    const field = riskFieldId ? this.riskFields().find((f) => f.def.id === riskFieldId) : null;
    const title =
      actionType === 'assess-risk' && field
        ? `Assess risk - ${field.def.label}`
        : actionType === 'finalize-risk-assessment'
          ? 'Finalize risk assessment'
          : this.outcomeTitleFor(actionType);

    /**
     * Never replace a draft with something in it.
     *
     * Starting another action used to overwrite the open form, note and files
     * included. With a risk status in the other panel able to start one, that
     * was a click away from wiping work the agent could not even see. The open
     * form is brought into view instead, with a line saying why.
     */
    const open = this.draft();
    if (open && this.draftDirty()) {
      const same = open.actionType === actionType && (open.riskFieldId ?? null) === riskFieldId;
      if (!same) this.draftConflict.set(`Save or cancel this draft before starting ${title}.`);
      this.draft.set({ ...open, reveal: true });
      return false;
    }

    this.draftConflict.set(null);
    this.draft.set({
      actionType,
      title,
      riskFieldId,
      returnTo: null,
      // Prefilled with what the field says now when that is an answer, so an
      // override starts from the current call. Action required has no answer
      // to start from, so the agent has to choose.
      risk: field && (field.status === 'risk' || field.status === 'no-risk') ? field.status : null,
      reveal,
      note: '',
      attachments: [],
      errors: [],
      // Preselected: the common case is keeping the lock, and an explicit
      // default is one less thing to fill in. Supersedes rule 5's "no default".
      lockAfter: 'keep',
      attempted: false,
      fromPlaceholder,
    });
    return true;
  }

  patchDraft(patch: Partial<Draft>): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, ...patch });
  }

  cancelDraft(): void {
    this.draftConflict.set(null);
    this.draft.set(null);
  }

  /**
   * A risk status was clicked in the Risk assessment section.
   *
   * Opens the same form the required placeholder opens. It takes that
   * placeholder's slot when the field is a pending required assessment, and
   * is appended to the stream otherwise. In the segmented layout the workflow
   * is brought forward, because that is where the form is.
   */
  assessRisk(fieldId: string): void {
    if (!this.canAssessRisk()) return;
    const pending = this.requiredActions().some((r) => r.fieldId === fieldId && !r.done);
    if (this.startRecord('assess-risk', pending, fieldId, true)) {
      this.patchDraft({ returnTo: fieldId });
    }
    // Either way the workflow comes forward: it holds the new form, or the
    // draft that has to be dealt with first.
    this.activeSegment.set('workflow');
    this.lastActivePanel.set('workflow');
  }

  /**
   * Rule 5. Valid files are appended; invalid ones produce a per-file inline
   * error and never disturb the files that did validate.
   */
  addFiles(files: CandidateFile[]): void {
    const d = this.draft();
    if (!d) return;
    const accepted: Attachment[] = [...d.attachments];
    const errors: AttachmentError[] = [...d.errors];

    for (const f of files) {
      if (!ALLOWED_ATTACHMENT_KINDS.includes(f.kind)) {
        errors.push({
          id: nextId('err'),
          file: f.name,
          reason: 'type',
          message: `${f.name} was not added. JPG or PNG only.`,
        });
        continue;
      }
      if (f.sizeKb > ATTACHMENT_MAX_KB) {
        errors.push({
          id: nextId('err'),
          file: f.name,
          reason: 'size',
          message: `${f.name} was not added. Files must be under ${ATTACHMENT_MAX_MB} MB.`,
        });
        continue;
      }
      // A file picked in the prototype has no bytes behind it - the picker
      // drops the File and keeps the name and size - so unless the name
      // happens to match a fixture it falls back to the shared sample. That
      // fallback is the one case where the preview header and the browser's
      // PDF toolbar can still disagree, and it cannot be fixed from here: no
      // asset can exist for a filename chosen at run time.
      accepted.push({
        id: nextId('att'),
        name: f.name,
        kind: f.kind,
        sizeKb: f.sizeKb,
        url: sampleUrlFor(f.name),
      });
    }

    this.draft.set({ ...d, attachments: accepted, errors });
  }

  removeAttachment(id: string): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, attachments: d.attachments.filter((a) => a.id !== id) });
  }

  dismissError(id: string): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, errors: d.errors.filter((e) => e.id !== id) });
  }

  /** Rule 5 + rule 6. Returns false and marks the draft attempted when invalid. */
  saveDraft(): boolean {
    const d = this.draft();
    if (!d) return false;
    if (!this.draftValid()) {
      this.draft.set({ ...d, attempted: true });
      return false;
    }
    const at = nowIso();
    const field =
      d.actionType === 'assess-risk' && d.riskFieldId
        ? this.riskFields().find((f) => f.def.id === d.riskFieldId)
        : null;
    const outcome: OutcomeItem = {
      kind: 'outcome',
      id: nextId('out'),
      actionType: d.actionType,
      title: d.actionType === 'finalize-risk-assessment' ? 'Risk assessment finalized' : d.title,
      actor: this.me().name,
      at,
      note: d.note.trim(),
      // Finalize carries no attachments, by definition.
      attachments: d.actionType === 'finalize-risk-assessment' ? [] : d.attachments, // frozen from here (rule 6)
      ...(field && d.risk
        ? {
            assessment: {
              fieldId: field.def.id,
              fieldLabel: field.def.label,
              risk: d.risk,
              previous: field.status,
            },
          }
        : {}),
      ...(d.actionType === 'finalize-risk-assessment' ? { finalized: this.sectionRisks() } : {}),
    };
    this.stream.update((s) => [...s, outcome]);
    if (field && d.risk) {
      this.pushTimeline(
        at,
        `Risk assessed: ${field.def.label} - ${RISK_STATUS_LABEL[d.risk]}`,
        this.me().name,
      );
    } else if (d.actionType === 'finalize-risk-assessment') {
      this.pushTimeline(at, 'Risk assessment finalized', this.me().name);
    } else {
      this.pushTimeline(at, `Outcome recorded: ${d.title}`, this.me().name);
    }
    // The row is live: a required type still to do completes its item, anything
    // else is custom and moves only the count.
    //
    // Only the work the TABLE knows about is written back. Assessing open
    // source searches is the table's "Open source searches" work item, so it
    // completes that. The other assessments and Finalize are modal-only and
    // leave the table exactly as it was.
    const work =
      field?.def.id === 'open-source-searches'
        ? 'open-source-searches'
        : d.actionType === 'player-contact' || d.actionType === 'note'
          ? d.actionType
          : null;
    if (work) this.collection.recordWork(this.caseId(), work, at, this.me().name);
    this.draftConflict.set(null);
    this.draft.set(null);

    // Rule 5: the agent's explicit choice is applied after the save.
    if (d.lockAfter === 'release') this.unlockSelf();
    return true;
  }

  // ---------------------------------------------------------------- rule 8: severity

  /** Always available while open. Changes severity everywhere and lifts the lock. */
  changeSeverity(to: Severity, reason: string): void {
    const from = this.severity();
    if (from === to || this.isResolved()) return;
    const at = nowIso();
    const direction = severityDirection(from, to);

    this.severity.set(to);
    this.pushEvent({
      kind: 'event',
      id: nextId('ev'),
      type: 'severity-change',
      from,
      to,
      direction,
      actor: this.me().name,
      at,
      reason: reason.trim(),
    });
    this.pushTimeline(
      at,
      `Severity changed ${from} to ${to} (${direction}); lock lifted`,
      this.me().name,
    );

    // Rule 8: the lock is lifted. Open question 3 - re-locking stays one click
    // away via the header Lock button, so no draft is silently resurrected.
    this.lockState.set('unlocked');
    this.lockOwner.set(null);
    this.lockedSince.set(null);
    this.draft.set(null);
    this.openDialog.set(null);
  }

  // ---------------------------------------------------------------- rule 9: decision

  submitDecision(note: string): boolean {
    if (!this.canSubmitDecision() || !note.trim()) return false;
    const at = nowIso();
    this.stream.update((s) => [
      ...s,
      {
        kind: 'outcome',
        id: nextId('out'),
        actionType: 'decision',
        title: 'Decision - case resolved',
        actor: this.me().name,
        at,
        note: note.trim(),
        attachments: [],
      } satisfies OutcomeItem,
    ]);
    this.status.set('RESOLVED');
    this.pushTimeline(at, 'Decision submitted; case RESOLVED', this.me().name);
    this.openDialog.set(null);
    this.draft.set(null);
    this.addMenuOpen.set(false);
    // Rule 10: the left panel shows the risk assessment as it was finalized.
    this.infoTab.set('risk');
    return true;
  }

  // ---------------------------------------------------------------- rule 11: triggers

  /**
   * Dev button. A system trigger arrives while the case is open.
   *
   * Nothing is forced: no refresh, no out-of-sync state, no amber, and
   * recording carries on. The arrival is written into the workflow with a
   * warning icon, and the next resync of the Risk assessment picks up what it
   * changed.
   */
  simulateNewTrigger(): void {
    const fixture = (this.fx.triggers as Trigger[]).find((t) => t.isNew);
    const already = this.triggers().some((t) => t.id === fixture?.id);
    const trigger: Trigger =
      fixture && !already
        ? { ...fixture, detail: triggerDetail(fixture.detail), at: nowIso(), isNew: false }
        : {
            id: nextId('trg'),
            name: 'System - Threshold',
            detail: 'Large deposit while case open.',
            at: nowIso(),
            isNew: false,
          };

    this.triggers.update((list) => [trigger, ...list]);
    this.pendingRegeneration.set(true);
    this.pushEvent({
      kind: 'event',
      id: nextId('ev'),
      type: 'trigger-added',
      name: trigger.name,
      detail: trigger.detail,
      actor: 'system',
      at: trigger.at,
    } satisfies TriggerAddedEvent);
    this.pushTimeline(trigger.at, `Trigger added: ${trigger.name}`, 'system');
  }

  /** Resync was pressed. It asks first: some actions may have to be recorded again. */
  requestResync(): void {
    if (!this.canResync()) return;
    this.openDialog.set('resync');
  }

  /** Confirmed. The overlay goes up and the section is regenerated. */
  confirmResync(): void {
    if (!this.canResync()) return;
    this.openDialog.set(null);
    this.resyncing.set(true);
    this.lastResyncSummary.set('');
    this.clearResyncTimer();
    this.resyncTimer = setTimeout(() => this.completeResync(), RESYNC_MS);
  }

  /**
   * The overlay comes down on the new values. See resyncDiff() for the rules.
   *
   * No history is kept on the section itself - the new values replace the
   * old, and the workflow entry is the record of what changed.
   */
  completeResync(): void {
    this.clearResyncTimer();
    const fromGen = this.riskGeneration();
    const toGen = this.pendingRegeneration()
      ? Math.min(fromGen + 1, GENERATIONS.length - 1)
      : fromGen;
    const { updated, riskChanged } = resyncDiff(fromGen, toGen);

    const at = nowIso();
    this.riskGeneration.set(toGen);
    this.pendingRegeneration.set(false);
    this.riskGeneratedAt.set(at);
    const event: ResyncCompletedEvent = {
      kind: 'event',
      id: nextId('ev'),
      type: 'resync-completed',
      updated: updated.map((d) => d.label),
      riskChangedIds: riskChanged.map((d) => d.id),
      riskChanged: riskChanged.map((d) => d.label),
      actor: this.me().name,
      at,
    };
    this.pushEvent(event);
    this.pushTimeline(at, 'Risk assessment resynced', this.me().name);
    this.resyncing.set(false);
    this.lastResyncSummary.set(`Resync completed. ${resyncSummary(event)}`);
  }

  private clearResyncTimer(): void {
    if (this.resyncTimer) clearTimeout(this.resyncTimer);
    this.resyncTimer = null;
  }

  /**
   * Past AML cases: View opens that case. Stubbed here - the fixture carries a
   * single case (rule 1: one open case per player), so there is nothing to
   * switch to. The row records the intent so the interaction is reviewable.
   */
  viewPastCase(caseId: string): void {
    this.viewedPastCase.set(caseId);
  }

  // ---------------------------------------------------------------- internals

  private pushEvent(event: StreamItem): void {
    this.stream.update((s) => [...s, event]);
  }

  private pushTimeline(at: string, what: string, who: string): void {
    this.timeline.update((t) => [...t, { at, what, who }]);
  }

  // ---------------------------------------------------------------- dev seeding
  //
  // Used only by the dev state switcher to jump straight to a Figma frame.
  // These bypass the command guards on purpose.

  /** @internal dev-only */
  seed(patch: {
    status?: CaseStatus;
    severity?: Severity;
    caseOrigin?: CaseOrigin;
    lockState?: LockState;
    lockOwner?: Agent | null;
    lockedSince?: string | null;
    stream?: StreamItem[];
    timeline?: TimelineEntry[];
    triggers?: Trigger[];
    triggersExpanded?: boolean;
    draft?: Draft | null;
    openDialog?: DialogId;
    addMenuOpen?: boolean;
    infoTab?: InfoTab;
    riskGeneration?: number;
    pendingRegeneration?: boolean;
    resyncing?: boolean;
    riskGeneratedAt?: string;
    lastActivePanel?: 'workflow' | 'player-info';
  }): void {
    if (patch.status !== undefined) this.status.set(patch.status);
    if (patch.severity !== undefined) this.severity.set(patch.severity);
    if (patch.lockState !== undefined) this.lockState.set(patch.lockState);
    if (patch.lockOwner !== undefined) this.lockOwner.set(patch.lockOwner);
    if (patch.lockedSince !== undefined) this.lockedSince.set(patch.lockedSince);
    if (patch.caseOrigin !== undefined) this.caseOrigin.set(patch.caseOrigin);
    if (patch.stream !== undefined) this.stream.set(patch.stream);
    if (patch.timeline !== undefined) this.timeline.set(patch.timeline);
    if (patch.triggers !== undefined) this.triggers.set(patch.triggers);
    if (patch.triggersExpanded !== undefined) this.triggersExpanded.set(patch.triggersExpanded);
    if (patch.draft !== undefined) this.draft.set(patch.draft);
    if (patch.openDialog !== undefined) this.openDialog.set(patch.openDialog);
    if (patch.addMenuOpen !== undefined) this.addMenuOpen.set(patch.addMenuOpen);
    if (patch.infoTab !== undefined) this.infoTab.set(patch.infoTab);
    if (patch.riskGeneration !== undefined) this.riskGeneration.set(patch.riskGeneration);
    if (patch.pendingRegeneration !== undefined) this.pendingRegeneration.set(patch.pendingRegeneration);
    if (patch.resyncing !== undefined) this.resyncing.set(patch.resyncing);
    if (patch.riskGeneratedAt !== undefined) this.riskGeneratedAt.set(patch.riskGeneratedAt);
    if (patch.lastActivePanel !== undefined) this.lastActivePanel.set(patch.lastActivePanel);
  }

  /**
   * The case's own creation, as a stream item - or null when the system raised
   * it. A system case has no motivation text, so there is nothing to put on
   * line two, and a creation event with an empty second line would be a
   * heading pretending to be a record.
   */
  creationEvent(): CaseCreatedEvent | null {
    if (this.caseOrigin() !== 'manual') return null;
    const c = (this.fx.case as any).creation;
    if (!c) return null;
    return {
      kind: 'event',
      id: 'case-created',
      type: 'case-created',
      reason: c.reason as CreationReason,
      description: c.description,
      actor: c.by,
      at: c.at,
    };
  }

  /**
   * The stream always opens with the creation event when there is one. The
   * stream runs oldest first and nothing precedes the case existing, so it is
   * the head of the list rather than something inserted by date.
   */
  private withCreation(items: StreamItem[]): StreamItem[] {
    const created = this.creationEvent();
    return created ? [created, ...items] : items;
  }

  /** @internal dev-only - the fixture history, replayed as saved stream items. */
  fixtureStream(upTo: 'first' | 'required' | 'all'): StreamItem[] {
    const raw = this.fx.workflow as any[];
    const items: StreamItem[] = raw.map((r) => {
      // The fixture still says 'open-source-searches': that record IS the
      // assessment of the Open source searches field now. The fixture's note
      // reads as a clear result, so it is replayed as No risk.
      if (r.kind === 'outcome' && r.actionType === 'open-source-searches') {
        const def = riskFieldDef('open-source-searches')!;
        return {
          kind: 'outcome',
          id: r.id,
          actionType: 'assess-risk',
          title: `Assess risk - ${def.label}`,
          actor: r.actor,
          at: r.at,
          note: r.note,
          attachments: (r.attachments ?? []).map(mapAttachment),
          assessment: {
            fieldId: def.id,
            fieldLabel: def.label,
            risk: 'no-risk',
            previous: 'action-required',
          },
        } satisfies OutcomeItem;
      }
      if (r.kind === 'outcome') {
        return {
          kind: 'outcome',
          id: r.id,
          actionType: r.actionType as ActionTypeId,
          title: r.title,
          actor: r.actor,
          at: r.at,
          note: r.note,
          attachments: (r.attachments ?? []).map(mapAttachment),
        } satisfies OutcomeItem;
      }
      // Direction is recomputed from SEVERITY_RANK rather than read from the
      // fixture's `direction` field: if the ranking changes, a stored label
      // would silently contradict the pills either side of it.
      return {
        kind: 'event',
        id: r.id,
        type: 'severity-change',
        from: r.from as Severity,
        to: r.to as Severity,
        direction: severityDirection(r.from as Severity, r.to as Severity),
        actor: r.actor,
        at: r.at,
        reason: r.reason,
      } as StreamItem;
    });

    if (upTo === 'first') return this.withCreation(items.slice(0, 1));
    // The fixture predates the Risk assessment, so its history has no
    // Document requests assessment and no finalize. Both are written in here,
    // after the last required action and before the decision - a resolved
    // case must have a finalized assessment behind it.
    const decisionAt = items.findIndex((i) => isOutcome(i) && i.actionType === 'decision');
    const before = decisionAt === -1 ? items : items.slice(0, decisionAt);
    const decision = decisionAt === -1 ? null : items[decisionAt];
    const completed = [...before, ...this.closingAssessments(before, decision)];
    if (upTo === 'required') return this.withCreation(completed);
    return this.withCreation(decisionAt === -1 ? completed : [...completed, ...items.slice(decisionAt)]);
  }

  /**
   * @internal dev-only - the Document requests assessment and the finalize
   * that the fixture's history is missing, timed just after its last item.
   */
  private closingAssessments(items: StreamItem[], decision: StreamItem | null): OutcomeItem[] {
    const last = items[items.length - 1];
    const base = last ? Date.parse(last.at) : Date.parse(this.fx.case.createdAt);
    // Inside the gap before the decision when there is one, so the stream
    // still reads in time order; five and ten minutes on when there is not.
    const gap = decision ? (Date.parse(decision.at) - base) / 3 : 5 * 60_000;
    const actor = (last as OutcomeItem | undefined)?.actor ?? this.otherAgent().name;
    const def = riskFieldDef('document-requests')!;
    const assess: OutcomeItem = {
      kind: 'outcome',
      id: 'fx-assess-docs',
      actionType: 'assess-risk',
      title: `Assess risk - ${def.label}`,
      actor,
      at: new Date(base + gap).toISOString(),
      note: 'Affordability documents approved. Proof of address received and consistent with the registered address.',
      attachments: [],
      assessment: { fieldId: def.id, fieldLabel: def.label, risk: 'no-risk', previous: 'action-required' },
    };
    const fields = deriveRiskFields(0, [...items, assess]);
    const finalize: OutcomeItem = {
      kind: 'outcome',
      id: 'fx-finalize',
      actionType: 'finalize-risk-assessment',
      title: 'Risk assessment finalized',
      actor,
      at: new Date(base + 2 * gap).toISOString(),
      note: 'Linked accounts, VPN use and the deposit pattern carry risk. Identity and documents are clear. Overall: enhanced monitoring.',
      attachments: [],
      finalized: sectionRisksOf(fields),
    };
    return [assess, finalize];
  }

  /**
   * @internal dev-only - the severity a case sits at after replaying these
   * items. Keeps scenarios from hardcoding "the escalated one".
   */
  severityAfter(items: StreamItem[]): Severity {
    let severity = OPENING_SEVERITY;
    for (const item of items) {
      if (item.kind === 'event' && item.type === 'severity-change') severity = item.to;
    }
    return severity;
  }

  /** @internal dev-only */
  fixtureTimeline(): TimelineEntry[] {
    return this.fx.timeline as TimelineEntry[];
  }

  /** @internal dev-only */
  allFixtureTriggers(): Trigger[] {
    return this.fx.triggers as Trigger[];
  }

  /** @internal dev-only - the two canned attachment errors from the fixture. */
  fixtureAttachmentErrors(): AttachmentError[] {
    return (SHARED.attachmentErrorsExample as any[]).map((e) => ({
      id: nextId('err'),
      file: e.file,
      reason: e.reason as 'type' | 'size',
      message: e.message,
    }));
  }
}
