import defaultCases from './mock-cases.json';
import stressCases from './mock-cases-stress.json';

/**
 * Which fixture this session runs on, decided once at module load from
 * ?fixture=. "stress" is the edge-case set - one case per thing that could
 * break a cell - and anything else is the authored collection. Read here,
 * not in a store, because SEED_NOW and ALL_CASES are module constants and the
 * choice has to be made before either is.
 *
 * Guarded for the store verifier, which bundles this module for Node.
 */
function selectFixture(): typeof defaultCases {
  const name =
    typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fixture') : null;
  return name === 'stress' ? (stressCases as unknown as typeof defaultCases) : defaultCases;
}
const mockCases = selectFixture();

/**
 * One fixture, two views.
 *
 * `mock-cases.json` is the only case data in the prototype. The table reads the
 * collection; the modal reads ONE case from it, shaped the way the modal has
 * always expected. This module is that projection, so CaseStore keeps its own
 * structure instead of learning the collection's.
 */

/**
 * The instant every relative timestamp is measured from, fixed at module load.
 *
 * Both stores materialise the same offsets, so they must share a base: read
 * separately, the table's createdAt for a case and the modal's createdAt for
 * the same case would differ by however far apart the two were constructed.
 * One constant, imported by both, is what stops that.
 */
export const SEED_NOW = Date.now();

/** Minutes before SEED_NOW, as the ISO timestamp the app actually sees. */
export function isoFromOffset(minutesAgo: number): string {
  return new Date(SEED_NOW - minutesAgo * 60_000).toISOString();
}

/**
 * An absolute date when the fixture states one, otherwise the offset.
 *
 * Case 4821 carries real August dates because its recorded history is dated;
 * a fresh createdAt would put the case's creation after the outcomes recorded
 * against it. Every other case is relative, so the seeded SLA spread is right
 * whenever the prototype is opened rather than only on the day it was written.
 */
function at(absolute: string | undefined, offsetMinutes: number | undefined): string | null {
  if (absolute) return absolute;
  if (offsetMinutes == null) return null;
  return isoFromOffset(offsetMinutes);
}

export const DEFAULT_CASE_ID = '4821';

/** Config that belongs to the prototype, not to any one case. */
export const SHARED = {
  agents: mockCases.agents,
  requiredActions: mockCases.requiredActions,
  actionTypes: mockCases.actionTypes,
  workTypes: mockCases.workTypes,
  severityRanking: mockCases.severityRanking,
  attachmentErrorsExample: mockCases.attachmentErrorsExample,
};

/**
 * Where a hand-authored case's dates land when the prototype is opened.
 *
 * 52h 10m puts it past the 48h breach threshold - the band the fixture needs
 * it to demonstrate - while reading as a case somebody is actually behind on.
 * The last recorded event lands 20 minutes ago, so the case looks worked
 * rather than abandoned.
 */
const REBASE_CREATED_MINUTES_AGO = 3130;
const REBASE_LAST_EVENT_MINUTES_AGO = 20;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Rebase a case authored with absolute dates onto a window ending now.
 *
 * Case 4821 is written with real August timestamps because its history is a
 * narrative - twenty stamps that have to stay in order and keep their relative
 * spacing, which is far easier to author and read as dates than as a list of
 * minute offsets. The cost was that the dates are FIXED: the SLA column read
 * "1174h 11m" and gained an hour every hour the prototype went unopened.
 *
 * So the dates stay authored, and this maps them. The whole block is shifted
 * and scaled onto [createdAt, ~now] together, so creation still precedes every
 * outcome recorded against it - the invariant a bare re-anchor of createdAt
 * would have broken. Stamps BEFORE the creation date are left alone: those are
 * prior cases, and they are supposed to be months old.
 *
 * Cases authored with offsets are already relative and pass through untouched.
 */
function rebaseAuthoredDates(cases: any[]): any[] {
  return cases.map((c) => {
    if (!c.createdAt) return c;
    const created = Date.parse(c.createdAt);

    let last = created;
    const scan = (v: any): void => {
      if (typeof v === 'string') {
        if (ISO.test(v)) last = Math.max(last, Date.parse(v));
      } else if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === 'object') Object.values(v).forEach(scan);
    };
    scan(c);

    const authoredSpan = last - created;
    const fromAgo = REBASE_CREATED_MINUTES_AGO * 60_000;
    const toAgo = REBASE_LAST_EVENT_MINUTES_AGO * 60_000;
    const shift = (iso: string): string => {
      const t = Date.parse(iso);
      if (t < created) return iso;
      const progress = authoredSpan === 0 ? 0 : (t - created) / authoredSpan;
      return new Date(SEED_NOW - (fromAgo - progress * (fromAgo - toAgo))).toISOString();
    };

    const walk = (v: any): any => {
      if (typeof v === 'string') return ISO.test(v) ? shift(v) : v;
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      }
      return v;
    };
    return walk(c);
  });
}

export const ALL_CASES = rebaseAuthoredDates(mockCases.cases as any[]);

export function rawCase(id: string): any {
  return ALL_CASES.find((c) => c.id === id) ?? ALL_CASES[0];
}

/**
 * The modal's view of one case: exactly the shape `mock-case.json` used to
 * have, so nothing in CaseStore had to change beyond where it reads from.
 */
export function caseFixture(id: string = DEFAULT_CASE_ID) {
  const c = rawCase(id);
  const createdAt = at(c.createdAt, c.createdAtOffsetMinutes)!;

  const creation = c.creation
    ? {
        reason: c.creation.reason,
        by: c.creation.by,
        at: at(c.creation.at, c.creation.atOffsetMinutes) ?? createdAt,
        description: c.creation.description,
      }
    : undefined;

  return {
    player: c.player,
    case: {
      id: c.id,
      status: c.status,
      severity: c.severity,
      createdAt,
      origin: c.origin,
      creation,
      lock: {
        state: c.lock.state,
        owner: c.lock.owner ?? null,
        since: at(c.lock.since, c.lock.sinceOffsetMinutes),
      },
      snapshot: {
        generatedAt:
          at(c.snapshot?.generatedAt, c.snapshot?.generatedAtOffsetMinutes) ?? createdAt,
        outOfSync: c.snapshot?.outOfSync ?? false,
      },
    },
    triggers: (c.triggers as any[]).map((t) => ({
      id: t.id,
      name: t.name,
      detail: t.detail,
      at: at(t.at, t.atOffsetMinutes)!,
      isNew: t.isNew ?? false,
    })),
    workflow: c.workflow as any[],
    timeline: c.timeline as any[],
    pastCases: c.pastCases as any[],
    starredCommentaries: c.starredCommentaries as any[],
    ...SHARED,
  };
}
