import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { InfoTab } from '../core/models';
import { PillComponent } from './ui-pill.component';

const TAB_LABEL: Record<InfoTab, string> = {
  snapshot: 'Snapshot',
  'past-cases': 'Past AML cases',
  starred: 'Starred',
  timeline: 'Timeline',
};

/**
 * Left panel. Scrolls independently of the workflow stream.
 *
 * Rule 10: once resolved the tab set reduces to Snapshot + Timeline, and the
 * Snapshot tab shows nothing until an outcome's View snapshot is used.
 */
@Component({
  selector: 'player-info-panel',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTabsModule, StampPipe, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="info" aria-label="Player information">
      <mat-tab-group
        class="info__tabs"
        [selectedIndex]="selectedIndex()"
        (selectedIndexChange)="onTabChange($event)"
        animationDuration="0ms"
      >
        @for (tab of store.visibleInfoTabs(); track tab) {
          <mat-tab [label]="label(tab)" />
        }
      </mat-tab-group>

      <!-- tabindex + label, the same contract .stream has: this scrolls, and
           hiding the snapshot Resync left it with no focusable child at all,
           so a keyboard user had no way to scroll it. -->
      <div
        class="info__body"
        [class.info__body--flush]="isFlushTab()"
        #body
        tabindex="0"
        aria-label="Player information"
        (scroll)="onScroll()"
      >
        @switch (store.infoTab()) {
          @case ('snapshot') {
            @if (store.viewedSnapshot(); as snap) {
              <!--
                Same header as the current view, filled differently: label over
                timestamp on the left, the view's ONE control on the right.
                Switching between the two modes must not move anything.
              -->
              <div class="snapshot-head">
                <div class="snapshot-head__text">
                  <p class="snapshot-head__label">Snapshot from {{ snap.title }}</p>
                  <p class="snapshot-head__value">Captured {{ snap.at | stamp }}</p>
                </div>
                <!-- A plain button, not mat-button: it occupies the slot a
                     36px stroked Resync occupies, and Material's button would
                     bring a ripple, a min-width and a border to a text
                     action. -->
                <button
                  type="button"
                  class="snapshot-head__back"
                  aria-label="Back to current snapshot"
                  (click)="store.clearSnapshot()"
                >
                  <mat-icon aria-hidden="true">chevron_left</mat-icon>
                  Back
                </button>
              </div>
              <p class="placeholder">
                Player snapshot as it stood at {{ snap.at | stamp }}. Snapshot content is out of
                scope for this epic.
              </p>
            } @else if (store.isResolved()) {
              <!-- Rule 10. -->
              <p class="empty">No snapshot selected.</p>
              <p class="placeholder">
                Use View snapshot on any outcome to see the player data as it stood when that
                outcome was recorded.
              </p>
            } @else {
              <div class="snapshot-head">
                <div class="snapshot-head__text">
                  <p class="snapshot-head__label">Snapshot generated</p>
                  <p class="snapshot-head__value">{{ store.snapshotGeneratedAt() | stamp }}</p>
                </div>
                <!-- Hidden while the workflow panel's out-of-sync notice is
                     up: that notice owns the action there, and in the
                     two-panel layout both are on screen at once, so leaving
                     this one visible put two Resync buttons in front of the
                     agent. -->
                @if (!store.snapshotOutOfSync()) {
                  <button mat-stroked-button type="button" disabled>
                    <mat-icon>sync</mat-icon>
                    Resync
                  </button>
                }
              </div>
              @if (store.snapshotOutOfSync()) {
                <p class="warn-note" role="alert">
                  <mat-icon fontSet="material-icons-outlined">sync_problem</mat-icon>
                  Out of sync. A trigger arrived after this snapshot was taken.
                </p>
              }
              <p class="placeholder">
                Player snapshot content is out of scope for this epic. This panel proves the
                generation stamp, the resync control and the historical view.
              </p>
            }
          }

          @case ('past-cases') {
            <!--
              Same three-column pattern as the trigger strip: one grid owns the
              columns and each row is a subgrid, so every row shares one set of
              track widths instead of sizing its own.

              Rows are real buttons rather than clickable divs - View is a
              genuine action, so it gets keyboard access and a focus ring for
              free.

              No status column: a past case is resolved by definition.
            -->
            <div class="past" role="group" aria-label="Past AML cases">
              @for (past of store.sortedPastCases(); track past.caseId) {
                <button
                  class="past__row"
                  type="button"
                  [class.past__row--active]="store.viewedPastCase() === past.caseId"
                  [attr.aria-label]="
                    'Open case ' + past.caseId + ', ' + past.severity + ', resolved'
                  "
                  (click)="store.viewPastCase(past.caseId)"
                >
                  <span class="past__id">#{{ past.caseId }}</span>
                  <span class="past__sev">
                    <!--
                      Severity AT RESOLUTION. A historical fact, not a live
                      value: it records what this case was closed at.

                      Do NOT re-derive or re-rank this against SEVERITY_RANK.
                      If the ranking changes, these pills must not move or
                      restyle - the past does not get re-graded. The pill is
                      keyed on the stored string only.
                    -->
                    <ui-pill [severity]="past.severity">
                      {{ past.severity }}
                    </ui-pill>
                  </span>
                  <time class="past__date" [attr.datetime]="past.dateCreated">
                    {{ past.dateCreated | stamp }}
                  </time>
                </button>
              }
            </div>

            @if (store.viewedPastCase(); as caseId) {
              <p class="placeholder">
                Case #{{ caseId }} would open here. This prototype ships a single case fixture, so
                the View behaviour is stubbed.
              </p>
            }
          }

          @case ('starred') {
            <!--
              Figma node 22224:18922. A full-bleed row list, not cards: severity
              pill, author, right-aligned timestamp on the first line, the
              commentary itself on the second.
            -->
            <ul class="starred">
              @for (star of store.sortedStarred(); track star.at) {
                <li class="starred__row">
                  <div class="starred__head">
                    <ui-pill [severity]="star.tag">{{ star.tag }}</ui-pill>
                    <span class="starred__who">{{ star.who }}</span>
                    <time class="starred__at" [attr.datetime]="star.at">{{ star.at | stamp }}</time>
                  </div>
                  <p class="starred__text">{{ star.text }}</p>
                </li>
              }
            </ul>
          }

          @case ('timeline') {
            <!--
              Same shape as Past AML cases: one grid owns the columns, each row
              is a subgrid, and the rows carry the 20px gutter so the list runs
              edge to edge. Not buttons, though - a timeline entry is a record,
              not an action.
            -->
            <ol class="timeline">
              @for (entry of store.sortedTimeline(); track $index) {
                <li class="timeline__item">
                  <time class="timeline__at" [attr.datetime]="entry.at">
                    {{ entry.at | stamp }}
                  </time>
                  <span class="timeline__what">{{ entry.what }}</span>
                  <span class="timeline__who">{{ entry.who }}</span>
                </li>
              }
            </ol>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        height: 100%;
      }
      .info {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--panel);
      }
      .info__tabs {
        flex: none;
        border-bottom: 1px solid var(--line);
      }
      /* Four tabs have to fit 420px without the pagination arrows appearing -
         those arrows cost more width than they save. */
      .info__tabs ::ng-deep .mat-mdc-tab .mdc-tab__text-label {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0;
      }
      .info__tabs ::ng-deep .mat-mdc-tab {
        padding: 0 10px;
        min-width: 0;
      }
      .info__body:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .info__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 12px 20px;
      }
      /**
       * Past AML cases only: the body gives up its side padding so the rows
       * reach both edges. The rows are buttons - a hover or active tint that
       * stops 20px short of the panel edge reads as a floating strip rather
       * than a row of a list. Their own 20px keeps the CONTENT on the same
       * gutter as every other tab, so only the tint moves.
       */
      .info__body--flush {
        padding-left: 0;
        padding-right: 0;
      }
      /* The stub that appears after a row click still has to line up with
         every other tab. Margin, not padding: this is a dashed box, and
         padding would inset its text while leaving the border itself hard
         against the panel edge. */
      .info__body--flush .placeholder {
        margin-left: 20px;
        margin-right: 20px;
      }
      /**
       * One header, two fillings.
       *
       * Left: a small label over a bold timestamp. Right: whatever single
       * control the view has - a stroked Resync when you are on the current
       * snapshot, a text Back when you are on a historical one.
       *
       * min-height is the point of the whole block. The two controls are not
       * the same height (a stroked Material button is 36px, a text button is
       * its line box), so without a floor the header would grow and shrink as
       * you moved between the modes and everything under it would jump.
       */
      .snapshot-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 40px;
      }
      .snapshot-head__text {
        min-width: 0;
      }
      /* One line each, both modes. The historical label is the longest string
         either mode puts here, and a wrap would defeat the fixed height. */
      .snapshot-head__label {
        margin: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .snapshot-head__value {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Text style: no border, no fill, no min-width. The visible label is
         just "Back"; aria-label carries the full sentence, because "Back" on
         its own does not say where to out of context. */
      .snapshot-head__back {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        flex: none;
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--link);
        cursor: pointer;
        white-space: nowrap;
      }
      /* Colour only - no underline. The icon has to be told as well: mat-icon
         sets its own colour, so a rule on the button alone leaves the chevron
         behind at the rest colour. */
      .snapshot-head__back:hover,
      .snapshot-head__back:hover mat-icon {
        color: var(--link-hover);
      }
      .snapshot-head__back:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 3px;
        border-radius: 2px;
      }
      .snapshot-head__back mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        flex: none;
      }
      .warn-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 14px 0 0;
        padding: 16px;
        border-radius: 8px;
        background: var(--warn-bg);
        color: var(--warn);
        font-size: 14px;
        line-height: 20px;
      }
      .warn-note mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        flex: none;
      }
      .placeholder {
        margin: 18px 0 0;
        padding: 14px;
        border: 1px dashed var(--line-strong);
        border-radius: 10px;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
      }
      .empty {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--ink-2);
      }
      /**
       * Figma node 22224:18922.
       *
       * Rows, not cards: 12px 20px with a rule between them, running the full
       * width of the panel. The head is pill, author, then the timestamp
       * pushed hard right by margin-left: auto - not a spacer column, so a
       * long author name takes the room it needs before the stamp gives way.
       */
      .starred {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .starred__row {
        padding: 12px 20px;
        border-bottom: 1px solid var(--line);
      }
      .starred__row:last-of-type {
        border-bottom: 0;
      }
      .starred__head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .starred__who {
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        text-transform: capitalize;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .starred__at {
        flex: none;
        margin-left: auto;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .starred__text {
        margin: 6px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
      }
      /* Past AML cases: 90px ID / severity pill / right-aligned date. */
      .past {
        display: grid;
        grid-template-columns: 90px auto 1fr;
      }
      .past__row {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        align-items: center;
        gap: 0 12px;
        height: 44px;
        padding: 0 20px;
        border: 0;
        border-bottom: 1px solid var(--line);
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .past__row:last-of-type {
        border-bottom: 0;
      }
      .past__row:hover {
        background: var(--page);
      }
      .past__row:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .past__row--active {
        background: var(--primary-bg);
      }
      .past__id {
        font-weight: 600;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink);
      }
      .past__sev {
        display: flex;
        min-width: 0;
      }
      .past__date {
        text-align: right;
        white-space: nowrap;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
        font-variant-numeric: tabular-nums;
      }

      /**
       * Figma node 22224:18961.
       *
       * Two lines in the left column - timestamp over what happened - and the
       * actor right-aligned on the second of them. 8px 20px inside a 52px row
       * with a 1px rule under it: 8 + 16 + 20 + 8 = 52, so the height falls
       * out of the type rather than being asserted on top of it.
       *
       * The cells are placed by hand. Auto-placement never backtracks, so the
       * actor would take a third row of its own instead of sitting beside the
       * second line - the same trap the trigger strip fell into.
       */
      .timeline {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .timeline__item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: 12px;
        min-height: 52px;
        padding: 8px 20px;
        border-bottom: 1px solid var(--line);
      }
      .timeline__item:last-of-type {
        border-bottom: 0;
      }
      /* No hover tint: these rows are records, not controls. See the trigger
         strip - a tint on something that cannot be clicked is a lie. */
      .timeline__at {
        grid-area: 1 / 1;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
        font-variant-numeric: tabular-nums;
      }
      .timeline__what {
        grid-area: 2 / 1;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink);
      }
      .timeline__who {
        grid-area: 2 / 2;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
        text-align: right;
        white-space: nowrap;
        text-transform: capitalize;
      }
    `,
  ],
})
export class PlayerInfoPanelComponent implements AfterViewInit {
  @ViewChild('body') private bodyEl?: ElementRef<HTMLElement>;

  /** A reflow rebuilds this panel, so the scroll offset lives in the store. */
  ngAfterViewInit(): void {
    const el = this.bodyEl?.nativeElement;
    if (el) el.scrollTop = this.store.infoScroll();
  }

  onScroll(): void {
    const el = this.bodyEl?.nativeElement;
    if (el) this.store.infoScroll.set(el.scrollTop);
  }

  readonly store = inject(CaseStore);

  readonly selectedIndex = computed(() => {
    const index = this.store.visibleInfoTabs().indexOf(this.store.infoTab());
    return index === -1 ? 0 : index;
  });

  /**
   * Tabs whose content is a full-bleed row list. The body drops its side
   * padding and each row carries the 20px itself, so a separator or a tint
   * reaches the panel edge while the text still lands on the shared gutter.
   */
  readonly isFlushTab = computed(() => {
    const tab = this.store.infoTab();
    return tab === 'past-cases' || tab === 'timeline' || tab === 'starred';
  });

  label(tab: InfoTab): string {
    return TAB_LABEL[tab];
  }

  onTabChange(index: number): void {
    const tab = this.store.visibleInfoTabs()[index];
    if (tab) this.store.infoTab.set(tab);
  }
}
