import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { PillComponent } from './ui-pill.component';

/**
 * Rule 4. One chip per mandatory action, pending or done. Pinned to the top of
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
      <!-- The "Required" heading and the Done/Pending suffixes are the first
           things to go when width is short: the tick and the pill colour
           already carry the state. -->
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
          <!-- Only the outstanding state is named. A done chip already says so
               with its tick and its green; "Done" on top of both is noise. -->
          @if (!store.layoutNarrow() && !action.done) {
            <span class="chip__state">Pending</span>
          }
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
        padding: 8px 16px;
        gap: 6px;
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
      /* No opacity: it silently multiplies against whatever is behind and
         dropped this to 4.09:1 on white, 3.75:1 on the done tint. */
      .chip__state {
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        color: var(--ink-2);
      }
    `,
  ],
})
export class RequiredChipsComponent {
  readonly store = inject(CaseStore);
}

