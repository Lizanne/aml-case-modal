import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { lockStatusLine } from '../core/models';
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
    <dialog-shell heading="Force unlock this case?" initialFocus=".panel__foot button" (dismiss)="close()">
      <!-- Same sentence as the panel band and the widget, so the dialog does
           not restate the lock in a third form. -->
      <p class="lead">{{ lockLine() }}.</p>

      <p class="danger-note">
        <mat-icon fontSet="material-icons-outlined">warning_amber</mat-icon>
        <span>
          Unlocking takes the case from {{ owner() }}. Anything they have typed and not saved is
          lost. The unlock is recorded against your name in the case timeline.
        </span>
      </p>

      <ng-container dialogActions>
        <button mat-button type="button" (click)="close()">Cancel</button>
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
  readonly lockLine = computed(() =>
    lockStatusLine(this.store.lockState(), this.store.lockOwner()?.name, {
      since: this.store.lockedSince()
        ? new StampPipe().transform(this.store.lockedSince())
        : undefined,
    }),
  );

  readonly store = inject(CaseStore);

  owner(): string {
    return this.store.lockOwner()?.name ?? 'Another agent';
  }

  confirm(): void {
    this.store.forceUnlock();
  }

  close(): void {
    this.store.openDialog.set(null);
  }
}
