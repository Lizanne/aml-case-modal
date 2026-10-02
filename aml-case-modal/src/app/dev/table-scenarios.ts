import { CasesStore } from '../core/cases-store';
import { CasesTab, NavStore } from '../core/nav-store';

/**
 * The table's build states, PROTOTYPE-TABLE.md §8. The ids keep their
 * numbers where states were retired (D-13, D-17), so a frame keeps its name.
 *
 * A SEPARATE group from the modal's fourteen. They are only offered while
 * `?view=cases` is active and never appear on the modal view, and the modal's
 * own ids, order and labels are untouched by anything here.
 *
 * Several of these depend on work that has not landed yet - the popovers, the
 * lock flow, the animations. Those scenarios still set up everything that DOES
 * exist, and say in their hint what is still missing, so the switcher never
 * offers a state that silently does nothing.
 */
export interface TableScenario {
  id: string;
  label: string;
  hint: string;
  apply: (cases: CasesStore, nav: NavStore) => void;
}

/** Back to the seeded collection, then whatever the scenario wants on top. */
function reseed(cases: CasesStore, tab: CasesTab, nav: NavStore): void {
  cases.reseed();
  cases.sort.set('priority');
  nav.showCases(tab);
}

export const TABLE_SCENARIOS: readonly TableScenario[] = [
  {
    id: 'T-00',
    label: 'T-00 - Empty',
    hint: 'Nothing open in either queue: "No open AML cases" here, "No open Compliance AML cases" on the other tab. No link.',
    // Not a reseed with a filter: an empty collection is its own state, and
    // both tabs have to show it - so, unlike every other frame, this one does
    // not pick a tab. Whichever queue you are on shows its own sentence.
    apply: (c) => {
      c.reseed();
      c.sort.set('priority');
      c.cases.set([]);
    },
  },
  {
    id: 'T-01',
    label: 'T-01 - Active queue, seeded',
    hint: 'The master frame: every severity, band, SLA band and lock state in one view.',
    apply: (c, n) => reseed(c, 'active', n),
  },
  {
    id: 'T-02',
    label: 'T-02 - Compliance queue, seeded',
    hint: 'Compliance severity only. Same columns, same rules.',
    apply: (c, n) => reseed(c, 'compliance', n),
  },
  {
    id: 'T-00a',
    label: 'T-00a - Active empty',
    hint: 'Every Active case resolved, so the queue empties. Rule 3 in one step.',
    apply: (c, n) => {
      reseed(c, 'active', n);
      c.activeCases().forEach((row) => c.resolve(row.id));
    },
  },
  {
    id: 'T-00b',
    label: 'T-00b - Compliance empty',
    hint: 'Same, for the Compliance queue.',
    apply: (c, n) => {
      reseed(c, 'compliance', n);
      c.complianceCases().forEach((row) => c.resolve(row.id));
    },
  },
  {
    id: 'T-03',
    label: 'T-03 - Row locked to me',
    hint: 'Top Active row locked to you: green padlock unlocks, Open case in Actions.',
    apply: (c, n) => {
      reseed(c, 'active', n);
      const top = c.activeCases()[0];
      if (top) c.lock(top.id);
    },
  },
  {
    id: 'T-04',
    label: 'T-04 - Row locked to another agent',
    hint: 'Top Active row held by M. Torres. The padlock opens the force-unlock confirm.',
    apply: (c, n) => {
      reseed(c, 'active', n);
      const top = c.activeCases()[0];
      if (top) c.lockToOther(top.id);
    },
  },
  {
    id: 'T-08',
    label: 'T-08 - Case escalates to Compliance',
    hint: 'Top Active case escalated: it leaves Active and joins Compliance, counts tick. The 300ms cross-fade is step 6.',
    apply: (c, n) => {
      reseed(c, 'active', n);
      const top = c.activeCases()[0];
      if (top) c.setSeverity(top.id, 'COMPLIANCE');
    },
  },
  {
    id: 'T-09',
    label: 'T-09 - Case resolved',
    hint: 'Top Active case resolved: it leaves both tabs and both counts. The fade is step 6.',
    apply: (c, n) => {
      reseed(c, 'active', n);
      const top = c.activeCases()[0];
      if (top) c.resolve(top.id);
    },
  },
  {
    id: 'T-10',
    label: 'T-10 - Sorted by SLA',
    hint: 'Sort switched to SLA elapsed, longest first. Priority order no longer leads.',
    apply: (c, n) => {
      reseed(c, 'active', n);
      c.sort.set('sla');
    },
  },
];

export const DEFAULT_TABLE_SCENARIO = 'T-01';

export function applyTableScenario(
  cases: CasesStore,
  nav: NavStore,
  id: string | null,
): string {
  const scenario =
    TABLE_SCENARIOS.find((s) => s.id === id) ??
    TABLE_SCENARIOS.find((s) => s.id === DEFAULT_TABLE_SCENARIO)!;
  scenario.apply(cases, nav);
  return scenario.id;
}
