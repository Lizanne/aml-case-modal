import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { ModalId, WorkspaceStore } from '../core/workspace-store';
import { PillComponent } from './ui-pill.component';

/**
 * A minimised modal, docked as a slim bar at the bottom edge. Bars stack, in
 * the same fixed order as the modals themselves.
 *
 * When a bar appears because opening the second modal auto-minimised the first
 * (too little room to share), it pulses once - otherwise the modal would seem
 * to have simply vanished.
 */
@Component({
  selector: 'minimised-bar',
  standalone: true,
  imports: [MatIconModule, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" [class.bar--pulse]="pulsing()">
      <!--
        The surface is INERT: a label, not a control. It was one big restore
        button with a separate X inside it, which put two targets in one and
        made the whole bar light up on hover for an action the chevron already
        names. Now the two icon buttons are the only interactive things here.
      -->
      <div class="bar__label">
        <ui-pill [severity]="severity()" tone="info">{{ tag() }}</ui-pill>
        <span class="bar__title">{{ title() }}</span>
      </div>

      <button
        class="bar__icon-btn"
        type="button"
        [attr.aria-label]="'Restore ' + panelName() + ' panel'"
        (click)="ws.restore(id)"
      >
        <mat-icon aria-hidden="true">expand_less</mat-icon>
      </button>
      <button
        class="bar__icon-btn"
        type="button"
        [attr.aria-label]="'Close ' + panelName() + ' panel'"
        (click)="ws.close(id)"
      >
        <mat-icon aria-hidden="true">close</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /* No hover, no cursor, no handler - the surface is not a control. */
      .bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px 6px 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        box-shadow: 0 -2px 14px rgba(24, 24, 27, 0.1);
      }
      .bar__label {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
      }
      .bar__title {
        flex: 1;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /**
       * The two controls. 44px of hit area each, with the hover drawn on a
       * 32px rounded square INSIDE that - so the target meets the touch
       * minimum while the visible affordance stays the size of the icon it
       * sits behind, rather than a 44px slab.
       *
       * background-clip: content-box with 6px of padding is what insets the
       * tint: the padding is transparent to the eye and solid to the pointer.
       */
      /**
       * THE HOVER SQUARE IS THE HIT AREA. Not a smaller square inside it.
       *
       * Two things were shrinking it. The browser's own stylesheet gives every
       * <button> padding - 1px 6px in Chrome - and this never reset it; and
       * background-clip: content-box then painted the tint INSIDE that
       * padding, so the square came out 28x38 in a 40x40 target. Hovering the
       * outer edge left the cursor somewhere that clicked but did not light
       * up, which reads as the button ending before it does.
       *
       * The clip was correct once: the button carried its own 6px of padding
       * deliberately, and content-box was what kept the tint off it. That
       * padding is gone, and the clip outlived it.
       *
       * padding: 0 rather than trusting the reset, because the UA value is
       * what got in last time.
       */
      .bar__icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .bar__icon-btn:hover {
        background-color: rgba(0, 0, 0, 0.06);
        color: var(--ink);
      }
      .bar__icon-btn:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -4px;
      }
      .bar__icon-btn mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /* One pulse, then done. Purely decorative, so it is dropped entirely
         under reduced motion rather than being sped up. */
      .bar--pulse {
        animation: bar-pulse 900ms ease-out 1;
      }
      @keyframes bar-pulse {
        0% {
          box-shadow: 0 -2px 14px rgba(24, 24, 27, 0.1), 0 0 0 0 rgba(26, 115, 201, 0.5);
        }
        40% {
          box-shadow: 0 -2px 14px rgba(24, 24, 27, 0.1), 0 0 0 6px rgba(26, 115, 201, 0);
        }
        100% {
          box-shadow: 0 -2px 14px rgba(24, 24, 27, 0.1), 0 0 0 0 rgba(26, 115, 201, 0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .bar--pulse {
          animation: none;
        }
      }
    `,
  ],
})
export class MinimisedBarComponent {
  readonly ws = inject(WorkspaceStore);
  private readonly store = inject(CaseStore);

  @Input({ required: true }) id!: ModalId;

  readonly pulsing = computed(() => this.ws.pulsingBar() === this.id);

  tag(): string {
    return this.id === 'sg' ? 'SG alert' : this.store.severity();
  }

  /** Severity colour only ever appears on the AML bar, and only for severity. */
  severity(): string | null {
    return this.id === 'aml' ? this.store.severity() : null;
  }

  /** What the panel is called in an accessible name: "SG alert" / "AML case". */
  panelName(): string {
    return this.id === 'sg' ? 'SG alert' : 'AML case';
  }

  title(): string {
    return this.id === 'sg'
      ? 'Resolve & archive active alert'
      : `AML case #${this.store.caseId()}`;
  }
}
