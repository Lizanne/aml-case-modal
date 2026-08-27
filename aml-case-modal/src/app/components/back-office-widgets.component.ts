import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { MODAL_GAP_PX, WIDGET_SOLO_MAX_PX, lockStatusLine } from '../core/models';
import { WorkspaceStore } from '../core/workspace-store';
import { PillComponent } from './ui-pill.component';

/**
 * The back office surface behind the panels. Each widget opens its own panel
 * and only its own: nothing here ever opens both, so two panels on screen is
 * always something the agent did in two deliberate steps.
 *
 * STYLING IS ONE-TO-ONE WITH FIGMA, not with the rest of this app:
 *   desktop  22263:21255
 *   mobile   22263:20943
 *
 * Which is why the count badge and the buttons here are written out rather than
 * reusing ui-pill and mat-button: the design's count badge carries a border and
 * its buttons are 32px with a 4px radius, neither of which the shared
 * components do.
 *
 * The severity badge is NOT one of those exceptions any more. It was local only
 * because it was smaller than a pill; ui-pill has a size for that now, so it is
 * the shared component at size sm and the dot is gone.
 *
 * WHILE A PANEL IS OPEN ITS WIDGET DOES NOT RENDER. Not a reduced card, no
 * card - in every state, dual included, where the row disappears outright
 * because both cards have gone.
 *
 * This replaces an identity-only card, which was the same argument taken one
 * step short. An open panel owns everything the card was for: its header holds
 * the lock, its own X closes it, and its title says which case it is. What was
 * left on the row restated the panel's own identity a few hundred pixels above
 * it - a second reading of one thing, which can go stale, contradict the
 * header, or simply be read instead of it. A card with nothing left to say is
 * not a quieter card; it is a card that should not be there.
 *
 * THE RULE IS PER WIDGET, not per row. A card is hidden by ITS OWN panel being
 * open and by nothing else, so with the case up and the alert shut the SG card
 * is still on the row, in full, and is still the way back into the alert.
 *
 * A WIDGET IS NOT TIED TO ITS PANEL'S LIFETIME, though. It renders on the item
 * being PRESENT on the surface - see ModalState.present - so a closed panel
 * leaves its widget behind rather than taking the item off the surface.
 * Presence decides whether there is a card at all; the panel decides whether
 * it is on screen. Two conditions, and both have to hold.
 *
 * So there is only one kind of card now: full, with its lock status and its
 * actions. The state that needed a reduced one no longer renders.
 *
 * THE PANEL IS UNTOUCHED BY ANY OF THIS. It keeps the same box in the content
 * area whether or not the row is above it - it does not dock right and gains
 * no scrim when the row goes. The row's host collapses to display: none so it
 * cannot leave the page's 16px flex gap behind; that is the only thing that
 * moves, and it moves the panel up, never sideways.
 */
