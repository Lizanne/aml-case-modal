import { Injectable, computed, signal } from '@angular/core';

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
export interface EddCheckpoint {
  id: 'lifetime-deposits' | 'lifetime-net-loss';
  /** What the edit button names: the measure, not the checkpoint set. */
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

/**
 * State for the AML dashboard in player details: the score-card, its
 * overrides, and the audit log those overrides write to.
 *
 * Separate from CaseStore on purpose. That store is one case; this is the
 * player's standing risk, which exists whether or not a case is open.
 */
@Injectable({ providedIn: 'root' })
export class AmlDashboardStore {
  private readonly entries = signal<ScoreState>(SEED);
  private readonly _log = signal<AuditEvent[]>(SEED_LOG);
  private seq = 100;

  readonly tab = signal<DashboardTab>('overview');

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
  readonly latest = computed(() => this._log().slice(0, 5));

  readonly targetRow = computed<ScoreRow | null>(() => {
    const id = this.overrideTarget();
    if (!id) return null;
    for (const section of this.sections()) {
      const row = section.rows.find((r) => r.parameter.id === id);
      if (row) return row;
    }
    return null;
  });

  readonly checkpoints: readonly EddCheckpoint[] = [
    {
      id: 'lifetime-deposits',
      measure: 'lifetime deposits',
      label: 'Global high risk checkpoint',
      threshold: '£25,000 lifetime deposits',
      position: 'Player is at £18,460 (74%)',
      actions: 'Open an EDD case and request source of funds',
    },
    {
      id: 'lifetime-net-loss',
      measure: 'lifetime net loss',
      label: 'Global high risk checkpoint',
      threshold: 'No next threshold for lifetime net loss',
      position: 'Player is at £2,140 (100%)',
      actions: null,
    },
  ];

  readonly archive: readonly ArchivedCase[] = [
    { id: 'AML-0877', opened: '2026-08-09T10:02:00Z', closed: '2026-08-14T11:05:00Z', trigger: 'Risk rating: Low to Medium', severity: 'AML' },
    { id: 'AML-0612', opened: '2026-03-02T13:45:00Z', closed: '2026-03-20T09:30:00Z', trigger: 'Deposit checkpoint crossed: £2,500', severity: 'EDD' },
    { id: 'AML-0398', opened: '2025-10-17T08:15:00Z', closed: '2025-10-29T15:10:00Z', trigger: 'Manual: created by an agent', severity: 'AML' },
  ];

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
    const span = change.days === null ? 'until revoked' : `for ${change.days} ${change.days === 1 ? 'day' : 'days'}`;
    this.record(`${parameter.label} overridden to ${change.points} points, ${span}: total ${this.total()}`, AGENT);
    this.recordBandChange(before);
    this.overrideTarget.set(null);
  }

  /** Hands the parameter back to the system's own result. */
  revokeOverride(id: string): void {
    const parameter = SCORE_PARAMETERS.find((candidate) => candidate.id === id);
    if (!parameter) return;
    const before = this.band();
    this.entries.update((state) => ({ ...state, [id]: { met: state[id]?.met ?? false } }));
    this.record(`${parameter.label} override revoked: total ${this.total()}`, AGENT);
    this.recordBandChange(before);
    this.overrideTarget.set(null);
  }

  private recordBandChange(before: RiskBand): void {
    const after = this.band();
    if (after.id !== before.id) {
      this.record(`Risk rating changed from ${before.label} to ${after.label}`, 'System');
    }
  }

  private record(what: string, who: string): void {
    const event: AuditEvent = { id: `e${this.seq++}`, at: new Date().toISOString(), what, who };
    this._log.update((log) => [event, ...log]);
  }
}
