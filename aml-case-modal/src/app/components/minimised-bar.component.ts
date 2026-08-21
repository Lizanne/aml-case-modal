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
        The bar IS the restore control: one button spanning everything but the
        close, so a tap anywhere on it restores. The chevron is the visual cue
        and carries no text of its own - a "Restore" link inside a button that
        already restores was a second affordance for one action.
      -->
      <button
        class="bar__restore"
        type="button"
        [attr.aria-label]="'Restore ' + panelName() + ' panel'"
        (click)="ws.restore(id)"
      >
        <ui-pill [severity]="severity()" tone="info">{{ tag() }}</ui-pill>
        <span class="bar__title">{{ title() }}</span>
        <mat-icon class="bar__icon" aria-hidden="true">expand_less</mat-icon>
      </button>
      <!-- Its own control, and its own hit area. stopPropagation is belt and
           braces: they are siblings, not nested, so a click here cannot reach
           the restore button - but nothing in the markup says so, and someone
           will nest them one day. -->
      <button
        class="bar__close"
        type="button"
        [attr.aria-label]="'Close ' + panelName() + ' panel'"
        (click)="$event.stopPropagation(); ws.close(id)"
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
      .bar {
        display: flex;
        align-items: stretch;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        box-shadow: 0 -2px 14px rgba(24, 24, 27, 0.1);
        overflow: hidden;
      }
      .bar__restore {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
        min-width: 0;
        padding: 8px 12px;
        border: 0;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .bar__restore:hover {
        background: var(--page);
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
      .bar__icon {
        flex: none;
        color: var(--primary);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      /* 32px square with a 16px glyph, matching every other close and minimise
         control. It used to be a full-height strip with a border-left divider;
         at a fixed size it cannot stretch, so it centres itself and the divider
         goes rather than hanging short of the bar edges. */
      /* 44px of hit area, and the 16px gutter the design asks for - it was
         clipped at 8px. The visual button stays 32px; the target is the
         padding around it. */
      .bar__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        align-self: center;
        width: 44px;
        height: 44px;
        margin-right: 16px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .bar__close:hover mat-icon {
        color: var(--ink);
      }
      .bar__close:hover {
        color: var(--ink);
      }
      .bar__close mat-icon {
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
