import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentInjector,
  ViewChild,
  afterNextRender,
  effect,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import { CandidateFile, CaseStore } from '../core/case-store';
import { ATTACHMENT_MAX_MB, AttachmentKind, Draft } from '../core/models';
import { AttachmentListComponent } from './attachment-list.component';
import { SectionRiskTableComponent } from './section-risk-table.component';

/**
 * Rule 5. The record-form. Inline in the stream, replacing the placeholder it
 * came from - never a dialog, so the agent keeps the case in view while writing.
 *
 * What gates Save:
 *   - a text note (required)
 *   - a keep-locked / unlock choice, preselected to keep (rule 5)
 *   - Assess risk only: a Risk answer, Yes or No
 *   - Finalize only: every field assessed (no Action required left)
 *
 * A new trigger no longer blocks Save, so the out-of-sync notice is gone.
 *
 * Three variants of one form, not three forms:
 *   - Record (contact, note): note and attachments
 *   - Assess risk - <field>: note, attachments, then Risk Yes/No beside them
 *   - Finalize risk assessment: the section table and a note, no attachments
 */
@Component({
  selector: 'record-form',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    AttachmentListComponent,
    SectionRiskTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.draft(); as draft) {
      <form
        class="form"
        #form
        aria-labelledby="record-form-title"
        (submit)="$event.preventDefault(); save()"
      >
        <header class="form__head">
          <h3 class="form__title" id="record-form-title">{{ heading(draft) }}</h3>
        </header>

        <!-- A start that was refused because this draft has work in it. -->
        @if (store.draftConflict(); as conflict) {
          <p class="conflict" role="alert">
            <mat-icon fontSet="material-icons-outlined" aria-hidden="true">info</mat-icon>
            <span>{{ conflict }}</span>
          </p>
        }

        @if (draft.actionType === 'finalize-risk-assessment') {
          <!-- What is being finalized, before the note about it. Live: it is
               the Risk assessment as it stands right now. -->
          <div class="field">
            <span class="field__label">Risk by section</span>
            <p class="field__hint">A section is a risk if any field in it is.</p>
            <section-risk-table [rows]="store.sectionRisks()" />
          </div>
        }

        <label class="field">
          <span class="field__label">Note</span>
          <textarea
            class="field__input"
            rows="4"
            aria-required="true"
            [attr.aria-invalid]="draft.attempted && !draft.note.trim() ? 'true' : null"
            [value]="draft.note"
            (input)="onNote($event)"
            (keydown)="onKeydown($event)"
            [placeholder]="placeholder(draft)"
          ></textarea>
          @if (draft.attempted && !draft.note.trim()) {
            <span class="field__error" role="alert">Add a note before saving.</span>
          }
        </label>

        @if (draft.actionType !== 'finalize-risk-assessment') {
        <div class="field">
          <span class="field__label">
            Attachments <span class="field__optional">(optional)</span>
          </span>
          <p class="field__hint">JPG or PNG only. Up to {{ maxMb }} MB per file.</p>

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
              accept="image/*"
              hidden
              (change)="onFiles($event)"
            />
          </div>
        </div>
        }

        <!--
          Assess risk only. The agent's call on the field, after the evidence.

          Radios, labelled with the outcomes - the same words the field's row,
          its chip and its card will show - so nothing has to be translated
          from a Yes or a No. Radios and not pills: a status pill is a label
          everywhere else in this product (or, on the Risk assessment row, the
          way in to this form), and an input that looks like a label is one
          shape with two meanings. The lock choice beneath is a radio group
          too, so the form has one input vocabulary. Prefilled with the
          field's current status when it has one; empty, so the agent must
          choose, when it is Action required.
        -->
        @if (draft.actionType === 'assess-risk') {
          <fieldset class="field field--risk">
            <legend class="field__label">Your assessment</legend>
            <mat-radio-group
              class="choice"
              aria-label="Your assessment"
              [value]="draft.risk"
              (change)="store.patchDraft({ risk: $any($event).value })"
            >
              <mat-radio-button value="risk">Risk flagged</mat-radio-button>
              <mat-radio-button value="no-risk">No risk</mat-radio-button>
            </mat-radio-group>
            @if (draft.attempted && !draft.risk) {
              <span class="field__error" role="alert">Choose whether this field is a risk.</span>
            }
          </fieldset>
        }

        <!-- Rule 5, revised: the choice now ships PRESELECTED to keep, because
             keeping the lock is the common case and an empty required question
             is one more thing to fill in. Neither option is styled as
             recommended; the default is carried by selection alone. -->
        <fieldset class="field field--lock">
          <legend class="field__label">After saving</legend>
          <mat-radio-group
            class="choice"
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
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="!store.draftValid()">
            {{ saveLabel(draft) }}
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
        padding: 16px;
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
        color: var(--foreground-primary);
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
        color: var(--foreground-primary);
        padding: 0;
      }
      .field__hint,
      .field__optional {
        font-weight: 400;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
        margin-left: 2px;
      }
      .field__hint {
        margin: 0;
        font-size: 12px;
        color: var(--foreground-secondary);
      }
      .field__input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        color: var(--foreground-primary);
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
      .field__actions button {
        padding-left: 16px;
        padding-right: 16px;
      }
      .field__actions mat-icon.mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      /* Information, not a warning: nothing is wrong, the agent just has to
         finish one thing before starting the next. */
      .conflict {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--color-background-info-subdued);
        color: var(--color-foreground-on-info);
        font-size: 14px;
        line-height: 20px;
      }
      .conflict mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        flex: none;
      }
      .choice {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      /* No rule above the footer: the separation is carried by space alone.
         .form is a 16 grid, so 16 more here makes the 32 that reads as a
         break without drawing one. */
      .form__foot {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }
      /* Material gives a text button less side padding than a filled one, so
         Cancel sat visibly tighter than Save outcome beside it - 8px against
         16. The same rule dialog-shell already applies to its own footer; this
         footer is not one of those, so it states it for itself rather than
         inheriting by accident. */
      .form__foot ::ng-deep .mat-mdc-button {
        padding-left: 16px;
        padding-right: 16px;
      }
    `,
  ],
})
export class RecordFormComponent {
  readonly store = inject(CaseStore);
  readonly maxMb = ATTACHMENT_MAX_MB;
  /** Outlives this form: focus is handed back after the form is gone. */
  private readonly env = inject(EnvironmentInjector);

  @ViewChild('form') private formEl?: ElementRef<HTMLFormElement>;

  /**
   * Bring the form into view and put the cursor in the note whenever the
   * store asks: on open from a risk status, and again when another start was
   * refused because this draft has work in it. The flag is cleared each
   * time, so a reflow rebuilding the form does not yank the stream back.
   */
  constructor() {
    effect(
      () => {
        if (!this.store.draft()?.reveal) return;
        afterNextRender(
          () => {
            const form = this.formEl?.nativeElement;
            if (!form) return;
            this.store.patchDraft({ reveal: false });
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            form.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
            // Not on touch: focusing would throw the keyboard over the form.
            if (!('ontouchstart' in window)) form.querySelector('textarea')?.focus({ preventScroll: true });
          },
          { injector: this.env },
        );
      },
      { allowSignalWrites: true },
    );
  }

  heading(draft: Draft): string {
    if (draft.actionType === 'assess-risk' || draft.actionType === 'finalize-risk-assessment') {
      return draft.title;
    }
    return `Record ${draft.title.toLowerCase()}`;
  }

  placeholder(draft: Draft): string {
    if (draft.actionType === 'assess-risk') return 'What did you check, and what did you find?';
    if (draft.actionType === 'finalize-risk-assessment') {
      return 'Summarise the overall risk and what it rests on.';
    }
    return 'What did you do, and what did you find?';
  }

  saveLabel(draft: Draft): string {
    if (draft.actionType === 'assess-risk') return 'Save assessment';
    if (draft.actionType === 'finalize-risk-assessment') return 'Finalize';
    return 'Save outcome';
  }

  /** Enter is a new line in a note; Cmd or Ctrl+Enter saves. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.save();
    }
  }

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
    const draft = this.store.draft();
    if (draft && this.store.saveDraft()) this.returnFocus(draft, 'saved');
  }

  cancel(): void {
    const draft = this.store.draft();
    this.store.cancelDraft();
    if (draft) this.returnFocus(draft, 'cancelled');
  }

  /**
   * Where focus goes once the form is gone. Without this it fell to the page
   * body, sending a keyboard user back to the top of the page.
   *
   *   - opened from a risk status: back to that status, the panel brought
   *     forward again in the segmented layout. If the status is a label now
   *     (the save released the lock), its info button.
   *   - saved otherwise: the new outcome card, which is what just happened.
   *   - cancelled otherwise: the placeholder it came from, or Add action.
   */
  private returnFocus(draft: Draft, how: 'saved' | 'cancelled'): void {
    if (draft.returnTo && this.store.layoutNarrow()) this.store.activeSegment.set('player-info');
    afterNextRender(
      () => {
        const q = (sel: string) => document.querySelector<HTMLElement>(sel);
        let target: HTMLElement | null = null;
        if (draft.returnTo) {
          const row = `risk-assessment [data-field="${draft.returnTo}"]`;
          target = q(`${row} risk-status button`) ?? q(`${row} .ra-info`);
        } else if (how === 'saved') {
          const cards = document.querySelectorAll<HTMLElement>('workflow-panel outcome-card .card');
          target = cards[cards.length - 1] ?? null;
        } else {
          const key = draft.actionType === 'assess-risk' ? `assess:${draft.riskFieldId}` : draft.actionType;
          target = draft.fromPlaceholder
            ? q(`action-placeholder[data-key="${key}"] button`)
            : q('workflow-panel .stream__add button');
        }
        target?.focus();
      },
      { injector: this.env },
    );
  }

  private toCandidate(file: File): CandidateFile {
    // Anything that is not an image is 'other', which is the kind addFiles
    // rejects. The PDF branch went with PDF support - a file the picker cannot
    // offer any more, since accept is image/* - but accept is a hint, not a
    // guarantee, and a dragged PDF still has to land somewhere.
    const kind: AttachmentKind = file.type.startsWith('image/') ? 'image' : 'other';
    return { name: file.name, sizeKb: Math.round(file.size / 1024), kind };
  }
}
