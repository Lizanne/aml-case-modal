import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { SEVERITY_LABEL } from '../core/models';
import { PillComponent } from './ui-pill.component';

/**
 * Title, severity pill, status pill, lock line, lock button.
 *
 * Rule 3: the lock button changes verb with the lock state, and "Force unlock"
 * says what it does rather than hiding the consequence behind "Unlock".
 * Rule 10: once resolved there is nothing to lock, so the control goes away.
 */
@Component({
  selector: 'case-header',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, StampPipe, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head" [class.head--narrow]="store.layoutNarrow()">
      <div class="head__main">
        <div class="head__titles">
          <!-- Pills sit directly beside the title, not flushed to the far
               right: they qualify the case name, so they belong next to it. -->
          <div class="head__title-row">
            <h2 class="head__title">AML case #{{ store.caseId() }}</h2>
            <div class="head__pills">
              <ui-pill [severity]="store.severity()">
                {{ severityLabel() }}
              </ui-pill>
              <ui-pill [tone]="store.isResolved() ? 'success' : 'neutral'">
                {{ store.isResolved() ? 'Resolved' : 'Open' }}
              </ui-pill>
            </div>
          </div>
          @if (!store.layoutNarrow()) {
            <p class="head__sub">{{ store.player().name }} · Player {{ store.player().id }}</p>
          }
        </div>

        <button
          class="head__close"
          type="button"
          aria-label="Minimise case"
          matTooltip="Minimise"
          (click)="minimise.emit()"
        >
          <mat-icon>remove</mat-icon>
        </button>
        <button class="head__close" type="button" aria-label="Close case" (click)="close.emit()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="head__lock" [attr.data-lock]="store.lockState()">
        <!-- Narrow: the player identity folds into the lock row rather than
             taking a line of its own. -->
        @if (store.layoutNarrow()) {
          <span class="head__player">Player {{ store.player().id }}</span>
        }
        <mat-icon class="head__lock-icon">{{ lockIcon() }}</mat-icon>
        <p class="head__lock-text">{{ store.layoutNarrow() ? shortLockLine() : lockLine() }}</p>

        @if (!store.isResolved()) {
          @switch (store.lockState()) {
            @case ('unlocked') {
              <button mat-flat-button color="primary" type="button" (click)="store.lock()">
                Lock to me
              </button>
            }
            @case ('locked-to-me') {
              <button mat-stroked-button type="button" (click)="store.requestUnlock()">Unlock</button>
            }
            @case ('locked-to-other') {
              <button mat-stroked-button class="danger-button" type="button" (click)="store.requestUnlock()">
                Force unlock
              </button>
            }
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .head {
        background: var(--panel);
        border-bottom: 1px solid var(--line);
      }
      .head__main {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 16px 20px;
      }
      .head__titles {
        flex: 1;
        min-width: 0;
      }
      .head__title-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .head__title {
        margin: 0;
        font-size: 20px;
        line-height: 30px;
        font-weight: 600;
        color: var(--ink);
        letter-spacing: -0.01em;
      }
      .head__sub {
        margin: 8px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
      }
      .head__pills {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .head__close {
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
      .head__close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--ink);
      }
      /* Fixed height: the band swaps a filled button for a stroked one and its
         copy changes length, and none of that may move the content below it. */
      .head__lock {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
        box-sizing: border-box;
        padding: 12px;
      }
      .head__lock-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ink-3);
      }
      /* Success green is the only "you can act here" signal. */
      .head__lock[data-lock='locked-to-me'] .head__lock-icon {
        color: var(--success);
      }
      .head__lock-text {
        flex: 1;
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
      }
      .head__lock[data-lock='locked-to-me'] .head__lock-text {
        color: var(--success);
      }
      .head__player {
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
      }

      /* Narrow / dual-modal: two tight rows instead of a title block and a
         separate lock strip. */
      .head--narrow .head__main {
        padding: 12px 16px 0;
        align-items: center;
      }
      .head--narrow .head__title {
        font-size: 16px;
        line-height: 24px;
      }
      .head--narrow .head__lock {
        padding: 6px 16px 12px;
        gap: 8px;
      }
      .head--narrow .head__lock-text {
        flex: 0 1 auto;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .head--narrow .head__lock button {
        margin-left: auto;
      }
    `,
  ],
})
export class CaseHeaderComponent {
  readonly store = inject(CaseStore);
  @Output() close = new EventEmitter<void>();
  @Output() minimise = new EventEmitter<void>();

  readonly severityLabel = computed(() => SEVERITY_LABEL[this.store.severity()]);

  readonly lockIcon = computed(() =>
    this.store.lockState() === 'unlocked' ? 'lock_open' : 'lock',
  );

  /**
   * Narrow layout: the lock state matters, the timestamp does not fit. The full
   * "since" stamp stays available in the Timeline tab.
   */
  readonly shortLockLine = computed(() => {
    if (this.store.isResolved()) return 'Resolved - read-only';
    switch (this.store.lockState()) {
      case 'locked-to-me':
        return 'Locked to you';
      case 'locked-to-other':
        return `Locked to ${this.store.lockOwner()?.name ?? 'another agent'}`;
      default:
        return 'Unassigned';
    }
  });

  /**
   * States the fact and stops. The button beside it already says what you can
   * do about it, so "You can record outcomes" was the sentence saying it twice.
   */
  readonly lockLine = computed(() => {
    if (this.store.isResolved()) return 'This case is resolved and read-only.';
    const since = this.store.lockedSince();
    const stamp = since ? new StampPipe().transform(since) : '';
    switch (this.store.lockState()) {
      case 'locked-to-me':
        return `Locked to you since ${stamp}`;
      case 'locked-to-other':
        return `Locked to ${this.store.lockOwner()?.name ?? 'another agent'} since ${stamp}`;
      default:
        return 'Unassigned';
    }
  });
}
