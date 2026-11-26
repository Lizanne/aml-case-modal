import { Injectable, computed, inject, signal } from '@angular/core';

import {
  RISK_BANDS,
  RiskBand,
  SCORE_CATEGORIES,
  SCORE_PARAMETERS,
  ScoreCategory,
  ScoreEntry,
  ScoreOverride,
  ScoreParameter,
  ScoreState,
  activeOverride,
  bandFor,
  effectivePoints,
  overrideEnds,
  scoreTotal,
} from './aml-risk';
import { CaseStore } from './case-store';
import { applyScenario } from './scenarios';
import { WorkspaceStore } from './workspace-store';

/** The agent the prototype is signed in as, as everywhere else in it. */
const AGENT = 'Liz Fernandez';

export type DashboardTab = 'overview' | 'archive' | 'audit';

/** One line of the AML audit log: what, when, who. */
export interface AuditEvent {
  id: string;
  /** ISO. */
  at: string;
  what: string;
  /** An agent's name, or "System". */
  who: string;
}

/**
 * One row of the Next EDD checkpoints card, as the current AML Risks tab
 * draws it: which checkpoint, the next threshold in words, and where the
 * player stands against it. `actions` is the column APP-17691 adds.
 */
/**
 * What the dashboard says back after a change. `undo` is there only when the
 * change took something away: a revoke removes an override and its reason in
 * one press, with no confirmation in front of it, so the way back is offered
 * afterwards instead.
 */
export interface DashboardNotice {
  /** Changes on every notice, so the same message twice is still two notices. */
  seq: number;
  message: string;
  /** The score-card row that changed. */
  parameterId: string;
  undo?: () => void;
}

export interface EddCheckpoint {
  id: 'lifetime-deposits' | 'lifetime-net-loss';
  /** What is being measured. Leads the row: it is what tells two rows apart. */
  measure: string;
  label: string;
  threshold: string;
  position: string;
  /** null when there is no next threshold, so nothing to cross. */
  actions: string | null;
}

export interface ArchivedCase {
  id: string;
  opened: string;
  closed: string;
  trigger: string;
  severity: 'AML' | 'EDD' | 'COMPLIANCE';
}

/** One score-card row, with everything the table needs already worked out. */
export interface ScoreRow {
  parameter: ScoreParameter;
  /** The system's own result, whatever an override says. */
  met: boolean;
  points: number;
  override: ScoreOverride | null;
  overrideEnds: Date | null;
  /**
   * A timed override that has run out. The field is back on the system's
   * result, which looks exactly like a field nobody ever touched - so the
   * row keeps the override that ended and the moment it did.
   */
  ended: { override: ScoreOverride; at: Date } | null;
}

export interface ScoreSection {
  category: ScoreCategory;
  rows: ScoreRow[];
  points: number;
}

/**
 * Seeded so the dashboard agrees with the case modal beside it: the modal's
 * linked accounts row reads "1 PAR · 1 Similar details", so those two are met
 * here. One override is in place from the start, so the overridden state is
 * on screen without anyone having to make one first.
 */
const SEED: Record<string, ScoreEntry> = {
  'linked-similar': { met: true },
  'par-link': { met: true },
  'high-deposit': { met: true },
  roulette: { met: true },
  stacking: { met: true },
  occupation: {
    met: false,
    override: {
      points: 50,
      days: null,
      reason: 'Customer confirmed on a call that they are paid in cash at a casino.',
      by: 'Amara Okafor',
      at: '2026-11-18T14:22:00Z',
    },
  },
};

