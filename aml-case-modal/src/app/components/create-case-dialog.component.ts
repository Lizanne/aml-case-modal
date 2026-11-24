import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';

import { AmlDashboardStore } from '../core/aml-dashboard-store';
import { SEVERITY_LABEL, SEVERITY_ORDER, Severity } from '../core/models';
import { DialogShellComponent } from './dialog-shell.component';

/**
 * APP-17691 7: an agent opens an AML case by hand.
 *
 * Cases are normally created by the score-card crossing a band, so this is
 * the exception: something the score-card does not measure. That is why it
 * asks for a reason before anything else - the reason is the case's trigger,
 * and it is what the audit log will say.
 *
 * Nothing is preselected. A severity the agent did not choose is a severity
 * the system chose for them.
 */
@Component({
  selector: 'create-case-dialog',
  standalone: true,
  imports: [MatButtonModule, MatRadioModule, DialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog-shell heading="Create AML case" (dismiss)="close()">
      <fieldset class="group">
        <legend class="group__label">Severity</legend>
        <mat-radio-group class="choices" [value]="severity()" (change)="onSeverity($event)">
          @for (option of severities; track option) {
            <mat-radio-button [value]="option">{{ label(option) }}</mat-radio-button>
          }
        </mat-radio-group>
      </fieldset>

      <label class="field">
        <span class="field__label">Reason</span>
        <textarea
          class="field__input"
          rows="3"
          aria-required="true"
          aria-describedby="create-reason-hint"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
          placeholder="What have you seen that the score-card does not measure?"
        ></textarea>
        <span class="field__hint" id="create-reason-hint">
          Required. It becomes the case's opening trigger and is recorded in the audit log.
        </span>
      </label>

      <ng-container dialogActions>
        <button mat-button type="button" (click)="close()">Cancel</button>
        <button mat-flat-button color="primary" type="button" [disabled]="!valid()" (click)="save()">
          Create case
        </button>
      </ng-container>
    </dialog-shell>
  `,
  styles: [
    `
      .group {
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
      }
      .group__label,
      .field__label {
        padding: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .choices {
        display: flex;
        flex-wrap: wrap;
        gap: 0 var(--lds-core-spacing-2, 8px);
        margin: 0 0 -10px -10px;
      }
      .field {
        display: grid;
        gap: var(--lds-core-spacing-2, 8px);
        margin-top: var(--lds-core-spacing-5, 20px);
      }
      .field__input {
        width: 100%;
        min-height: 80px;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
        resize: vertical;
      }
      .field__input::placeholder {
        color: var(--foreground-secondary);
      }
      .field__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -1px;
        border-color: var(--primary);
      }
      .field__hint {
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      @media (pointer: coarse) {
        .field__input {
          font-size: 16px;
        }
      }
    `,
  ],
})
export class CreateCaseDialogComponent {
  private readonly store = inject(AmlDashboardStore);

  /** Least severe first: the order an agent escalates in. */
  readonly severities: readonly Severity[] = [...SEVERITY_ORDER].reverse();

  readonly severity = signal<Severity | null>(null);
  readonly reason = signal('');
  readonly valid = computed(() => this.severity() !== null && this.reason().trim().length > 0);

  label(severity: Severity): string {
    return SEVERITY_LABEL[severity];
  }

  /** (change) is also the DOM event of that name; take only a real answer. */
  onSeverity(event: unknown): void {
    const value = (event as { value?: unknown }).value;
    if (typeof value === 'string' && (SEVERITY_ORDER as readonly string[]).includes(value)) {
      this.severity.set(value as Severity);
    }
  }

  save(): void {
    const severity = this.severity();
    if (!severity || !this.valid()) return;
    this.store.createCase(SEVERITY_LABEL[severity], this.reason().trim());
  }

  close(): void {
    this.store.creatingCase.set(false);
  }
}
