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
import { RiskAssessmentComponent } from './risk-assessment.component';
import { PillComponent } from './ui-pill.component';

const TAB_LABEL: Record<InfoTab, string> = {
  risk: 'Risk assessment',
  'past-cases': 'Past AML cases',
  starred: 'Starred',
  timeline: 'Timeline',
};

/**
 * Left panel. Scrolls independently of the workflow stream.
 *
 * Rule 10: once resolved the tab set reduces to Risk assessment + Timeline,
 * and the Risk assessment is shown read-only, as it was finalized.
 */
@Component({
  selector: 'player-info-panel',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTabsModule, StampPipe, PillComponent, RiskAssessmentComponent],
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
           a tab with no focusable child would leave a keyboard user no way to
           scroll it. -->
      <div
        class="info__body"
        [class.info__body--flush]="isFlushTab()"
        #body
        tabindex="0"
        aria-label="Player information"
        (scroll)="onScroll()"
      >
        @switch (store.infoTab()) {
          @case ('risk') {
            <risk-assessment />
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
                  <!--
                    Two lines, same rhythm as the starred rows: a fixed head
                    that never truncates, then the reason at full width below.
                    Still ONE button, so hover and focus cover both lines.
                  -->
                  <span class="past__head">
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
                    <ui-pill size="sm" [severity]="past.severity">
                      {{ past.severity }}
                    </ui-pill>
                  </span>
                  <time class="past__date" [attr.datetime]="past.dateCreated">
                    {{ past.dateCreated | stamp }}
                  </time>
                  </span>
                  <span class="past__reason" [title]="past.reason">{{ past.reason }}</span>
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
                    <span class="starred__who">{{ star.who }}</span>
                    <time class="starred__at" [attr.datetime]="star.at">{{ star.at | stamp }}</time>
                  </div>
                  <!-- Clamped to one line; the title is where the rest of it
                       still is. -->
                  <p class="starred__text" [attr.title]="star.text">{{ star.text }}</p>
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
                  <span class="timeline__what" [attr.title]="entry.what">{{ entry.what }}</span>
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
      /* Tab type and padding used to live here. They are in styles.scss now,
         beside the header tokens: the cases table uses the same tab bar, and a
         component-scoped copy is exactly how the two would drift apart. */
      .info__body:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .info__body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 16px 20px;
      }
      /* 16px on mobile, matching head__main and the page gutter. Placed BEFORE
         the flush rule below on purpose: both are single-class selectors, so
         the later one wins, and Past AML cases must still reach 0. */
      @media (max-width: 719.98px) {
        .info__body {
          padding-left: 16px;
          padding-right: 16px;
        }
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
      .placeholder {
        margin: 16px 0 0;
        padding: 16px;
        border: 1px dashed var(--line-strong);
        border-radius: 10px;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
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
        color: var(--foreground-primary);
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
        color: var(--foreground-secondary);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .starred__text {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
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
      /**
       * Past AML cases: two lines, on the starred rows' rhythm - 12px/20px
       * padding, a fixed head line, then muted body text below.
       *
       * The subgrid is gone with the fixed height: the row is a column now, so
       * there are no columns for the parent to hand down, and a height would
       * cut the second line off.
       */
      .past {
        display: block;
      }
      .past__row {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        width: 100%;
        text-align: left;
        padding: 12px 20px;
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
      /* Line one. Nothing here shrinks or truncates; the date holds the right
         edge with an auto margin, the same guarantee the event row uses. */
      .past__head {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .past__id {
        flex: none;
        font-weight: 600;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
      }
      .past__sev {
        display: flex;
        flex: none;
      }
      /* Line two: full width, two lines then ellipsis, full text on title.
         No height of any kind - the clamp is a maximum, so a short reason
         renders at one line. */
      .past__reason {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
      .past__date {
        flex: none;
        margin-left: auto;
        text-align: right;
        white-space: nowrap;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
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
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      .timeline__what {
        grid-area: 2 / 1;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
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
      .timeline__who {
        grid-area: 2 / 2;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
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