@Component({
  selector: 'back-office-widgets',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, PillComponent, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // The panels' own gap, so the row and the stage below it split their
    // width at exactly the same two points. One constant, two layouts.
    '[style.--widget-gap.px]': 'gap',
    // The lone card's cap, from the constant rather than a literal in the CSS.
    '[style.--widget-solo-max.px]': 'soloMax',
    // display: none, not an empty host. .page is a flex column with a 16px
    // gap, and a zero-height flex item still claims its share of it - the row
    // would be gone and its gap would not, leaving the panel pushed down by a
    // strip of nothing. null restores the stylesheet's display: block.
    //
    // The panel therefore starts higher whenever the row is away, by the
    // row's height plus that gap. It is the only thing about the panel that
    // moves: same left edge, same width, no scrim.
    '[style.display]': 'showRow() ? null : "none"',
  },
  template: `
    <!--
      One card per item that is on the surface AND whose panel is down, in slot
      order. Both conditions live in cardIds(); nothing below re-tests either,
      which is what lets the cards themselves be unconditional.

      The row is still sized to the box the panels occupy, so it lines up with
      whatever is beneath it. A card sitting above the OTHER item's panel is
      the ordinary state now rather than an edge case, and sharing that box is
      what keeps it from reading as a strip floating over the page.
    -->
    @if (showRow()) {
    <div class="widgets" [class.widgets--single]="cardIds().length === 1" [style.width]="ws.rowCss()">
      @for (id of cardIds(); track id) {
      @if (id === 'sg') {
      <!-- ------------------------------------------------------- SG alerts -->
      <article class="w">
        <span class="w__type w__type--sg">
          <mat-icon fontSet="material-icons-outlined">shield</mat-icon>
        </span>

        <div class="w__inner">
          <div class="w__content">
            <div class="w__titles">
              <h2 class="w__name">SG Alerts</h2>
              <span class="w__count">41 triggers hit</span>
            </div>
            <div class="w__meta-group">
              <p class="w__meta">12 snoozed · Last trigger 1mo ago</p>
            </div>
          </div>

        </div>

        <!--
          Unconditional. This card exists only while the SG panel is down, so a
          guard here would be the same test written twice - and the copy free
          to fall out of step with the one that actually decides.

          No lock line, because the SG alert has no lock: this panel is the
          existing production modal, carried in as a peer to prove the dual
          layout, and it has no lock band of its own to be a second reading of.
          Inventing one here would be the widget asserting state the panel
          itself would contradict the moment it was opened.
        -->
        <div class="w__actions">
          <!-- "Open alert", naming its object the way "Open case" does beside
               it, so two Open buttons on one row cannot be mistaken for each
               other. -->
          <button class="w__btn w__btn--primary" type="button" (click)="ws.open('sg')">
            <mat-icon aria-hidden="true">open_in_new</mat-icon>
            Open alert
          </button>
        </div>
      </article>
      } @else {

      <!-- -------------------------------------------------------- AML case -->
      <article class="w">
        <span class="w__type" [attr.data-sev]="store.severity()">
          <mat-icon fontSet="material-icons-outlined">business_center</mat-icon>
        </span>

        <div class="w__inner">
          <div class="w__content">
            <div class="w__titles">
              <h2 class="w__name">AML Case</h2>
              <ui-pill size="sm" [severity]="store.severity()">{{ store.severity() }}</ui-pill>
            </div>
            <div class="w__meta-group">
              <!--
                Status, then the date it opened. NOT "Open · Opened 12d ago",
                which said the word twice and then answered a question the
                status had already answered.

                Absolute, and taken from the fixture rather than the hardcoded
                "12d ago" it replaces - a literal that was wrong the moment the
                fixture date moved, and silently so. Relative time lives on the
                lock line alone, which is the one place recency is the point:
                how long someone has held a lock decides whether you take it,
                whereas how long ago a case opened is a fact about the case.
              -->
              <p class="w__meta">
                #AML-1042 · {{ stage() }} · {{ store.createdAt() | stamp: 'date' }}
              </p>
              <!--
                Lock status, unguarded. It used to be gated on the panel being
                shut, which is now the only way this card renders at all - one
                statement of the lock, in the place that also owns the controls
                for it, and never a second reading of the header's.

                The remaining @if is about the lock itself: a resolved case has
                no holder, and the design shows no chip rather than an
                "Unassigned" one.
              -->
              @if (lockChip(); as chip) {
                <span class="w__lock" [class.w__lock--mine]="chip.mine">
                  <mat-icon fontSet="material-icons-outlined" aria-hidden="true">lock</mat-icon>
                  {{ chip.label }}
                </span>
              }
            </div>
          </div>

          <!--
            Unconditional, like the SG card's. The panel test that used to wrap
            this block IS the test that decides whether the card exists, so
            keeping it here would be one rule in two places.

            The branches inside are about the LOCK, not the panel: which lock
            control the current state calls for, and whether rule 3 has been
            satisfied well enough to offer a way in.
          -->
          <div class="w__actions">
            @if (!store.isResolved()) {
              @switch (store.lockState()) {
                @case ('locked-to-me') {
                  <button class="w__btn w__btn--compact" type="button" (click)="store.requestUnlock()">
                    Unlock
                  </button>
                }
                @case ('locked-to-other') {
                  <button class="w__btn w__btn--danger" type="button" (click)="store.requestUnlock()">
                    <mat-icon aria-hidden="true">lock</mat-icon>
                    Force unlock
                  </button>
                }
                @default {
                  <!-- "Lock case", not "Lock": the widget names its object,
                       the way Open case does beside it. The panel band can
                       say "Lock to me" because the case it means is the one
                       it is the header of. -->
                  <button class="w__btn w__btn--primary" type="button" (click)="store.lock()">
                    Lock case
                  </button>
                }
              }
            }
            @if (canOpen()) {
              <button class="w__btn w__btn--primary" type="button" (click)="ws.open('aml')">
                <mat-icon aria-hidden="true">open_in_new</mat-icon>
                Open case
              </button>
            }
          </div>
        </div>
      </article>
      }
      }
    </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /**
       * The row is sized from the store to the box the panels occupy, and
       * margin-left: auto right-docks it, so its edges ARE the panel area's
       * edges. What happens inside it depends on how many cards there are:
       *
       *   two    auto-fit splits the row in half, which is the same split the
       *          two panels take - so each card sits over its own. Unchanged.
       *   one    capped at WIDGET_SOLO_MAX_PX and pushed to the right edge.
       *          See .widgets--single.
       *
       * The min() floor matters: a fixed 260px track whose floor exceeds the
       * container overflows it rather than collapsing to one column.
       */
      .widgets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        /* The PANEL gap, published by the host from MODAL_GAP_PX - not a 12px
           that merely looked close. Two cards over two panels only share their
           inner edges if the two gaps are the same number, and at 12 against
           16 they were 2px out on each side. */
        gap: var(--widget-gap);
        margin-left: auto;
      }
      /**
       * A lone card: 640px at most, hard against the panel's right edge.
       *
       * The ROW still spans the panel area - only the track inside it is
       * capped - so the right edge the card lands on is the panel's own,
       * measured rather than guessed at. justify-content moves the track
       * within the row; sizing the row instead would move the edge the card is
       * supposed to be meeting.
       *
       * min(100%, 640px), so below 640px of row there is no cap left to apply
       * and the card fills the content area between the gutters. One
       * expression covering both halves of the rule, rather than a second
       * breakpoint that could be set to disagree with the first.
       *
       * A cap, because a single card stretched across 1080px is a 32px icon,
       * two short lines and then several hundred pixels of nothing before the
       * buttons. Right-aligned rather than left, because the panel it stands
       * in for arrives from that edge.
       */
      .widgets--single {
        grid-template-columns: min(100%, var(--widget-solo-max));
        justify-content: end;
      }

      /* ---- card: 22263:21085 ------------------------------------------- */
      /* Top-aligned, per 24100:8194: the icon and the actions sit level with
         the title row and the content flows down past them. Centring them
         floated both against a card whose height is set by the text. */
      .w {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        /* The wrap point belongs to the WIDGET's width, not the window's: two
           widgets sharing a wide viewport are each narrow. */
        container-type: inline-size;
      }

      /* ---- type icon: 32px, 8px radius, tinted by state ----------------- */
      .w__type {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--page);
      }
      /**
       * Each variant sets BOTH halves of its pair, and the glyph inherits.
       *
       * The requested icon colours - 1E3A8A, 7F1D1D, 78350F - are already the
       * foreground tokens that go with these exact backgrounds, so they go in
       * by name: the tile is now the same fg/bg pairing as the severity pill
       * beside it, and a token change moves both together. As three hex
       * literals they would have been a second, silent definition of the
       * severity palette living in one component.
       *
       * COMPLIANCE was not in the brief; it takes its own foreground token by
       * the same rule, rather than being the only tile left on --ink.
       */
      /**
       * SG is amber, not blue.
       *
       * The requested pair - FEF3C7 behind 78350F - is exactly --warn-bg and
       * --warn, so it goes in by name like every tile below it rather than as
       * two hex literals. The old background WAS a literal, which is how it
       * ended up paired with a token foreground and free to drift from it.
       *
       * --warn rather than --sev-aml, which carries the identical values
       * today: this tile marks an alert surface, not an AML severity, so if
       * the severity palette ever moves this must not move with it.
       *
       * Contrast is already established at 12px for this pair - see the note
       * on --sev-aml in styles.scss.
       */
      .w__type--sg {
        background: var(--warn-bg);
        color: var(--warn);
      }
      .w__type[data-sev='AML'] {
        background: var(--sev-aml-bg);
        color: var(--sev-aml);
      }
      .w__type[data-sev='EDD'] {
        background: var(--sev-edd-bg);
        color: var(--sev-edd);
      }
      .w__type[data-sev='COMPLIANCE'] {
        background: var(--sev-compliance-bg);
        color: var(--sev-compliance);
      }
      .w__type mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        /* inherit, not a colour: the variant above owns it. Material sets its
           own colour on .mat-icon, so leaving this out entirely is not the
           same as inheriting. */
        color: inherit;
      }

      /* ---- inner: content then actions ---------------------------------- */
      /**
       * Wraps when it must, not at a width someone guessed.
       *
       * The identity block claims 140px - the mobile node's own min-width - so
       * the actions drop to a second line exactly when holding them on the
       * first would squeeze the name and meta below that. A container
       * threshold instead put every 566px card (two widgets at 1440, the most
       * ordinary desktop there is) into the mobile layout, which is why the
       * desktop widgets did not look like the desktop node.
       */
      /**
       * nowrap, deliberately. Wrapping here is what dropped the action row onto
       * a second line - a flex line takes an over-wide item to the next row
       * INSTEAD of shrinking it, so the buttons left the corner the moment the
       * card got tight, at 1200 and on every phone. The row is kept intact and
       * the identity block absorbs the squeeze instead; the buttons wrap within
       * their own row if they have to.
       */
      .w__inner {
        display: flex;
        flex-wrap: nowrap;
        align-items: flex-start;
        gap: 8px;
        flex: 1 1 auto;
        min-width: 0;
      }
      /* min-width: 0, not 140px: a floor here is the same bug by another name -
         it makes the row unshrinkable and forces the wrap the line above
         prevents. The text truncates and wraps on its own. */
      .w__content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1 1 auto;
        min-width: 0;
      }
      /* The badge wraps under the name rather than shortening it. With the
         actions holding the corner the identity block is the part that gives,
         and "SG Aler..." is a worse trade than a badge on its own line. */
      .w__titles {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .w__name {
        flex: 0 1 auto;
        min-width: 0;
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ---- count badge: 22263:21125 ------------------------------------- */
      .w__count {
        flex: 0 1 auto;
        min-width: 0;
        padding: 2px 8px;
        border-radius: 100px;
        background: var(--page);
        font-size: 12px;
        line-height: 16px;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* The severity badge is ui-pill at size sm - no local copy, no dot, and
         no third place where COMPLIANCE has its own hardcoded lilac. */


      /* ---- meta line: first to truncate --------------------------------- */
      .w__meta {
        margin: 0;
        min-width: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ---- lock status: 24101:8830 ---------------------------------- */
      .w__meta-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .w__lock {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        max-width: 220px;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .w__lock--mine {
        color: var(--foreground-success);
      }
      .w__lock mat-icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /* ---- buttons: 32px, 4px radius ------------------------------------ */
      /**
       * Top right, in every state and at every width.
       *
       * align-self is the whole point: the identity block is two lines in one
       * state and three in another, and a centred action row therefore sat at a
       * different height in each - floating mid-card next to the taller block.
       * Anchored to the top it lines up with the title row instead, and the
       * padding is what puts it on the title's baseline zone.
       *
       * Wrapping INSIDE the action row, rather than letting the row itself wrap
       * below the content, is what keeps that true when two buttons will not fit
       * side by side: they stack in the corner, still starting at the title.
       */
      /**
       * Controls handed back, not snapped back.
       *
       * A card regains its lock line and its buttons the instant its panel
       * closes - which is the instant the panel STARTS leaving, with 300ms of
       * it still on screen. At full opacity from the first frame they arrived
       * before the thing they replace had gone, and the eye read it as a pop
       * rather than a handover.
       *
       * A CSS animation rather than an Angular one, because the trigger is
       * exactly "this element was created": the actions block is behind
       * @if (!isOpen), so it exists only in the state that should fade it in,
       * and there is nothing to bind or tear down. Same 300ms ease-out as the
       * panel's exit, so the two are one movement.
       */
      @keyframes widget-restore {
        from {
          opacity: 0;
        }
      }
      .w__actions,
      .w__lock {
        animation: widget-restore 300ms ease-out;
      }
      @media (prefers-reduced-motion: reduce) {
        .w__actions,
        .w__lock {
          animation: none;
        }
      }
      .w__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        align-self: flex-start;
        gap: 8px;
        flex: 0 1 auto;
        margin-left: auto;
      }
      .w__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex: none;
        height: 32px;
        padding: 0 16px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: var(--panel);
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
        cursor: pointer;
      }
      .w__btn:hover {
        background: var(--page);
      }
      /* Lock / Unlock are the compact variant in the design: 13px on 12px of
         padding rather than 14px on 16px. */
      .w__btn--compact {
        padding: 0 12px;
        font-size: 13px;
        line-height: 16px;
      }
      .w__btn--primary {
        border-color: transparent;
        background: var(--primary);
        color: #fff;
      }
      .w__btn--primary:hover {
        background: var(--primary-ink);
      }
      /**
       * Force unlock, demoted at rest.
       *
       * A case locked to another agent is a NORMAL state, not an error. Red
       * text sitting permanently in the widget row said otherwise every time
       * the row was looked at, and a warning that is always on is a warning
       * nobody reads. So the danger treatment moves to the point of intent:
       * quiet grey until you reach for it, danger the moment you do.
       *
       * Demoted, not hidden. It stays a visible button in the row rather than
       * moving into an overflow menu - breaking someone else's lock should be
       * a considered act, and a considered act you cannot find is not safer,
       * only slower.
       *
       * border-color transparent rather than removing the border outright:
       * .w__btn's 32px height sits on a 1px border, so dropping it would
       * leave this button 2px shorter than Lock and Open case beside it.
       */
      .w__btn--danger {
        border-color: transparent;
        background: var(--colors-background-background-tertiary, #f4f4f5);
        color: var(--ink);
      }
      /* One rule for both, deliberately: the button must read the same to a
         pointer and to a keyboard, and the focus ring is what the keyboard
         gets on top rather than instead. */
      .w__btn--danger:hover,
      .w__btn--danger:focus-visible {
        background: var(--danger-bg);
        color: var(--danger);
      }
      .w__btn mat-icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /**
       * Narrow: the mobile node, 22263:20943.
       *
       * The threshold is the desktop node's own card width, 640px, expressed
       * as a container width: a size container measures its CONTENT box, so
       * 640 outer minus 24px of padding and 2px of border is 614. Writing 640
       * here put a 646px card into the mobile layout. Below it
       * the desktop row cannot hold the design's own content - icon, chip,
       * Unlock and the primary come to about 552px, leaving the identity block
       * a dozen pixels - so this is where the design stops applying, measured
       * rather than picked.
       *
       * It has to be a CONTAINER query, and it is the one already in this
       * file rather than a new breakpoint: between 720px and roughly 1130px of
       * viewport the two widgets share a row at under 640px each, which no
       * viewport query can see because the viewport is wide while the widget
       * is not.
       *
       * Content and actions become two rows, the lock chip moves under the meta
       * line inside the content column, and the chip steps down to 24px with a
       * 20px avatar. Driven by the widget's own width rather than the
       * viewport's, so two widgets sharing a 1440px screen get it too - which
       * is the case a viewport query cannot see.
       */
      /**
       * The mobile node, 22263:20943: chip under the meta at 24px with a 20px
       * avatar, actions on their own row. Keyed to the mobile card's own width
       * rather than the viewport, so a narrow widget on a wide screen gets it
       * too.
       */
      /**
       * Narrow.
       *
       * 24101:8775 drops the actions below the identity block here, and that is
       * the one thing not carried over: dropped, they sit ~70px below the title
       * on a three-line card and ~50px on a two-line one, which is the floating
       * button in the other layout by another route. The row is kept, so the
       * corner is the corner at every width; two buttons stack within it.
       *
       * Nothing here re-flows the row any more - that is the point. All this
       * leaves is the top anchor, which the row rule already carries.
       */
      @container (max-width: 419.98px) {
        .w {
          align-items: flex-start;
        }
      }

      /**
       * Mobile, per the Mobile variants of 22290:2443.
       *
       * The card STACKS - it is not a horizontal row that wraps. That is the
       * bug this replaces: .w__actions kept its auto left margin and its
       * wrap, so the buttons floated right and broke onto two lines of their
       * own, and .w__content was left competing with them for width, which is
       * why the meta line ellipsised with empty space beside it.
       *
       * Values read from the node: 16px padding on all four sides, 10px
       * between the identity block and the actions row, 32px buttons at
       * 13px/16px.
       */
      @media (max-width: 719.98px) {
        /* One card per line. Below this the panel is full-bleed and there is
           no side-by-side left to align to, so the auto-fit split is dropped
           rather than shrunk. */
        .widgets {
          grid-template-columns: minmax(0, 1fr);
        }
        /**
         * The cap is NOT dropped with it. Restated here because the rule above
         * is a later single-class selector and would otherwise win on order -
         * which is what put a 668px card on a 700px viewport, 28px over a cap
         * that was still meant to be in force.
         *
         * The stack rule is about two cards not sharing a line. A lone card
         * was never sharing one, so nothing about it changes at this width:
         * 640 until the row is narrower than 640, then the row.
         */
        .widgets--single {
          grid-template-columns: min(100%, var(--widget-solo-max));
        }
        .w {
          gap: 10px;
          padding: 16px;
          align-items: flex-start;
        }
        .w__inner {
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }
        /* Full width, so the meta line has the whole card before it truncates
           rather than whatever the buttons left over. */
        .w__content {
          flex: none;
          width: 100%;
          min-width: 0;
        }
        /* A row of its own: left-aligned, no auto margin pushing it right, and
           no wrap - the buttons share the line instead of stacking. */
        .w__actions {
          width: 100%;
          margin-left: 0;
          justify-content: flex-start;
          flex-wrap: nowrap;
        }
        .w__btn {
          font-size: 13px;
          line-height: 16px;
        }
      }
    `,
  ],
})
export class BackOfficeWidgetsComponent {
  readonly ws = inject(WorkspaceStore);
  readonly store = inject(CaseStore);

