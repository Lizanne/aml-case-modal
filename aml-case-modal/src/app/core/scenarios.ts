import { CaseStore, sampleUrlFor } from './case-store';
import { Attachment, Draft } from './models';
import { WorkspaceStore } from './workspace-store';

/**
 * Dev-only scenario table. Each entry rebuilds the base case and then seeds the
 * exact state of one Figma frame, so all 13 states are reachable for review.
 *
 * These bypass the command guards deliberately - they are a review harness,
 * not a user path. Everything a real agent can do still goes through CaseStore.
 */
export interface Scenario {
  id: string;
  /** Figma frame label, shown in the switcher. */
  label: string;
  /** One-line reminder of what the frame is meant to prove. */
  hint: string;
  apply: (store: CaseStore, ws: WorkspaceStore) => void;
}

function attachment(name: string, kind: 'pdf' | 'image', sizeKb: number): Attachment {
  // Resolved by name, through the same function mapAttachment and addFiles
  // use - a seeded chip and a fixture chip of the same filename must open the
  // same document, or the dev harness would be demonstrating something the
  // app does not do.
  return {
    id: `seed-${name}`,
    name,
    kind,
    sizeKb,
    url: sampleUrlFor(name, kind),
  };
}

/** Locked to me, mid-morning, matching the fixture's lock timestamp. */
function lockedToMe(store: CaseStore) {
  return {
    lockState: 'locked-to-me' as const,
    lockOwner: store.me(),
    lockedSince: '2026-08-11T10:31:00Z',
  };
}

