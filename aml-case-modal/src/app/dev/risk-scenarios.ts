import {
  AmlDashboardStore,
  ArchivedCase,
  AuditEvent,
  DashboardSnapshot,
  EddCheckpoint,
  HIGH_RISK,
} from '../core/aml-dashboard-store';
import { ScoreEntry, ScoreOverride } from '../core/aml-risk';
import { CaseStore } from '../core/case-store';
import { Severity } from '../core/models';
import { applyScenario } from '../core/scenarios';
import { WorkspaceStore } from '../core/workspace-store';

/**
 * The AML dashboard's build states.
 *
 * A third group, beside the modal's and the table's, offered only while the
 * dashboard is on screen (?section=aml-risks) and kept in its own URL param
 * (?rstate=). The modal's states are about one case; these are about one
 * PLAYER - what they score, what has been overridden, whether a case exists.
 *
 * Each is a whole player rather than a patch on the last one, so any state
 * can be linked to directly and looks the same however it was reached.
 */
export interface RiskScenario {
  id: string;
  label: string;
  hint: string;
  /** The severity of the player's open case, or null for no case at all. */
  activeCase: Severity | null;
  /** Who holds the case's lock. The agent, unless a state says otherwise. */
  lock?: 'me' | 'other';
  /** A function: several states carry dates measured back from "now". */
  snapshot: () => DashboardSnapshot;
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0): string => new Date(Date.now() - days * DAY - hours * 3600_000).toISOString();

const met = (...ids: string[]): Record<string, ScoreEntry> =>
  Object.fromEntries(ids.map((id) => [id, { met: true }]));

let seq = 0;
const event = (daysAgo: number, what: string, who = 'System'): AuditEvent => ({
  id: `r${seq++}`,
  at: ago(daysAgo),
  what,
  who,
});

const checkpoints = (
  band: string,
  deposits: [threshold: string, position: string, actions: string | null],
  netLoss: [threshold: string, position: string, actions: string | null],
): EddCheckpoint[] => [
  {
    id: 'lifetime-deposits',
    measure: 'Lifetime deposits',
    label: `Global ${band} risk checkpoint`,
    threshold: deposits[0],
    position: deposits[1],
    actions: deposits[2],
  },
  {
    id: 'lifetime-net-loss',
    measure: 'Lifetime net loss',
    label: `Global ${band} risk checkpoint`,
    threshold: netLoss[0],
    position: netLoss[1],
    actions: netLoss[2],
  },
];

const override = (
  points: number,
  days: number | null,
  madeDaysAgo: number,
  by: string,
  reason: string,
): ScoreOverride => ({ points, days, by, reason, at: ago(madeDaysAgo) });

