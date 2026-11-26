/**
 * The AML risk score-card: APP-17691.
 *
 * Plain TypeScript, nothing from Angular, so verify/aml-risk.mjs can run it in
 * Node as it stands. Everything the dashboard shows about points is derived
 * here from two inputs: what the system found, and what an agent overrode.
 *
 * The points and the band boundaries are data, not logic - the ticket asks for
 * both to be configurable server side, so nothing below does arithmetic on a
 * literal that is not in one of these two tables.
 */

export type ScoreCategory =
  | 'Profile'
  | 'Payments'
  | 'Jurisdiction'
  | 'Affordability'
  | 'Product risk'
  | 'Activity / Behaviour';

/** The order the sections are read in. Profile first: it is who the player is. */
export const SCORE_CATEGORIES: readonly ScoreCategory[] = [
  'Profile',
  'Payments',
  'Jurisdiction',
  'Affordability',
  'Product risk',
  'Activity / Behaviour',
];

export interface ScoreParameter {
  id: string;
  category: ScoreCategory;
  label: string;
  /** Points scored while the risk is met. */
  points: number;
  /** Exit criteria: the days of history the metric looks at. null = none. */
  exitDays: number | null;
  /**
   * The (i) explanation: the "Tooltip" column of the ticket's Excel
   * (APP-17691, 5c), word for word. The one change is "at lest" to "at
   * least", and a full stop on the PEP line. It is compliance copy, so it is
   * not reworded here.
   */
  info: string;
}

const p = (
  id: string,
  category: ScoreCategory,
  label: string,
  points: number,
  exitDays: number | null,
  info: string,
): ScoreParameter => ({ id, category, label, points, exitDays, info });

export const SCORE_PARAMETERS: readonly ScoreParameter[] = [
  p('linked-household', 'Profile', 'Linked account (household link)', 25, null, 'Fixed number of points for at least one link.'),
  p('linked-similar', 'Profile', 'Linked account (similar details)', 50, null, 'Fixed number of points for at least one link.'),
  p('domestic-pep', 'Profile', 'Domestic PEP', 75, null, 'Can be only updated manually as on override here or as auto action on AML Case being resolved.'),
  p('international-pep', 'Profile', 'International PEP', 125, null, 'Can be only updated manually as on override here or as auto action on AML Case being resolved.'),
  p('sanctioned', 'Profile', 'Sanctioned individual', 500, null, 'Can be only updated manually as on override here or as auto action on AML Case being resolved.'),
  p('occupation', 'Profile', 'Occupation associated with risk', 50, null, 'Check confluence doc to see list of occupations associated with risk.'),
  p('age-under-25', 'Profile', 'Player age under 25', 25, null, 'Checked daily.'),
  p('age-75-plus', 'Profile', 'Player age 75+', 25, null, 'Checked daily.'),
  p('par-link', 'Payments', 'PAR link', 50, null, 'Fixed number of points for at least one link.'),
  p('ip-black-list', 'Jurisdiction', 'IP address from a black list country', 50, 90, 'Check confluence doc to see list of black list risk countries.'),
  p('ip-grey-list', 'Jurisdiction', 'IP address from a grey list country', 25, 30, 'Check confluence doc to see list of grey list risk countries.'),
  p('high-deposit', 'Affordability', 'High single deposit: £2,000', 20, 30, 'Checked daily.'),
  p('high-deposit-3x', 'Affordability', 'High single deposit: £2,000, 3 times in 7 days', 50, 90, 'Checked daily.'),
  p('crash-games', 'Product risk', 'Crash games used', 10, 90, 'At least one play. Updated daily.'),
  p('roulette', 'Product risk', 'Roulette', 10, 90, 'At least one play. Updated daily.'),
  p('blackjack', 'Product risk', 'Blackjack', 10, 90, 'At least one play. Updated daily.'),
  p('withdraw-no-bet', 'Activity / Behaviour', 'Withdrawing without betting', 20, 30, 'Withdrawals that mirror recent deposits without any stakes being placed between. Updated daily.'),
  p('withdraw-no-bet-3x', 'Activity / Behaviour', 'Withdrawing without betting, 3 times in 7 days', 50, 90, 'Withdrawals that mirror recent deposits without any stakes being placed between. Updated daily.'),
  p('stacking', 'Activity / Behaviour', 'Stacking deposits', 20, 30, 'Instances where ≥ 3 deposits take place without any gameplay or staking occurring between deposits. Updated daily.'),
  p('stacking-3x', 'Activity / Behaviour', 'Stacking deposits, 3 times in 7 days', 50, 90, 'Instances where ≥ 3 deposits take place without any gameplay or staking occurring between deposits. Updated daily.'),
  p('multi-payment', 'Activity / Behaviour', 'Multiple payment types in one session', 25, 30, 'Checked daily.'),
  p('multi-payment-3x', 'Activity / Behaviour', 'Multiple payment types in one session, 3 times in 7 days', 50, 90, 'Checked daily.'),
  p('not-staked', 'Activity / Behaviour', 'Deposits not staked through in full', 25, 30, 'If ratio for requested period is <=1 then points are assigned.'),
];