const SEED_LOG: AuditEvent[] = [
  { id: 'e9', at: '2026-11-22T09:12:00Z', what: 'AML case #AML-1042 created', who: 'System' },
  { id: 'e8', at: '2026-11-22T09:12:00Z', what: 'Risk rating changed from Medium risk to High risk', who: 'System' },
  { id: 'e7', at: '2026-11-22T09:11:00Z', what: 'Stacking deposits met: +20 points, total 200', who: 'System' },
  { id: 'e6', at: '2026-11-18T14:22:00Z', what: 'Occupation associated with risk overridden to 50 points, until revoked: total 180', who: 'Amara Okafor' },
  { id: 'e5', at: '2026-11-12T19:40:00Z', what: 'High single deposit: £2,000 met: +20 points, total 130', who: 'System' },
  { id: 'e4', at: '2026-11-02T08:00:00Z', what: 'Roulette met: +10 points, total 110', who: 'System' },
  { id: 'e3', at: '2026-08-14T11:05:00Z', what: 'AML case #AML-0877 resolved', who: 'Daniel Reyes' },
  { id: 'e2', at: '2026-08-11T16:30:00Z', what: 'AML case #AML-0877 action recorded: Open source searches', who: 'Daniel Reyes' },
  { id: 'e1', at: '2026-08-09T10:02:00Z', what: 'AML case #AML-0877 created', who: 'System' },
  { id: 'e0', at: '2026-08-09T10:02:00Z', what: 'Risk rating changed from Low risk to Medium risk', who: 'System' },
];

function lapsed(
  entry: ScoreEntry | undefined,
  active: ScoreOverride | null,
  now: Date,
): ScoreRow['ended'] {
  if (active || !entry?.override) return null;
  const at = overrideEnds(entry.override);
  return at && at.getTime() <= now.getTime() ? { override: entry.override, at } : null;
}

/** "Risk rating changed from X to Y" is how the log records a rating change. */
const RATING_CHANGE = /^Risk rating changed/;

/** Everything the dashboard knows about one player. */
export interface DashboardSnapshot {
  entries: Record<string, ScoreEntry>;
  /** Newest first. */
  log: AuditEvent[];
  archive: ArchivedCase[];
  checkpoints: EddCheckpoint[];
  /** When the score last changed. Defaults to the newest event in the log. */
  updatedAt?: string;
  /** When the player entered their current rating. Defaults to the newest
      rating change in the log; absent if the rating has never changed. */
  ratingSince?: string;
}

/** The player the dashboard opens on: 200 points, High risk, one override. */
export const HIGH_RISK: DashboardSnapshot = {
  entries: SEED,
  log: SEED_LOG,
  archive: [
    { id: 'AML-0877', opened: '2026-08-09T10:02:00Z', closed: '2026-08-14T11:05:00Z', trigger: 'Risk rating: Low to Medium', severity: 'AML' },
    { id: 'AML-0612', opened: '2026-03-02T13:45:00Z', closed: '2026-03-20T09:30:00Z', trigger: 'Deposit checkpoint crossed: £2,500', severity: 'EDD' },
    { id: 'AML-0398', opened: '2025-10-17T08:15:00Z', closed: '2025-10-29T15:10:00Z', trigger: 'Manual: created by an agent', severity: 'AML' },
  ],
  checkpoints: [
    {
      id: 'lifetime-deposits',
      measure: 'Lifetime deposits',
      label: 'Global high risk checkpoint',
      threshold: '£25,000 lifetime deposits',
      position: 'Player is at £18,460 (74%)',
      actions: 'Open an EDD case and request source of funds',
    },
    {
      id: 'lifetime-net-loss',
      measure: 'Lifetime net loss',
      label: 'Global high risk checkpoint',
      threshold: 'No next threshold for lifetime net loss',
      position: 'Player is at £2,140 (100%)',
      actions: null,
    },
  ],
};

/**
 * State for the AML dashboard in player details: the score-card, its
 * overrides, and the audit log those overrides write to.
 *
 * Separate from CaseStore on purpose. That store is one case; this is the
 * player's standing risk, which exists whether or not a case is open.
 */
@Injectable({ providedIn: 'root' })
export class AmlDashboardStore {
  /**
   * Read, and written in exactly one place: what a rise in the rating does to
   * the player's case (see recordBandChange). The score-card itself knows
   * nothing about cases.
   */
  private readonly cases = inject(CaseStore);
  private readonly ws = inject(WorkspaceStore);

