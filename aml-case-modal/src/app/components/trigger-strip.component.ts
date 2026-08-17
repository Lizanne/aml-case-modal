import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import {
  TRIGGER_COLLAPSE_THRESHOLD,
  TRIGGER_EXPANDED_ROWS,
  TRIGGER_PREVIEW_ROWS,
} from '../core/models';

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
 * The control never moves and never changes shape: it is the same row, in the
 * same place, in every state and at both layout widths. Only the secondary
 * text and the verb change.
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
 * column widths. The NEW marker sits inside the timestamp cell rather than
 * taking a column of its own, so a highlighted row lines up exactly like every
 * other row.
 */
@Component({
  selector: 'trigger-strip',
  standalone: true,
  imports: [MatIconModule, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="strip" aria-label="Case triggers">
      <button
        class="strip__toggle"
        type="button"
        [disabled]="!canToggle()"
        [attr.aria-expanded]="canToggle() ? store.triggersExpanded() : null"
        (click)="store.triggersExpanded.set(!store.triggersExpanded())"
      >
        <span class="strip__chip" [class.strip__chip--new]="store.newTriggerCount() > 0">
          {{ total() }} {{ total() === 1 ? 'trigger' : 'triggers' }}
        </span>

        <!-- Only when the expanded list is actually withholding rows behind a
             scrollbar is showing-vs-total worth saying. -->
        @if (scrollsInternally()) {
          <span class="strip__count">
            Showing {{ expandedRows }} of {{ total() }}, scroll for more
          </span>
        }

        <!-- No verb when there is nothing to reveal. -->
        @if (canToggle()) {
          <span class="strip__verb">
            <mat-icon>{{ store.triggersExpanded() ? 'expand_less' : 'expand_more' }}</mat-icon>
            {{ store.triggersExpanded() ? 'Show less' : 'Show all' }}
          </span>
        }
      </button>

      @if (visible().length) {
        <!-- A scrollable region must be focusable or keyboard users cannot
             reach the rows below the fold. tabindex only when it scrolls. -->
        <div
          class="strip__list"
          [class.strip__list--expanded]="store.triggersExpanded()"
          role="list"
          [attr.tabindex]="scrollsInternally() ? 0 : null"
          [attr.aria-label]="scrollsInternally() ? 'Triggers, scrollable list' : null"
        >
          @for (trigger of visible(); track trigger.id) {
            <div class="trigger" [class.trigger--new]="trigger.isNew" role="listitem">
              <span class="cell cell--name">{{ trigger.name }}</span>
              <span class="cell cell--detail">{{ trigger.detail }}</span>
              <span class="cell cell--meta">
                @if (trigger.isNew) {
                  <span class="cell__new">New</span>
                }
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

      /* The single control. Same box, same click target, both states. */
      .strip__toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: var(--trigger-row-height);
        padding: 0 12px 0 20px;
        border: 0;
        background: var(--panel);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .strip__toggle:hover:not(:disabled) {
        background: var(--page);
      }
      .strip__toggle:disabled {
        cursor: default;
      }
      .strip__toggle:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .strip__chip {
        flex: none;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        background: var(--primary-bg);
        color: var(--primary-ink);
      }
      /* Rule 11: the arrival is also flagged on the control itself, so it
         survives the row scrolling out of view in a long expanded list. */
      .strip__chip--new {
        background: var(--warn-bg);
        color: var(--warn);
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
      /* margin-left: auto, not a flexing sibling - the verb stays hard right
         whether or not the optional scroll note is there. */
      .strip__verb {
        flex: none;
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--primary);
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

      .cell {
        height: var(--trigger-row-height);
        border-bottom: 1px solid var(--line);
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
        background: var(--panel);
      }
      /* Block cells so text-overflow works directly on the cell. */
      .cell--name,
      .cell--detail {
        display: block;
        line-height: var(--trigger-row-height);
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
      .cell--meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
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
      .cell__new {
        flex: none;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--warn);
        color: #fff;
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
}
