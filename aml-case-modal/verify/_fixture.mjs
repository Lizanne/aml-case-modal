/**
 * The verifiers' view of the fixture.
 *
 * `mock-case.json` is gone: there is one case file now, `mock-cases.json`, and
 * the modal reads a single case out of it. This is the Node-side mirror of
 * `src/app/core/case-fixture.ts` - the same projection, so a verifier can keep
 * asking for `FIXTURE.workflow` or `FIXTURE.pastCases` and get the case the
 * modal is actually showing.
 *
 * Deliberately NOT a second copy of the data: it reads the same file the app
 * does, and only reshapes it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CASES = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/core/mock-cases.json', import.meta.url)), 'utf8'),
);

export const DEFAULT_CASE_ID = '4821';

export function caseFixture(id = DEFAULT_CASE_ID) {
  const c = CASES.cases.find((x) => x.id === id) ?? CASES.cases[0];
  return {
    player: c.player,
    case: {
      id: c.id,
      status: c.status,
      severity: c.severity,
      createdAt: c.createdAt,
      origin: c.origin,
      creation: c.creation,
      lock: c.lock,
      snapshot: c.snapshot,
    },
    triggers: c.triggers,
    workflow: c.workflow,
    timeline: c.timeline,
    pastCases: c.pastCases,
    starredCommentaries: c.starredCommentaries,
    agents: CASES.agents,
    requiredActions: CASES.requiredActions,
    actionTypes: CASES.actionTypes,
    workTypes: CASES.workTypes,
    severityRanking: CASES.severityRanking,
    attachmentErrorsExample: CASES.attachmentErrorsExample,
  };
}

/** The case the modal shows by default - what every existing verifier means. */
export const FIXTURE = caseFixture();