  private readonly entries = signal<ScoreState>(SEED);
  private readonly _log = signal<AuditEvent[]>(SEED_LOG);
  private seq = 100;

  readonly tab = signal<DashboardTab>('overview');

  /** How many audit events the log shows before "Show more". */
  static readonly PAGE = 10;
  readonly logShown = signal(AmlDashboardStore.PAGE);

  /** The Create AML case dialog. */
  readonly creatingCase = signal(false);
  /**
   * A case made from the dashboard. The prototype's case panel holds one
   * fixture case, so this is the record that one was created - enough for
   * the dashboard to stop offering Create and to say which case is active.
   */
  readonly createdCase = signal<{ id: string; severity: string; opened: string } | null>(null);

  /**
   * When the score last changed - by the system or by an override. Not when
   * it was last CHECKED: most fields are re-read daily whether or not anything
   * moved, so a "last checked" time would always say today and tell an agent
   * nothing. null for a player who has never scored.
   */
  private readonly _updatedAt = signal<string | null>(HIGH_RISK.log[0]?.at ?? null);
  readonly updatedAt = this._updatedAt.asReadonly();

  /**
   * When the player entered the rating they have now. "High risk" on its own
   * does not say whether this is this morning's news or last quarter's.
   * null when the rating has never changed: there is no date to give.
   */
  private readonly _ratingSince = signal<string | null>(
    HIGH_RISK.log.find((event) => RATING_CHANGE.test(event.what))?.at ?? null,
  );
  readonly ratingSince = this._ratingSince.asReadonly();

  /** The last thing that changed, for the toast and the row it points at. */
  readonly notice = signal<DashboardNotice | null>(null);

  /** The parameter whose override dialog is up, if any. */
  readonly overrideTarget = signal<string | null>(null);

  readonly bands = RISK_BANDS;

  /**
   * A fresh "now" per read is deliberate: an override's last day is decided
   * against the clock, not against whenever the page happened to load.
   */
  readonly sections = computed<ScoreSection[]>(() => {
    const state = this.entries();
    const now = new Date();
    return SCORE_CATEGORIES.map((category) => {
      const rows = SCORE_PARAMETERS.filter((parameter) => parameter.category === category).map(
        (parameter): ScoreRow => {
          const entry = state[parameter.id];
          const override = activeOverride(entry, now);
          return {
            parameter,
            met: entry?.met ?? false,
            points: effectivePoints(parameter, entry, now),
            override,
            overrideEnds: override ? overrideEnds(override) : null,
            ended: lapsed(entry, override, now),
          };
        },
      );
      return { category, rows, points: rows.reduce((sum, row) => sum + row.points, 0) };
    });
  });

  readonly total = computed(() => scoreTotal(this.entries(), new Date()));
  readonly band = computed<RiskBand>(() => bandFor(this.total()));

  /** The band above the current one, or null at critical. */
  readonly nextBand = computed<RiskBand | null>(() => {
    const at = RISK_BANDS.indexOf(this.band());
    return RISK_BANDS[at + 1] ?? null;
  });

  readonly log = this._log.asReadonly();
  /**
   * Ten, not five (26 Nov 2026): the card sits beside a score-card of twenty
   * rows, and five left most of that column empty. Past ten, the full log is
   * one click away.
   */
  readonly latest = computed(() => this._log().slice(0, 10));
  readonly visibleLog = computed(() => this._log().slice(0, this.logShown()));
  readonly logRemaining = computed(() => Math.max(0, this._log().length - this.logShown()));

  showMoreLog(): void {
    this.logShown.update((n) => n + AmlDashboardStore.PAGE);
  }

  /** Rule 1 allows one open case per player, so this is only offered when
      there is none. */
  createCase(severity: string, reason: string): void {
    const opened = new Date().toISOString();
    this.createdCase.set({ id: 'AML-1043', severity, opened });
    this.record(`AML case #AML-1043 created by an agent (${severity} severity): ${reason}`, AGENT);
    this.creatingCase.set(false);
  }

