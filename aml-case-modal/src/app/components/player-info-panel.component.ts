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
        [class.info__body--flush]="store.infoTab() === 'past-cases'"
        #body
        tabindex="0"
        aria-label="Player information"
        (scroll)="onScroll()"
      >
        @switch (store.infoTab()) {
          @case ('snapshot') {
            @if (store.viewedSnapshot(); as snap) {
              <!-- Historical view: name the action that captured it, and offer a way back. -->
              <div class="banner">
                <mat-icon fontSet="material-icons-outlined">history</mat-icon>
                <p class="banner__title">
                  Snapshot from {{ snap.title }} · Captured {{ snap.at | stamp }}
                </p>
                <button mat-button type="button" class="banner__back" (click)="store.clearSnapshot()">
                  <mat-icon>arrow_back</mat-icon>
                  Back to current snapshot
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
                <div>
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
              @for (past of store.pastCases(); track past.caseId) {
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
            <ul class="rows">
              @for (star of store.starred(); track star.at) {
                <li class="row row--stacked">
                  <div class="row__head">
                    <ui-pill [severity]="star.tag">{{ star.tag }}</ui-pill>
                    <span class="row__meta">{{ star.who }} · {{ star.at | stamp }}</span>
                  </div>
                  <p class="row__text">{{ star.text }}</p>
                </li>
              }
            </ul>
          }

          @case ('timeline') {
            <ol class="timeline">
              @for (entry of store.timeline(); track $index) {
                <li class="timeline__item">
                  <span class="timeline__at">{{ entry.at | stamp }}</span>
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
      .snapshot-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .snapshot-head__label {
        margin: 0;
        font-size: 12px;
        color: var(--ink-3);
      }
      .snapshot-head__value {
        margin: 2px 0 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--ink);
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
      /**
       * One row: icon, the sentence, and the way back hard right. flex-wrap is
       * the narrow-width answer - the button drops to a line of its own and
       * stays right-aligned rather than being clipped or squeezing the text.
       * The way out used to be a stranded button UNDER the banner, which read
       * as a separate control belonging to the page rather than to the
       * historical view it exits.
       */
      .banner {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 16px;
        border-radius: 10px;
        background: var(--primary-bg);
        color: var(--primary-ink);
        align-items: flex-start;
      }
      .banner mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        flex: none;
      }
      .banner__title {
        flex: 1 1 12rem;
        min-width: 0;
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
      }
      /* Hard right on the title's row, and still hard right on its own row
         once the sentence has taken the width. align-self keeps it optically
         centred against a single line of text while the icon stays top-aligned. */
      .banner__back {
        flex: none;
        margin-left: auto;
        align-self: center;
        color: var(--primary-ink);
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
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 10px;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
      }
      .row--stacked {
        display: block;
      }
      .row__head {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .row__meta {
        color: var(--ink-3);
        font-size: 12px;
      }
      .row__text {
        margin: 8px 0 0;
        line-height: 1.5;
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

      .timeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 2px;
      }
      .timeline__item {
        display: grid;
        grid-template-columns: 130px 1fr;
        gap: 4px 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
        font-size: 14px;
        line-height: 20px;
      }
      .timeline__at {
        color: var(--ink-3);
        font-variant-numeric: tabular-nums;
      }
      .timeline__what {
        color: var(--ink);
      }
      .timeline__who {
        grid-column: 2;
        color: var(--ink-3);
        font-size: 12px;
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

  label(tab: InfoTab): string {
    return TAB_LABEL[tab];
  }

  onTabChange(index: number): void {
    const tab = this.store.visibleInfoTabs()[index];
    if (tab) this.store.infoTab.set(tab);
  }
}