export const RISK_SCENARIOS: readonly RiskScenario[] = [
  {
    id: 'R-01',
    label: 'R-01 - Low risk, no case',
    hint: '35 points. Nothing has ever opened a case, so there is no AML widget, the archive is empty, and Create AML case is offered in the risk card.',
    activeCase: null,
    snapshot: () => ({
      entries: met('age-under-25', 'roulette'),
      log: [
        event(6, 'Roulette met: +10 points, total 35'),
        event(41, 'Player age under 25 met: +25 points, total 25'),
      ],
      archive: [],
      checkpoints: checkpoints(
        'low',
        ['£37,500 lifetime deposits', 'Player is at £4,120 (11%)', 'Open an EDD case and request source of funds'],
        ['No next threshold for lifetime net loss', 'Player is at £310 (100%)', null],
      ),
    }),
  },
  {
    id: 'R-02',
    label: 'R-02 - Medium risk, 10 points from High',
    hint: '115 points with an AML case open. Override any 10-point field (Roulette, Blackjack, Crash games) to 10 and the rating crosses into High in front of you.',
    activeCase: 'AML',
    snapshot: () => ({
      entries: met('linked-household', 'par-link', 'high-deposit', 'stacking'),
      log: [
        event(2, 'AML case #AML-1042 created'),
        event(2, 'Risk rating changed from Low risk to Medium risk'),
        event(2, 'PAR link met: +50 points, total 115'),
        event(9, 'Stacking deposits met: +20 points, total 65'),
        event(16, 'High single deposit: £2,000 met: +20 points, total 45'),
        event(70, 'Linked account (household link) met: +25 points, total 25'),
      ],
      archive: [],
      checkpoints: checkpoints(
        'medium',
        ['£30,000 lifetime deposits', 'Player is at £21,900 (73%)', 'Open an EDD case and request source of funds'],
        ['£10,000 lifetime net loss', 'Player is at £6,480 (65%)', 'Open an EDD case and request source of funds'],
      ),
    }),
  },
  {
    id: 'R-03',
    label: 'R-03 - High risk, one override',
    hint: 'The master frame: 200 points, an EDD case open, one field overridden until revoked, three closed cases.',
    activeCase: 'EDD',
    snapshot: () => HIGH_RISK,
  },
  {
    id: 'R-04',
    label: 'R-04 - Critical, sixteen fields scoring',
    hint: '1,105 points on a sanctions match. Sixteen fields score, so the risk card lists five and counts the rest. Nothing is promised above Critical.',
    activeCase: 'AML',
    snapshot: () => ({
      entries: met(
        'sanctioned', 'international-pep', 'linked-similar', 'par-link', 'occupation', 'ip-black-list',
        'high-deposit', 'high-deposit-3x', 'withdraw-no-bet', 'withdraw-no-bet-3x', 'stacking', 'stacking-3x',
        'multi-payment', 'not-staked', 'crash-games', 'roulette',
      ),
      log: [
        event(0, 'AML case #AML-1042 created'),
        event(0, 'Risk rating changed from High risk to Critical'),
        event(0, 'Sanctioned individual met: +500 points, total 1105'),
        event(3, 'International PEP met: +125 points, total 605'),
        event(3, 'Stacking deposits, 3 times in 7 days met: +50 points, total 480'),
        event(4, 'Withdrawing without betting, 3 times in 7 days met: +50 points, total 430'),
        event(5, 'High single deposit: £2,000, 3 times in 7 days met: +50 points, total 380'),
        event(8, 'IP address from a black list country met: +50 points, total 330'),
        event(30, 'AML case #AML-0931 resolved', 'Daniel Reyes'),
        event(44, 'AML case #AML-0931 created'),
        event(44, 'Risk rating changed from Medium risk to High risk'),
      ],
      archive: [
        { id: 'AML-0931', opened: ago(44), closed: ago(30), trigger: 'Risk rating: Medium to High', severity: 'EDD' },
        { id: 'AML-0702', opened: ago(160), closed: ago(151), trigger: 'Risk rating: Low to Medium', severity: 'AML' },
      ],
      checkpoints: checkpoints(
        'critical',
        ['£10,000 lifetime deposits', 'Player is at £9,640 (96%)', 'Escalate to Compliance and suspend deposits'],
        ['£2,500 lifetime net loss', 'Player is at £2,460 (98%)', 'Escalate to Compliance'],
      ),
    }),
  },
  {
    id: 'R-05',
    label: 'R-05 - Overrides in every form',
    hint: 'Four overrides: up and down, timed and until revoked, one ending in 3 days, one with a reason long enough to wrap. A fifth ended 4 days ago, and its row says so. Requirement 5.3.5: overridden, and for how long.',
    activeCase: 'EDD',
    snapshot: () => ({
      entries: {
        ...met('linked-similar', 'par-link'),
        // Ran out four days ago: seven days, made eleven days back. The
        // field is met, so it is scoring its 20 again.
        stacking: {
          met: true,
          override: override(0, 7, 11, 'Daniel Reyes', 'Deposits were split by the bank, not by the customer.'),
        },
        occupation: {
          met: false,
          override: override(50, null, 6, 'Amara Okafor', 'Customer confirmed on a call that they are paid in cash at a casino.'),
        },
        roulette: {
          met: true,
          override: override(0, 90, 12, 'Daniel Reyes', 'One low-stake session. The customer plays lottery only.'),
        },
        'high-deposit': {
          met: true,
          override: override(
            0,
            30,
            27,
            'Priya Raman-Castellanos',
            'Deposit was the proceeds of a house sale, evidenced by a completion statement from the solicitor and a matching bank statement. Source of funds is verified for this single deposit only; any further deposit at this level must be assessed again on its own evidence.',
          ),
        },
        'domestic-pep': {
          met: false,
          override: override(75, 14, 0, 'Liz Fernandez', 'Customer disclosed a seat on the county council.'),
        },
      },
      log: [
        event(0, 'Domestic PEP overridden to 75 points, for 14 days: total 245', 'Liz Fernandez'),
        event(4, 'Stacking deposits override ended: back to 20 points, total 170'),
        event(6, 'Occupation associated with risk overridden to 50 points, until revoked: total 150', 'Amara Okafor'),
        event(11, 'Stacking deposits overridden to 0 points, for 7 days: total 100', 'Daniel Reyes'),
        event(12, 'Roulette overridden to 0 points, for 90 days: total 120', 'Daniel Reyes'),
        event(27, 'High single deposit: £2,000 overridden to 0 points, for 30 days: total 130', 'Priya Raman-Castellanos'),
        event(28, 'AML case #AML-1042 created'),
        event(28, 'Risk rating changed from Medium risk to High risk'),
      ],
      archive: HIGH_RISK.archive,
      checkpoints: HIGH_RISK.checkpoints,
    }),
  },
  {
    id: 'R-06',
    label: 'R-06 - New player, nothing yet',
    hint: 'Zero points and no history: every empty state at once. The risk card, the latest events, the archive and the audit log each say what will appear there.',
    activeCase: null,
    snapshot: () => ({
      entries: {},
      log: [],
      archive: [],
      checkpoints: checkpoints(
        'low',
        ['£37,500 lifetime deposits', 'Player is at £0 (0%)', 'Open an EDD case and request source of funds'],
        ['No next threshold for lifetime net loss', 'Player is at £0 (100%)', null],
      ),
    }),
  },
  {
    id: 'R-07',
    label: 'R-07 - Long history',
    hint: 'Sixty-four audit events and twelve closed cases on the High risk player: the audit log pages ten at a time, and the archive runs past one screen.',
    activeCase: 'EDD',
    snapshot: () => {
      const fields = ['Roulette', 'Blackjack', 'Crash games used', 'Stacking deposits', 'High single deposit: £2,000', 'Withdrawing without betting'];
      const older: AuditEvent[] = Array.from({ length: 54 }, (_, i) => {
        const field = fields[i % fields.length];
        return i % 2
          ? event(40 + i * 9, `${field} met: +${i % 3 ? 20 : 10} points`)
          : event(40 + i * 9, `${field} exit criteria reached: points removed`);
      });
      const triggers = ['Risk rating: Low to Medium', 'Risk rating: Medium to High', 'Deposit checkpoint crossed: £2,500', 'Manual: created by an agent'];
      const archive: ArchivedCase[] = Array.from({ length: 12 }, (_, i) => ({
        id: `AML-0${880 - i * 43}`,
        opened: ago(100 + i * 47),
        closed: ago(100 + i * 47 - 6 - (i % 4) * 3),
        trigger: triggers[i % triggers.length],
        severity: (['AML', 'EDD', 'AML', 'COMPLIANCE'] as const)[i % 4],
      }));
      return { ...HIGH_RISK, log: [...HIGH_RISK.log, ...older], archive };
    },
  },
  {
    id: 'R-08',
    label: 'R-08 - Case locked to another agent',
    hint: 'The High risk player, with the case in someone else\u2019s hands. The risk card names who holds it; the case number still opens the case, read-only, with the panel\u2019s own lock band.',
    activeCase: 'EDD',
    lock: 'other',
    snapshot: () => HIGH_RISK,
  },
];

export const DEFAULT_RISK_SCENARIO = 'R-03';

export function applyRiskScenario(
  dashboard: AmlDashboardStore,
  store: CaseStore,
  ws: WorkspaceStore,
  id: string | null,
): string {
  const scenario =
    RISK_SCENARIOS.find((s) => s.id === id) ??
    RISK_SCENARIOS.find((s) => s.id === DEFAULT_RISK_SCENARIO)!;

  if (scenario.activeCase) {
    // The case locked to you with nothing recorded: the plainest open case.
    // Its panel is left closed - the dashboard is the page being looked at -
    // so the widget is on the row with Open case on it.
    applyScenario(store, ws, '01');
    store.seed({ severity: scenario.activeCase });
    if (scenario.lock === 'other') {
      store.seed({ lockState: 'locked-to-other', lockOwner: store.otherAgent(), lockedSince: ago(0, 3) });
    }
    ws.seed({ aml: { open: false } });
  } else {
    // No case at all, which is not the same as a resolved one: the AML
    // widget is absent, not showing a closed case.
    store.reset();
    ws.reset();
  }
  dashboard.seed(scenario.snapshot());
  return scenario.id;
}