  readonly targetRow = computed<ScoreRow | null>(() => {
    const id = this.overrideTarget();
    if (!id) return null;
    for (const section of this.sections()) {
      const row = section.rows.find((r) => r.parameter.id === id);
      if (row) return row;
    }
    return null;
  });

  readonly checkpoints = signal<readonly EddCheckpoint[]>(HIGH_RISK.checkpoints);
  readonly archive = signal<readonly ArchivedCase[]>(HIGH_RISK.archive);

  /**
   * @internal dev-only. Puts the dashboard in a named state for the dev
   * switcher: a whole player, not a patch, and everything transient - the
   * open dialog, the toast, the tab, the paging - goes back to its start.
   */
  seed(snapshot: DashboardSnapshot): void {
    this.entries.set(snapshot.entries);
    this._log.set(snapshot.log);
    this.archive.set(snapshot.archive);
    this.checkpoints.set(snapshot.checkpoints);
    this._updatedAt.set(snapshot.updatedAt ?? snapshot.log[0]?.at ?? null);
    this._ratingSince.set(
      snapshot.ratingSince ?? snapshot.log.find((event) => RATING_CHANGE.test(event.what))?.at ?? null,
    );
    this.tab.set('overview');
    this.logShown.set(AmlDashboardStore.PAGE);
    this.overrideTarget.set(null);
    this.creatingCase.set(false);
    this.createdCase.set(null);
    this.notice.set(null);
  }

  /** The next field the system could find met: unmet, and not overridden. */
  private readonly nextUnmet = computed<ScoreParameter | null>(() => {
    const state = this.entries();
    const now = new Date();
    return (
      SCORE_PARAMETERS.find((parameter) => {
        const entry = state[parameter.id];
        return !entry?.met && !activeOverride(entry, now);
      }) ?? null
    );
  });
  readonly canSystemChange = computed(() => this.nextUnmet() !== null);

  /**
   * @internal dev-only. The system finds one more field met - a deposit
   * lands, a screening match comes back - so the score moves without anyone
   * touching it. Returns what changed, so the dev harness can follow the
   * ticket's rule and open a case when the rating rises.
   */
  systemChange(): void {
    const parameter = this.nextUnmet();
    if (!parameter) return;
    const before = this.band();
    this.entries.update((state) => ({ ...state, [parameter.id]: { ...state[parameter.id], met: true } }));
    this._updatedAt.set(new Date().toISOString());
    this.record(`${parameter.label} met: +${parameter.points} points, total ${this.total()}`, 'System');
    const consequence = this.recordBandChange(before);
    const rating = this.band().id === before.id ? '' : ` Rating is now ${this.band().label}.`;
    this.announce(
      `System update. ${parameter.label} is now met: +${parameter.points} points.${rating}${consequence}`,
      parameter.id,
    );
  }

  /** Sets or replaces the override on a parameter, and logs what it did. */
  setOverride(id: string, change: Pick<ScoreOverride, 'points' | 'days' | 'reason'>): void {
    const parameter = SCORE_PARAMETERS.find((candidate) => candidate.id === id);
    if (!parameter) return;
    const before = this.band();
    const at = new Date().toISOString();
    this.entries.update((state) => ({
      ...state,
      [id]: { met: state[id]?.met ?? false, override: { ...change, by: AGENT, at } },
    }));
    this._updatedAt.set(at);
    const span = change.days === null ? 'until revoked' : `for ${change.days} ${change.days === 1 ? 'day' : 'days'}`;
    this.record(`${parameter.label} overridden to ${change.points} points, ${span}: total ${this.total()}`, AGENT);
    const consequence = this.recordBandChange(before);
    this.overrideTarget.set(null);
    this.announce(`Override saved. ${parameter.label} now scores ${change.points} points.${consequence}`, id);
  }

