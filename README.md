# AML case modal

Angular 17 + Angular Material prototype of the AML case modal for the Lottomart
back office (Manual Core epic). Built to prove the state machine and the
workflow interactions, not to be pixel-final.

```bash
cd aml-case-modal
npm install
npm start          # http://localhost:4200
```

Jump straight to any state with `?state=<id>`, or use the dev switcher above the
modal: `http://localhost:4200/?state=03`.

## What is here

| Path | What it is |
| --- | --- |
| [`PROTOTYPE.md`](PROTOTYPE.md) | The brief: stack, design tokens, layout, components, the 11 business rules, the states to make reachable, and the open questions |
| [`mock-case.json`](mock-case.json) | The fixture. Single source of truth for the case, its triggers, the workflow history and the severity ranking |
| [`aml-case-modal/`](aml-case-modal/) | The Angular app. See [its README](aml-case-modal/README.md) for where each rule is enforced |

## The short version

Every business rule lives in one place, `src/app/core/case-store.ts`. Components
read signals off the store and call commands on it; none of them decide for
themselves whether an action is allowed.

Fourteen states are reachable through a dev state switcher, mirroring the Figma
frames — from unlocked, through recording outcomes and adjusting severity, to
resolved and read-only.

Six Playwright suites cover it: the states render correctly, the rules hold when
driven live, the layout never latches or overflows, the dual-modal interaction
behaves, the severity ranking is derived rather than hardcoded, and every state
passes axe-core WCAG 2.1 AA plus real keyboard paths.

```bash
cd aml-case-modal
npm start          # in one terminal
npm run verify     # in another
```

## Note on the data

`mock-case.json` is fictional. It models the shape of a real case record — a
player, triggers, outcomes, a severity history — so the prototype can prove the
state machine against something realistic. No real player data is present.
