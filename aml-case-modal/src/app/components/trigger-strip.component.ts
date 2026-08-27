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
        The bar itself is NOT a control - it is a label strip. Only the verb is
        a button, so the count and the scroll note stay plain, selectable text
        and the hit target is exactly the thing that does something.
      -->
      <div class="strip__bar">
        <ui-pill
          [tone]="showsArrival() ? 'warn' : 'info'"
        >
          {{ total() }} {{ total() === 1 ? 'trigger' : 'triggers' }}
        </ui-pill>

        <!-- Only when the list is actually withholding rows behind a scrollbar
             is showing-vs-total worth saying. Either mode can be. -->
        @if (scrollsInternally()) {
          <span class="strip__count">
            Showing {{ visibleRows() }} of {{ total() }}, scroll for more
          </span>
        }

        <!--
          ONE button whose label and aria-expanded change - never two buttons
          that swap places. aria-controls points at the region it reveals.
          Absent entirely when there is nothing to reveal.
        -->
        @if (canToggle()) {
          <button
            class="strip__verb"
            type="button"
            [attr.aria-expanded]="isExpanded()"
            [attr.aria-controls]="visible().length ? listId : null"
            (click)="store.triggersExpanded.set(!store.triggersExpanded())"
          >
            <!-- Decoration: the visible label already carries the meaning. -->
            <mat-icon aria-hidden="true">
              {{ store.triggersExpanded() ? 'expand_less' : 'expand_more' }}
            </mat-icon>
            {{ store.triggersExpanded() ? 'Show less' : 'Show all' }}
          </button>
        }
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
          @for (trigger of visible(); track trigger.id) {
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
              <span class="cell cell--detail">{{ trigger.detail }}</span>
              <span class="cell cell--meta">
                <time class="cell__at" [attr.datetime]="trigger.at">{{ trigger.at | stamp }}</time>
              </span>
            </div>
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
      .strip__count {
        flex: 0 1 auto;
        min-width: 0;
        font-size: 12px;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* The only control in the strip. margin-left: auto, not a flexing
         sibling - it stays hard right whether or not the scroll note is there.
         Padding gives it a real hit target rather than bare text. */
      .strip__verb {
        flex: none;
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--primary);
        cursor: pointer;
      }
      .strip__verb:hover {
        background: var(--primary-bg);
      }
      .strip__verb:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 1px;
      }
      .strip__verb mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
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
      .strip__list--expanded {
        max-height: calc(var(--trigger-row-height) * var(--trigger-expanded-rows));
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
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
         * 62px: 10px of padding either side, two 20px lines, and the 2px
         * row-gap between them. A row whose detail wraps to a second line is
         * taller, so the window then holds a little under five - which is the
         * honest reading of "five rows" for rows that are not all one height,
         * and much closer to it than a fraction of the window.
         */
        .strip__list--expanded {
          max-height: calc(var(--trigger-row-height-stacked) * var(--trigger-expanded-rows));
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
        /* The whole point: full width on its own line, and allowed to wrap
           instead of ellipsising a sentence down to nothing. */
        .cell--detail {
          grid-area: 2 / 1 / 3 / -1;
          line-height: 20px;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
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
   * A toggle is only worth offering once there is a middle to reveal. At two
   * triggers or fewer the collapsed pair IS the whole history, so Show all
   * would reveal nothing and a control that reveals nothing is worse than no
   * control.
   */
  readonly canToggle = computed(() => this.total() > TRIGGER_COLLAPSED_ROWS);


  /**
   * THE TWO MODES READ IN OPPOSITE DIRECTIONS, and that is the design.
   *
   * Collapsed is a PAIR: the oldest trigger, then the newest. Not a slice of
   * the list - the two ends of it. The oldest is why the case exists and the
   * newest is what just happened, so ascending is the only order in which the
   * pair reads as a sentence: it started here, and this is where it is now.
   *
   * Expanded is the whole history NEWEST FIRST, like every other time-ordered
   * list in the product. Once every row is on screen the question changes from
   * "what are the ends of this" to "what has been happening", and the answer to
   * that is read from the top down, most recent first.
   *
   * The consequence is deliberate and worth stating: the newest trigger is the
   * BOTTOM row collapsed and the TOP row expanded. It moves because the reason
   * it is on screen moves - anchoring the recent end of a two-row summary, then
   * heading a list.
   *
   * Rule 11 holds by construction either way: an unresynced arrival is by
   * definition the newest trigger, so it is the second collapsed row and the
   * first expanded one. It can never be among the rows the pair withholds.
   */
  readonly visible = computed(() => {
    const all = this.store.sortedTriggers();
    if (this.store.triggersExpanded()) return [...all].reverse();
    // At or below two there is no middle, so the pair is the whole list - and
    // taking both ends of a one-trigger list would render it twice.
    if (!this.canToggle()) return all;
    return [all[0], all[all.length - 1]];
  });

  /** How many rows the current window shows before it scrolls. */
  readonly visibleRows = computed(() =>
    this.store.triggersExpanded() ? TRIGGER_EXPANDED_ROWS : TRIGGER_COLLAPSED_ROWS,
  );

  /**
   * True only when EXPANDED and the list is taller than its window, so rows are
   * genuinely behind a scrollbar.
   *
   * Collapsed never scrolls: it renders exactly two rows and withholds the rest
   * outright rather than putting them below a fold. Show all is the control for
   * that, which is why the collapsed bar says nothing about scrolling.
   */
  readonly scrollsInternally = computed(
    () => this.store.triggersExpanded() && this.total() > TRIGGER_EXPANDED_ROWS,
  );

  /**
   * What aria-expanded reports. Not simply triggersExpanded(): below the
   * toggle point every row is visible regardless, so the region IS expanded and
   * saying otherwise would describe the page inaccurately.
   */
  readonly isExpanded = computed(() =>
    this.canToggle() ? this.store.triggersExpanded() : true,
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
