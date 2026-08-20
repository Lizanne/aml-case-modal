import { Injectable, computed, signal } from '@angular/core';

import mockCase from './mock-case.json';
import {
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
  Severity,
  SnapshotView,
  StarredCommentary,
  StreamItem,
  TimelineEntry,
  Trigger,
  isOutcome,
  severityDirection,
} from './models';

/** Why recording is currently impossible. `null` means the agent may record. */
export type RecordBlock = 'resolved' | 'unlocked' | 'locked-to-other' | 'out-of-sync' | null;

export interface RequiredActionState {
  id: ActionTypeId;
  label: string;
  /** Abbreviated form, used by the narrow / dual-modal layout. */
  shortLabel: string;
  done: boolean;
  recordedAt: string | null;
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
const OPENING_SEVERITY: Severity = (() => {
  const firstChange = (mockCase.workflow as any[]).find(
    (w) => w.kind === 'event' && w.type === 'severity-change',
  );
  return (firstChange?.from ?? mockCase.case.severity) as Severity;
})();

const nowIso = () => new Date().toISOString();

function mapAttachment(raw: { name: string; type: string; sizeKb: number }): Attachment {
  return {
    id: nextId('att'),
    name: raw.name,
    kind: (raw.type as AttachmentKind) ?? 'other',
    sizeKb: raw.sizeKb,
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

@Injectable({ providedIn: 'root' })
export class CaseStore {
  // ---------------------------------------------------------------- reference data
  readonly agents = signal<Agent[]>(mockCase.agents as Agent[]);
  readonly actionTypes = signal<ActionTypeDef[]>(mockCase.actionTypes as ActionTypeDef[]);
  readonly pastCases = signal<PastCase[]>(mockCase.pastCases as PastCase[]);
  readonly starred = signal<StarredCommentary[]>(
    mockCase.starredCommentaries as StarredCommentary[],
  );

  // ---------------------------------------------------------------- case state
  readonly player = signal<Player>(mockCase.player as Player);
  readonly caseId = signal<string>(mockCase.case.id);
  readonly createdAt = signal<string>(mockCase.case.createdAt);
  readonly status = signal<CaseStatus>('OPEN');
  /** Rule 8. Always derived from the ranking, never from a hardcoded direction. */
  readonly severity = signal<Severity>(OPENING_SEVERITY);
  readonly openingSeverity = OPENING_SEVERITY;

  // Rule 3.
  readonly lockState = signal<LockState>('unlocked');
  readonly lockOwner = signal<Agent | null>(null);
  readonly lockedSince = signal<string | null>(null);

  // Rule 11.
  readonly snapshotGeneratedAt = signal<string>(mockCase.case.snapshot.generatedAt);
  readonly snapshotOutOfSync = signal<boolean>(false);

  readonly triggers = signal<Trigger[]>([]);
  readonly stream = signal<StreamItem[]>([]);
  readonly timeline = signal<TimelineEntry[]>([]);

  // ---------------------------------------------------------------- ui state
  readonly draft = signal<Draft | null>(null);
  readonly openDialog = signal<DialogId>(null);
  readonly addMenuOpen = signal(false);
  readonly triggersExpanded = signal(false);
  readonly infoTab = signal<InfoTab>('snapshot');
  readonly viewedSnapshot = signal<SnapshotView | null>(null);
  /** Which past case the agent asked to open from the Past AML cases tab. */
  readonly viewedPastCase = signal<string | null>(null);
  readonly activeSegment = signal<'workflow' | 'player-info'>('workflow');
  /**
   * Published by the modal shell so children can adapt their own density.
   * The narrow layout is not just "hide one panel" - the header, trigger strip,
   * chips, placeholders and footer all take a compact form (Figma frame 09).
   */
  readonly layoutNarrow = signal(false);

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

  /** Rule 11. Recording is additionally blocked while the snapshot is out of sync. */
  readonly recordBlock = computed<RecordBlock>(() => {
    if (this.isResolved()) return 'resolved';
    if (this.lockState() === 'locked-to-other') return 'locked-to-other';
    if (this.lockState() === 'unlocked') return 'unlocked';
    if (this.snapshotOutOfSync()) return 'out-of-sync';
    return null;
  });

  readonly canRecord = computed(() => this.recordBlock() === null);

  readonly outcomes = computed<OutcomeItem[]>(() => this.stream().filter(isOutcome));

  /** Rule 4. Set membership, not order. */
  readonly requiredActions = computed<RequiredActionState[]>(() =>
    REQUIRED_ACTIONS.map((id) => {
      const hit = this.outcomes().find((o) => o.actionType === id);
      return {
        id,
        label: this.labelFor(id),
        shortLabel: SHORT_ACTION_LABEL[id] ?? this.labelFor(id),
        done: !!hit,
        recordedAt: hit?.at ?? null,
      };
    }),
  );

  readonly allRequiredRecorded = computed(() => this.requiredActions().every((r) => r.done));

  /** Rule 4 + rule 7. Extra actions never add placeholders and never re-gate Submit. */
  readonly pendingPlaceholders = computed<RequiredActionState[]>(() =>
    this.isResolved() ? [] : this.requiredActions().filter((r) => !r.done),
  );

  /** Rule 9. Enabled only once rule 4 is satisfied - and you still need the lock to save. */
  readonly canSubmitDecision = computed(() => this.canAct() && this.allRequiredRecorded());

  /** Rule 8. Adjust severity is always enabled while the case is open. */
  readonly canAdjustSeverity = computed(() => !this.isResolved());

  /** Rule 10. Footer disappears entirely once resolved. */
  readonly showFooter = computed(() => !this.isResolved());

  readonly visibleInfoTabs = computed<InfoTab[]>(() =>
    this.isResolved()
      ? ['snapshot', 'timeline']
      : ['snapshot', 'past-cases', 'starred', 'timeline'],
  );

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
  readonly sortedTriggers = computed<Trigger[]>(() => {
    const byTime = [...this.triggers()].sort(
      (a, b) => Date.parse(b.at) - Date.parse(a.at),
    );
    return [...byTime.filter((t) => t.isNew), ...byTime.filter((t) => !t.isNew)];
  });

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

  /** Rule 5. A draft may only be saved with a note, an explicit lock choice, and a synced snapshot. */
  readonly draftValid = computed(() => {
    const d = this.draft();
    if (!d) return false;
    return d.note.trim().length > 0 && d.lockAfter !== null && this.canRecord();
  });

  // ---------------------------------------------------------------- lifecycle

  /** Rebuilds the base case: open, unlocked, nothing recorded, no rule-11 arrival yet. */
  reset(): void {
    seq = 0;
    this.status.set('OPEN');
    this.severity.set(OPENING_SEVERITY);
    this.lockState.set('unlocked');
    this.lockOwner.set(null);
    this.lockedSince.set(null);
    this.snapshotGeneratedAt.set(mockCase.case.snapshot.generatedAt);
    this.snapshotOutOfSync.set(false);
    // The fixture ships the rule-11 arrival inline; the base case predates it.
    this.triggers.set((mockCase.triggers as Trigger[]).filter((t) => !t.isNew));
    this.stream.set([]);
    this.timeline.set([
      {
        at: mockCase.case.createdAt,
        what: `Case created (${OPENING_SEVERITY})`,
        who: this.me().name,
      },
      { at: mockCase.case.createdAt, what: 'Trigger added: Manual - EDD', who: 'system' },
    ]);
    this.draft.set(null);
    this.openDialog.set(null);
    this.addMenuOpen.set(false);
    this.triggersExpanded.set(false);
    this.infoTab.set('snapshot');
    this.viewedSnapshot.set(null);
    this.viewedPastCase.set(null);
    this.activeSegment.set('workflow');
    this.lastActivePanel.set('workflow');
    this.streamScroll.set(0);
    this.infoScroll.set(0);
  }

  labelFor(id: ActionTypeId): string {
    if (id === 'decision') return 'Decision - case resolved';
    return this.actionTypes().find((t) => t.id === id)?.label ?? id;
  }

  /** Card titles differ from menu labels: "Contact player" (verb) vs "Player contact" (record). */
  outcomeTitleFor(id: ActionTypeId): string {
    switch (id) {
      case 'player-contact':
        return 'Player contact';
      case 'open-source-searches':
        return 'Open source searches';
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
  startRecord(actionType: ActionTypeId, fromPlaceholder = false): void {
    if (this.isResolved() || this.lockState() !== 'locked-to-me') return;
    this.addMenuOpen.set(false);
    this.draft.set({
      actionType,
      title: this.outcomeTitleFor(actionType),
      note: '',
      attachments: [],
      errors: [],
      lockAfter: null, // rule 5: no default
      attempted: false,
      fromPlaceholder,
    });
  }

  patchDraft(patch: Partial<Draft>): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, ...patch });
  }

  cancelDraft(): void {
    this.draft.set(null);
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
          message: `${f.name} was not added. PDF and images only.`,
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
      accepted.push({ id: nextId('att'), name: f.name, kind: f.kind, sizeKb: f.sizeKb });
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
    const outcome: OutcomeItem = {
      kind: 'outcome',
      id: nextId('out'),
      actionType: d.actionType,
      title: d.title,
      actor: this.me().name,
      at,
      note: d.note.trim(),
      attachments: d.attachments, // frozen from here (rule 6)
      snapshotAt: this.snapshotGeneratedAt(),
    };
    this.stream.update((s) => [...s, outcome]);
    this.pushTimeline(at, `Outcome recorded: ${d.title}`, this.me().name);
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
        snapshotAt: this.snapshotGeneratedAt(),
      } satisfies OutcomeItem,
    ]);
    this.status.set('RESOLVED');
    this.pushTimeline(at, 'Decision submitted; case RESOLVED', this.me().name);
    this.openDialog.set(null);
    this.draft.set(null);
    this.addMenuOpen.set(false);
    // Rule 10: the left panel starts empty until an outcome's snapshot is opened.
    this.viewedSnapshot.set(null);
    this.infoTab.set('snapshot');
    return true;
  }

  // ---------------------------------------------------------------- rule 11: triggers

  /** Dev button. Inserts a system trigger, marks the snapshot out of sync. */
  simulateNewTrigger(): void {
    const fixture = (mockCase.triggers as Trigger[]).find((t) => t.isNew);
    const already = this.triggers().some((t) => t.id === fixture?.id);
    const trigger: Trigger =
      fixture && !already
        ? { ...fixture, at: nowIso(), isNew: true }
        : {
            id: nextId('trg'),
            name: 'System - Threshold',
            detail:
              'Large deposit while case open. Snapshot resync required before recording outcomes.',
            at: nowIso(),
            isNew: true,
          };

    this.triggers.update((list) => [trigger, ...list]);
    this.snapshotOutOfSync.set(true);
    this.pushTimeline(
      trigger.at,
      `Trigger added: ${trigger.name}; snapshot out of sync`,
      'system',
    );
    // Open question 6: only auto-expand if the strip was already expanded.
    // (Left deliberately as a no-op - the strip keeps whatever state it had.)
  }

  resync(): void {
    const at = nowIso();
    this.snapshotOutOfSync.set(false);
    this.snapshotGeneratedAt.set(at);
    this.triggers.update((list) => list.map((t) => ({ ...t, isNew: false })));
    this.pushTimeline(at, 'Snapshot resynced', this.me().name);
    // Open question 2: an open draft survives resync untouched and Save re-enables.
  }

  // ---------------------------------------------------------------- snapshots

  viewSnapshot(outcome: OutcomeItem): void {
    this.viewedSnapshot.set({
      outcomeId: outcome.id,
      title: outcome.title,
      at: outcome.snapshotAt,
    });
    this.infoTab.set('snapshot');
    this.activeSegment.set('player-info');
  }

  clearSnapshot(): void {
    this.viewedSnapshot.set(null);
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
    lockState?: LockState;
    lockOwner?: Agent | null;
    lockedSince?: string | null;
    stream?: StreamItem[];
    timeline?: TimelineEntry[];
    triggers?: Trigger[];
    triggersExpanded?: boolean;
    snapshotOutOfSync?: boolean;
    draft?: Draft | null;
    openDialog?: DialogId;
    addMenuOpen?: boolean;
    viewedSnapshot?: SnapshotView | null;
    infoTab?: InfoTab;
    lastActivePanel?: 'workflow' | 'player-info';
  }): void {
    if (patch.status !== undefined) this.status.set(patch.status);
    if (patch.severity !== undefined) this.severity.set(patch.severity);
    if (patch.lockState !== undefined) this.lockState.set(patch.lockState);
    if (patch.lockOwner !== undefined) this.lockOwner.set(patch.lockOwner);
    if (patch.lockedSince !== undefined) this.lockedSince.set(patch.lockedSince);
    if (patch.stream !== undefined) this.stream.set(patch.stream);
    if (patch.timeline !== undefined) this.timeline.set(patch.timeline);
    if (patch.triggers !== undefined) this.triggers.set(patch.triggers);
    if (patch.triggersExpanded !== undefined) this.triggersExpanded.set(patch.triggersExpanded);
    if (patch.snapshotOutOfSync !== undefined) this.snapshotOutOfSync.set(patch.snapshotOutOfSync);
    if (patch.draft !== undefined) this.draft.set(patch.draft);
    if (patch.openDialog !== undefined) this.openDialog.set(patch.openDialog);
    if (patch.addMenuOpen !== undefined) this.addMenuOpen.set(patch.addMenuOpen);
    if (patch.viewedSnapshot !== undefined) this.viewedSnapshot.set(patch.viewedSnapshot);
    if (patch.infoTab !== undefined) this.infoTab.set(patch.infoTab);
    if (patch.lastActivePanel !== undefined) this.lastActivePanel.set(patch.lastActivePanel);
  }

  /** @internal dev-only - the fixture history, replayed as saved stream items. */
  fixtureStream(upTo: 'first' | 'required' | 'all'): StreamItem[] {
    const raw = mockCase.workflow as any[];
    const items: StreamItem[] = raw.map((r) => {
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
          snapshotAt: r.snapshotAt,
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

    if (upTo === 'first') return items.slice(0, 1);
    if (upTo === 'required') return items.filter((i) => !(isOutcome(i) && i.actionType === 'decision'));
    return items;
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
    return mockCase.timeline as TimelineEntry[];
  }

  /** @internal dev-only */
  allFixtureTriggers(): Trigger[] {
    return mockCase.triggers as Trigger[];
  }

  /** @internal dev-only - the two canned attachment errors from the fixture. */
  fixtureAttachmentErrors(): AttachmentError[] {
    return (mockCase.attachmentErrorsExample as any[]).map((e) => ({
      id: nextId('err'),
      file: e.file,
      reason: e.reason as 'type' | 'size',
      message: e.message,
    }));
  }
}
