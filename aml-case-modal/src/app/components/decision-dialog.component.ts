import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { DialogShellComponent } from './dialog-shell.component';

/**
 * Rule 9. Only reachable once rule 4 is satisfied, so the dialog opens by
 * confirming that - green, because green is the "you can act here" signal.
 *
 * One textarea, and a button that names the consequence: "Submit and resolve".
 */
@Component({
  selector: 'decision-dialog',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, DialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog-shell heading="Submit decision" (dismiss)="close()">
      <!-- One line. The action names were a stacked list restating the chip bar
           the agent just came from; the sentence is the whole message. -->
      <p class="met">
        <mat-icon aria-hidden="true">check_circle</mat-icon>
        <span>All required actions are recorded. Submitting will resolve the case.</span>
      </p>

      <label class="field">
        <span class="field__label">Decision <span class="field__req">required</span></span>
        <textarea
          class="field__input"
          rows="5"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
          placeholder="What was decided, and on what basis?"
        ></textarea>
      </label>

      <p class="consequence">A resolved case is read-only and cannot be reopened here.</p>

      <ng-container dialogActions>
        <button mat-button type="button" (click)="close()">Cancel</button>
        <button mat-flat-button color="primary" type="button" [disabled]="!valid()" (click)="submit()">
          Submit and resolve
        </button>
      </ng-container>
    </dialog-shell>
  `,
  styles: [
    `
      /* Plain weight throughout - nothing here is a link or a control. */
      .met {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 400;
        margin: 4px 0 16px;
        padding: 12px 14px;
        border-radius: 10px;
        background: var(--success-bg);
        color: var(--success);
        font-size: 14px;
        line-height: 20px;
      }
      .met mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex: none;
      }
      .field {
        display: grid;
        gap: 6px;
      }
      .field__label {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
      }
      .field__req {
        font-weight: 400;
        font-size: 12px;
        color: var(--ink-3);
        margin-left: 6px;
      }
      .field__input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        color: var(--ink);
        resize: vertical;
      }
      .field__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -1px;
        border-color: var(--primary);
      }
      .consequence {
        margin: 14px 0 4px;
        font-size: 12px;
        color: var(--ink-3);
        line-height: 1.5;
      }
    `,
  ],
})
export class DecisionDialogComponent {
  readonly store = inject(CaseStore);
  readonly note = signal('');

  readonly valid = computed(() => this.note().trim().length > 0 && this.store.canSubmitDecision());

  submit(): void {
    if (this.store.submitDecision(this.note())) this.note.set('');
  }

  close(): void {
    this.store.openDialog.set(null);
    this.note.set('');
  }
}
