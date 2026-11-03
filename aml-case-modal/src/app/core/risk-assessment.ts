/**
 * The Risk assessment section: grouped player information, each field with
 * the risk the system (or the agent) has put on it.
 *
 * Source: "Aml Case Report snapshot example - Final Risk Assesment section"
 * (PDF). Sections, labels, mock values, definitions and the "risk if" logic
 * are taken from it; labels are in sentence case to match the rest of the
 * product.
 *
 * Two generations of values. GENERATION 0 is what the case opens with. A new
 * trigger arriving queues GENERATION 1, and the next resync swaps it in. The
 * prototype has no backend to regenerate from, so the second generation is
 * authored to exercise every resync rule at once:
 *
 *   - value changed, risk unchanged (Pending withdrawals, VPN usage,
 *     Active payment methods): the value is replaced, nothing else happens
 *   - value AND risk changed (Latest fraud scores, Deposit spike): the field
 *     goes back to Action required and becomes a required assessment
 *   - nothing changed (everything else): left alone
 */

/** What a field's risk can be. Informational fields carry no risk at all. */
export type RiskStatus = 'informational' | 'risk' | 'no-risk' | 'action-required';

/** The two answers an agent can give. */
export type RiskAnswer = 'risk' | 'no-risk';

export const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  informational: 'Informational',
  risk: 'Risk flagged',
  'no-risk': 'No risk',
  'action-required': 'Action required',
};

export interface RiskFieldDef {
  id: string;
  section: string;
  label: string;
  /** Account information. Shown, never assessed, never in the finalise table. */
  informational?: boolean;
  /**
   * The system cannot judge these: their risk is always the agent's call, so
   * they open as Action required and are required assessments on every case.
   */
  manual?: boolean;
  /** What the field is. First half of the tooltip. */
  definition: string;
  /** When it counts as a risk. Second half of the tooltip. */
  riskIf: string | null;
}

/** One generation's reading of a field. */
export interface RiskReading {
  value: string[];
  /** What the system concluded. Null for informational and manual fields. */
  systemRisk: RiskAnswer | null;
}

export const RISK_SECTIONS = [
  'Account information',
  'Verification risks',
  'Login & geography risks',
  'Payment methods',
  'Deposit & transaction behaviour',
  'Product & gameplay analysis',
  'Open source intelligence',
] as const;

