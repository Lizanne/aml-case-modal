import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * The Lottomart product bar, per frame 09.
 *
 * Host-app chrome, reproduced for composition only: nothing here is wired up,
 * because none of it belongs to this epic. It exists so the case modal is seen
 * in the surface it actually opens in rather than on a blank page.
 */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <button class="bar__back" type="button" aria-label="Back">
        <mat-icon>chevron_left</mat-icon>
      </button>
      <span class="bar__brand">LOTTOMART</span>
      <span class="bar__env">DEVELOPMENT</span>

      <span class="bar__clock">{{ clock }}</span>
      <button class="bar__icon" type="button" aria-label="Search">
        <mat-icon>search</mat-icon>
      </button>
      <button class="bar__icon" type="button" aria-label="Switch environment">
        <mat-icon>swap_horiz</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 56px;
        padding: 0 12px;
        background: var(--brand-bar);
        color: var(--brand-bar-ink);
      }
      .bar__back,
      .bar__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .bar__back:hover,
      .bar__icon:hover {
        background: rgba(0, 0, 0, 0.08);
      }
      .bar__back mat-icon,
      .bar__icon mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
      }
      .bar__brand {
        flex: none;
        font-size: 20px;
        line-height: 24px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .bar__env {
        flex: none;
        font-size: 16px;
        line-height: 24px;
        font-weight: 700;
        color: var(--brand-bar-accent);
      }
      /* The region picker used to be the centre item, and its "margin: 0 auto"
         was what pushed the clock and the icon buttons to the right edge. With
         it gone the auto margin moves here, or the whole right-hand group
         collapses in against the brand. */
      .bar__clock {
        flex: none;
        margin-left: auto;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      /* Below the nav breakpoint the brand keeps its place and the rest of the
         bar gives way, so it never wraps to a second line. */
      @media (max-width: 1023.98px) {
        .bar__env,
        .bar__clock {
          display: none;
        }
        /* The clock carries the auto margin, so hiding it takes the spacer with
           it. The next element inherits the job. */
        .bar__clock + .bar__icon {
          margin-left: auto;
        }
      }

      /* At 320 the brand and two icon buttons come to more than the bar is
         wide, so the brand truncates. Same breakpoint as the panel reflow and
         the 16px gutters. */
      @media (max-width: 719.98px) {
        .bar {
          gap: 4px;
        }
        .bar__brand {
          flex: 0 1 auto;
          min-width: 0;
          margin-right: auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    `,
  ],
})
export class AppTopBarComponent {
  /** Static, per the frame. A live clock would be motion with nothing to say. */
  readonly clock = '08:10:48 AM UTC';
}
