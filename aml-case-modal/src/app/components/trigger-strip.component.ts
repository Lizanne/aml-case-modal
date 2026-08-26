import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { PillComponent } from './ui-pill.component';
import { TRIGGER_EXPANDED_ROWS, TRIGGER_PREVIEW_ROWS } from '../core/models';

/** Unique-id counter, so two strips on one page cannot collide on aria-controls. */
let stripSeq = 0;

/**
 * One trigger control, identical in every state and at every width.
 *
 * The strip is a single toggle row - count chip, secondary text, verb - with
 * the trigger rows underneath it:
 *
 *   collapsed, <=5  (3 triggers)
 *                   [all 3 rows, no toggle]
 *   collapsed, 6+   (19 triggers)                              v Show all
 *                   [oldest 4, then the newest - 5 rows, no scroll]
 *   expanded        (19 triggers)  Showing 10 of 19, scroll...  ^ Show less
 *                   [all 19 rows, 10 visible, scrolling]
 *
 * EVERY mode reads oldest first, most recent last. The collapsed preview is
 * five rows that SPAN the history - its first row is the oldest trigger and
 * its last is the most recent - and the expanded list is the same two anchors
 * with everything in between restored.
 *
 * Collapsed does not scroll. It renders exactly what it shows, so the rows it
 * drops are absent rather than below a fold, and Show all is the only way to
 * reach them. That is the difference the toggle is for.
 *
 * The badge is the only place a count is rendered. It previously sat beside
 * both "Showing 2 of 19" and "+17 more triggers" - three restatements of one
 * number, two of them separately computed and free to drift apart. Showing-vs-
 * total is only information when the list is genuinely withholding rows behind
 * a scrollbar, so that is the only time it is said - which is now either mode.
 *
 * Collapsing only pays for itself when it hides something: at or below
 * TRIGGER_PREVIEW_ROWS every row is already visible, so the toggle disappears
 * entirely - a control that reveals nothing is worse than no control.
 *
 * The bar is a LABEL STRIP, not a control. Only the Show all / Show less verb
 * is a button - the count chip and the scroll note are plain, selectable text.
 * Making the whole bar the hit target meant the strip's first row looked and
 * behaved like a clickable row, which is exactly what rows must not be.
 *
 * The control never moves and never changes shape: same place, every state,
 * both layout widths. Only its label and aria-expanded change.
 *
 * Rule 11: an unresynced arrival is the NEWEST trigger, so it is the last row
 * in both modes - and because the collapsed preview ends on the most recent
 * rather than the fifth-oldest, it is always on screen, never one of the rows
 * the preview drops. The count chip carries the same amber as a second signal.
 *
 * The highlight persists until resync (open question 6). The count chip also
 * carries the amber, so the arrival stays visible if the row scrolls out of
 * view in the expanded list.
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
        min-height: var(--trigger-row-height);
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
       * BOTH modes scroll, and the only difference between them is the height
       * of the window: five rows collapsed, ten expanded. The strip must never
       * push the workflow off screen, and a collapsed list holding twenty rows
       * would do exactly that without a cap of its own.
       */
      .strip__list {
        display: grid;
        grid-template-columns: minmax(140px, 220px) minmax(0, 1fr) auto;
        border-top: 1px solid var(--line);
        max-height: calc(var(--trigger-row-height) * var(--trigger-preview-rows));
        overflow-y: auto;
      }
      .strip__list--expanded {
        max-height: calc(var(--trigger-row-height) * var(--trigger-expanded-rows));
      }
      /* On the list, not on --expanded: a collapsed list scrolls too, so a
         keyboard user reaching it needs the same ring either way. */
      .strip__list:focus-visible {
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
      @media (max-width: 719.98px) {
        .strip__bar {
          padding: 0 16px;
        }
        .strip__list {
          display: block;
          /* Rows are taller and no longer uniform, so a row-count height is
             meaningless here. Cap against the screen instead, keeping the two
             modes in the same proportion they have on desktop. */
          max-height: 30vh;
        }
        .strip__list--expanded {
          max-height: 50vh;
        }
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
    '[style.--trigger-preview-rows]': 'previewRows',
    '[style.--trigger-expanded-rows]': 'expandedRows',
  },
})
export class TriggerStripComponent {
  readonly store = inject(CaseStore);
  readonly previewRows = TRIGGER_PREVIEW_ROWS;
  readonly expandedRows = TRIGGER_EXPANDED_ROWS;

  /** Target of the toggle's aria-controls. Unique so two strips cannot collide. */
  readonly listId = `trigger-list-${++stripSeq}`;

  readonly total = computed(() => this.store.sortedTriggers().length);

  /**
   * A toggle is only worth offering once the collapsed window cannot hold
   * everything. At or below TRIGGER_PREVIEW_ROWS every trigger is already on
   * screen, and Show all would reveal nothing.
   */
  readonly canToggle = computed(() => this.total() > TRIGGER_PREVIEW_ROWS);

  /**
   * Collapsed: the oldest four, then the newest. Expanded: everything.
   *
   * The preview SPANS the history rather than sampling the start of it. Its
   * first row is the oldest trigger and its last row is the most recent, so
   * both ends of the case are on screen at once and the five rows answer "when
   * did this start, and what has just happened" without a scroll. Five rows off
   * the top would answer only the first half of that, and the half that
   * matters least.
   *
   * It also keeps rule 11 true by construction: an unresynced arrival is by
   * definition the most recent trigger, so it IS the last preview row and can
   * never be one of the ones dropped.
   *
   * The rows between three and eighteen are genuinely absent, not scrolled
   * past - which is what Show all is for.
   */
  readonly visible = computed(() => {
    const all = this.store.sortedTriggers();
    if (this.store.triggersExpanded() || !this.canToggle()) return all;
    return [...all.slice(0, TRIGGER_PREVIEW_ROWS - 1), all[all.length - 1]];
  });

  /** How many rows the current window shows before it scrolls. */
  readonly visibleRows = computed(() =>
    this.store.triggersExpanded() ? TRIGGER_EXPANDED_ROWS : TRIGGER_PREVIEW_ROWS,
  );

  /**
   * True only when EXPANDED and the list is taller than its window, so rows are
   * genuinely behind a scrollbar.
   *
   * Collapsed never scrolls: it renders exactly the rows it shows, so there is
   * nothing behind the fold to reach. What it withholds it withholds outright,
   * and Show all is the control for that - which is why the collapsed bar says
   * nothing about scrolling.
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
   * No scroll pinning anywhere. Both windows open at the top and read forward
   * in time, and the collapsed one renders exactly five rows, so there is no
   * scroll position to choose in the first place.
   */

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
}
