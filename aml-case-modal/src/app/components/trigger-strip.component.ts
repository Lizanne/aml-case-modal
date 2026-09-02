import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  ViewChild,
  afterNextRender,
  computed,
  effect,
  inject,
} from '@angular/core';

import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { PillComponent } from './ui-pill.component';
import { TRIGGER_COLLAPSED_ROWS, TRIGGER_EXPANDED_ROWS } from '../core/models';

/** Unique-id counter, so two strips on one page cannot collide on aria-controls. */
let stripSeq = 0;

/**
 * One trigger control, identical in every state and at every width.
 *
 * The strip is a sticky header - count chip, secondary text, verb - with the
 * trigger rows underneath it:
 *
 *   collapsed, <=2  (2 triggers)
 *                   [both rows, no toggle, no gap]
 *   collapsed, 3+   (19 triggers)                              v Show all
 *                   [oldest] [newest]              exactly 2 rows, no scroll
 *   expanded        (19 triggers)  Showing 5 of 19, scroll...  ^ Show less
 *                   [all 19 rows NEWEST FIRST, 5 visible, scrolling]
 *
 * COLLAPSED IS A PAIR, NOT A PREVIEW. Exactly two rows, always: the oldest
 * trigger and the newest, with the whole middle withheld. The oldest is why
 * the case exists and the newest is what just happened - the two questions a
 * collapsed strip is asked. It reads ASCENDING, because that pairing is a
 * sentence: it started here, and this is where it is now.
 *
 * The two rows sit directly against each other, with nothing between them
 * marking the gap. The header verb is the one control, and the badge saying
 * "19 triggers" over two rows is already the whole of what a marker would say.
 *
 * EXPANDED IS NEWEST FIRST, like every other time-ordered list in the product
 * bar the workflow stream. Once the whole history is on screen the question
 * changes from "what are the ends of this" to "what has been happening", and
 * that is read from the top down.
 *
 * So the newest trigger is the BOTTOM row collapsed and the TOP row expanded.
 * That is deliberate: it moves because the reason it is on screen moves -
 * anchoring the recent end of a two-row summary, then heading a list.
 *
 * Only the expanded list scrolls, and only it needs to: collapsed renders
 * exactly the two rows it shows, so what it withholds is absent rather than
 * below a fold. Expanded holds every trigger in the DOM and windows them to
 * five, which is what keeps the strip from pushing the workflow down the page.
 * The header stays sticky above that scroll region.
 *
 * The badge is the only place a count is rendered. It previously sat beside
 * both "Showing 2 of 19" and "+17 more triggers" - three restatements of one
 * number, two of them separately computed and free to drift apart.
 *
 * Collapsing only pays for itself when it hides something: at or below
 * TRIGGER_COLLAPSED_ROWS the pair IS the whole history, so the toggle
 * disappears - a control that reveals nothing is worse than no control.
 *
 * The bar is a LABEL STRIP, not a control. Only the Show all / Show less verb
 * is a button - the count chip and the scroll note are plain, selectable text.
 * Making the whole bar the hit target meant the strip's first row looked and
 * behaved like a clickable row, which is exactly what rows must not be.
 *
 * ONE control, in the header, in both directions - the strip has no second
 * way to expand. The verb never moves and never changes shape: same place,
 * every state, both layout widths. Only its label and aria-expanded change.
 *
 * Rule 11: an unresynced arrival is by definition the NEWEST trigger, so it is
 * the second collapsed row and the first expanded one - on screen in both,
 * never among the rows the pair withholds. Arriving while expanded, it lands at
 * the top of a list the agent may have scrolled away from, so the strip scrolls
 * back to it; the count chip carries the same amber as a second signal.
 *
 * The highlight persists until RESYNC, not until it is seen (open question 6).
 * Several arrivals before a resync all stay highlighted, and the collapsed pair
 * shows the newest of them.
 *
 * List layout: three columns - name, detail, timestamp. The list is a single
 * grid and each row is `display: contents`, so every row shares one set of
 * column widths. The NEW badge sits with the trigger name in column 1 - it
 * describes the trigger, not its time - and takes no column of its own, so a
 * highlighted row lines up exactly like every other row. The timestamp column
 * stays right-aligned with nothing beside it.
 *
 * ROWS ARE NOT INTERACTIVE IN THIS EPIC. They are read-only content: no button
 * or link semantics, no pointer cursor, no hover tint, and the text stays
 * selectable so an agent can copy a trigger name or timestamp.
 *
 * FUTURE SCOPE - do not wire these up here without a spec:
 *   - clicking a row to jump to its related commentary
 *   - resyncing directly from the new-trigger row
 * Both would make rows interactive, which changes the semantics of the whole
 * list (rows would need to become buttons, gain focus styling, and be reachable
 * in the tab order). The header bar toggle is deliberately the ONLY interactive
 * element in the strip.
 *
 * Resolved cases (state 07): the strip is still read-only and still expandable,
 * but it never shows an arrival. A resolved case cannot be acted on, so an
 * amber "act on this" signal would be a lie - see `showsArrival`.
 */
