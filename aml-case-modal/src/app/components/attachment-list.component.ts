import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { FileSizePipe } from '../core/format';
import { Attachment, AttachmentError } from '../core/models';

/**
 * The one and only attachment chip. Wrapping chips of name + size.
 *
 * `removable` is the single switch between the two states this chip has:
 *   - draft (rule 5): every chip carries a remove X that drops it from the
 *     draft immediately, no confirmation.
 *   - saved (rule 6): no remove affordance at all, because outcomes are
 *     immutable.
 *
 * There is deliberately no second implementation - a saved chip and a draft
 * chip differ by this input and nothing else, so they cannot drift apart.
 *
 * Errors render per file, inline, and never remove the files that did validate.
 */
@Component({
  selector: 'attachment-list',
  standalone: true,
  imports: [MatIconModule, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (attachments.length) {
      <ul class="files" [attr.aria-label]="removable ? 'Attachments in this draft' : 'Attachments'">
        @for (file of attachments; track file.id) {
          <li class="file">
            <mat-icon class="file__icon" fontSet="material-icons-outlined" aria-hidden="true">{{
              file.kind === 'pdf' ? 'picture_as_pdf' : 'image'
            }}</mat-icon>
            <span class="file__name">{{ file.name }}</span>
            <span class="file__size">{{ file.sizeKb | fileSize }}</span>
            @if (removable) {
              <button
                type="button"
                class="file__remove"
                [attr.aria-label]="'Remove ' + file.name"
                (click)="remove.emit(file.id)"
              >
                <mat-icon>close</mat-icon>
              </button>
            }
          </li>
        }
      </ul>
    }

    @if (errors.length) {
      <!-- aria-live, not role="alert": role="alert" replaces the list role,
           which orphans the <li> children and breaks list semantics. -->
      <ul class="errors" aria-live="assertive" aria-label="Files that were not added">
        @for (error of errors; track error.id) {
          <li class="error">
            <mat-icon class="error__icon">error_outline</mat-icon>
            <span class="error__message">{{ error.message }}</span>
            <button
              type="button"
              class="error__dismiss"
              [attr.aria-label]="'Dismiss error for ' + error.file"
              (click)="dismiss.emit(error.id)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .files {
        display: flex;
        flex-wrap: wrap;
        min-width: 0;
        gap: 8px;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .file {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
        padding: 5px 8px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--page);
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
      }
      /* mat-icon.<class>: Material's own .mat-icon sets 24px at the same class
         specificity, so the element tag is what wins. */
      mat-icon.file__icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        flex: none;
        color: var(--ink-3);
      }
      .file__name {
        color: var(--ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .file__size {
        color: var(--ink-3);
        font-variant-numeric: tabular-nums;
      }
      .file__remove,
      .error__dismiss {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .file__remove:hover,
      .error__dismiss:hover {
        background: rgba(0, 0, 0, 0.06);
        color: var(--ink);
      }
      .file__remove mat-icon,
      .error__dismiss mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .errors {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
        display: grid;
        gap: 6px;
      }
      .error {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 8px 8px 10px;
        border-radius: 8px;
        background: var(--danger-bg);
        color: var(--danger);
        font-size: 14px;
        line-height: 20px;
      }
      .error__icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex: none;
      }
      .error__message {
        flex: 1;
      }
      .error__dismiss {
        color: var(--danger);
        flex: none;
      }
    `,
  ],
})
export class AttachmentListComponent {
  @Input({ required: true }) attachments: Attachment[] = [];
  @Input() errors: AttachmentError[] = [];
  /**
   * True only while a record-form is in draft. Saved outcomes are immutable
   * (rule 6), so their chips render without the remove control.
   */
  @Input() removable = false;

  @Output() remove = new EventEmitter<string>();
  @Output() dismiss = new EventEmitter<string>();
}
