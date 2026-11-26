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
  effect,
  inject,
  signal,
} from '@angular/core';

import { AppTopBarComponent } from './chrome/app-top-bar.component';
import { PlayerHeaderComponent } from './chrome/player-header.component';
import { SideNavComponent } from './chrome/side-nav.component';
import { AmlCaseModalComponent } from './components/aml-case-modal.component';
import { AmlDashboardComponent } from './components/aml-dashboard.component';
import { CreateCaseDialogComponent } from './components/create-case-dialog.component';
import { DashboardToastComponent } from './components/dashboard-toast.component';
import { ScoreOverrideDialogComponent } from './components/score-override-dialog.component';
import { AmlDashboardStore } from './core/aml-dashboard-store';
import { AttachmentPreviewComponent } from './components/attachment-preview.component';
import { BackOfficeWidgetsComponent } from './components/back-office-widgets.component';
import { ConfirmUnlockDialogComponent } from './components/confirm-unlock-dialog.component';
import { MinimisedBarComponent } from './components/minimised-bar.component';
import { SgAlertModalComponent } from './components/sg-alert-modal.component';
import { AttachmentPreviewStore } from './core/attachment-preview-store';
import { CaseStore } from './core/case-store';
import { CasesStore } from './core/cases-store';
import { MODAL_GAP_PX } from './core/models';
import { NavStore } from './core/nav-store';
import { CasesTableComponent } from './components/cases-table.component';
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
    AmlDashboardComponent,
    ScoreOverrideDialogComponent,
    CreateCaseDialogComponent,
    DashboardToastComponent,
    AttachmentPreviewComponent,
    ConfirmUnlockDialogComponent,
    SgAlertModalComponent,
    BackOfficeWidgetsComponent,
    MinimisedBarComponent,
    DevStateSwitcherComponent,
    AppTopBarComponent,
    PlayerHeaderComponent,
    SideNavComponent,
    CasesTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--dock-h.px]': 'dockHeight()',
    '(document:keydown.escape)': 'onEscape()',
  },
  /**
   * The drawer convention: a panel arrives from the right edge, 300ms ease-out.
   *
   * :leave takes the panel out of flow first. Left in flow it would hold its
   * width for the whole 300ms and the survivor could not start widening until
   * it had gone - two sequential moves instead of the one continuous one the
   * spec asks for.
   *
   * BUT A PANEL LEAVES FROM ITS OWN COLUMN, and that is what decides how it
   * leaves. Out of flow, it has to be re-anchored, and the anchor used to be
   * right: 0 for every panel - true of the right-hand one, and a lie about the
   * left-hand one, which teleported a full column and gap to the right edge on
   * the first frame, landing on top of the panel that was still there, before
   * it began to slide. Two panels jumping in opposite directions in one frame:
   * the closing one 604px right, the survivor 516px wider.
   *
   * So there are two exits, chosen by whether the panel is the last one on the
   * stage:
   *
   *   tail   the right-hand panel, or a solo one. It is already against the
   *          edge it entered from, so it leaves the way it arrived - out to
   *          the right, the drawer convention exactly.
   *
   *   inner  anything with a panel to its right. It has nowhere to go: sliding
   *          out would carry it straight across its neighbour, which is the
   *          one thing the convention must not do. It dissolves in place with
   *          a gap's worth of drift, and the survivor widens underneath it.
   *
   * The fade is not decoration. It is what covers the survivor's reflow, which
   * is instant by design - the same job the newcomer's slide does on the way
   * in, and the job nothing was doing on the way out.
   */
  animations: [
    trigger('panel', [
      transition('void => *', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
      transition('tail => void', [
        style({ position: 'absolute', top: 0, right: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(100%)', opacity: 0 })),
      ]),
      transition('inner => void', [
        // left: 0 - the stage is the panels' own box, so the first column
        // starts on its left edge. No measurement, and nothing to keep in step.
        style({ position: 'absolute', top: 0, left: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: `translateX(${MODAL_GAP_PX}px)`, opacity: 0 }),
        ),
      ]),
    ]),
  ],
  template: `
    <a class="skip-link" href="#workspace">Skip to case workspace</a>

    <!-- The dev harness is not product content, so it sits outside the app
         shell entirely, above the chrome, in its own labelled landmark. -->
    <aside class="page__dev" aria-label="Prototype dev harness">
      <dev-state-switcher />
    </aside>

    <!--
      Frame 09's composition. The panels live INSIDE the main column, below the
      player bar and beside the nav, so they can never cover either: they are
      in normal flow, not an overlay. The nav stays reachable throughout.
    -->
    <app-top-bar />

    <div class="shell">
      <aside class="shell__nav">
        <side-nav />
      </aside>

      <div class="shell__main">
        <!-- Two views, one shell. The top bar and the nav are the Back Office
             and stay put; only the working area changes. -->
        @if (nav.view() === 'cases') {
          <main class="page page--cases" id="workspace">
            <cases-table />
          </main>
        } @else {
        <player-header />

        <main class="page" id="workspace">
          <!--
            No scrim, in any state. The widget row stays above the panel and
            the page beneath is simply the page - there is nothing here that
            the agent is being kept out of, so there is nothing to dim.
          -->
          <back-office-widgets />

      <!--
        Rendered straight from the open order, so the DOM order IS the dock
        order: incumbent left, newest right. No component knows which side it
        is on, because no side is assigned to it.
      -->
          <div class="stage" #stage [@.disabled]="reducedMotion()">
            <!--
              The player-details section, when one is showing. It is the PAGE:
              it lies under the panels, in the stage's own box, and a panel
              that opens covers it the way it covers anything else on the page.
              While covered it is inert and hidden, so neither the keyboard nor
              the 16px between two panels can find it.
            -->
            @if (nav.section() === 'aml-risks') {
              <aml-dashboard
                class="stage__page"
                tabindex="-1"
                [class.stage__page--covered]="ws.visibleOrder().length > 0"
                [attr.inert]="ws.visibleOrder().length > 0 ? '' : null"
              />
            }
            @for (id of ws.visibleOrder(); track id; let last = $last) {
              <!--
                The animation state is the panel's POSITION, which is what its
                exit depends on. A component keeps its last-bound state when it
                is removed, so the panel that closes leaves by the rule that
                applied while it was still on the stage.

                A surviving panel promoted from inner to tail changes state
                too. No inner <=> tail transition is declared, so nothing
                animates: its width is already reflowing, and a second motion
                on top of that would be the abruptness by another route.
              -->
              @if (id === 'sg') {
                <sg-alert-modal class="stage__modal" [@panel]="last ? 'tail' : 'inner'" />
              } @else {
                <aml-case-modal class="stage__modal" [@panel]="last ? 'tail' : 'inner'" />
              }
            }
          </div>

          <!--
            The dock lives INSIDE .page, which is the same box the panels are
            laid out in - so its right edge is their right edge at every width,
            with no offset to keep in step. Minimise and restore then read as
            the panel shrinking into and growing out of the same corner.
          -->
          @if (ws.minimisedBars().length) {
            <div class="dock">
              @for (id of ws.minimisedBars(); track id) {
                <minimised-bar [id]="id" />
              }
            </div>
          }
        </main>
        }
      </div>
    </div>

    <!--
      Outside .shell, because the preview covers the whole composition rather
      than the page inside it. position: fixed would escape .page's overflow
      anyway; what it would NOT escape is a transformed ancestor, and
      .stage__modal is transformed for the 300ms of its entry animation.
      Sitting at the top level, it never has one.
    -->
    @if (preview.current(); as file) {
      <attachment-preview [file]="file" (dismiss)="preview.close()" />
    }

    <!--
      Force unlock is offered in two places - the panel's lock band and the
      AML widget - and the widget shows its actions only while the panel is
      CLOSED. Hosted inside the panel, as it was, the widget's button set
      openDialog and then had nothing to render into, so it did nothing at
      all. Here it does not care whether a panel exists.

      Severity and decision stay inside the panel: both are reached from
      controls in it, so neither can be asked for while it is shut.
    -->
    @if (store.openDialog() === 'confirm-unlock') {
      <confirm-unlock-dialog />
    }
    <!--
      The same dialog, asked for by a row in the cases table instead of by the
      widget. Hosted HERE rather than inside cases-table for the reason the
      block above exists: an overlay owned by the thing that triggers it
      disappears with it, and the table is not guaranteed to be on screen for
      the whole life of the dialog.

      Two @ifs rather than one @else if: the (expr; as name) form of @else if
      is not supported in Angular 17, and the two conditions are exclusive
      in practice anyway - one is the modal's case, the other a table row.
    -->
    <!-- Hosted here for the reason above, and one more: the dashboard sits in
         a stacking context under the panels, and a dialog inside it would be
         painted under the player bar. -->
    @if (dashboard.overrideTarget()) {
      <score-override-dialog />
    }
    @if (dashboard.creatingCase()) {
      <create-case-dialog />
    }
    @if (nav.view() === 'player' && nav.section() === 'aml-risks') {
      <dashboard-toast />
    }
    @if (cases.pendingForceUnlock()) {
      <confirm-unlock-dialog [caseId]="cases.pendingForceUnlock()" />
    }
  `,
  styles: [
    `
      /* One column exactly the height of the viewport: dev harness, top bar,
         then the shell taking whatever is left. Measuring the shell against
         100vh instead would ignore the harness above it and push the panels
         off the bottom of a locked page, where nothing can scroll them back. */
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        /* dvh where it exists: on a phone 100vh is measured with the browser's
           toolbar hidden, so with it showing the bottom of the page sat under
           it and could not be scrolled to. */
        height: 100dvh;
        background: var(--page);
      }
      /**
       * Nav beside main, both filling what the top bar leaves. Sized to the
       * viewport rather than to content, which is what makes the page itself
       * unscrollable and hands scrolling to the nav and the panels instead.
       */
      .shell__bar {
        flex: none;
      }
      .shell {
        flex: 1;
        display: flex;
        align-items: stretch;
        min-height: 0;
      }
      .shell__nav {
        flex: none;
        width: var(--nav-w);
        min-height: 0;
      }
      .shell__main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      /* The content area under the player bar. It is the panels' container, so
         the panels start exactly where the chrome ends. */
      .page {
        position: relative;
        flex: 1;
        min-height: 0;
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow: hidden;
      }
      .page__dev {
        flex: none;
        padding: 12px 20px;
        background: var(--page);
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
      /* Fills the height the widgets leave. Panels are stretched to it and
         scroll internally, so nothing here ever grows the page. */
      .stage {
        position: relative;
        display: flex;
        justify-content: flex-end;
        align-items: stretch;
        gap: 16px;
        flex: 1;
        min-width: 0;
        min-height: 0;
        /* Its own stacking context, so the page layer below can sit under the
           panels without a z-index on either of the panels. */
        isolation: isolate;
      }
      /**
       * While a dialog is open inside it, the stage goes above the chrome.
       *
       * isolation makes the stage a stacking context, and a context with no
       * z-index sits at level 0 - under the player bar, which is z-index 20.
       * A dialog's own z-index: 60 only counts INSIDE that context, so the
       * player bar was painted across the middle of the Adjust severity sheet,
       * and across the scrim on desktop. Raised only for the dialog's
       * lifetime: the rest of the time the player bar's menus must still open
       * over the panels.
       */
      .stage:has(dialog-shell) {
        z-index: 60;
      }
      /**
       * The page under the panels. Absolute, so it takes no part in the row
       * the panels are laid out in and cannot change a width any of them was
       * given; z-index -1, so it is painted before them.
       *
       * It scrolls itself: the document is not allowed to, by the same rule
       * that hands the panels their own scrolling.
       */
      .stage__page {
        /**
         * The page stops at the stage's own top edge, 16px clear of the
         * widget row. It used to reach up into that gap and fade out there,
         * which ended the fade on the widget's bottom border: the card read
         * as lying on top of the page, with the page sliding under it.
         *
         * Now the gap stays empty, and what scrolls off fades out inside the
         * stage, before it reaches the gap. --fade is 0 at rest, so nothing
         * at the top of an unscrolled page is dimmed, and grows with the
         * first 16px of scroll (set by the dashboard) so it never pops in.
         */
        --fade: 0px;
        position: absolute;
        inset: 0;
        z-index: -1;
        overflow-y: auto;
        /* The page scrolls one way. A table too wide for its card scrolls
           inside the card; nothing is allowed to move the whole page
           sideways. */
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-mask-image: linear-gradient(to bottom, transparent, #000 var(--fade));
        mask-image: linear-gradient(to bottom, transparent, #000 var(--fade));
        /* Room for the minimised bars, which dock over this corner, and a
           gutter under the last card either way. */
        padding-bottom: calc(var(--dock-h, 0px) + 20px);
        outline: none;
        transition:
          opacity 160ms ease-out,
          visibility 0s;
      }
      /* Gone a little before the panel has finished arriving over it. */
      .stage__page--covered {
        opacity: 0;
        visibility: hidden;
        transition:
          opacity 160ms ease-out,
          visibility 0s 160ms;
      }
      @media (prefers-reduced-motion: reduce) {
        .stage__page,
        .stage__page--covered {
          transition: none;
        }
      }
      /**
       * Bottom right, hugging its content, stacking upward.
       *
       * absolute inside .page rather than fixed to the viewport: .page is the
       * panels' own box, so right: 0 IS the panel's right edge - flush when
       * solo, inside the gutters in dual - without a second offset to keep in
       * step with the padding rules above.
       *
       * width: max-content is the hug. The 400px cap is what stops a long case
       * title turning the bar into a full-width strip; the bar's own title
       * ellipsises into whatever that leaves.
       */
      .dock {
        /* One inset, used four ways: the right offset, the bottom offset, and
           both halves of the width cap. Changing it at the mobile breakpoint
           moves all four together, so the bar cannot end up 16px from one edge
           and 32px from another. */
        --dock-inset: 32px;
        position: absolute;
        right: var(--dock-inset);
        bottom: var(--dock-inset);
        z-index: 3;
        display: grid;
        gap: 8px;
        width: max-content;
        /* Subtracting the inset TWICE is what keeps the far gutter: the bar is
           right-anchored, so without it a wide bar grows leftward and runs off
           the left edge instead of shrinking. */
        max-width: min(400px, calc(100% - var(--dock-inset) * 2));
      }
      /**
       * Grid items get min-width: auto, so a bar whose title is wider than the
       * cap refuses to shrink and overflows it - the title ran past the edge
       * and pushed both icon buttons out of the bar entirely. min-width: 0 is
       * what lets the cap actually bind, and the title's own ellipsis absorbs
       * the difference.
       */
      .dock > * {
        min-width: 0;
      }


      /**
       * Mobile: one 16px gutter, everywhere.
       *
       * The modal takes its width from the measured stage, so narrowing the
       * page padding is what gives it calc(100vw - 32px) - there is no second
       * width rule to keep in step, and nothing needs !important to beat the
       * inline width the workspace sets.
       */
      /* Below 1200 the content area is tight enough that 20px of gutter is
         worth 8px of panel. Widgets and panel both live in .page, so they take
         this change together and stay flush with each other. */
      @media (max-width: 1199.98px) {
        .page {
          padding-left: 16px;
          padding-right: 16px;
        }
      }

      /* No room for a 256px nav beside a panel much below this, and the panel
         is the point of the page. */
      @media (max-width: 1023.98px) {
        .shell__nav {
          display: none;
        }
      }

      @media (max-width: 719.98px) {
        /**
         * The panel was rendering 0px tall.
         *
         * .page is a fixed-height flex column with overflow: hidden, sized to
         * what the chrome leaves. That works on a desktop where the widget row
         * is one short row. Stacked on a phone the row is ~488px - taller than
         * the whole page box - so .stage, being flex: 1 with min-height: 0,
         * got nothing and the panel collapsed to 2px with its stream at 42px.
         *
         * So on mobile the page itself scrolls: the app chrome stays pinned
         * (document scroll is still locked), the widget row can scroll away,
         * and the panel keeps a height it can actually work in. Its stream
         * still scrolls internally between the pinned chip bar and footer.
         */
        .page {
          padding-left: 16px;
          padding-right: 16px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        /* A BOUNDED height, not a minimum: given only a minimum the stage
           grew to fit the whole stream, the page scrolled and the panel's own
           scroller never engaged. Measured from the viewport less the app
           chrome - the dev harness and the widget row are not in the sum
           because they scroll away above it. */
        .stage {
          flex: none;
          /* The page's own visible height, so a panel scrolled into place
             fits it exactly. It was 100vh less the app chrome, which ignored
             whatever else sat above the page and left the panel's last rows
             below the fold with no way to scroll to them. */
          height: 100%;
          /* 600, up from 420: the panel's fixed parts (header, tabs, chips,
             and a footer of two stacked 48px buttons) now come to about 440,
             and under that the stream had no room and the footer was cut
             off. Taller than the window is fine - the page scrolls to it. */
          min-height: 600px;
        }
        /**
         * A section with no panel over it is just the page: it flows, and the
         * PAGE scrolls it. As its own scroller it was a scroll area inside a
         * scroll area, 600px tall in a 490px window, and with overscroll
         * contained a thumb on it could never move the page to show its end.
         */
        .stage:has(> .stage__page):not(:has(> .stage__modal)) {
          height: auto;
          min-height: 0;
        }
        .stage:has(> .stage__page):not(:has(> .stage__modal)) > .stage__page {
          position: static;
          overflow: visible;
          overscroll-behavior: auto;
          -webkit-mask-image: none;
          mask-image: none;
          z-index: auto;
        }
        /**
         * No scrim on mobile, because there is nothing left to dim: the panel
         * is full-bleed below the player bar and covers the content area
         * outright. A scrim under an opaque full-screen view is a layer that
         * can only ever be seen if something else is wrong.
         */
        .page__dev {
          padding: 16px;
        }
        /* Same shape, tighter gutters. Only the inset changes - the bar still
           hugs its content and stays right-aligned rather than going full
           width, so the two sizes are one layout at two scales. */
        .dock {
          --dock-inset: 16px;
          /**
           * Pinned to the SCREEN on a phone, not to the page.
           *
           * It was position: absolute at the bottom of .page - and on a phone
           * .page is what scrolls, so the bar was placed at the bottom of the
           * first screenful and then rode up with the content, ending in the
           * middle of the AML risk card. Fixed, it stays in the corner. Nothing
           * above it is transformed, so the viewport is its containing block.
           */
          position: fixed;
          bottom: max(var(--dock-inset), env(safe-area-inset-bottom));
          max-width: calc(100vw - var(--dock-inset) * 2);
        }

      }
    `,
  ],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  readonly ws = inject(WorkspaceStore);
  readonly nav = inject(NavStore);
  readonly preview = inject(AttachmentPreviewStore);
  /** Only for the force-unlock dialog above - see the template comment. */
  readonly store = inject(CaseStore);
  readonly cases = inject(CasesStore);
  readonly dashboard = inject(AmlDashboardStore);

  /**
   * Rule 4's other half: the deep link the table's Open AML Case button opens.
   *
   * NavStore parses ?case= at startup but nothing acted on it, so the link
   * carried the right id and the modal showed whichever case was loaded
   * before - the default, always. Loaded HERE, in the root constructor,
   * because it has to happen before the dev harness applies a scenario:
   * applyScenario calls reset(), which re-seeds from whatever fixture is
   * current, so identity has to be right first or the scenario re-seeds the
   * previous case. Parent constructors run before their template children,
   * which is what makes this the earliest honest place for it.
   */
  constructor() {
    const deepLinked = this.nav.deepLinkCaseId();
    if (deepLinked) this.store.loadCase(deepLinked);
  }

  /**
   * Height the docked bars occupy, published as --dock-h so the modals can
   * subtract it. Without this a bar overlaps the survivor's pinned footer,
   * which is exactly the control the agent needs.
   */
  /**
   * Exactly one panel on the stage: the solo composition. Both the scrim and
   * the full-bleed panel read from this one signal, so they can never be half
   * applied.
   */
  readonly dockHeight = computed(() => {
    const n = this.ws.minimisedBars().length;
    // The dock's bottom offset, doubled, so the clearance reads as a gap above
    // the bar as well as below it. Takes the DESKTOP inset: mobile's is half
    // that, so this over-reserves there by 32px, which costs a little panel
    // height and never lets a bar sit on the footer.
    return n === 0 ? 0 : 64 + n * 46 + (n - 1) * 8;
  });

  /**
   * Angular animations do not consult prefers-reduced-motion, so the trigger
   * is disabled outright rather than sped up - a slide is a slide.
   */
  private readonly motionQuery =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  readonly reducedMotion = signal(this.motionQuery?.matches ?? false);

  private readonly zone = inject(NgZone);

  /**
   * Page scroll lock. While a panel is up the composition is fixed to the
   * viewport: the chrome stays put, the nav scrolls itself, and the panel
   * scrolls internally. Without this a tall panel would drag the whole page
   * and take the player bar off screen with it.
   */
  private readonly scrollLock = effect(() => {
    const open = this.ws.visibleOrder().length > 0;
    document.documentElement.classList.toggle('panel-open', open);
  });

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

  /**
   * Escape closes the most recently opened panel - the last one in the dock
   * order, which is the one on the right.
   *
   * A dialog owns Escape while it is up, and it stops the event at its own
   * host. This is a document listener, so it would still fire for a keypress
   * OUTSIDE the dialog and take the panel out from under it. Hence the guard:
   * if a dialog is on screen, Escape is not ours.
   *
   * The attachment preview is in the guard for the same reason. Losing the
   * panel and its draft behind a preview you were only closing would be the
   * worst outcome of pressing Escape twice quickly.
   */
  onEscape(): void {
    // The player Menu is in the guard too: Escape closes the menu, and must
    // not also take down the panel underneath it.
    if (document.querySelector('dialog-shell, attachment-preview, player-menu')) return;
    const order = this.ws.visibleOrder();
    const newest = order[order.length - 1];
    if (newest) this.ws.close(newest);
  }
}