/* ------------------------------------------------------------------ bands */

export type RiskBandId = 'low' | 'medium' | 'high' | 'critical';

export interface RiskBand {
  id: RiskBandId;
  label: string;
  start: number;
  /** Inclusive. null on the last band: critical has no upper limit. */
  end: number | null;
}

export const RISK_BANDS: readonly RiskBand[] = [
  { id: 'low', label: 'Low risk', start: 0, end: 74 },
  { id: 'medium', label: 'Medium risk', start: 75, end: 124 },
  { id: 'high', label: 'High risk', start: 125, end: 449 },
  { id: 'critical', label: 'Critical', start: 450, end: null },
];

export function bandFor(total: number): RiskBand {
  // Last band whose start has been reached, so a gap in a mis-configured table
  // resolves downward rather than to nothing.
  let found = RISK_BANDS[0];
  for (const band of RISK_BANDS) if (total >= band.start) found = band;
  return found;
}

/* -------------------------------------------------------------- overrides */

export interface ScoreOverride {
  /** Zero, or the parameter's full points. Nothing in between. */
  points: number;
  /** Days the override lasts. null = until it is revoked. */
  days: number | null;
  reason: string;
  by: string;
  /** ISO, when it was made. */
  at: string;
}

/** What is known about one parameter for one player. */
export interface ScoreEntry {
  /** The system's own result. */
  met: boolean;
  override?: ScoreOverride;
}

export type ScoreState = Readonly<Record<string, ScoreEntry | undefined>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment a timed override lapses, or null if it runs until revoked. */
export function overrideEnds(override: ScoreOverride): Date | null {
  if (override.days === null) return null;
  return new Date(new Date(override.at).getTime() + override.days * DAY_MS);
}

export function overrideActive(override: ScoreOverride, now: Date): boolean {
  const ends = overrideEnds(override);
  return ends === null || now.getTime() < ends.getTime();
}

/** The override that is in force right now, if there is one. */
export function activeOverride(entry: ScoreEntry | undefined, now: Date): ScoreOverride | null {
  return entry?.override && overrideActive(entry.override, now) ? entry.override : null;
}

/**
 * The points a parameter contributes: the override's while one is in force,
 * otherwise the system's result. A lapsed override is simply not there.
 */
export function effectivePoints(
  parameter: ScoreParameter,
  entry: ScoreEntry | undefined,
  now: Date,
): number {
  const override = activeOverride(entry, now);
  if (override) return override.points;
  return entry?.met ? parameter.points : 0;
}

export function scoreTotal(state: ScoreState, now: Date): number {
  return SCORE_PARAMETERS.reduce((sum, parameter) => sum + effectivePoints(parameter, state[parameter.id], now), 0);
}