  /** Hands the parameter back to the system's own result. */
  revokeOverride(id: string): void {
    const parameter = SCORE_PARAMETERS.find((candidate) => candidate.id === id);
    if (!parameter) return;
    const before = this.band();
    const removed = this.entries()[id]?.override;
    this.entries.update((state) => ({ ...state, [id]: { met: state[id]?.met ?? false } }));
    this._updatedAt.set(new Date().toISOString());
    this.record(`${parameter.label} override revoked: total ${this.total()}`, AGENT);
    this.recordBandChange(before);
    this.overrideTarget.set(null);

    const now = effectivePoints(parameter, this.entries()[id], new Date());
    this.announce(
      `Override revoked. ${parameter.label} now scores ${now} points.`,
      id,
      removed ? () => this.restoreOverride(id, parameter.label, removed) : undefined,
    );
  }

  /** Puts a revoked override back exactly as it was: same reason, author, date. */
  private restoreOverride(id: string, label: string, override: ScoreOverride): void {
    const before = this.band();
    this.entries.update((state) => ({ ...state, [id]: { met: state[id]?.met ?? false, override } }));
    this._updatedAt.set(new Date().toISOString());
    this.record(`${label} override restored: total ${this.total()}`, AGENT);
    const consequence = this.recordBandChange(before);
    this.announce(`Override restored. ${label} scores ${override.points} points again.${consequence}`, id);
  }

  private noticeSeq = 0;
  private announce(message: string, parameterId: string, undo?: () => void): void {
    this.notice.set({ seq: ++this.noticeSeq, message, parameterId, undo });
  }

  dismissNotice(): void {
    this.notice.set(null);
  }

  /**
   * Logs a change of rating and, when the rating has RISEN, does what the
   * ticket says a rise does to the player's case. Returns a sentence saying
   * so, for the notice - empty when there is nothing to add.
   *
   * A player has one open case at a time. So:
   *
   *   no case open   one is created, at the severity the ticket gives:
   *                  AML into Medium, EDD into High, AML into Critical.
   *   a case open    no second case. The rise lands on the open one as a
   *                  trigger - the case modal already knows how to receive a
   *                  trigger mid-case - and the agent decides what it means
   *                  for severity.
   *
   * Whatever raised it: the system finding a field met, or an agent's
   * override. The rating is what the rule is about, not who moved it.
   */
  private recordBandChange(before: RiskBand): string {
    const after = this.band();
    if (after.id === before.id) return '';
    this.record(`Risk rating changed from ${before.label} to ${after.label}`, 'System');
    this._ratingSince.set(new Date().toISOString());
    if (RISK_BANDS.indexOf(after) < RISK_BANDS.indexOf(before)) return '';

    const change = `Risk rating: ${before.label} to ${after.label}`;
    if (this.ws.isPresent('aml') && !this.cases.isResolved()) {
      this.cases.addSystemTrigger(change, `Score-card total is now ${this.total()} points.`);
      this.record(`Trigger added to AML case #AML-1042: ${change}`, 'System');
      return ' A trigger was added to the open case.';
    }
    // A case made by hand from the dashboard is on record but not in the
    // panel, so there is nothing to add a trigger to and nothing to create.
    if (this.createdCase()) return '';

    const severity = after.id === 'high' ? 'EDD' : 'AML';
    // Unlocked: nobody has picked it up yet. Its panel stays shut, so the
    // widget arriving on the row is the thing that is seen to happen.
    applyScenario(this.cases, this.ws, '00a');
    this.cases.seed({ severity });
    this.ws.seed({ aml: { open: false } });
    this.record(`AML case #AML-1042 created (${severity} severity)`, 'System');
    return ` An ${severity} case was created.`;
  }

  private record(what: string, who: string): void {
    const event: AuditEvent = { id: `e${this.seq++}`, at: new Date().toISOString(), what, who };
    this._log.update((log) => [event, ...log]);
  }
}
