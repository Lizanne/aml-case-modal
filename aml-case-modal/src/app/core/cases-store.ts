import { Injectable, computed, signal } from '@angular/core';

import { ALL_CASES, SEED_NOW, SHARED, isoFromOffset } from './case-fixture';
import {
  Agent,
  CaseQueue,
  CaseRecord,
  LockState,
  Priority,
  Severity,
  TableSort,
  WorkItem,
  WorkTypeDef,
  formatElapsed,
  CaseScoring,
  priorityBand,
  priorityLabel,
  priorityOf,
  queueFor,
  slaBand,
} from './models';

/**
 * The Global AML Cases table's store - PROTOTYPE-TABLE.md.
 *
 * ONE STORE, TWO VIEWS. This holds every open case; the modal reads a single
 * one of them by id. Nothing here is a copy of what the modal keeps: the table
 * owns the collection, and a case's deep history (triggers, workflow, timeline)
 * stays with the modal.
 *
 * Everything the table shows twice is DERIVED once. Queue membership, priority
 * band, SLA band and both LHM counts are computed from the case list, never
 * stored beside it - rule 8, and the same discipline the modal applies to
 * severity direction.
 */
@Injectable({ providedIn: 'root' })
export class CasesStore {
  // ------------------------------------------------------------ shared config
  readonly agents = SHARED.agents as Agent[];
  readonly workTypes = SHARED.workTypes as WorkTypeDef[];

  readonly me = computed<Agent>(() => this.agents.find((a) => a.isMe) ?? this.agents[0]);

  // ------------------------------------------------------------------- cases
  readonly cases = signal<CaseRecord[]>(seedCases());

  /**
   * The clock the SLA column reads.
   *
   * A signal rather than Date.now() at render time: elapsed time is live, and
   * a value read during change detection would only update when something else
   * happened to change. Ticked by startClock(); left alone it simply holds the
   * seed time, which keeps tests deterministic.
   */
  readonly now = signal(SEED_NOW);
  private clock?: ReturnType<typeof setInterval>;

  /** Sort choice, rule 6. Persists for the session, not beyond it. */
  readonly sort = signal<TableSort>('priority');

  // ------------------------------------------------------------------ queues
  /** Open cases only. A resolved case leaves both tabs in the same tick, rule 3. */
  private readonly openCases = computed(() => this.cases().filter((c) => c.status === 'OPEN'));

  readonly activeCases = computed(() => this.sorted(this.inQueue('active')));
  readonly complianceCases = computed(() => this.sorted(this.inQueue('compliance')));

  /** Both LHM counts and both tab counts come from here, rule 8. */
  readonly activeCount = computed(() => this.inQueue('active').length);
  readonly complianceCount = computed(() => this.inQueue('compliance').length);

  private inQueue(queue: CaseQueue): CaseRecord[] {
    return this.openCases().filter((c) => queueFor(c.severity) === queue);
  }

  /**
   * Default: priority score descending, SLA elapsed descending as tiebreaker.
   * Switching to SLA sorts by elapsed alone, still descending - the oldest
   * case is the most urgent either way, so the direction never flips.
   */
  private sorted(rows: CaseRecord[]): CaseRecord[] {
    const elapsed = (c: CaseRecord) => this.now() - Date.parse(c.createdAt);
    const bySla = (a: CaseRecord, b: CaseRecord) => elapsed(b) - elapsed(a);
    return [...rows].sort((a, b) =>
      this.sort() === 'sla' ? bySla(a, b) : b.priority.score - a.priority.score || bySla(a, b),
    );
  }

  // ------------------------------------------------------------- derivations
  elapsedMs(c: CaseRecord): number {
    return this.now() - Date.parse(c.createdAt);
  }

  slaText(c: CaseRecord): string {
    return formatElapsed(this.elapsedMs(c));
  }

  slaBandOf(c: CaseRecord): ReturnType<typeof slaBand> {
    return slaBand(this.elapsedMs(c));
  }

  /** "50 Medium" - the score and its band label, derived from the score. */
  priorityText(p: Priority): string {
    return `${p.score} ${priorityLabel(p.score)}`;
  }

  bandOf(p: Priority): ReturnType<typeof priorityBand> {
    return priorityBand(p.score);
  }

  /** The matrix itself, exposed so a verifier can exercise its boundaries. */
  priorityOfScoring(s: CaseScoring): Priority {
    return priorityOf(s);
  }

  /** To-do chips render first; the column is read left to right as work left. */
  workOrdered(c: CaseRecord): WorkItem[] {
    return [...c.actions].sort((a, b) => (a.state === b.state ? 0 : a.state === 'todo' ? -1 : 1));
  }

  workLabel(type: string): string {
    return this.workTypes.find((w) => w.id === type)?.label ?? type;
  }

  byId(id: string): CaseRecord | undefined {
    return this.cases().find((c) => c.id === id);
  }

  // ----------------------------------------------------------------- actions
  /**
   * Lock, unlock and force-unlock behave exactly as from the widget, rule 5.
   * Force unlock is the same act as unlock here - the CONFIRM is the dialog's
   * job, and taking the lock afterwards is a separate act, as in the modal.
   */
  lock(id: string): void {
    this.patch(id, () => ({
      state: 'locked-to-me' as LockState,
      owner: this.me(),
      since: new Date(this.now()).toISOString(),
    }));
  }

