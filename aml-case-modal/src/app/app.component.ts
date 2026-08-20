import { animate, style, transition, trigger } from '@angular/animations';
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
  signal,
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
  /**
   * The drawer convention: a panel arrives from the right edge and leaves the
   * same way, 300ms ease-out.
   *
   * :leave takes the panel out of flow first. Left in flow it would hold its
   * width for the whole 300ms and the survivor could not start widening until
   * it had gone - two sequential moves instead of the one continuous one the
   * spec asks for.
   */
  animations: [
    trigger('panel', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        style({ position: 'absolute', top: 0, right: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(100%)', opacity: 0 })),
      ]),
    ]),
  ],
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

      <!--
        Rendered straight from the open order, so the DOM order IS the dock
        order: incumbent left, newest right. No component knows which side it
        is on, because no side is assigned to it.
      -->
      <div class="stage" #stage [@.disabled]="reducedMotion()">
        @for (id of ws.visibleOrder(); track id) {
          @if (id === 'sg') {
            <sg-alert-modal class="stage__modal" @panel />
          } @else {
            <aml-case-modal class="stage__modal" @panel />
          }
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
      /* Right-docked, per frame 09: a solo panel sits against the right edge of
         the content area rather than centred, so opening a second one pushes
         the first leftward instead of shunting both sideways.
         position: relative is what the leaving panel is absolute against. */
      .stage {
        position: relative;
        display: flex;
        justify-content: flex-end;
        align-items: flex-start;
        gap: 16px;
        min-width: 0;
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


      /**
       * Mobile: one 16px gutter, everywhere.
       *
       * The modal takes its width from the measured stage, so narrowing the
       * page padding is what gives it calc(100vw - 32px) - there is no second
       * width rule to keep in step, and nothing needs !important to beat the
       * inline width the workspace sets.
       */
      @media (max-width: 719.98px) {
        .page {
          padding-left: 16px;
          padding-right: 16px;
          padding-bottom: 96px;
        }
        .page__dev {
          padding: 16px;
        }
        .dock {
          padding: 12px 16px;
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

  /**
   * Angular animations do not consult prefers-reduced-motion, so the trigger
   * is disabled outright rather than sped up - a slide is a slide.
   */
  private readonly motionQuery =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  readonly reducedMotion = signal(this.motionQuery?.matches ?? false);

  private readonly zone = inject(NgZone);

  @ViewChild('stage') private stage?: ElementRef<HTMLElement>;
  private observer?: ResizeObserver;

  ngAfterViewInit(): void {
    this.motionQuery?.addEventListener('change', this.onMotionChange);

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
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.observer?.disconnect();
  }

  private readonly onMotionChange = (event: MediaQueryListEvent): void =>
    this.zone.run(() => this.reducedMotion.set(event.matches));
}
