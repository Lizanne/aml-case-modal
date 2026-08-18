import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { PillComponent } from './ui-pill.component';

/**
 * Rule 4. One chip per mandatory action, pending or done - stated by icon
 * and colour, never by a word. Pinned to the top of
 * the workflow panel - it never scrolls with the stream.
 *
 * Rule 10: hidden entirely once the case is resolved.
 */
@Component({
  selector: 'required-chips',
  standalone: true,
  imports: [MatIconModule, PillComponent],
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
      @for (action of store.requiredActions(); track action.id) {
        <ui-pill
          [tone]="action.done ? 'success' : 'outline'"
          [attr.aria-label]="action.label + ': ' + (action.done ? 'done' : 'pending')"
        >
          <mat-icon class="chip__icon" aria-hidden="true">{{
            action.done ? 'check_circle' : 'radio_button_unchecked'
          }}</mat-icon>
          {{ store.layoutNarrow() ? action.shortLabel : action.label }}
        </ui-pill>
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
        color: var(--ink-3);
        margin-right: 4px;
      }
      /* Success green is the only "you can act here" / completed signal. */
    `,
  ],
})
export class RequiredChipsComponent {
  readonly store = inject(CaseStore);
}

