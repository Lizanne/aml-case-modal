import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { RISK_STATUS_LABEL } from '../core/risk-assessment';
import { RiskStatusComponent } from './risk-status.component';
import { PillComponent } from './ui-pill.component';

/**
 * Rule 4. One chip per mandatory action: Action required while pending, a
 * quiet neutral chip with its result glyph once done. Pinned to the top of
 * the workflow panel - it never scrolls with the stream.
 *
 * Rule 10: hidden entirely once the case is resolved.
 */
@Component({
  selector: 'required-chips',
  standalone: true,
  imports: [MatIconModule, PillComponent, RiskStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="chip-bar"
      [class.chip-bar--narrow]="store.layoutNarrow()"
      role="status"
      aria-label="Required actions"
    >
      <!-- State is carried by the icon and the pill colour alone: a ring and
           an outline when pending, a tick and green when done. No word is
           needed for either, so neither has one. The "Required" heading is
           still the first thing to go when width is short. -->
      @if (!store.layoutNarrow()) {
        <span class="chip-bar__label">Required</span>
      }
      <!--
        Recede (prototyped 13 Nov 2026): to do is the amber Action required
        pill, for every item. Done steps back - the neutral pill, with the
        result as its glyph: a red flag for Risk flagged, a green tick for No
        risk or a recorded action. The bar then answers "what's left" at a
        glance, and a finished risky field no longer reads as an open problem.
        The full red / green result stays on the field's row, band and card.
      -->
      @for (action of store.requiredActions(); track action.key) {
        @if (!action.done) {
          <risk-status
            size="md"
            status="action-required"
            [label]="store.layoutNarrow() || action.status ? action.shortLabel : action.label"
            [name]="action.label + ': Action required'"
          />
        } @else {
          <ui-pill
            tone="neutral"
            class="chip--done"
            [attr.data-result]="action.status === 'risk' ? 'risk' : action.status === 'no-risk' ? 'no-risk' : 'done'"
            [attr.aria-label]="action.label + ': ' + doneWord(action.status)"
          >
            <mat-icon
              class="chip__icon"
              [class.chip__icon--risk]="action.status === 'risk'"
              [class.chip__icon--ok]="action.status !== 'risk'"
              aria-hidden="true"
            >{{ action.status === 'risk' ? 'flag' : 'check_circle' }}</mat-icon>
            {{ store.layoutNarrow() || action.status ? action.shortLabel : action.label }}
          </ui-pill>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .chip-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        /* The height its padding and a 24px pill already came to, stated so
           the trigger strip's header can be held to the same number rather
           than to a copy of it. Still free to grow when the chips wrap. */
        min-height: var(--panel-bar-h);
        box-sizing: border-box;
        padding: 12px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }
      .chip-bar--narrow {
        padding: 12px 20px;
        gap: 8px;
      }
      /* mat-icon.<class>, not just .<class>: Material's own .mat-icon rule sets
         24px at the same class specificity, so the element tag is what wins. */
      mat-icon.chip__icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .chip-bar__label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--foreground-secondary);
        margin-right: 4px;
      }
      /* Done steps back: secondary ink on the neutral pill (6.86:1 on
         --background-tertiary), so only the amber to-do chips stand out. */
      .chip-bar ui-pill.chip--done {
        color: var(--foreground-secondary);
      }
      /* The result, as the done chip's only colour: the status inks. */
      mat-icon.chip__icon--risk {
        color: var(--danger-deep);
      }
      mat-icon.chip__icon--ok {
        color: var(--success);
      }
    `,
  ],
})
export class RequiredChipsComponent {
  readonly store = inject(CaseStore);
  /** The done chip's spoken state: its result for an assessment, "done" otherwise. */
  doneWord(status: string | null): string {
    return status === 'risk' || status === 'no-risk' ? `done, ${RISK_STATUS_LABEL[status]}` : 'done';
  }
}

