import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { WorkspaceStore } from '../core/workspace-store';
import { PillComponent } from './ui-pill.component';

/**
 * The existing production "Resolve & archive active alert" modal.
 *
 * Its content is unchanged by this epic and stays a placeholder - its own
 * summary column already stacks at half width, so there is nothing to design.
 * What matters here is that it is a real peer: it opens from its own widget,
 * takes the same reflow, and has the same minimise and close chrome. Dual mode
 * only reads correctly if both modals behave like modals.
 */
@Component({
  selector: 'sg-alert-modal',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width.px]': 'ws.modalWidth()',
  },
  template: `
    <div class="sg">
      <div class="sg__head">
        <h2 class="sg__title">Resolve &amp; archive active alert</h2>
        <!-- SG-alert material stays in the primary blue family, never severity. -->
        <ui-pill tone="info">SG alert</ui-pill>
        <button
          class="sg__btn"
          type="button"
          aria-label="Minimise alert"
          matTooltip="Minimise"
          (click)="ws.minimise('sg')"
        >
          <mat-icon>remove</mat-icon>
        </button>
        <button class="sg__btn" type="button" aria-label="Close alert" (click)="ws.close('sg')">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="sg__body">
        <div class="sg__note">
          <p class="sg__note-title">Existing prod monitoring modal, shown illustratively</p>
          <p class="sg__note-body">
            Content unchanged by this epic. In dual mode it narrows to half width; its summary
            column already stacks.
          </p>
        </div>

        @for (row of rows; track row) {
          <div class="sg__row" aria-hidden="true">
            <span class="sg__bar sg__bar--label"></span>
            <span class="sg__bar sg__bar--value"></span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 100vw;
        min-width: 0;
        transition: width 300ms ease-out;
      }
      .sg {
        display: flex;
        flex-direction: column;
        width: 100%;
        /* Leave room for any docked bars, or one will cover the footer. */
        height: min(820px, calc(100vh - 240px - var(--dock-h, 0px)));
        min-height: 520px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        box-shadow: 0 20px 56px rgba(24, 24, 27, 0.14);
        overflow: hidden;
      }
      .sg__head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--line);
      }
      .sg__title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--ink);
      }
      .sg__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .sg__btn:first-of-type {
        margin-left: auto;
      }
      .sg__btn:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--ink);
      }
      .sg__btn mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .sg__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 16px;
      }
      .sg__note {
        padding: 12px;
        border-radius: 8px;
        background: var(--page);
        margin-bottom: 16px;
      }
      .sg__note-title {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--ink-2);
      }
      .sg__note-body {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
      }
      .sg__row {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
      }
      .sg__bar {
        height: 10px;
        border-radius: 3px;
        background: var(--line);
      }
      .sg__bar--label {
        flex: 0 0 120px;
      }
      .sg__bar--value {
        flex: 1 1 auto;
        background: #eef0f3;
      }
      @media (prefers-reduced-motion: reduce) {
        :host {
          transition: none;
        }
      }
    `,
  ],
})
export class SgAlertModalComponent {
  readonly ws = inject(WorkspaceStore);
  readonly rows = [1, 2, 3, 4, 5, 6];
}