function draft(partial: Partial<Draft> & Pick<Draft, 'actionType' | 'title'>): Draft {
  return {
    note: '',
    attachments: [],
    errors: [],
    lockAfter: null,
    attempted: false,
    fromPlaceholder: true,
    ...partial,
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: '00a',
    label: '00a - Unlocked',
    hint: 'Nobody holds the case. Read-only: Record buttons and Add action are disabled.',
    apply: (s) => {
      s.seed({ lockState: 'unlocked', lockOwner: null, lockedSince: null });
    },
  },
  {
    id: '00b',
    label: '00b - Locked to another agent + force-unlock confirm',
    hint: 'Rule 3: breaking someone else’s lock needs the confirm dialog.',
    apply: (s) => {
      s.seed({
        lockState: 'locked-to-other',
        lockOwner: s.otherAgent(),
        lockedSince: '2026-08-11T09:58:00Z',
        openDialog: 'confirm-unlock',
      });
    },
  },
  {
    id: '01',
    label: '01 - Locked to you, nothing recorded',
    hint: 'Two pending chips, two placeholders, Submit decision disabled.',
    apply: (s) => {
      s.seed(lockedToMe(s));
    },
  },
  {
    id: '02',
    label: '02 - Recording, with attachment errors',
    hint: 'Rule 5: invalid files error inline and never clear the valid ones.',
    apply: (s) => {
      s.seed({
        ...lockedToMe(s),
        draft: draft({
          actionType: 'open-source-searches',
          title: 'Open source searches',
          note: 'Adverse media check complete. Two hits reviewed, both false positives relating to a namesake.',
          attachments: [
            attachment('adverse-media-results.pdf', 'pdf', 2150),
            attachment('sanctions-screen.png', 'image', 480),
          ],
          errors: s.fixtureAttachmentErrors(),
        }),
      });
    },
  },
  {
    id: '02b',
    label: '02b - Recording clean, reverse order',
    hint: 'Rule 4: Contact player recorded first. Order does not matter.',
    apply: (s) => {
      s.seed({
        ...lockedToMe(s),
        draft: draft({
          actionType: 'player-contact',
          title: 'Player contact',
          note: 'Called player on verified number. Confirmed source of funds as property sale, documentation promised within 5 days.',
          attachments: [attachment('call-log-2026-08-11.pdf', 'pdf', 1200)],
          lockAfter: 'keep',
        }),
      });
    },
  },
  {
    id: '03',
    label: '03 - Both required actions recorded',
    hint: 'Rule 4 satisfied, so rule 9 unlocks Submit decision. Severity escalated to AML.',
    apply: (s) => {
      const stream = s.fixtureStream('required');
      s.seed({
        ...lockedToMe(s),
        lockedSince: '2026-08-11T11:05:00Z',
        // Derived by replaying the stream, so it follows the ranking rather
        // than restating whichever severity happens to be "the escalated one".
        severity: s.severityAfter(stream),
        stream,
        timeline: s.fixtureTimeline().slice(0, 8),
      });
    },
  },
  {
    id: '04',
    label: '04 - Viewing a historical snapshot',
    hint: 'Left panel shows the snapshot captured by an outcome, with a way back.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '03')!.apply(s, ws);
      const first = s.outcomes()[0];
      s.seed({
        viewedSnapshot: { outcomeId: first.id, title: first.title, at: first.snapshotAt },
        infoTab: 'snapshot',
      });
    },
  },
  {
    id: '05',
    label: '05 - Adjust severity dialog',
    hint: 'Rule 8: always enabled, states escalation vs de-escalation, warns the lock lifts.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '03')!.apply(s, ws);
      s.seed({ openDialog: 'severity' });
    },
  },
  {
    id: '06',
    label: '06 - Submit decision dialog',
    hint: 'Rule 9: only reachable because both required actions exist.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '03')!.apply(s, ws);
      s.seed({ openDialog: 'decision' });
    },
  },
  {
    id: '07',
    label: '07 - Resolved',
    hint: 'Rule 10: read-only, tabs reduced, no footer, no snapshot selected.',
    apply: (s) => {
      const stream = s.fixtureStream('all');
      s.seed({
        status: 'RESOLVED',
        severity: s.severityAfter(stream),
        lockState: 'unlocked',
        lockOwner: null,
        lockedSince: null,
        stream,
        timeline: s.fixtureTimeline(),
        viewedSnapshot: null,
        infoTab: 'snapshot',
      });
    },
  },
  {
    id: '08',
    label: '08 - Add action menu open',
    hint: 'Rule 7: three uncapped extra actions, none of which re-gate Submit.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '03')!.apply(s, ws);
      s.seed({ addMenuOpen: true });
    },
  },
  {
    id: '09',
    label: '09 - Dual modals: SG alert + AML case',
    hint: 'Two modals share the width. The AML modal drops to a segmented, compact layout.',
    apply: (s, ws) => {
      // Frame 09 is the state one required action in, not both: the outcome
      // card and the outstanding placeholder are what prove the compact layout.
      s.seed({
        ...lockedToMe(s),
        stream: s.fixtureStream('first'),
        timeline: s.fixtureTimeline().slice(0, 4),
      });
      // Both modals open. The narrow layout is a consequence of the width each
      // one gets, not something set here.
      ws.seed({ sg: { open: true }, aml: { open: true } });
    },
  },
  {
    id: '10',
    label: '10 - Triggers expanded, 20 triggers, new arrival',
    hint: 'Rule 11: amber NEW row pinned top, snapshot out of sync, recording blocked.',
    apply: (s) => {
      s.seed({
        ...lockedToMe(s),
        triggers: s.allFixtureTriggers(),
        triggersExpanded: true,
        snapshotOutOfSync: true,
      });
    },
  },
  {
    id: '11',
    label: '11 - Past AML cases tab',
    hint: 'Three shared columns; the pill records severity at resolution, not today.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '03')!.apply(s, ws);
      s.seed({ infoTab: 'past-cases' });
    },
  },
];

export const DEFAULT_SCENARIO = '01';

export function applyScenario(store: CaseStore, ws: WorkspaceStore, id: string): string {
  const scenario =
    SCENARIOS.find((s) => s.id === id) ?? SCENARIOS.find((s) => s.id === DEFAULT_SCENARIO)!;
  store.reset();
  ws.reset();
  // Every frame is a view of the case modal, so it starts open. Scenarios that
  // need a second modal open it themselves.
  ws.seed({ aml: { open: true } });
  scenario.apply(store, ws);
  return scenario.id;
}