  unlock(id: string): void {
    this.patch(id, () => ({ state: 'unlocked' as LockState, owner: null, since: null }));
  }

  forceUnlock(id: string): void {
    this.unlock(id);
  }

  /**
   * The row whose lock the agent has asked to break, or null.
   *
   * Rule 5 sends force-unlock through the same consequence-stating confirm the
   * widget uses, so the row cannot break a lock on a single click. The table
   * does not own that dialog - app.component hosts it, the way it hosts the
   * widget's - so what the row sets is the REQUEST, and the dialog decides.
   */
  readonly pendingForceUnlock = signal<string | null>(null);

  requestForceUnlock(id: string): void {
    this.pendingForceUnlock.set(id);
  }

  cancelForceUnlock(): void {
    this.pendingForceUnlock.set(null);
  }

  /** Confirmed from the dialog: break the lock, and close it. */
  confirmForceUnlock(): void {
    const id = this.pendingForceUnlock();
    if (id) this.forceUnlock(id);
    this.pendingForceUnlock.set(null);
  }

  /**
   * Change one scoring factor and recompute.
   *
   * The matrix says scoring refreshes every 24 hours or when the ticket is
   * repopulated - not continuously - so this is the deliberate refresh, and
   * the real-time feed calls it rather than mutating a score directly. Band
   * and breakdown come along with the number, because all three are one
   * derivation and none of them is stored on its own.
   */
  rescore(id: string, patch: Partial<CaseScoring>): void {
    this.cases.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        const scoring = { ...c.scoring, ...patch };
        return { ...c, scoring, priority: priorityOf(scoring) };
      }),
    );
  }

  /** Rule 2: severity decides the queue, so this is also how a row changes tab. */
  setSeverity(id: string, severity: Severity): void {
    this.cases.update((list) => list.map((c) => (c.id === id ? { ...c, severity } : c)));
  }

  /** Rule 3: leaves both tabs and both counts in the same tick. */
  resolve(id: string): void {
    this.cases.update((list) =>
      list.map((c) => (c.id === id ? { ...c, status: 'RESOLVED' as const } : c)),
    );
  }

  private patch(id: string, lock: () => CaseRecord['lock']): void {
    this.cases.update((list) => list.map((c) => (c.id === id ? { ...c, lock: lock() } : c)));
  }

  // ------------------------------------------------------------------- clock
  /** Called by the view. Off by default so nothing ticks under a verifier. */
  startClock(everyMs = 30_000): void {
    this.stopClock();
    this.clock = setInterval(() => this.now.set(Date.now()), everyMs);
  }

  stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = undefined;
  }

  /** @internal dev-only - drive the clock from a test without waiting. */
  setNow(ms: number): void {
    this.now.set(ms);
  }

  /** @internal dev-only - back to the seeded collection, for the T-* states. */
  reseed(): void {
    this.cases.set(seedCases());
  }

  /**
   * @internal dev-only - put a case in another agent's hands.
   *
   * Not a product action: an agent can only ever take a lock or release one.
   * This exists so T-04 can show the state without waiting for someone else.
   */
  lockToOther(id: string): void {
    const other = this.agents.find((a) => !a.isMe) ?? this.agents[0];
    this.patch(id, () => ({
      state: 'locked-to-other' as LockState,
      owner: other,
      since: new Date(this.now() - 26 * 3_600_000).toISOString(),
    }));
  }
}

/**
 * The fixture stores an OFFSET, not an absolute timestamp, for everything the
 * SLA clock reads.
 *
 * The spec asks for `createdAt` as an ISO timestamp, and that is what the app
 * sees - but a fixed date cannot demonstrate four SLA bands on an arbitrary
 * day. Hardcoded dates would all have drifted into the breached band by the
 * 7 Oct walkthrough. Offsets are materialised into real ISO timestamps once,
 * here, so the seeded spread is correct whenever the prototype is opened.
 *
 * Case 4821 is the exception and carries a real date: it is the modal's own
 * case, whose history is timestamped in August, and a recent createdAt would
 * put its creation after the outcomes recorded against it.
 */
function seedCases(): CaseRecord[] {
  const iso = isoFromOffset;
  const agents = SHARED.agents as Agent[];

  return ALL_CASES.map((c) => {
    const lock = c.lock ?? {};
    const owner = lock.owner ? (agents.find((a) => a.id === lock.owner.id) ?? lock.owner) : null;
    const scoring = c.scoring as CaseScoring;
    return {
      id: c.id,
      player: c.player,
      status: c.status,
      severity: c.severity as Severity,
      createdAt: c.createdAt ?? iso(c.createdAtOffsetMinutes),
      lock: {
        state: lock.state as LockState,
        owner,
        since: lock.sinceOffsetMinutes != null ? iso(lock.sinceOffsetMinutes) : (lock.since ?? null),
      },
      scoring,
      // Derived, never read from the fixture: the four factors are the only
      // authored priority data, so a score cannot disagree with the lines
      // that are meant to add up to it.
      priority: priorityOf(scoring),
      linkedAccounts: c.linkedAccounts,
      actions: c.actions as WorkItem[],
    } satisfies CaseRecord;
  });
}
