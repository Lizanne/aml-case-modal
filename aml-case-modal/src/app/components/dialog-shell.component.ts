import { A11yModule, InputModalityDetector } from '@angular/cdk/a11y';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
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
    <!-- Inert. A scrim that dismisses is a way to lose a half-written note to
         a stray click; Cancel, Close and Escape are the ways out. -->
    <div class="scrim"></div>
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="headingId"
      tabindex="-1"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="false"
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
      /**
       * Fixed to the VIEWPORT, not to the panel it belongs to.
       *
       * A dialog scoped to .modal left the widgets, the player bar and the nav
       * outside its scrim and still clickable - which is not what aria-modal
       * claims. Fixed positioning puts the scrim over the whole composition,
       * so what the screen says matches what the focus trap enforces.
       */
      :host {
        position: fixed;
        inset: 0;
        z-index: 60;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .scrim {
        position: absolute;
        inset: 0;
        background: rgba(24, 24, 27, 0.42);
        animation: dialog-scrim 150ms ease-out;
      }
      /**
       * The dialog arrives; it does not pop. Centre origin, because a dialog
       * belongs to the viewport rather than to the button that opened it.
       * From 0.96, never from nothing. Entrance only: closing is the agent's
       * own act and the page behind is what they want next, so it is instant.
       *
       * Keyframes with no "to", so the panel ends on transform: none and is
       * not a containing block for anything fixed once it has settled.
       */
      @keyframes dialog-scrim {
        from {
          opacity: 0;
        }
      }
      @keyframes dialog-in {
        from {
          opacity: 0;
          transform: scale(0.96);
        }
      }
      @keyframes dialog-sheet {
        from {
          transform: translateY(100%);
        }
      }
      .panel {
        position: relative;
        outline: none;
        width: min(520px, 100%);
        max-height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--panel);
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(24, 24, 27, 0.26);
        overflow: hidden;
        animation: dialog-in 200ms var(--ease-out);
      }
      .panel__head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
      }
      .panel__title {
        flex: 1;
        margin: 0;
        font-size: 18px;
        line-height: 28px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .panel__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 0;
        /* The controls radius tier, 4 - shared with the header's window controls
           and the minimised bar's icon buttons, so every piece of chrome that
           closes something reads the same. */
        border-radius: 4px;
        background: transparent;
        color: var(--foreground-secondary);
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
        color: var(--foreground-primary);
      }
      .panel__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        /* Scrolling past the end of the form must not start scrolling the
           page behind the scrim. */
        overscroll-behavior: contain;
        padding: 16px 20px;
      }
      .panel__foot {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
      }
      /* Material gives a text button less side padding than a filled one, so
         Cancel sat visibly tighter than the action beside it. 16px on both
         puts the pair on the same rhythm. Applied in the shell rather than in
         two dialogs, so the third one cannot drift. */
      .panel__foot ::ng-deep .mat-mdc-button {
        padding-left: 16px;
        padding-right: 16px;
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
          padding: 0;
          place-items: end stretch;
        }
        .panel {
          width: auto;
          /* Edge to edge. With 16px of page down each side and none
             underneath it was neither a card floating clear of the screen
             nor a sheet attached to it. */
          /* dvh, with vh as the fallback: on a phone 90vh is measured against
             the screen with the browser's toolbar hidden, so with it showing
             the sheet's buttons sat under the toolbar. */
          max-height: 90vh;
          max-height: 90dvh;
          border-radius: 14px 14px 0 0;
          /* A sheet comes up from the edge it is attached to. */
          animation: dialog-sheet 300ms var(--ease-drawer);
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
        /* Clear of the home indicator on a phone with no home button. */
        .panel__foot {
          padding: 16px 16px max(16px, env(safe-area-inset-bottom));
        }
      }
      /* 32px to look at, 44px to hit, on anything pressed with a finger. */
      @media (pointer: coarse) {
        .panel__close {
          position: relative;
        }
        .panel__close::before {
          content: '';
          position: absolute;
          inset: -6px;
        }
      }

      /**
       * Under 400px there is not enough width for two buttons side by side
       * without one of them wrapping its label. Stack them full width, primary
       * first: column-reverse, because the primary is last in DOM order (which
       * is the correct reading order for a dialog's actions and must not
       * change to satisfy a layout).
       */
      /* Reduced motion keeps the fade and drops the travel. After the phone
         rule, so it wins there too. */
      @media (prefers-reduced-motion: reduce) {
        .panel {
          animation: dialog-scrim 150ms ease-out;
        }
      }

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
export class DialogShellComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) heading = '';
  /**
   * CSS selector for the control that should hold focus on open.
   *
   * Without it CDK's auto-capture takes the first tabbable, which is the Close
   * button - landing the user on the way OUT of a dialog they have just been
   * given. Each dialog names its own starting point instead: the field you are
   * there to fill, or Cancel when the confirmed action is destructive.
   */
  @Input() initialFocus?: string;
  @Output() dismiss = new EventEmitter<void>();

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly modality = inject(InputModalityDetector);

  readonly headingId = `dialog-heading-${++dialogSeq}`;

  /** Where focus was before the dialog opened, so it can be handed back. */
  private readonly opener = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    const target = this.initialFocus
      ? this.host.nativeElement.querySelector<HTMLElement>(this.initialFocus)
      : null;
    // Falls back to the panel itself rather than to the Close button, so focus
    // is inside the trap even when a named target is missing.
    // The ring is for someone who arrived by keyboard. Opened by a tap, a
    // click, or by landing on a dev state with the dialog already up, the
    // focus is still moved - it just is not drawn until a key is pressed.
    // A field you type in is the exception: its focus border says where the
    // typing will go, whatever opened the dialog.
    const el = target ?? this.host.nativeElement.querySelector<HTMLElement>('.panel');
    const typed = !!el?.matches('textarea, input:not([type=radio]):not([type=checkbox])');
    const options: FocusOptions & { focusVisible?: boolean } = { preventScroll: true };
    if (!typed) options.focusVisible = this.modality.mostRecentModality === 'keyboard';
    el?.focus(options);
  }

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
