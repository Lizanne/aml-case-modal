import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { CaseStore } from '../core/case-store';
import { DialogShellComponent } from './dialog-shell.component';

/**
 * Asked before every resync of the Risk assessment.
 *
 * A resync can send fields back to Action required, which puts assessments
 * the agent already recorded back on the required list. That is the cost the
 * dialog names. Nothing is lost - the earlier assessments stay in the
 * workflow - so the confirm is the primary button, not a danger one, and
 * focus starts on it.
 */
@Component({
  selector: 'resync-dialog',
  standalone: true,
  imports: [MatButtonModule, DialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog-shell heading="Resync risk assessment?" initialFocus=".confirm" (dismiss)="close()">
      <p class="lead">Some actions might need to be recorded again.</p>
      <p class="detail">
        Every value is regenerated. Where a field's risk changes, it goes back to Action required
        and has to be assessed again before the risk assessment can be finalised.
      </p>

      <ng-container dialogActions>
        <button mat-button type="button" (click)="close()">Cancel</button>
        <button mat-flat-button color="primary" class="confirm" type="button" (click)="store.confirmResync()">
          Resync
        </button>
      </ng-container>
    </dialog-shell>
  `,
  styles: [
    `
      .lead {
        margin: 4px 0 8px;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .detail {
        margin: 0 0 4px;
        font-size: 14px;
        line-height: 1.55;
        color: var(--foreground-secondary);
      }
    `,
  ],
})
export class ResyncDialogComponent {
  readonly store = inject(CaseStore);

  close(): void {
    this.store.openDialog.set(null);
  }
}
