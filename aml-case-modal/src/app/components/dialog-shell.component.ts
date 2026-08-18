import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

let dialogSeq = 0;

/**
 * Scrim + panel used by the three dialogs.
 *
 * Deliberately not MatDialog: the dev state switcher needs to land directly on
 * frames 00b / 05 / 06 with a dialog already open, which means dialog visibility
 * has to be a signal on the store rather than an imperative service call.
 *
 * Rolling our own means owing the accessibility MatDialog would have provided,
 * so this does all of it: a real CDK focus trap behind the aria-modal claim
 * (asserting aria-modal without trapping focus is worse than not asserting it),
 * focus captured into the panel on open and handed back to the opener on close,
 * Escape to dismiss, and labelling by the heading rather than a duplicated
 * string.
 */
@Component({
  selector: 'dialog-shell',
  standalone: true,
  imports: [MatIconModule, A11yModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'onEscape($event)',
  },
  template: `
    <div class="scrim" (click)="dismiss.emit()"></div>
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="headingId"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <div class="panel__head">
        <h2 class="panel__title" [id]="headingId">{{ heading }}</h2>
        <button type="button" class="panel__close" aria-label="Close" (click)="dismiss.emit()">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>
      <div class="panel__body">
        <ng-content />
      </div>
      <div class="panel__foot">
        <ng-content select="[dialogActions]" />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .scrim {
        position: absolute;
        inset: 0;
        background: rgba(24, 24, 27, 0.42);
      }
      .panel {
        position: relative;
        width: min(520px, 100%);
        max-height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--panel);
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(24, 24, 27, 0.26);
        overflow: hidden;
      }
      .panel__head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 18px 12px 20px;
      }
      .panel__title {
        flex: 1;
        margin: 0;
        font-size: 18px;
        line-height: 28px;
        font-weight: 600;
        color: var(--ink);
      }
      .panel__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .panel__close mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .panel__close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--ink);
      }
      .panel__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 0 20px 4px;
      }
      .panel__foot {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 14px 20px 16px;
      }

      /**
       * Mobile: a bottom sheet, not a floating box.
       *
       * The desktop dialog is absolutely positioned inside .modal, which is
       * fine while the modal is comfortably larger than the dialog. On a phone
       * the modal is barely wider than the dialog, so a centred box sat on top
       * of a clipped modal edge with no clear owner. Anchoring to the viewport
       * instead - position: fixed, hard to the bottom edge, rounded only where
       * it meets the screen - makes it read as a sheet over the whole page.
       *
       * position: fixed escapes .modal's overflow: hidden. It would NOT escape
       * a transformed ancestor, which .stage__modal is for the 300ms of its
       * entry animation; the animation ends on transform: none, so the
       * containing block goes with it.
       */
      @media (max-width: 719.98px) {
        :host {
          position: fixed;
          inset: 0;
          padding: 0;
          place-items: end stretch;
        }
        .panel {
          width: auto;
          /* Flush at the bottom, 16px of gutter at the sides - the same
             gutter the page and the modal use. */
          margin: 0 16px;
          max-height: 90vh;
          border-radius: 14px 14px 0 0;
          /* The sheet is the query container for its own footer, so the
             stacking rule is about the sheet's width rather than a viewport
             width that happens to imply it. */
          container-type: inline-size;
        }
        .panel__head {
          padding: 16px;
        }
        .panel__body {
          padding: 0 16px 4px;
        }
        .panel__foot {
          padding: 16px;
        }
      }

      /**
       * Under 400px there is not enough width for two buttons side by side
       * without one of them wrapping its label. Stack them full width, primary
       * first: column-reverse, because the primary is last in DOM order (which
       * is the correct reading order for a dialog's actions and must not
       * change to satisfy a layout).
       */
      @container (max-width: 400px) {
        .panel__foot {
          flex-direction: column-reverse;
          align-items: stretch;
          gap: 8px;
        }
        .panel__foot ::ng-deep .mat-mdc-button-base {
          width: 100%;
        }
      }
    `,
  ],
})
export class DialogShellComponent implements OnDestroy {
  @Input({ required: true }) heading = '';
  @Output() dismiss = new EventEmitter<void>();

  readonly headingId = `dialog-heading-${++dialogSeq}`;

  /** Where focus was before the dialog opened, so it can be handed back. */
  private readonly opener = document.activeElement as HTMLElement | null;

  onEscape(event: Event): void {
    event.stopPropagation();
    this.dismiss.emit();
  }

  ngOnDestroy(): void {
    // Without this, focus falls back to <body> on close and a keyboard user
    // resumes from the top of the document.
    this.opener?.focus?.();
  }
}