export const RISK_FIELDS: readonly RiskFieldDef[] = [
  // ---- Account information: informational only
  {
    id: 'pending-withdrawals',
    section: 'Account information',
    label: 'Pending withdrawals',
    informational: true,
    definition:
      'All concurrent pending withdrawals, the total requested and when each was requested.',
    riskIf: null,
  },
  {
    id: 'aml-risk-rating-history',
    section: 'Account information',
    label: 'AML risk rating history',
    informational: true,
    definition: 'The last three AML risk ratings in the order they were set, current rating last.',
    riskIf: null,
  },
  {
    id: 'global-affordability',
    section: 'Account information',
    label: 'Global affordability',
    informational: true,
    definition: 'Whether global affordability is on, and the monthly net loss threshold assigned.',
    riskIf: null,
  },
  {
    id: 'max-limits',
    section: 'Account information',
    label: 'Max limits',
    informational: true,
    definition: 'Active maximum net loss and maximum deposit limits.',
    riskIf: null,
  },
  {
    id: 'registration-date',
    section: 'Account information',
    label: 'Registration date',
    informational: true,
    definition: 'When the account was created. Establishes tenure for profiling the player.',
    riskIf: null,
  },
  {
    id: 'personal-detail-changes',
    section: 'Account information',
    label: 'Personal detail changes',
    informational: true,
    definition:
      'Changes to full name, address, phone, email or date of birth since registration.',
    riskIf: null,
  },

  // ---- Verification risks
  {
    id: 'employment-occupation',
    section: 'Verification risks',
    label: 'Employment & occupation',
    definition: 'Declared employment status and occupation.',
    riskIf: 'The occupation is on the list of high-risk occupations.',
  },
  {
    id: 'latest-fraud-scores',
    section: 'Verification risks',
    label: 'Latest fraud scores',
    definition: 'Fraud scores returned by SEON over the last year.',
    riskIf: 'Any SEON score is above 100.',
  },
  {
    id: 'verification-result',
    section: 'Verification risks',
    label: 'Verification result',
    definition:
      'Latest electronic identity verification (eIDV) result from GBG. Pass (2+2) means two name and two address matches.',
    riskIf: 'The result is anything other than Pass (2+2).',
  },
  {
    id: 'document-requests',
    section: 'Verification risks',
    label: 'Document requests',
    manual: true,
    definition: 'Every document request assigned to the player.',
    riskIf: 'Set by the agent. Always needs a manual assessment.',
  },
  {
    id: 'linked-accounts',
    section: 'Verification risks',
    label: 'Linked accounts',
    definition: 'Every account linked to this player.',
    riskIf: 'At least one linked account exists.',
  },

  // ---- Login & geography
  {
    id: 'vpn-usage',
    section: 'Login & geography risks',
    label: 'VPN usage',
    definition: 'Whether the player has ever used a VPN, from SEON. No SEON request means no.',
    riskIf: 'Yes.',
  },
  {
    id: 'high-risk-country-login',
    section: 'Login & geography risks',
    label: 'High-risk country login',
    definition: 'Whether the player has ever logged in from a high-risk country. Checked daily.',
    riskIf: 'Yes.',
  },

  // ---- Payment methods
  {
    id: 'active-payment-methods',
    section: 'Payment methods',
    label: 'Active payment methods',
    definition: 'How many payment methods are currently active.',
    riskIf: 'Five or more active cards.',
  },
  {
    id: 'name-mismatch',
    section: 'Payment methods',
    label: 'Name mismatch',
    definition:
      "Every active payment method's cardholder name, checked against the account holder's registered name.",
    riskIf: 'At least one mismatch.',
  },

  // ---- Deposit & transaction behaviour
  {
    id: 'stacking-deposits',
    section: 'Deposit & transaction behaviour',
    label: 'Stacking deposits without betting',
    definition: 'Three or more deposits with no gameplay or staking between them. Last 30 days.',
    riskIf: 'At least one occurrence.',
  },
  {
    id: 'multi-method-deposits',
    section: 'Deposit & transaction behaviour',
    label: 'Multi-method deposits',
    definition:
      'Three or more different payment instruments used to deposit within a rolling 6-hour window. Last 30 days.',
    riskIf: 'At least one occurrence.',
  },
  {
    id: 'withdrawing-without-betting',
    section: 'Deposit & transaction behaviour',
    label: 'Withdrawing without betting',
    definition:
      'Withdrawals that mirror recent deposits without matching gaming turnover. Last 30 days.',
    riskIf: 'At least one occurrence.',
  },
  {
    id: 'stakes-to-deposit-ratio',
    section: 'Deposit & transaction behaviour',
    label: 'Stakes-to-deposit ratio',
    definition: 'Total stakes placed divided by total deposits made. Last 30 days.',
    riskIf: 'The ratio is 1.00 or lower.',
  },
  {
    id: 'deposit-spike',
    section: 'Deposit & transaction behaviour',
    label: 'Deposit spike',
    definition: 'Alerts raised by the SG system when deposits surge sharply. Last 30 days.',
    riskIf: 'At least one alert.',
  },

  // ---- Product & gameplay
  {
    id: 'roulette-max-stake',
    section: 'Product & gameplay analysis',
    label: 'Roulette max stake',
    definition: 'The highest roulette stake placed in the last 30 days.',
    riskIf: 'Any single stake of £250 or more.',
  },
  {
    id: 'roulette-no-financial-risk',
    section: 'Product & gameplay analysis',
    label: 'Roulette no financial risk stakes',
    definition:
      'Hedged roulette play, such as red and black together, where winnings are within £1 of the stake across rounds. Last 30 days.',
    riskIf: 'At least 5 occurrences.',
  },
  {
    id: 'product-mix-shift',
    section: 'Product & gameplay analysis',
    label: 'Product mix shift (30d)',
    definition:
      'Share of stakes by product (slots, roulette, other) over the prior 30 days against the last 30 days.',
    riskIf:
      'Prior slots 70% or more and recent roulette 50% or more. Or roulette up 40 points or more while slots fell 30 points or more.',
  },

  // ---- Open source intelligence
  {
    id: 'open-source-searches',
    section: 'Open source intelligence',
    label: 'Open source searches',
    manual: true,
    definition: 'Open source information found on the player.',
    riskIf: 'Set by the agent. Always needs a manual assessment.',
  },
];

const r = (value: string[], systemRisk: RiskAnswer | null): RiskReading => ({ value, systemRisk });