@Component({
  selector: 'trigger-strip',
  standalone: true,
  imports: [MatIconModule, StampPipe, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="strip" aria-label="Case triggers">
      <!--
        A LABEL, not a control. The bar used to carry the Show all toggle as
        well; that moved into the list, where the rows it reveals actually are.
        What is left is the count, and the count is not a button.
      -->
      <div class="strip__bar">
        <ui-pill [tone]="showsArrival() ? 'warn' : 'info'">
          {{ total() }} {{ total() === 1 ? 'trigger' : 'triggers' }}
        </ui-pill>
      </div>

      @if (visible().length) {
        <!-- A scrollable region must be focusable or keyboard users cannot
             reach the rows below the fold. tabindex only when it scrolls. -->
        <div
          class="strip__list"
          #list
          [id]="listId"
          [class.strip__list--expanded]="store.triggersExpanded()"
          role="list"
          [attr.tabindex]="scrollsInternally() ? 0 : null"
          [attr.aria-label]="scrollsInternally() ? 'Triggers, scrollable list' : null"
        >
          @for (trigger of visible(); track trigger.id; let first = $first) {
            <!-- role="listitem" only. Content, not a control (see class doc). -->
            <div class="trigger" [class.trigger--new]="isArrival(trigger)" role="listitem">
              <!-- The badge belongs to the trigger, so it sits with the name.
                   The name itself is wrapped so it can ellipsise without the
                   badge being squeezed or pushed out of the cell. -->
              <span class="cell cell--name">
                <span class="cell__label">{{ trigger.name }}</span>
                @if (isArrival(trigger)) {
                  <ui-pill tone="warn-solid">New</ui-pill>
                }
              </span>
              <!-- Clamped to one line; the title is where the rest of it
                   still is. -->
              <span class="cell cell--detail" [attr.title]="trigger.detail">{{ trigger.detail }}</span>
              <span class="cell cell--meta">
                <time class="cell__at" [attr.datetime]="trigger.at">{{ trigger.at | stamp }}</time>
              </span>
            </div>

            <!--
              THE CONTROL SITS IN THE GAP IT DESCRIBES - immediately after the
              oldest row, which is where the hidden triggers belong.

              A divider across the list rather than a button in the header:
              collapsed it IS the elision, drawn between the two anchors, so
              "17 remaining" is read in the place the 17 are missing from.
              Expanded it stays exactly there and becomes the way back, with
              the unfolded rows below it - so the control never moves either,
              and neither anchor is disturbed by what happens between them.

              Rendered after the FIRST row and only when there is a middle to
              hide, so a strip of two triggers or fewer has no divider at all.
            -->
            @if (first && hiddenCount() > 0) {
              <!--
                A LISTITEM around the button, not the button alone.
                
                role="list" requires every child to be a listitem, and axe
                catches a bare button here as aria-required-children. Which is
                right: the divider stands for the rows it hides, so it IS a
                member of this list - it just happens to be the member you can
                press.
              -->
              <div class="strip__gap-slot" role="listitem">
                <button
                  class="strip__gap"
                  type="button"
                  [attr.aria-expanded]="store.triggersExpanded()"
                  [attr.aria-controls]="listId"
                  (click)="store.triggersExpanded.set(!store.triggersExpanded())"
                >
                  <span class="strip__gap-rule" aria-hidden="true"></span>
                  <!--
                    THE COUNT IS THE ONLY BOLD THING. A glance should pick up
                    "17", not "Show" - the verb is the same on every strip in
                    the product and the number is the only part that is about
                    this case.
                  -->
                  <span class="strip__gap-label">
                    <!-- Decoration: the words already carry the direction. -->
                    <mat-icon class="strip__gap-sign" aria-hidden="true">{{
                      store.triggersExpanded() ? 'remove' : 'add'
                    }}</mat-icon>
                    @if (store.triggersExpanded()) {
                      <span>Hide <b class="strip__gap-count">{{ hiddenCount() }}</b></span>
                    } @else {
                      <span
                        >Show <b class="strip__gap-count">{{ hiddenCount() }}</b> remaining</span
                      >
                    }
                  </span>
                  <span class="strip__gap-rule" aria-hidden="true"></span>
                </button>
              </div>
            }
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        /**
         * The strip measures ITSELF, not the window.
         *
         * It lives in the left column now, which is 420px on a 1078px panel -
         * so the viewport is wide while the strip is not, and a viewport query
         * cannot see the difference. Keyed to the window, the three-column
         * grid stayed on in a 420px column and squeezed the detail cell to
         * about eight characters: "Case opened: unusual deposit pattern"
         * rendered as "Case op...".
         *
         * Same reasoning as the widget row, which had the same problem for the
         * same reason: two cards sharing a wide screen are each narrow.
         */
        container-type: inline-size;
      }
      .strip {
        background: var(--panel);
        border-bottom: 1px solid var(--line);
      }

      /* A label strip, not a control: no cursor, no hover, nothing focusable.
         Sticky so it stays pinned above the rows if the strip is ever placed
         inside a scrolling ancestor - the toggle must never scroll away from
         the list it controls. */
      .strip__bar {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        /* The chip bar's height, not the trigger row's. The two bars stack in
           the same column and read as one piece of chrome; --trigger-row-height
           is what the ROWS below this are, and it happened to be the number
           here as well. */
        min-height: var(--panel-bar-h);
        padding: 0 20px 0 20px;
        box-sizing: border-box;
        background: var(--panel);
        cursor: default;
        user-select: text;
      }
      /**
       * THE DIVIDER THAT NAMES THE GAP.
       *
       * Spans the whole grid, because it stands for rows and a row spans the
       * strip. Shorter than a real row and on the page ground rather than the
       * panel's, so it reads as a break in the list rather than another entry
       * in it - and the two rules either side of the label are the break made
       * literal.
       *
       * It carries the count that the header no longer does: "17 remaining" is
       * read in the place the 17 are missing from, which is the one place the
       * number means something specific rather than being a second total.
       */
      /* The slot is the list member; the button fills it. Both span the grid,
         because the divider stands for rows and a row spans the strip. */
      .strip__gap-slot {
        grid-column: 1 / -1;
      }
      .strip__gap {
        display: flex;
        align-items: center;
        /* Wide, so the rules read as a frame around the label rather than a
           line with text sitting on it. */
        gap: 16px;
        width: 100%;
        /* Published as a variable because the expanded window has to add it
           back: five rows means five TRIGGERS, and this is not one. */
        height: var(--trigger-gap-height);
        padding: 0 20px;
        box-sizing: border-box;
        border: 0;
        /* BOTTOM, not top. Every row already carries its own bottom rule, so a
           top border here sat directly under the oldest row's and drew the
           line twice. Below it there is nothing to collide with: the next row
           rules its own underside too. */
        border-bottom: 1px solid var(--line);
        background: var(--page);
        font: inherit;
        cursor: pointer;
      }
      /**
       * The two halves of the break: solid hairlines, stopping 16px short of
       * the label on each side.
       *
       * The 16px is the row's own flex gap, so the clearance either side is
       * one number rather than two paddings that could drift apart. It is what
       * keeps the label reading as the object and the rules as the frame -
       * a rule running into the text made the line the object and the words an
       * interruption in it.
       *
       * flex: 1 each, so the label stays centred whatever it says - "Show 17
       * remaining" and "Hide 17" are very different lengths and the rules
       * absorb the difference.
       */
      .strip__gap-rule {
        flex: 1 1 auto;
        height: 1px;
        background: var(--line);
      }
      /**
       * Regular weight, so the COUNT can be the only bold thing in it. The verb
       * is the same on every strip in the product; the number is the only part
       * that is about this case, and it is what a glance should pick up.
       */
      .strip__gap-label {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        line-height: 16px;
        font-weight: 400;
        color: var(--primary);
        white-space: nowrap;
      }
      .strip__gap-count {
        font-weight: 700;
      }
      /* mat-icon.<class>, not just .<class>: Material's own .mat-icon rule
         sets 24px at the same class specificity, so the element tag is what
         wins. */
      mat-icon.strip__gap-sign {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      /* ONE TARGET. The tint is on the button, so it covers the label and both
         rules to the full width of the row - the rules are inside the thing
         being pressed, not chrome beside it. The rules keep the standard line
         colour throughout; the tint is what says the row is live. */
      .strip__gap:hover {
        background: var(--primary-bg);
      }
      /* One rule for pointer and keyboard: the ring is what the keyboard gets
         on top, never instead of the hover treatment. */
      .strip__gap:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
        background: var(--primary-bg);
      }

      /**
       * One grid for the whole list, so all rows share column widths.
       *
       * ONLY THE EXPANDED LIST SCROLLS. Collapsed renders exactly two rows, so
       * it has nothing to scroll and needs no cap - a height limit there would
       * be a promise about rows that are not in the DOM. Expanded holds the
       * whole history and is windowed to five, which is what keeps the strip
       * from pushing the workflow down the page.
       */
      .strip__list {
        display: grid;
        grid-template-columns: minmax(140px, 220px) minmax(0, 1fr) auto;
        border-top: 1px solid var(--line);
      }
      /**
       * Five ROWS, plus the divider that is not one.
       *
       * The divider lives inside the scroller, so a window of five row-heights
       * showed four triggers and a break. It is 28px of chrome describing the
       * list rather than a member of it, and the five is a promise about
       * triggers.
       */
      .strip__list--expanded {
        max-height: calc(
          var(--trigger-row-height) * var(--trigger-expanded-rows) + var(--trigger-gap-height)
        );
        overflow-y: auto;
      }
      /* On --expanded, because that is the only one that scrolls: a focus ring
         on a region with nothing below the fold is a control that does nothing. */
      .strip__list--expanded:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }

      /* The row itself has no box: its three cells are the grid items. */
      .trigger {
        display: contents;
      }

      /* Read-only content. No pointer, no hover tint, and text stays
         selectable - a row is something to read and copy, not to click. If a
         future epic adds per-row actions these become buttons and this block
         goes with them. */
      .cell {
        cursor: default;
        user-select: text;
      }

      .cell {
        height: var(--trigger-row-height);
        border-bottom: 1px solid var(--line);
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
        background: var(--panel);
      }
      /* Block cell so text-overflow works directly on the cell. */
      .cell--detail {
        display: block;
        line-height: var(--trigger-row-height);
        /**
         * ONE LINE, ALWAYS - see the note on row height in this file.
         *
         * overflow-wrap: anywhere alongside nowrap is not a contradiction and
         * not decoration. nowrap stops the wrapping; anywhere is what lowers
         * the element's MIN-CONTENT size to a single character, so a 100-char
         * unbroken string cannot force its flex or grid track wider than the
         * row. Without it the track sizes to the whole token and the text
         * escapes the row rather than ellipsising inside it - which is the
         * failure mode nowrap alone does not cover.
         */
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        overflow-wrap: anywhere;
      }
      /* Name cell is a flex row: name then badge, 6px apart. */
      .cell--name {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      /* The name is what gives way, never the badge. */
      .cell__label {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Spacing lives in cell padding rather than column-gap: a gap would leave
         unpainted stripes through a highlighted row. */
      .cell--name {
        padding: 0 20px 0 20px;
        font-weight: 600;
        color: var(--ink);
      }
      .cell--detail {
        padding: 0 12px 0 0;
        color: var(--ink-3);
      }
      /* Timestamp only, hard right, with nothing beside it. */
      .cell--meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 20px 0 0;
      }
      .cell__at {
        color: var(--ink-3);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .trigger:last-child .cell {
        border-bottom: 0;
      }

      /* Rule 11 highlight. Amber, and it persists until resync. Nothing here
         changes the geometry - a new row is an ordinary row with a tint and a
         marker, so it stays aligned with the rest. */
      .trigger--new .cell {
        background: var(--warn-bg);
      }
      /* --ink-3 is only 4.32:1 on the amber tint. The muted detail steps up to
         --ink-2 (6.92:1) on a highlighted row rather than the tint being
         lightened, which would weaken the rule-11 signal. */
      .trigger--new .cell--detail,
      .trigger--new .cell__at {
        color: var(--ink-2);
      }

      /**
       * Mobile: the row stops being three columns and becomes two lines.
       *
       * The shared grid is what keeps rows aligned on desktop, and it is
       * exactly what breaks here: the name column alone claims 140px of a
       * ~310px content box, and the detail column was left with about 12px to
       * render a full sentence into. Below 720px the list becomes a stack of
       * blocks and each row owns its own grid - name and timestamp on the
       * first line, the detail wrapping freely across the second.
       *
       * .trigger is display: contents on desktop, so the tint and border have
       * to live on the cells there. Here the row has a box again and takes
       * them back.
       */
      /**
       * Below this the three columns cannot all be readable, so the row stacks:
       * name and timestamp on one line, the detail sentence on its own beneath.
       *
       * 520, derived rather than picked. The grid is
       * minmax(140px, 220px) / minmax(0, 1fr) / auto, and its parts need
       * 140 for the name, about 180 before a trigger detail stops being a
       * sentence, 135 for the timestamp, 24 of column gaps and 40 of padding -
       * 519. Above it the detail has a readable share; below it, whatever the
       * grid gives it is an ellipsis.
       *
       * A CONTAINER query, not a media query. See the note on :host.
       */
      @container (max-width: 519.98px) {
        .strip__bar {
          padding: 0 16px;
        }
        .strip__list {
          display: block;
        }
        /**
         * STILL FIVE ROWS, not a slice of the viewport.
         *
         * This used to cap against 50vh, on the argument that stacked rows are
         * taller and no longer uniform so a row count is meaningless. The
         * height it produced was ~8 rows on a 1000px window and ~4 on a short
         * one - a strip whose length depended on the browser, in a column
         * whose neighbour is a scrolling workflow. Five is the contract in
         * both layouts; only the row height it multiplies changes.
         *
         * 63px: 10px of padding either side, two 20px lines, the 2px row-gap
         * between them and the 1px rule under the row. Every stacked row is
         * exactly that now the detail is clamped to one line, so five rows is
         * five rows rather than "about five".
         */
        .strip__list--expanded {
          max-height: calc(
            var(--trigger-row-height-stacked) * var(--trigger-expanded-rows) +
              var(--trigger-gap-height)
          );
        }
        /* The bar is the strip's own header and stays above its scroll region
           at every width - the stacked layout changes the rows, not that. */
        .trigger {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: baseline;
          column-gap: 12px;
          row-gap: 2px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--line);
          background: var(--panel);
        }
        .trigger:last-child {
          border-bottom: 0;
        }
        .cell {
          height: auto;
          padding: 0;
          border-bottom: 0;
          background: transparent;
        }
        /* Placed explicitly, by row and column. DOM order is name, detail,
           meta - and auto-placement never backtracks, so once the full-width
           detail has claimed row 2 the timestamp is pushed to a row 3 of its
           own instead of sitting beside the name. Naming the cells is what
           keeps it to two lines. */
        .cell--name {
          grid-area: 1 / 1;
        }
        .cell--meta {
          grid-area: 1 / 2;
        }
        /**
         * Full width on its own line - and ONE line.
         *
         * It used to wrap here, on the argument that ellipsising a sentence
         * down to nothing is worse than two lines. That was true of the
         * ellipsis and false of the wrap: a row whose height depends on how
         * much its author wrote makes the whole list unscannable, and made the
         * five-row window hold a different number of rows per case. The
         * sentence is still reachable - it is the row's title.
         */
        .cell--detail {
          grid-area: 2 / 1 / 3 / -1;
          line-height: 20px;
        }
        .trigger--new {
          background: var(--warn-bg);
        }
        .trigger--new .cell {
          background: transparent;
        }
      }
    `,
  ],
  host: {
    '[style.--trigger-row-height]': '"40px"',
    // The divider's own height - chrome inside the scroller, not a row.
    // 32px: the smallest button tier in the product, which is what it is.
    '[style.--trigger-gap-height]': '"32px"',
    // The stacked row, added up rather than measured: 10px of padding either
    // side, two 20px lines, the 2px row-gap between them, and the 1px rule
    // under the row. Miss the border and the five-row window comes out 5px
    // short of five rows.
    '[style.--trigger-row-height-stacked]': '"63px"',
    '[style.--trigger-collapsed-rows]': 'collapsedRows',
    '[style.--trigger-expanded-rows]': 'expandedRows',
  },
})
export class TriggerStripComponent {
  readonly store = inject(CaseStore);
  private readonly injector = inject(Injector);
  readonly collapsedRows = TRIGGER_COLLAPSED_ROWS;
  readonly expandedRows = TRIGGER_EXPANDED_ROWS;

  /** Target of the toggle's aria-controls. Unique so two strips cannot collide. */
  readonly listId = `trigger-list-${++stripSeq}`;

  readonly total = computed(() => this.store.sortedTriggers().length);

  /**
   * How many triggers the collapsed strip is withholding - the middle, between
   * the two anchors.
   *
   * Zero at two triggers or fewer, which is what removes the divider: there is
   * no gap between the oldest and the newest when they are adjacent, and a
   * control offering to reveal nothing is worse than no control.
   */
  readonly hiddenCount = computed(() => Math.max(0, this.total() - TRIGGER_COLLAPSED_ROWS));

  /**
   * OLDEST TO NEWEST, ALWAYS. Collapsed and expanded, one direction.
   *
   * The list is a history and it is read forwards. It briefly ran newest-first
   * when expanded, on the argument that an open list answers "what has been
   * happening" rather than "what are the ends of this" - but that made the
   * newest trigger the bottom row collapsed and the top row expanded, so the
   * act of expanding moved both anchors past each other. Expanding should add
   * rows, not rearrange the ones already on screen.
   *
   * Collapsed is the two ENDS: the oldest, which is why the case exists, and
   * the newest, which is what just happened. Expanded restores the middle
   * between them. Neither anchor moves either way - the same two rows are
   * first and last in both modes, and the divider that names the gap sits
   * between them in both.
   *
   * Rule 11 holds by construction: an unresynced arrival is by definition the
   * newest trigger, so it is the LAST row in either mode and can never be
   * among the rows the collapsed strip withholds.
   */
  readonly visible = computed(() => {
    const all = this.store.sortedTriggers();
    if (this.store.triggersExpanded() || this.hiddenCount() === 0) return all;
    return [all[0], all[all.length - 1]];
  });

  /**
   * True only when EXPANDED and the list is taller than its window, so rows are
   * genuinely behind a scrollbar.
   *
   * Collapsed never scrolls: it renders two rows and a divider, and withholds
   * the rest outright rather than putting them below a fold. That is the
   * difference the divider is for - what it hides is absent, not scrolled past.
   */
  readonly scrollsInternally = computed(
    () => this.store.triggersExpanded() && this.total() > TRIGGER_EXPANDED_ROWS,
  );

  /**
   * Rule 11 arrivals are suppressed once the case is resolved. The amber is an
   * "act on this before recording" signal, and a resolved case cannot be acted
   * on (rule 10) - so state 07 shows neither the highlighted row nor the amber
   * count, whatever the trigger data happens to say.
   */
  readonly showsArrival = computed(
    () => !this.store.isResolved() && this.store.newTriggerCount() > 0,
  );

  isArrival(trigger: { isNew?: boolean }): boolean {
    return !!trigger.isNew && !this.store.isResolved();
  }

  @ViewChild('list') private listEl?: ElementRef<HTMLElement>;

  /**
   * A new trigger arriving expanded is scrolled to.
   *
   * The expanded list is newest first, so the arrival is its FIRST row - which
   * is off screen whenever the agent has scrolled down into the history. The
   * amber is the signal, and a signal in a scroll region nobody is looking at
   * is not one.
   *
   * Keyed on the arrival COUNT, so several landing before a resync each bring
   * the list back rather than only the first. Not on the trigger list itself:
   * that changes for reasons - a resync clearing the flags - that are the
   * agent finishing with the strip, not something new to show them.
   *
   * Collapsed needs none of this. The pair renders the newest as its second
   * row, and two rows do not scroll.
   */
  private lastArrivalCount = 0;
  private readonly revealArrival = effect(() => {
    const arrivals = this.store.newTriggerCount();
    const expanded = this.store.triggersExpanded();
    const grew = arrivals > this.lastArrivalCount;
    this.lastArrivalCount = arrivals;
    if (!grew || !expanded) return;
    // After the row it is scrolling to has been rendered.
    afterNextRender(
      () => this.listEl?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' }),
      { injector: this.injector },
    );
  });
}
