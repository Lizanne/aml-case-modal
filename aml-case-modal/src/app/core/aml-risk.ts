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
  /** The (i) explanation. Placeholder copy until compliance supplies it. */
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
  p('linked-household', 'Profile', 'Linked account (household link)', 25, null, 'Another account shares this household: the same address or surname at the address.'),
  p('linked-similar', 'Profile', 'Linked account (similar details)', 50, null, 'Another account has closely matching personal details.'),
  p('domestic-pep', 'Profile', 'Domestic PEP', 75, null, 'Screening matched the player to a UK politically exposed person.'),
  p('international-pep', 'Profile', 'International PEP', 125, null, 'Screening matched the player to a politically exposed person outside the UK.'),
  p('sanctioned', 'Profile', 'Sanctioned individual', 500, null, 'Screening matched the player to a sanctions list.'),
  p('occupation', 'Profile', 'Occupation associated with risk', 50, null, 'The declared occupation is on the higher-risk occupation list.'),
  p('age-under-25', 'Profile', 'Player age under 25', 25, null, 'The player is under 25.'),
  p('age-75-plus', 'Profile', 'Player age 75+', 25, null, 'The player is 75 or older.'),
  p('par-link', 'Payments', 'PAR link', 50, null, 'A payment instrument on this account is also used on another account.'),
  p('ip-black-list', 'Jurisdiction', 'IP address from a black list country', 50, 90, 'The player logged in from a country on the black list.'),
  p('ip-grey-list', 'Jurisdiction', 'IP address from a grey list country', 25, 30, 'The player logged in from a country on the grey list.'),
  p('high-deposit', 'Affordability', 'High single deposit: £2,000', 20, 30, 'A single deposit of £2,000 or more.'),
  p('high-deposit-3x', 'Affordability', 'High single deposit: £2,000, 3 times in 7 days', 50, 90, 'Three single deposits of £2,000 or more inside any 7 day period.'),
  p('crash-games', 'Product risk', 'Crash games used', 10, 90, 'The player has played a crash game.'),
  p('roulette', 'Product risk', 'Roulette', 10, 90, 'The player has played roulette.'),
  p('blackjack', 'Product risk', 'Blackjack', 10, 90, 'The player has played blackjack.'),
  p('withdraw-no-bet', 'Activity / Behaviour', 'Withdrawing without betting', 20, 30, 'A withdrawal was requested with no bets placed since the deposit.'),
  p('withdraw-no-bet-3x', 'Activity / Behaviour', 'Withdrawing without betting, 3 times in 7 days', 50, 90, 'Three withdrawals without betting inside any 7 day period.'),
  p('stacking', 'Activity / Behaviour', 'Stacking deposits', 20, 30, 'Several deposits made in quick succession.'),
  p('stacking-3x', 'Activity / Behaviour', 'Stacking deposits, 3 times in 7 days', 50, 90, 'Deposit stacking seen three times inside any 7 day period.'),
  p('multi-payment', 'Activity / Behaviour', 'Multiple payment types in one session', 25, 30, 'More than one payment type was used to deposit in the same session.'),
  // UNCONFIRMED: the name is cut off in the ticket's screenshot. "3 times in 7
  // days" follows the pattern of the other pairs; check against the Excel.
  p('multi-payment-3x', 'Activity / Behaviour', 'Multiple payment types in one session, 3 times in 7 days', 50, 90, 'Multiple payment types in one session, seen three times inside any 7 day period.'),
  p('not-staked', 'Activity / Behaviour', 'Deposits not staked through in full', 25, 30, 'Deposited funds were withdrawn without being staked through in full.'),
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
