import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
} from '@angular/core';

import { AmlCaseModalComponent } from './components/aml-case-modal.component';
import { BackOfficeWidgetsComponent } from './components/back-office-widgets.component';
import { MinimisedBarComponent } from './components/minimised-bar.component';
import { SgAlertModalComponent } from './components/sg-alert-modal.component';
import { WorkspaceStore } from './core/workspace-store';
import { DevStateSwitcherComponent } from './dev/dev-state-switcher.component';

/**
 * The back office page: widgets, the stage the modals dock into, and the bar
 * dock along the bottom edge.
 *
 * Docking order is fixed in the template - SG first, AML second - so a modal
 * never moves because of the order it was opened in.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AmlCaseModalComponent,
    SgAlertModalComponent,
    BackOfficeWidgetsComponent,
    MinimisedBarComponent,
    DevStateSwitcherComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--dock-h.px]': 'dockHeight()',
  },
  template: `
    <a class="skip-link" href="#workspace">Skip to case workspace</a>

    <!-- The dev harness is not product content, so it sits outside <main> in
         its own labelled complementary landmark. -->
    <aside class="page__dev" aria-label="Prototype dev harness">
      <dev-state-switcher />
    </aside>

    <main class="page" id="workspace">
      <h1 class="visually-hidden">AML case workspace</h1>
      <back-office-widgets />

      <div class="stage" #stage>
        @if (ws.sgVisible()) {
          <sg-alert-modal class="stage__modal" />
        }
        @if (ws.amlVisible()) {
          <aml-case-modal class="stage__modal" />
        }
      </div>
    </main>

    @if (ws.minimisedBars().length) {
      <div class="dock">
        @for (id of ws.minimisedBars(); track id) {
          <minimised-bar [id]="id" />
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--page);
      }
      .page {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 20px 120px;
        display: grid;
        gap: 16px;
      }
      .page__dev {
        display: block;
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px 20px 16px;
      }
      /* Visible only on focus - the first thing a keyboard user reaches. */
      .skip-link {
        position: absolute;
        left: 8px;
        top: -48px;
        z-index: 40;
        padding: 10px 14px;
        border-radius: 8px;
        background: var(--panel);
        color: var(--primary-ink);
        font-weight: 600;
        text-decoration: none;
        box-shadow: 0 4px 14px rgba(24, 24, 27, 0.18);
        transition: top 120ms ease-out;
      }
      .skip-link:focus-visible {
        top: 8px;
      }
      @media (prefers-reduced-motion: reduce) {
        .skip-link {
          transition: none;
        }
      }
      .stage {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        gap: 16px;
        min-width: 0;
      }
      /* The entering modal slides in beside the incumbent while the incumbent
         animates down to half width. Transform and opacity only, so it never
         intercepts or blocks input during the move. */
      .stage__modal {
        animation: modal-in 300ms ease-out both;
      }
      @keyframes modal-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.995);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* Bars dock to the bottom edge and stack. */
      .dock {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 30;
        display: grid;
        gap: 8px;
        max-width: 1400px;
        margin: 0 auto;
        padding: 12px 20px;
      }

      @media (prefers-reduced-motion: reduce) {
        .stage__modal {
          animation: none;
        }
      }
    `,
  ],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  readonly ws = inject(WorkspaceStore);

  /**
   * Height the docked bars occupy, published as --dock-h so the modals can
   * subtract it. Without this a bar overlaps the survivor's pinned footer,
   * which is exactly the control the agent needs.
   */
  readonly dockHeight = computed(() => {
    const n = this.ws.minimisedBars().length;
    return n === 0 ? 0 : 24 + n * 46 + (n - 1) * 8;
  });

  private readonly zone = inject(NgZone);

  @ViewChild('stage') private stage?: ElementRef<HTMLElement>;
  private observer?: ResizeObserver;

  ngAfterViewInit(): void {
    const element = this.stage?.nativeElement;
    if (!element) return;

    this.observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (!w) return;
      // Inside the zone: in Angular 17 a signal written from an unpatched async
      // callback marks the view dirty but does not schedule change detection,
      // so the reflow would not actually happen until some unrelated event.
      this.zone.run(() => this.ws.stageWidth.set(w));
    });
    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
