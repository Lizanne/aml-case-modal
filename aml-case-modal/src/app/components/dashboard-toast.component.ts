import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';

import { AmlDashboardStore } from '../core/aml-dashboard-store';

/** Long enough to read two short sentences and reach for Undo. */
const VISIBLE_MS = 6000;

/** The exit, in step with toast-out below. Shorter than the 220ms entrance. */
const EXIT_MS = 150;

/**
 * What the dashboard says back after an override is saved, revoked or
 * restored.
 *
 * It exists for the revoke. Saving shows its result where the agent is
 * looking - a note and a pill appear on the row. Revoking shows its result as
 * an ABSENCE: the note goes, and nothing arrives to say so. It is also one
 * press with no confirmation, so this is where the way back lives.
 *
 * The message is in a live region, so it is spoken as well as shown. The
 * timer stops while the pointer or the keyboard is on the toast, and while
 * the tab is in the background - a notice nobody was there to read has not
 * been read.
 */
@Component({
  selector: 'dashboard-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <div class="live" role="status" aria-live="polite">
      @if (shown(); as notice) {
        <!-- Keyed on seq: a second notice replaces the first as a new
             element, so it enters again rather than changing its words. -->
        @for (n of [notice]; track n.seq) {
          <div
            class="toast"
            [class.toast--leaving]="leaving()"
            (mouseenter)="pause()"
            (mouseleave)="resume()"
            (focusin)="pause()"
            (focusout)="resume()"
          >
            <span class="toast__text">{{ n.message }}</span>
            @if (n.undo; as undo) {
              <button class="toast__undo" type="button" (click)="undo()">Undo</button>
            }
            <button class="toast__close" type="button" aria-label="Dismiss" (click)="store.dismissNotice()">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      /* Bottom centre: the minimised case bars dock bottom right, and the
         two must never be stacked on each other. */
      .live {
        position: fixed;
        left: 50%;
        bottom: 24px;
        z-index: 50;
        transform: translateX(-50%);
        width: max-content;
        max-width: calc(100vw - 32px);
        pointer-events: none;
      }
      /* On a phone the minimised bars are pinned to the same bottom edge and
         there is no room beside them, so the toast sits above them. --dock-h
         is the bars plus their clearance, and 0 when there are none. */
      @media (max-width: 719.98px) {
        .live {
          bottom: max(24px, calc(var(--dock-h, 0px) - 24px));
        }
      }
      .toast {
        display: flex;
        align-items: center;
        gap: var(--lds-core-spacing-1, 4px);
        padding: 6px 6px 6px var(--lds-core-spacing-4, 16px);
        border-radius: 12px;
        background: var(--foreground-primary);
        color: var(--panel);
        font-size: 14px;
        line-height: 20px;
        box-shadow:
          0 1px 2px rgba(24, 24, 27, 0.12),
          0 8px 24px rgba(24, 24, 27, 0.2);
        pointer-events: auto;
        animation: toast-in 220ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
      }
      /* Out the way it came in, and quicker: the agent has finished with it.
         No pointer events on the way out, so a press meant for the page
         behind does not land on a toast that is already going. */
      .toast--leaving {
        pointer-events: none;
        animation: toast-out 150ms var(--ease-out) forwards;
      }
      @keyframes toast-out {
        to {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
      }
      @keyframes toast-fade {
        from {
          opacity: 0;
        }
      }
      @keyframes toast-fade-out {
        to {
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast {
          animation: toast-fade 120ms ease-out;
        }
        .toast--leaving {
          animation: toast-fade-out 120ms ease-out forwards;
        }
      }
      .toast__text {
        margin-right: var(--lds-core-spacing-2, 8px);
        font-variant-numeric: tabular-nums;
      }
      .toast__undo,
      .toast__close {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
        touch-action: manipulation;
        transition:
          background-color 150ms ease-out,
          transform 120ms ease-out;
      }
      .toast__undo {
        padding: 0 12px;
        font-weight: 600;
      }
      .toast__close {
        width: 32px;
        color: rgba(255, 255, 255, 0.7);
      }
      /* 32px to look at, 44px to hit. */
      .toast__undo::before,
      .toast__close::before {
        content: '';
        position: absolute;
        inset: -6px 0;
      }
      .toast__undo:active,
      .toast__close:active {
        transform: scale(0.97);
      }
      @media (hover: hover) and (pointer: fine) {
        .toast__undo:hover,
        .toast__close:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
        }
      }
      .toast__undo:focus-visible,
      .toast__close:focus-visible {
        outline: 2px solid #fff !important;
        outline-offset: 0;
        box-shadow: none !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .toast__undo,
        .toast__close {
          transition: none;
        }
        .toast__undo:active,
        .toast__close:active {
          transform: none;
        }
      }
    `,
  ],
})
export class DashboardToastComponent implements OnDestroy {
  readonly store = inject(AmlDashboardStore);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private remaining = VISIBLE_MS;
  private startedAt = 0;
  private held = false;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * What is on screen, which outlives the store's notice by the length of the
   * exit: the store clears at once, the toast needs 150ms to leave.
   */
  readonly shown = signal<ReturnType<AmlDashboardStore['notice']>>(null);
  readonly leaving = signal(false);

  /** Every new notice gets the full time, whatever the last one had left. */
  private readonly onNotice = effect(
    () => {
      const notice = this.store.notice();
      this.stop();
      if (this.exitTimer) clearTimeout(this.exitTimer);
      this.exitTimer = null;
      if (notice) {
        // A notice arriving mid-exit replaces the one leaving outright.
        this.shown.set(notice);
        this.leaving.set(false);
        this.remaining = VISIBLE_MS;
        this.held = false;
        this.start();
        return;
      }
      if (!untracked(this.shown)) return;
      this.leaving.set(true);
      this.exitTimer = setTimeout(() => {
        this.shown.set(null);
        this.leaving.set(false);
      }, EXIT_MS);
    },
    { allowSignalWrites: true },
  );

  pause(): void {
    this.held = true;
    this.freeze();
  }

  resume(): void {
    this.held = false;
    if (this.store.notice() && !document.hidden) this.start();
  }

  onVisibility(): void {
    if (!this.store.notice()) return;
    if (document.hidden) this.freeze();
    else if (!this.held) this.start();
  }

  ngOnDestroy(): void {
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.stop();
  }

  private start(): void {
    this.stop();
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.store.dismissNotice(), this.remaining);
  }

  private freeze(): void {
    if (!this.timer) return;
    this.remaining = Math.max(1000, this.remaining - (Date.now() - this.startedAt));
    this.stop();
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
