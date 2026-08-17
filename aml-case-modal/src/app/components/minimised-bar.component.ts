import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { ModalId, WorkspaceStore } from '../core/workspace-store';

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
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" [class.bar--pulse]="pulsing()">
      <button class="bar__restore" type="button" (click)="ws.restore(id)">
        <span class="bar__tag" [attr.data-sev]="severity()">{{ tag() }}</span>
        <span class="bar__title">{{ title() }}</span>
        <span class="bar__hint">Restore</span>
        <mat-icon class="bar__icon">expand_less</mat-icon>
      </button>
      <button class="bar__close" type="button" [attr.aria-label]="'Close ' + title()" (click)="ws.close(id)">
        <mat-icon>close</mat-icon>
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
      .bar__tag {
        flex: none;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        background: var(--primary-bg);
        color: var(--primary-ink);
      }
      .bar__tag[data-sev='AML'] {
        background: var(--sev-aml-bg);
        color: var(--sev-aml);
      }
      .bar__tag[data-sev='EDD'] {
        background: var(--sev-edd-bg);
        color: var(--sev-edd);
      }
      .bar__tag[data-sev='COMPLIANCE'] {
        background: var(--sev-compliance-bg);
        color: var(--sev-compliance);
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
      .bar__hint {
        flex: none;
        font-size: 12px;
        color: var(--primary);
        font-weight: 600;
      }
      .bar__icon {
        flex: none;
        color: var(--primary);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .bar__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        border: 0;
        border-left: 1px solid var(--line);
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .bar__close:hover {
        background: var(--page);
        color: var(--ink);
      }
      .bar__close mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
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

  title(): string {
    return this.id === 'sg'
      ? 'Resolve & archive active alert'
      : `AML case #${this.store.caseId()}`;
  }
}