  /** The stage's gap, handed to the row so the two split at the same points. */
  readonly gap = MODAL_GAP_PX;

  /** The lone card's cap - see .widgets--single. */
  readonly soloMax = WIDGET_SOLO_MAX_PX;

  /**
   * The cards, in slot order: on the surface, and panel down.
   *
   * BOTH conditions, in one place. They were previously split - presence chose
   * the cards, and each card re-tested its own panel to decide what to show -
   * which is how the same rule ended up written three times and how "identity
   * only" survived as a state at all. There is nothing for a card to fall back
   * to now, so the second condition belongs in the list rather than inside the
   * things the list produces.
   */
  readonly cardIds = computed(() => this.ws.presentIds().filter((id) => !this.ws.isOpen(id)));

  /**
   * Whether there is a row at all. In dual there is not: both panels are up,
   * both cards are gone, and an empty row would still take the page's flex gap
   * - hence the display: none on the host rather than an empty div here.
   */
  readonly showRow = computed(() => this.cardIds().length > 0);

  /** "Open" / "In progress" / "Resolved", per the design's meta line. */
  readonly stage = computed(() => {
    if (this.store.isResolved()) return 'Resolved';
    return this.store.stream().length > 0 ? 'In progress' : 'Open';
  });

  /**
   * The lock chip, or null when there is no holder.
   *
   * Null rather than an "Unassigned" label: the design shows no chip at all in
   * the unlocked state, and the Lock button is the signal instead.
   */
  readonly lockChip = computed<{ label: string; initials: string; mine: boolean } | null>(() => {
    if (this.store.isResolved()) return null;
    const state = this.store.lockState();
    const owner = this.store.lockOwner()?.name;
    return {
      // Rule 5: ONE source. The widget used to compose its own "Locked to you"
      // and "Locked to {name}" strings, which is a copy of the panel band's
      // vocabulary that nothing stopped from drifting - and the two are read
      // side by side. Both call lockStatusLine now, so they cannot disagree.
      // The band adds "since {time}" and the unlocked hint on top; the widget
      // takes the bare line, which is the same sentence, shorter.
      label: lockStatusLine(state, owner, { sinceIso: this.store.lockedSince() ?? undefined }),
      initials: state === 'locked-to-me' ? 'LF' : owner ? initialsOf(owner) : '',
      mine: state === 'locked-to-me',
    };
  });

  /** Rule 3: the case must be locked to you before it can be opened. */
  readonly canOpen = computed(() => this.store.lockState() === 'locked-to-me');
}

function initialsOf(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
