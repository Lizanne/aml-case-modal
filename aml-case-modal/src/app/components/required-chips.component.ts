import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { RISK_STATUS_LABEL } from '../core/risk-assessment';
import { RiskStatusComponent } from './risk-status.component';
import { PillComponent } from './ui-pill.component';

/**
 * Rule 4. One chip per mandatory action: Action required while pending, the
 * field's status or a green tick once done. Pinned to the top of
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
        An assessment's chip IS its risk status - the same pill, same fill,
        same icon as the field's row in the Risk assessment - with the field
        name as the word and the status on the accessible name and title.
        A done assessment therefore reads No risk or Risk flagged here, never
        a generic tick, and the two panels say the same thing about one field.
        Contact player and Finalise keep the pending / done pill.
      -->
      @for (action of store.requiredActions(); track action.key) {
        @if (action.status) {
          <risk-status
            class="chip--assess"
            size="md"
            [status]="action.status"
            [label]="action.shortLabel"
            [name]="action.label + ': ' + statusWord(action.status)"
          />
        } @else if (!action.done) {
          <!-- Pending is Action required here too (feedback 12 Nov 2026):
               every item in this bar is required, so every pending one wears
               the same amber pill the assessments and the placeholders do. -->
          <risk-status
            size="md"
            status="action-required"
            [label]="store.layoutNarrow() ? action.shortLabel : action.label"
            [name]="action.label + ': Action required'"
          />
        } @else {
        <ui-pill tone="success" [attr.aria-label]="action.label + ': done'">
          <mat-icon class="chip__icon" aria-hidden="true">check_circle</mat-icon>
          <!-- An assessment shows its field alone: "Assess risk - " on every
               chip took a second and third row of height for no information.
               The aria-label keeps the full name. -->
          {{ store.layoutNarrow() ? action.shortLabel : action.label }}
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
      /* Success green is the only "you can act here" / completed signal. */
    `,
  ],
})
export class RequiredChipsComponent {
  readonly store = inject(CaseStore);
  readonly statusWord = (s: keyof typeof RISK_STATUS_LABEL) => RISK_STATUS_LABEL[s];
}

