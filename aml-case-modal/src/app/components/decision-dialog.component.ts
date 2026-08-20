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
    <dialog-shell heading="Submit decision" initialFocus="textarea" (dismiss)="close()">
      <!--
        ONE notice, never two. The green line and the amber warning say the
        same thing about resolving; stacking them made the dialog restate its
        own consequence in two moods at once. When there is a draft to lose,
        the amber line carries the finality itself.
      -->
      @if (store.draftDirty()) {
        <p class="notice notice--warn" role="alert">
          <mat-icon fontSet="material-icons-outlined" aria-hidden="true">warning_amber</mat-icon>
          <span>
            Submitting will resolve the case and discard your unsaved
            {{ store.draftLabel() }} draft.
          </span>
        </p>
      } @else {
        <p class="notice notice--ok">
          <mat-icon fontSet="material-icons-outlined" aria-hidden="true">check_circle</mat-icon>
          <span>All required actions are recorded. Submitting will resolve the case.</span>
        </p>
      }

      <label class="field">
        <span class="field__label">Decision</span>
        <textarea
          class="field__input"
          rows="5"
          aria-required="true"
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
      .field {
        display: grid;
        gap: 8px;
      }
      .field__label {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
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
      /**
       * One notice, two tones. Same box either way - 16px, a 20px outlined
       * icon, icon and text top-aligned so a second line does not float the
       * icon - so swapping mood never moves the dialog's layout.
       */
      .notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 16px;
        padding: 16px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 20px;
      }
      .notice mat-icon {
        flex: none;
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
      }
      .notice--ok {
        background: var(--success-bg-subtle);
        color: var(--success);
      }
      .notice--warn {
        background: var(--warn-bg);
        color: var(--warn);
      }
      .consequence {
        margin: 16px 0 0px;
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
