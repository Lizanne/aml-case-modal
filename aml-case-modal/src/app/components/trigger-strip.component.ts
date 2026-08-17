import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { PillComponent } from './ui-pill.component';
import {
  TRIGGER_COLLAPSE_THRESHOLD,
  TRIGGER_EXPANDED_ROWS,
  TRIGGER_PREVIEW_ROWS,
} from '../core/models';

/** Unique-id counter, so two strips on one page cannot collide on aria-controls. */
let stripSeq = 0;

/**
 * One trigger control, identical in every state and at every width.
 *
 * The strip is a single toggle row - count chip, secondary text, verb - with
 * the trigger rows underneath it:
 *
 *   collapsed, 4+   (19 triggers)                              v Show all
 *                   [2 most recent rows]
 *   collapsed, <=3  (3 triggers)
 *                   [all 3 rows]
 *   expanded        (19 triggers)                              ^ Show less
 *                   [all rows]
 *   expanded, 10+   (19 triggers)  Showing 10 of 19, scroll...  ^ Show less
 *                   [10 rows visible, scrolling]
 *
 * The badge is the only place a count is rendered. It previously sat beside
 * both "Showing 2 of 19" and "+17 more triggers" - three restatements of one
 * number, two of them separately computed and free to drift apart. Showing-vs-
 * total is only information in the one state where the list is genuinely
 * withholding rows behind a scrollbar, so that is the only state that says it.
 *
 * Collapsing only pays for itself when it hides something: at or below
 * TRIGGER_COLLAPSE_THRESHOLD every row shows and the overflow badge disappears
 * entirely, because "+0 more" is noise and a toggle that reveals nothing is
 * worse than no toggle.
 *
 * The bar is a LABEL STRIP, not a control. Only the Show all / Show less verb
 * is a button - the count chip and the scroll note are plain, selectable text.
 * Making the whole bar the hit target meant the strip's first row looked and
 * behaved like a clickable row, which is exactly what rows must not be.
 *
 * The control never moves and never changes shape: same place, every state,
 * both layout widths. Only its label and aria-expanded change.
 *
 * Rule 11: an unresynced arrival is pinned to the top row in BOTH modes - it is
 * sorted first, so it is always inside the collapsed preview, never hidden
 * behind the badge.
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
          [tone]="showsArrival() ? 'warn' : 'primary'"
        >
          {{ total() }} {{ total() === 1 ? 'trigger' : 'triggers' }}
        </ui-pill>

        <!-- Only when the expanded list is actually withholding rows behind a
             scrollbar is showing-vs-total worth saying. -->
        @if (scrollsInternally()) {
          <span class="strip__count">
            Showing {{ expandedRows }} of {{ total() }}, scroll for more
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
        padding: 0 12px 0 20px;
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

      /* One grid for the whole list, so all rows share column widths. */
      .strip__list {
        display: grid;
        grid-template-columns: minmax(140px, 220px) minmax(0, 1fr) auto;
        border-top: 1px solid var(--line);
      }
      /* Ten rows then scroll - the strip must never push the workflow off
         screen. Only the expanded list can get long enough to need it. */
      .strip__list--expanded:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .strip__list--expanded {
        max-height: calc(var(--trigger-row-height) * var(--trigger-expanded-rows));
        overflow-y: auto;
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
        padding: 0 12px 0 20px;
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
    `,
  ],
  host: {
    '[style.--trigger-row-height]': '"40px"',
    '[style.--trigger-expanded-rows]': 'expandedRows',
  },
})
export class TriggerStripComponent {
  readonly store = inject(CaseStore);
  readonly expandedRows = TRIGGER_EXPANDED_ROWS;

  /** Target of the toggle's aria-controls. Unique so two strips cannot collide. */
  readonly listId = `trigger-list-${++stripSeq}`;

  readonly total = computed(() => this.store.sortedTriggers().length);

  /** Above the threshold there is something worth hiding, so the strip toggles. */
  readonly canToggle = computed(() => this.total() > TRIGGER_COLLAPSE_THRESHOLD);

  /**
   * Collapsed shows the two most recent when there is an overflow, or every row
   * when there is not. Expanded always shows all of them.
   *
   * Rule 11: sortedTriggers pins an unresynced arrival first, so it occupies
   * the top row of the preview and can never be one of the hidden ones.
   */
  readonly visible = computed(() => {
    const all = this.store.sortedTriggers();
    if (this.store.triggersExpanded() || !this.canToggle()) return all;
    return all.slice(0, TRIGGER_PREVIEW_ROWS);
  });

  /**
   * True only when expanded AND the list is taller than its cap, so rows are
   * genuinely hidden behind a scrollbar. This is the one state where
   * showing-vs-total tells the agent something they cannot see for themselves.
   */
  readonly scrollsInternally = computed(
    () => this.store.triggersExpanded() && this.total() > TRIGGER_EXPANDED_ROWS,
  );

  /**
   * What aria-expanded reports. Not simply triggersExpanded(): below the
   * collapse threshold every row is rendered regardless, so the region IS
   * expanded and saying otherwise would describe the page inaccurately.
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
}
