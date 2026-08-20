import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';

/**
 * The black player bar, per frame 09.
 *
 * The panels anchor directly beneath this, so its height is part of the
 * layout contract rather than decoration: see .shell__main in app.component.
 */
@Component({
  selector: 'player-header',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ph">
      <button class="ph__icon" type="button" aria-label="Back to players">
        <mat-icon>chevron_left</mat-icon>
      </button>
      <span class="ph__flag" aria-hidden="true">🇬🇧</span>
      <h1 class="ph__title">
        {{ store.player().name }} #{{ accountNumber }}
        <span class="ph__state">(ENABLED)</span>
      </h1>

      <button class="ph__action" type="button">
        <mat-icon>menu</mat-icon>
        Menu
      </button>
      <button class="ph__action" type="button">
        <mat-icon>more_vert</mat-icon>
        Actions
      </button>
      <button class="ph__icon" type="button" aria-label="Refresh">
        <mat-icon>refresh</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .ph {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 64px;
        padding: 0 12px 0 4px;
        background: var(--player-bar);
        color: var(--player-bar-ink);
      }
      .ph__flag {
        flex: none;
        font-size: 22px;
        line-height: 1;
      }
      /* The only h1 on the page: the player is what the page is about. The
         modal's own heading is an h2 under it. */
      .ph__title {
        flex: 1;
        min-width: 0;
        margin: 0 8px;
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ph__state {
        font-weight: 400;
      }
      .ph__icon,
      .ph__action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex: none;
        height: 36px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .ph__icon {
        width: 36px;
      }
      .ph__action {
        padding: 0 12px;
      }
      .ph__icon:hover,
      .ph__action:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .ph__icon mat-icon,
      .ph__action mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
      }

      /* Narrow: the labels go, the targets stay. */
      @media (max-width: 719.98px) {
        .ph {
          height: 56px;
        }
        .ph__action {
          width: 36px;
          padding: 0;
          font-size: 0;
          gap: 0;
        }
      }
    `,
  ],
})
export class PlayerHeaderComponent {
  readonly store = inject(CaseStore);
  /** From the frame. Not in the fixture - it is host-app data, not case data. */
  readonly accountNumber = '226588376000002';
}