/** What the case opens with. Values from the PDF's mock column. */
export const GENERATION_0: Readonly<Record<string, RiskReading>> = {
  'pending-withdrawals': r(
    [
      '£400.04 total, 2 pending requests',
      '£399.04 · requested 01 May 2026, 13:00',
      '£0.96 · requested 01 May 2026, 13:00',
    ],
    null,
  ),
  'aml-risk-rating-history': r(
    [
      'Medium · 01 May 2026, 13:00',
      'High · 01 May 2026, 13:00',
      'Medium · 01 May 2026, 13:00',
    ],
    null,
  ),
  'global-affordability': r(['On · base monthly threshold £3,600.00'], null),
  'max-limits': r(['Monthly net loss £300.00', 'Weekly deposits £300.00'], null),
  'registration-date': r(['21 Jun 2024'], null),
  'personal-detail-changes': r(
    ['Address updated · 20 Sep 2025', 'Mobile updated · 14 Nov 2025'],
    null,
  ),
  'employment-occupation': r(['Employed · Bar staff'], 'no-risk'),
  'latest-fraud-scores': r(['21 · 01 May 2026, 13:00', '44 · 04 May 2026, 13:00'], 'no-risk'),
  'verification-result': r(['Pass (2+2)'], 'no-risk'),
  'document-requests': r(
    ['#10482 · Affordability · Approved', '#11953 · Proof of address · Waiting for review'],
    null,
  ),
  'linked-accounts': r(
    ['2 linked accounts', 'PID 90214 · Active · John Doe', 'PID 90455 · Suspended · Jane Doe'],
    'risk',
  ),
  'vpn-usage': r(['Yes · last detected 14 Nov 2025, 13 Nov 2025, 13 Nov 2025'], 'risk'),
  'high-risk-country-login': r(
    [
      'Yes, last 3 detections',
      '14 Nov 2025 · Papua New Guinea',
      '13 Nov 2025 · Bulgaria',
      '13 Nov 2025 · Papua New Guinea',
    ],
    'risk',
  ),
  'active-payment-methods': r(['3 active cards'], 'no-risk'),
  'name-mismatch': r(["#32232 · card name mismatch · 'Nikola Fail'"], 'risk'),
  'stacking-deposits': r(
    ['01 May 2026 · 4 deposits in 24h', '04 May 2026 · 3 deposits in 6h'],
    'risk',
  ),
  'multi-method-deposits': r(['01 May 2026 · 3 methods'], 'risk'),
  'withdrawing-without-betting': r(
    [
      '01 May 2026 · deposit £432 → withdrawal £432',
      '02 May 2026 · deposit £433 → withdrawal £433',
    ],
    'risk',
  ),
  'stakes-to-deposit-ratio': r(['0.32'], 'risk'),
  'deposit-spike': r(['0'], 'no-risk'),
  'roulette-max-stake': r(['£25 · 12 Dec 2025, 12:12, and 23 more'], 'no-risk'),
  'roulette-no-financial-risk': r(
    [
      '£25 → £25 · 12 Dec 2025, 12:12',
      '£21 → £25 · 13 Dec 2025, 12:12',
      '£25 → £25 · 13 Dec 2025, 12:12',
      '£22 → £25 · 13 Dec 2025, 12:22',
      '£25 → £25 · 15 Dec 2025, 11:12',
      'and 32 more',
    ],
    'risk',
  ),
  'product-mix-shift': r(['Slots 90% → 45%', 'Roulette 0% → 50%', 'Other 10% → 5%'], 'risk'),
  'open-source-searches': r(['No searches recorded'], null),
};

/** What the next resync finds, once a new trigger has queued it. */
export const GENERATION_1: Readonly<Record<string, RiskReading>> = {
  ...GENERATION_0,
  'pending-withdrawals': r(
    [
      '£1,250.04 total, 3 pending requests',
      '£850.00 · requested 05 May 2026, 08:40',
      '£399.04 · requested 01 May 2026, 13:00',
      '£0.96 · requested 01 May 2026, 13:00',
    ],
    null,
  ),
  'latest-fraud-scores': r(
    ['21 · 01 May 2026, 13:00', '44 · 04 May 2026, 13:00', '112 · 05 May 2026, 08:40'],
    'risk',
  ),
  'vpn-usage': r(['Yes · last detected 05 May 2026, 14 Nov 2025, 13 Nov 2025'], 'risk'),
  'active-payment-methods': r(['4 active cards'], 'no-risk'),
  'deposit-spike': r(['1'], 'risk'),
};

export const GENERATIONS: readonly Readonly<Record<string, RiskReading>>[] = [
  GENERATION_0,
  GENERATION_1,
];

export function riskFieldDef(id: string): RiskFieldDef | undefined {
  return RISK_FIELDS.find((f) => f.id === id);
}

/** Same lines in the same order. */
export function sameValue(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/** "A", "A and B", "A, B and C". */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** The tooltip: what the field is, then when it is a risk. */
export function riskTooltip(def: RiskFieldDef): string {
  return def.riskIf ? `${def.definition}\n\nRisk if: ${def.riskIf}` : def.definition;
}
