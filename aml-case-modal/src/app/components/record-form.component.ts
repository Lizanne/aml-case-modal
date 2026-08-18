import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import { CandidateFile, CaseStore } from '../core/case-store';
import { ATTACHMENT_MAX_MB, AttachmentKind } from '../core/models';
import { AttachmentListComponent } from './attachment-list.component';

/**
 * Rule 5. The record-form. Inline in the stream, replacing the placeholder it
 * came from - never a dialog, so the agent keeps the case in view while writing.
 *
 * Three things gate Save:
 *   - a text note (required)
 *   - an explicit keep-locked / unlock choice (no default, rule 5)
 *   - a snapshot that is in sync (rule 11 / open question 2 - the draft survives
 *     a mid-draft trigger, only Save is withheld)
 */
@Component({
  selector: 'record-form',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatRadioModule, AttachmentListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.draft(); as draft) {
      <form class="form" (submit)="$event.preventDefault(); save()">
        <header class="form__head">
          <h3 class="form__title">Record {{ draft.title.toLowerCase() }}</h3>
        </header>

        <!-- Open question 2: the draft is preserved; Save is what stops. -->
        @if (store.snapshotOutOfSync()) {
          <p class="warn-note" role="alert">
            <mat-icon fontSet="material-icons-outlined">sync_problem</mat-icon>
            Resync required. A new trigger arrived - resync the snapshot before saving this outcome.
            Your draft is kept.
          </p>
        }

        <label class="field">
          <span class="field__label">Note</span>
          <textarea
            class="field__input"
            rows="4"
            aria-required="true"
            [value]="draft.note"
            (input)="onNote($event)"
            placeholder="What did you do, and what did you find?"
          ></textarea>
          @if (draft.attempted && !draft.note.trim()) {
            <span class="field__error" role="alert">Add a note before saving.</span>
          }
        </label>

        <div class="field">
          <span class="field__label">
            Attachments <span class="field__optional">optional</span>
          </span>
          <p class="field__hint">PDF and images only. Up to {{ maxMb }} MB per file.</p>

          <attachment-list
            [attachments]="draft.attachments"
            [errors]="draft.errors"
            [removable]="true"
            (remove)="store.removeAttachment($event)"
            (dismiss)="store.dismissError($event)"
          />

          <div class="field__actions">
            <button mat-stroked-button type="button" (click)="picker.click()">
              <mat-icon>attach_file</mat-icon>
              Add files
            </button>
            <input
              #picker
              type="file"
              multiple
              accept="application/pdf,image/*"
              hidden
              (change)="onFiles($event)"
            />
          </div>
        </div>

        <!-- Rule 5: explicit choice, neither option styled as the recommended one. -->
        <fieldset class="field field--lock">
          <legend class="field__label">After saving <span class="field__hint">choose one</span></legend>
          <mat-radio-group
            class="lock-choice"
            [value]="draft.lockAfter"
            (change)="store.patchDraft({ lockAfter: $any($event).value })"
          >
            <mat-radio-button value="keep">Keep the case locked to me</mat-radio-button>
            <mat-radio-button value="release">Unlock the case</mat-radio-button>
          </mat-radio-group>
          @if (draft.attempted && draft.lockAfter === null) {
            <span class="field__error" role="alert">Choose what happens to the lock.</span>
          }
        </fieldset>

        <footer class="form__foot">
          <button mat-button type="button" (click)="store.cancelDraft()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="!store.draftValid()">
            Save outcome
          </button>
        </footer>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .form {
        border: 1px solid var(--primary);
        border-radius: 12px;
        background: var(--panel);
        padding: 16px 18px 12px;
        display: grid;
        gap: 16px;
      }
      .form__head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .form__title {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        color: var(--ink);
      }
      .warn-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0;
        padding: 16px;
        border-radius: 8px;
        background: var(--warn-bg);
        color: var(--warn);
        font-size: 14px;
        line-height: 20px;
      }
      .warn-note mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        flex: none;
      }
      .field {
        display: grid;
        gap: 8px;
        border: 0;
        padding: 0;
        margin: 0;
      }
      .field__label {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        padding: 0;
      }
      .field__hint,
      .field__optional {
        font-weight: 400;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
        margin-left: 2px;
      }
      .field__hint {
        margin: 0;
        font-size: 12px;
        color: var(--ink-3);
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
        background: var(--panel);
        resize: vertical;
      }
      .field__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -1px;
        border-color: var(--primary);
      }
      .field__error {
        font-size: 12px;
        color: var(--danger);
      }
      .field__actions {
        margin-top: 4px;
      }
      .lock-choice {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .form__foot {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        border-top: 1px solid var(--line);
        padding-top: 12px;
      }
    `,
  ],
})
export class RecordFormComponent {
  readonly store = inject(CaseStore);
  readonly maxMb = ATTACHMENT_MAX_MB;

  onNote(event: Event): void {
    this.store.patchDraft({ note: (event.target as HTMLTextAreaElement).value });
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) {
      this.store.addFiles(files.map((f) => this.toCandidate(f)));
    }
    // Reset so picking the same file twice still fires a change.
    input.value = '';
  }

  save(): void {
    this.store.saveDraft();
  }

  private toCandidate(file: File): CandidateFile {
    let kind: AttachmentKind = 'other';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) kind = 'pdf';
    else if (file.type.startsWith('image/')) kind = 'image';
    return { name: file.name, sizeKb: Math.round(file.size / 1024), kind };
  }
}
