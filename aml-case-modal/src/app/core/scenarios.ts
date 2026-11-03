import { CaseStore, resyncDiff, sampleUrlFor, triggerDetail } from './case-store';
import {
  Attachment,
  Draft,
  ResyncCompletedEvent,
  StreamItem,
  TriggerAddedEvent,
  isOutcome,
} from './models';
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

function attachment(name: string, kind: 'image', sizeKb: number): Attachment {
  // Resolved by name, through the same function mapAttachment and addFiles
  // use - a seeded chip and a fixture chip of the same filename must open the
  // same document, or the dev harness would be demonstrating something the
  // app does not do.
  return {
    id: `seed-${name}`,
    name,
    kind,
    sizeKb,
    url: sampleUrlFor(name),
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

/** The fixture's own new trigger, as the workflow entry it now becomes. */
function triggerArrival(store: CaseStore): TriggerAddedEvent {
  const t = store.allFixtureTriggers().find((x) => x.isNew)!;
  return {
    kind: 'event',
    id: 'seed-trigger-added',
    type: 'trigger-added',
    name: t.name,
    detail: triggerDetail(t.detail),
    actor: 'system',
    at: t.at,
  };
}

/** Every fixture trigger, none of them flagged: a new trigger is no longer amber. */
function allTriggersUnflagged(store: CaseStore) {
  return store.allFixtureTriggers().map((t) => ({ ...t, detail: triggerDetail(t.detail), isNew: false }));
}

/** A resync from generation 0 to 1, built with the same rules the real one uses. */
function resyncEntry(store: CaseStore, at: string): ResyncCompletedEvent {
  const { updated, riskChanged } = resyncDiff(0, 1);
  return {
    kind: 'event',
    id: 'seed-resync',
    type: 'resync-completed',
    updated: updated.map((d) => d.label),
    riskChangedIds: riskChanged.map((d) => d.id),
    riskChanged: riskChanged.map((d) => d.label),
    actor: store.me().name,
    at,
  };
}

/**
 * Everything required done EXCEPT the finalize: both assessments and the
 * contact. With the new trigger slotted in where its timestamp puts it.
 */
function requiredButFinalize(store: CaseStore, withTrigger: boolean): StreamItem[] {
  const items = store
    .fixtureStream('required')
    .filter((i) => !(isOutcome(i) && i.actionType === 'finalize-risk-assessment'));
  if (!withTrigger) return items;
  const arrival = triggerArrival(store);
  const at = items.findIndex((i) => Date.parse(i.at) > Date.parse(arrival.at));
  return at === -1 ? [...items, arrival] : [...items.slice(0, at), arrival, ...items.slice(at)];
}

function draft(partial: Partial<Draft> & Pick<Draft, 'actionType' | 'title'>): Draft {
  return {
    note: '',
    attachments: [],
    errors: [],
    lockAfter: 'keep',
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
    hint: 'Required: assess open source searches and document requests, contact the player, then Finalise (disabled until both are assessed).',
    apply: (s) => {
      s.seed(lockedToMe(s));
    },
  },
  {
    id: '02',
    label: '02 - Assess risk - Open source searches, with attachment errors',
    hint: 'Rule 5: invalid files error inline and never clear the valid ones. Risk Yes/No sits after the attachments.',
    apply: (s) => {
      s.seed({
        ...lockedToMe(s),
        draft: draft({
          actionType: 'assess-risk',
          title: 'Assess risk - Open source searches',
          riskFieldId: 'open-source-searches',
          risk: null,
          note: 'Adverse media check complete. Two hits reviewed, both false positives relating to a namesake.',
          // One image, because there is one image fixture. The PDFs that used
          // to sit beside it went with PDF support; duplicating the single
          // sample to keep the count up would put two chips on screen that
          // open the same file under two names.
          attachments: [attachment('promo-catch-a-triple-wave.png', 'image', 188)],
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
          attachments: [],
          lockAfter: 'keep',
        }),
      });
    },
  },
  {
    id: '03',
    label: '03 - Everything required done, risk assessment finalised',
    hint: 'Both assessments, the player contact and Finalise are recorded, so rule 9 unlocks Submit decision.',
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
    label: '04 - Overriding a risk from the Risk assessment',
    hint: 'Clicking No risk on Employment & occupation opened the Assess risk form in the workflow, prefilled with the current answer.',
    apply: (s) => {
      s.seed({
        ...lockedToMe(s),
        draft: draft({
          actionType: 'assess-risk',
          title: 'Assess risk - Employment & occupation',
          riskFieldId: 'employment-occupation',
          risk: 'no-risk',
          fromPlaceholder: false,
        }),
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
    hint: 'Rule 10: read-only, tabs reduced, no footer. The risk assessment shows as finalised.',
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
        infoTab: 'risk',
      });
    },
  },
  {
    id: '08',
    label: '08 - Add action menu open',
    hint: 'Rule 7: uncapped extra actions, none of which re-gate Submit.',
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
    label: '10 - New trigger arrived, triggers expanded',
    hint: 'No amber and nothing blocked: the arrival is a workflow entry with a warning icon. Resync picks up what it changed.',
    apply: (s) => {
      s.seed({
        ...lockedToMe(s),
        triggers: allTriggersUnflagged(s),
        triggersExpanded: true,
        stream: [...s.stream(), triggerArrival(s)],
        pendingRegeneration: true,
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
  {
    id: '12',
    label: '12 - Resync confirm',
    hint: 'Resync asks first: some actions might need to be recorded again.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '10')!.apply(s, ws);
      s.seed({ triggersExpanded: false, openDialog: 'resync' });
    },
  },
  {
    id: '13',
    label: '13 - Resyncing',
    hint: 'The Risk assessment is covered by the Resyncing overlay until the new values are in.',
    apply: (s, ws) => {
      SCENARIOS.find((x) => x.id === '10')!.apply(s, ws);
      s.seed({ triggersExpanded: false, resyncing: true });
    },
  },
  {
    id: '14',
    label: '14 - Resync completed, two risks changed',
    hint: 'Latest fraud scores and Deposit spike went back to Action required and joined the required list. Finalise is disabled until they are assessed.',
    apply: (s) => {
      const base = requiredButFinalize(s, true);
      const last = base[base.length - 1];
      const resync = resyncEntry(s, new Date(Date.parse(last.at) + 4 * 60_000).toISOString());
      const stream = [...base, resync];
      s.seed({
        ...lockedToMe(s),
        triggers: allTriggersUnflagged(s),
        severity: s.severityAfter(stream),
        stream,
        riskGeneration: 1,
        riskGeneratedAt: resync.at,
      });
    },
  },
  {
    id: '15',
    label: '15 - Finalise risk assessment',
    hint: 'Every field assessed, so Finalise is enabled: the section table, a note, no attachments.',
    apply: (s) => {
      const stream = requiredButFinalize(s, false);
      s.seed({
        ...lockedToMe(s),
        severity: s.severityAfter(stream),
        stream,
        draft: draft({
          actionType: 'finalize-risk-assessment',
          title: 'Finalise risk assessment',
        }),
      });
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
