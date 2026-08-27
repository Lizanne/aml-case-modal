import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { DialogShellComponent } from './dialog-shell.component';

/**
 * Rule 3, force-unlock path only. Self-unlock never reaches this dialog.
 *
 * The body names the owner, when they took the lock, and what breaking it costs
 * them (open question 4: their unsaved draft is lost). The confirm button says
 * "Unlock case" rather than "Confirm", and carries the danger colour.
 */
@Component({
  selector: 'confirm-unlock-dialog',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, DialogShellComponent, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Focus lands on Cancel, not the confirm: the action is destructive and
         irreversible for the other agent, so the safe way out is what a
         keyboard user gets first. Named by class rather than by "the first
         button in the footer", which would silently follow a reorder. -->
    <dialog-shell heading="Force unlock this case?" initialFocus=".cancel" (dismiss)="close()">
      <!--
        Names the owner and when they took it. The fact, and nothing else.

        It used to end "and may be mid investigation", carrying the argument as
        well as the fact. The red note directly below already says what
        breaking the lock costs them, and in stronger words - so the lead was
        making the same case first, more weakly, and softening the warning by
        pre-empting it. Two sentences, one job each: this one says who and
        since when, the note says what happens.
      -->
      <p class="lead">
        <strong>{{ owner() }}</strong> has held the lock since {{ since() }}.
      </p>

      <p class="danger-note">
        <mat-icon fontSet="material-icons-outlined">warning_amber</mat-icon>
        <span>Unlocking removes their lock and interrupts any action they're recording.</span>
      </p>

      <ng-container dialogActions>
        <button mat-button class="cancel" type="button" (click)="close()">Cancel</button>
        <button mat-flat-button class="danger-button-filled" type="button" (click)="confirm()">
          Unlock case
        </button>
      </ng-container>
    </dialog-shell>
  `,
  styles: [
    `
      .lead {
        margin: 4px 0 14px;
        font-size: 14px;
        line-height: 1.55;
        color: var(--ink-2);
      }
      .lead strong {
        color: var(--ink);
      }
      .danger-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 4px;
        padding: 16px;
        border-radius: 10px;
        background: var(--danger-bg);
        color: var(--danger);
        font-size: 14px;
        line-height: 20px;
      }
      .danger-note mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        flex: none;
      }
    `,
  ],
})
export class ConfirmUnlockDialogComponent {
  readonly store = inject(CaseStore);

  /** When the lock was taken. Absolute, not "2h ago": this is the sentence a
   *  decision gets made on, and an absolute stamp cannot be misread as the
   *  age of the case. The relative age is one line above, on the band or the
   *  widget the button was clicked from. */
  readonly since = computed(() => new StampPipe().transform(this.store.lockedSince()));

  owner(): string {
    return this.store.lockOwner()?.name ?? 'Another agent';
  }

  /**
   * Unlocks. It does NOT then lock the case to me - taking the lock is a
   * separate, deliberate press of Lock, and rolling the two together would
   * make "get them out of my way" and "start work" one irreversible action.
   */
  confirm(): void {
    this.store.forceUnlock();
  }

  close(): void {
    this.store.openDialog.set(null);
  }
}
