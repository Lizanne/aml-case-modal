import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Overlay } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_MENU_SCROLL_STRATEGY, MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { CasesStore } from '../core/cases-store';
import { CASES_TABS, CasesTab, NavStore, QUEUE_COPY } from '../core/nav-store';
import { CaseRecord, TriggerRef, lockStatusLine, relativeAge, WorkItem } from '../core/models';
import { PillComponent } from './ui-pill.component';
import { TriggerPopoverComponent } from './trigger-popover.component';
import { WorkPopoverComponent } from './work-popover.component';

/**
 * The Global AML Cases table - PROTOTYPE-TABLE.md.
 *
 * T-01 and T-02: the two working queues, seeded, with every row treatment
 * visible. Popovers, the lock flow and real-time land in later steps.
 *
 * Nothing here is redrawn from the modal: the severity pill is ui-pill, the
 * lock sentence is lockStatusLine(), and both come from the components the
 * modal already ships.
 */
@Component({
  selector: 'cases-table',
  standalone: true,
  imports: [
    CdkScrollable,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTabsModule,
    MatTooltipModule,
    PillComponent,
    TriggerPopoverComponent,
    WorkPopoverComponent,
  ],
  /**
   * Scrolling closes the popover; it does not follow the row.
   *
   * Material's default is reposition, which keeps the panel glued to a trigger
   * that is sliding up the screen - and this trigger is in a scrolling table
   * inside a scrolling page, so it would chase the row and then hang over the
   * header. A breakdown is about one row: if that row moves, the panel has
   * stopped being anchored to anything the reader is looking at.
   */
  providers: [
    {
      provide: MAT_MENU_SCROLL_STRATEGY,
      useFactory: (overlay: Overlay) => () => overlay.scrollStrategies.close(),
      deps: [Overlay],
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cases" aria-labelledby="cases-title">
      <header class="cases__head">
        <!-- Both come from QUEUE_COPY, which the sidebar entry reads too:
             clicking "Compliance AML cases" has to land somewhere that agrees
             it is the Compliance queue. -->
        <h1 class="cases__title" id="cases-title">
          {{ copy().title }}<a
            class="th__info"
            [href]="DOCS_URL"
            target="_blank"
            rel="noopener noreferrer"
            matTooltip="AML cases documentation"
            aria-label="AML cases documentation, opens in new tab"
          >
            <svg
              class="th__info-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </a>
        </h1>
        <p class="cases__sub">{{ copy().sub }}</p>
      </header>

      <!--
        Tab bar and Refresh share one line, and one bottom rule runs under
        both. The rule lives on the toolbar rather than on the tab group so it
        spans the full width including the button, which it would not do if
        the group kept its own border and the button sat outside it.
      -->
      <div class="cases__toolbar">
        <!--
          The SAME mat-tab-group the case panel uses, not a lookalike. Its
          type, padding, indicator and header tokens all come from styles.scss,
          so the two bars cannot drift.

          [mat-stretch-tabs]="false" is the ONE deliberate difference, and it is an
          input rather than a CSS override so it stays visible in the template.
          Material defaults stretchTabs to true, which is why four tabs were
          being distributed across 1264px here. The panel keeps the default:
          its own header is 419px and the tabs already fill it, so turning
          stretch off there would shrink them to 317px and leave a gap - a
          change to the case modal, which is frozen.

          Idle and Archive are [disabled]: they render and do not respond,
          which is Material's own disabled treatment rather than a second one
          written here.
        -->
        <mat-tab-group
          class="cases__tabs"
          [selectedIndex]="selectedTabIndex()"
          (selectedIndexChange)="onTabChange($event)"
          [mat-stretch-tabs]="false"
          animationDuration="0ms"
        >
          @for (t of tabs; track t.id) {
            <mat-tab [label]="tabLabel(t)" [disabled]="!t.enabled" />
          }
        </mat-tab-group>

        <!-- Fallback only. The store is the update path. -->
        <button
          mat-stroked-button
          type="button"
          class="cases__refresh"
          [class.is-spinning]="spinning()"
          (click)="refresh()"
          matTooltip="Refresh table"
          aria-label="Refresh table"
        >
          <mat-icon>refresh</mat-icon>
        </button>
      </div>

      @if (rows().length === 0) {
        <!-- One sentence, centred, nothing to click: the queue is empty and
             that is the whole fact. The link to past cases went - past cases
             live in the case, under the player, not in a queue that has none. -->
        <p class="cases__empty">
          {{ nav.tab() === 'compliance' ? 'No open Compliance AML cases' : 'No open AML cases' }}
        </p>
      } @else {
        <!-- Only the table scrolls. The sidebar and the page header above
             stay put; below about 1000px this is what moves. -->
        <!--
          cdkScrollable is what makes "closes on scroll" work. The app shell
          sets overflow:hidden on body and html, so the window never scrolls -
          this container is the only thing that does, and CDK's ScrollDispatcher
          only watches containers that announce themselves. Without it the
          close strategy has nothing to listen to and the panel rides along.
        -->
        <div
          class="table-scroll"
          [class.is-scrolled]="scrolledX()"
          (scroll)="onScroll($event)"
          cdkScrollable
          tabindex="0"
          role="region"
          aria-label="Cases table"
        >
          <table class="table">
            <colgroup>
              <col class="col-player" />
              <col class="col-sev" />
              <col class="col-triggers" />
              <col class="col-prio" />
              <col class="col-sla" />
              <col class="col-work" />
              <col class="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" class="cell--player">Player</th>
                <th scope="col">Severity</th>
                <th scope="col">Triggered by</th>
                <th
                  scope="col"
                  [attr.aria-sort]="ariaSort('priority')"
                >
                  <!--
                    A flex row, not inline children. Inline-level siblings
                    share a baseline, so the 24px info button grew this cell's
                    line box and pushed its sort arrow 0.8px above the SLA
                    one - two headers, two arrow positions, from a sibling
                    neither arrow knows about.
                  -->
                  <span class="th-inner">
                  <!-- A real button inside the th: the header is the control,
                       and a th is not focusable. -->
                  <button class="th-sort" type="button" (click)="cases.toggleSort('priority')">
                    Priority
                    <svg
                      class="th-sort__arrow"
                      [class.th-sort__arrow--on]="cases.sort() === 'priority'"
                      [class.th-sort__arrow--up]="
                        cases.sort() === 'priority' && cases.sortDir() === 'asc'
                      "
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M12 5v14" />
                      <path d="m19 12-7 7-7-7" />
                    </svg>
                  </button>
                  </span>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('sla')">
                  <span class="th-inner">
                  <button class="th-sort" type="button" (click)="cases.toggleSort('sla')">
                    SLA
                    <svg
                      class="th-sort__arrow"
                      [class.th-sort__arrow--on]="cases.sort() === 'sla'"
                      [class.th-sort__arrow--up]="cases.sort() === 'sla' && cases.sortDir() === 'asc'"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M12 5v14" />
                      <path d="m19 12-7 7-7-7" />
                    </svg>
                  </button>
                  </span>
                </th>
                <th scope="col">Work</th>
                <th scope="col" class="cell--actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (c of rows(); track c.id) {
                <tr>
                  <!-- Player id links to details; status sits beside it. -->
                  <td class="cell--player">
                    <span class="player-line">
                      <a
                        class="linkish"
                        [href]="playerHref()"
                        [title]="c.player.id"
                        (click)="openPlayer($event, c)"
                        >{{ c.player.id }}</a
                      >
                      <!-- Text, not a pill. The status is a fact about the
                           player, not a badge to scan for - and a pill on
                           every row made the column read as two columns. -->
                      <span class="player-status" [title]="c.player.status">{{
                        statusLabel(c.player.status)
                      }}</span>
                    </span>
                  </td>

                  <td>
                    <ui-pill [severity]="c.severity">{{ c.severity }}</ui-pill>
                  </td>

                  <!--
                    The INITIATING trigger - what the case was opened for -
                    and how much has happened since. Text, not chips: the Work
                    column is chips, and two chip columns would read as one
                    kind of thing said twice.

                    The count is the way into the rest. The row shows what
                    opened the case; the popover lists everything since, in
                    the modal's own strip - the same component on the same case.
                  -->
                  <td class="cell--triggers">
                    <!-- Not possible in production - a case exists because
                         something triggered it - but the table must not throw
                         on data it did not expect. One muted line. -->
                    @if (c.triggers.length === 0) {
                      <span class="trig__empty">No triggers</span>
                    } @else {
                      <span class="trig">
                        <span class="trig__line" [title]="initiating(c).name">
                          <span class="trig__name">{{ initiating(c).name }}</span>
                          <span class="trig__at" [title]="triggerStamp(c)"
                            >· {{ triggerAge(c) }}</span
                          >
                          @if (c.triggers.length > 1) {
                            <!-- aria-expanded and aria-haspopup are MatMenuTrigger's,
                                 as on the other two popovers: it keeps them in step
                                 with the panel, and a second hand on them would drift. -->
                            <button
                              class="trig__more"
                              type="button"
                              #trigTrigger="matMenuTrigger"
                              [matMenuTriggerFor]="trigMenu"
                              [matMenuTriggerData]="{ c: c }"
                              (keydown.escape)="trigTrigger.closeMenu()"
                              matTooltip="Show all triggers"
                              [attr.aria-label]="'Show all ' + c.triggers.length + ' triggers'"
                            >
                              +{{ c.triggers.length - 1 }}
                            </button>
                          }
                        </span>
                        <span class="trig__detail" [title]="initiating(c).detail">{{
                          initiating(c).detail
                        }}</span>
                      </span>
                    }
                  </td>

                  <!--
                    Neutral ink. Urgent is weight plus an icon, never a colour:
                    SLA is the row's only traffic light.

                    A button, not a span: it opens the breakdown, so it has to
                    be reachable and operable from the keyboard. Click rather
                    than hover - the spec allows either, and ten rows of
                    hover-opening popovers fire constantly while the eye is
                    just scanning the column.
                  -->
                  <!-- Neutral ink, and entirely inert. Urgent is weight plus
                       an icon, never a colour: SLA is the row's only traffic
                       light. Nothing in this cell is clickable - the scoring
                       doc is linked once, from the column header. -->
                  <td>
                    <span class="prio-cell">
                      <!-- Inert. The score is a value to read, not a control:
                           no cursor, no underline, no handler. -->
                      <span
                        class="prio"
                        [class.prio--urgent]="cases.bandOf(c.priority) === 'urgent'"
                      >
                        @if (cases.bandOf(c.priority) === 'urgent') {
                          <mat-icon class="prio__icon" aria-hidden="true">warning_amber</mat-icon>
                        }
                        {{ cases.priorityText(c.priority) }}
                      </span>
                      <!--
                        The breakdown's only trigger. aria-expanded is not set
                        here: MatMenuTrigger owns it and keeps it in step with
                        the panel, and a second hand on it would drift.
                      -->
                      <button
                        class="prio__info"
                        type="button"
                        #prioTrigger="matMenuTrigger"
                        [matMenuTriggerFor]="prioMenu"
                        [matMenuTriggerData]="{ c: c }"
                        (keydown.escape)="prioTrigger.closeMenu()"
                        matTooltip="Score breakdown"
                        [attr.aria-label]="'Score breakdown for ' + c.priority.score"
                      >
                        <svg
                          class="prio__info-svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4" />
                          <path d="M12 8h.01" />
                        </svg>
                      </button>
                    </span>
                  </td>

                  <td class="cell--sla">
                    <!-- The same pill as everything else. Only this column
                         takes the dot: it is the one value in the row that is
                         still moving while you read it. -->
                    <ui-pill [tone]="slaTone(c)" dot>{{ cases.slaText(c) }}</ui-pill>
                  </td>

                  <!-- To-do first. Two chips, then the count. Nothing is actionable. -->
                  <!--
                    Text, not chips - D-12. Four pills a row read as four
                    controls; the column is a statement about what is left to
                    do, and every to-do item is one to action.

                    Order and WEIGHT carry the priority, never colour alone:
                    green marks completion, which is a different fact.
                  -->
                  <td class="cell--work">
                    <span class="work-row" [attr.aria-label]="workSummary(c)">
                      @for (w of cases.workRow(c); track w.type; let i = $index) {
                        @if (i > 0) {
                          <span class="work__sep" aria-hidden="true">·</span>
                        }
                        <span
                          class="work__item"
                          [class.work__item--done]="w.state === 'done'"
                          aria-hidden="true"
                        >
                          @if (w.state === 'done') {
                            <mat-icon class="work__tick">check_circle_outline</mat-icon>
                          }
                          {{ cases.workLabel(w.type) }}
                        </span>
                      }
                      @if (cases.customCount(c) > 0) {
                        <!-- Beyond the required set: notes, a second contact,
                             anything the agent added. They never enter the
                             row; the count is the way to the list that holds
                             them. -->
                        <button
                          class="work__more"
                          type="button"
                          #workTrigger="matMenuTrigger"
                          [matMenuTriggerFor]="workMenu"
                          [matMenuTriggerData]="{ c: c }"
                          (keydown.escape)="workTrigger.closeMenu()"
                          matTooltip="Show all work items"
                          aria-label="Show all work items"
                        >
                          +{{ cases.customCount(c) }}
                        </button>
                      }
                    </span>
                  </td>

                  <!--
                    Two controls on one 32px axis: the lock, then the way in.
                    The lock left its own column - D-07 - because a whole
                    column to hold one 32px control was a column of chrome,
                    and the two things an agent does to a row belong together.
                  -->
                  <td class="cell--actions">
                    <span class="actions">
                      @switch (c.lock.state) {
                        @case ('locked-to-me') {
                          <!-- An avatar, not a padlock: who holds it is the
                               fact, and the monogram says it in the space a
                               glyph was using to say less. -->
                          <button
                            class="lock-av lock-av--mine"
                            type="button"
                            aria-pressed="true"
                            [matTooltip]="lockTip(c) + ' · Click to unlock'"
                            [attr.aria-label]="lockTip(c) + ', click to unlock'"
                            (click)="cases.unlock(c.id)"
                          >
                            <span aria-hidden="true">{{ initials(cases.me().name) }}</span>
                          </button>
                        }
                        @case ('locked-to-other') {
                          <button
                            class="lock-av lock-av--other"
                            type="button"
                            [matTooltip]="lockTip(c)"
                            [attr.aria-label]="lockedToLabel(c)"
                            (click)="cases.requestForceUnlock(c.id)"
                          >
                            <span aria-hidden="true">{{ initials(c.lock.owner?.name) }}</span>
                          </button>
                        }
                        @default {
                          <button
                            class="lock-av lock-av--free"
                            type="button"
                            matTooltip="Lock case"
                            aria-label="Lock case"
                            (click)="cases.lock(c.id)"
                          >
                            <!-- Material lock_open, the glyph the modal draws. It is a fill, not a
                                 stroke, so the colour rides on fill="currentColor" and the stroke
                                 attributes the old outline icon needed would only thicken it. -->
                            <svg
                              class="lock-av__svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <path d="M12 17.5C13.1 17.5 14 16.6 14 15.5C14 14.4 13.1 13.5 12 13.5C10.9 13.5 10 14.4 10 15.5C10 16.6 10.9 17.5 12 17.5ZM18 8.5H17V6.5C17 3.74 14.76 1.5 12 1.5C9.24 1.5 7 3.74 7 6.5H8.9C8.9 4.79 10.29 3.4 12 3.4C13.71 3.4 15.1 4.79 15.1 6.5V8.5H6C4.9 8.5 4 9.4 4 10.5V20.5C4 21.6 4.9 22.5 6 22.5H18C19.1 22.5 20 21.6 20 20.5V10.5C20 9.4 19.1 8.5 18 8.5ZM18 20.5H6V10.5H18V20.5Z" />
                            </svg>
                          </button>
                        }
                      }

                      @if (c.lock.state === 'locked-to-me') {
                        <!-- Rule 4: only on a row locked to me. Icon only -
                           the tooltip and the accessible name carry the words,
                           and a labelled button beside a 32px avatar made the
                           pair look like two different kinds of control. -->
                        <button
                          mat-flat-button
                          color="primary"
                          type="button"
                          class="open-case"
                          matTooltip="Open case"
                          aria-label="Open AML case in new tab"
                          (click)="openCase(c)"
                        >
                          <mat-icon aria-hidden="true">open_in_new</mat-icon>
                        </button>
                      } @else {
                        <!-- Holds the slot open. Without it the lock would
                             slide right on every row that is not yours, and
                             the column would be two widths. -->
                        <span class="actions__slot" aria-hidden="true"></span>
                      }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!--
        ONE menu of each kind for the whole table, not one per row.
        matMenuTriggerData passes the row in, so ten triggers share two
        overlays instead of building twenty that are closed all but once.

        Escape is handled on the TRIGGERS, not here, and that is not belt and
        braces. MatMenu binds its own Escape handler to the panel and moves
        focus into the panel when it opens - but only as far as the first
        mat-menu-item, and these panels are documents to read with no items in
        them. Focus therefore stays on the trigger, Material's handler never
        sees the key, and the popover could only be dismissed by clicking away.
      -->
      <mat-menu #workMenu="matMenu" class="pop pop--work">
        <ng-template matMenuContent let-c="c">
          <div class="pop__body pop__body--list" (click)="$event.stopPropagation()">
            <!-- No heading: the two group labels inside - To do, Completed,
                 each with its live count - say what the list is. The case's
                 actions and only its actions, read from the same record as
                 the row, so it is live by construction. -->
            <work-popover [caseId]="c.id" />
          </div>
        </ng-template>
      </mat-menu>

      <mat-menu #trigMenu="matMenu" class="pop pop--trig">
        <ng-template matMenuContent let-c="c">
          <div class="pop__body pop__body--list" (click)="$event.stopPropagation()">
            <p class="pop__head pop__head--list">Triggered by</p>
            <!-- The modal's strip, unchanged, on a CaseStore of its own loaded
                 with THIS row's case - so the list is the modal's list by
                 construction, not a second rendering of the same data. -->
            <trigger-popover [caseId]="c.id" />
          </div>
        </ng-template>
      </mat-menu>

      <mat-menu #prioMenu="matMenu" class="pop pop--prio">
        <ng-template matMenuContent let-c="c">
          <!-- stopPropagation: a mat-menu closes on any click inside it, and
               the panel is a table to read, not a list to pick from. -->
          <div class="pop__body" (click)="$event.stopPropagation()">
            <p class="pop__head">
              Priority {{ c.priority.score }}
              <span>{{ cases.priorityText(c.priority).split(' ')[1] }}</span>
            </p>
            <!--
              ONE grid for all the lines, not one per line. Three columns
              shared down the panel is what makes the amounts and the plus
              signs line up; a grid per row would align nothing to anything.

              Flat children rather than a row element each: aligning columns
              across rows would need display:contents on the rows, which drops
              them out of the accessibility tree in several browsers. Read in
              order this is still "Withdrawals pending, £34,500, +50".
            -->
            <div class="pop__lines">
              @for (line of c.priority.breakdown; track line.label) {
                <span class="pop__label">{{ line.label }}</span>
                <span class="pop__amount">{{ line.amount }}</span>
                <span class="pop__points">+{{ line.points }}</span>
              }
            </div>
            <a
              class="pop__link"
              [href]="SCORING_URL"
              target="_blank"
              rel="noopener noreferrer"
            >
              How scoring works
              <mat-icon aria-hidden="true">open_in_new</mat-icon>
            </a>
          </div>
        </ng-template>
      </mat-menu>

    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .cases {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 16px;
        padding: 20px;
      }
      .cases__title {
        display: flex;
        align-items: center;
        gap: 2px;
        margin: 0;
        font-size: 20px;
        line-height: 30px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .cases__sub {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }

      /* The panel's own rule: the bar sits on a hairline. Everything else
         about these tabs is inherited from the global tab styles. */
      /**
       * One line: tabs flush left, Refresh hard right.
       *
       * align-items is stretch, not center, so the tab header sets the
       * toolbar's height and the button centres against it rather than the
       * two negotiating one. The rule that used to sit on the tab group now
       * sits here, so it runs under the button too.
       */
      .cases__toolbar {
        display: flex;
        align-items: stretch;
        gap: 16px;
        border-bottom: 1px solid var(--line);
      }
      .cases__tabs {
        /* Grows to take the slack so the button is pushed to the far edge,
           but min-width:0 keeps a long label list from forcing the button
           off the end instead of paginating. */
        flex: 1 1 auto;
        min-width: 0;
      }
      .cases__refresh.mat-mdc-outlined-button {
        /* Square, icon only. Material sizes its buttons from the label box,
           so the min-width has to go or a 32px button comes out 64 wide. */
        flex: none;
        align-self: center;
        width: 32px;
        height: 32px;
        min-width: 0;
        padding: 0;
        line-height: 32px;
      }
      .cases__refresh .mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        /**
         * THIS is what was offsetting the glyph, and it was not padding.
         *
         * Material ships a rule giving .mdc-button > .mat-icon a margin-right
         * of 8px and a margin-left of -4px, for an icon that PRECEDES a
         * label. There is no
         * label here, so that is a net 4px of right margin against a centred
         * flex line - the glyph sat 6px left of centre while being perfectly
         * centred vertically. Zeroing it is the whole fix: the wrapper was
         * already a 32px centred flex box, and the persistent ripple is
         * position:absolute across the full button, so neither could have
         * moved anything.
         */
        margin: 0;
        flex-shrink: 0;
        /* No transition on the resting rule, and that is the reset.
           The spin below carries its own, so dropping the class returns the
           icon to 0deg instantly rather than unwinding it backwards. */
        transform: rotate(0deg);
      }
      .cases__refresh.is-spinning .mat-icon {
        transform: rotate(360deg);
        transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      /**
       * Reduced motion gets the acknowledgement without the rotation: the
       * click still has to read as having done something, so the glyph dips
       * and returns. No transform, so nothing travels.
       */
      @media (prefers-reduced-motion: reduce) {
        .cases__refresh.is-spinning .mat-icon {
          transform: none;
          transition: none;
          animation: refresh-pulse 200ms ease-out;
        }
      }
      @keyframes refresh-pulse {
        50% {
          opacity: 0.4;
        }
      }

      /**
       * The table SCROLLS rather than collapsing.
       *
       * Below about 1000px the columns cannot all fit, and squeezing them is
       * what put the lock chip under the priority score. Only this box moves -
       * the sidebar and the page header above it stay where they are.
       */
      .table-scroll {
        overflow-x: auto;
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
      }
      .table-scroll:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }

      /**
       * table-layout: fixed, so the columns come from the colgroup and NOT
       * from whichever lock sentence happens to be longest. The lock cell is
       * the most variable thing in the row; left to auto it dictated the whole
       * table and the widths shifted as rows locked and unlocked.
       */
      .table {
        width: 100%;
        min-width: 1304px;
        table-layout: fixed;
        border-collapse: collapse;
      }
      /**
       * Wide enough for the real thing: a 15-digit id is 108px and the longest
       * status ("Self excluded") is 100, so 108 + 8 + 100 + 32 of cell padding
       * is 248. At the old 170 every id in the fixture ellipsed, which makes
       * the truncation the normal case rather than the fallback it is meant to
       * be - and the id is the one value in the row you cannot infer.
       */
      .col-player {
        min-width: 184px;
        width: 200px;
      }
      /**
       * One line, and the NAME is the part that gives.
       *
       * The time and the count are short and fixed; a squeezed column should
       * eat the end of "Deposit velocity threshold" rather than push the
       * count out of the row. Both keep their full text on the title.
       */
      .cell--triggers {
        white-space: nowrap;
      }
      /**
       * Two lines, the modal's strip format: what fired, and what it said.
       *
       * The name and its age are the scannable line; the detail beneath is
       * why the case exists. Both nowrap with the full text on their title -
       * a queue row is not where a sentence should wrap.
       */
      .trig {
        display: flex;
        flex-direction: column;
        min-width: 0;
        max-width: 100%;
      }
      .trig__line {
        display: flex;
        align-items: baseline;
        gap: 4px;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        white-space: nowrap;
      }
      .trig__name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .trig__at {
        flex: none;
        font-weight: 400;
        color: var(--foreground-secondary);
      }
      /**
       * Work's count, declared once with it below. One control, one look.
       *
       * Its 32px target sits on a 20px line, and a 32px flex item would make
       * the line 32 and the row 64. The negative margin takes the box out of
       * the line's flow: the target stays 32, the line stays 20, the row 52.
       */
      .trig__more {
        margin: -6px 0;
      }
      .trig__empty {
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
      .trig__detail {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 20px;
        font-weight: 400;
        color: var(--foreground-secondary);
      }

      .col-sev {
        width: 110px;
      }
      /* 200 is the brief's minimum; the widest initiating name plus its time
         and count needs a little more. */
      .col-triggers {
        min-width: 200px;
        width: 240px;
        /* +8 for the count: a 32px button with 8px sides is 30 wide where the
           bare "+N" was 22, and the longest name was 6px from the edge. */
      }
      /**
       * Sized for the widest real cell, which is locked-to-me: a 102px status
       * sentence, Unlock at 66, Open AML Case at 148, two 8px gaps and the
       * cell's own 32 of padding. At the old 230 the buttons took the room and
       * "Locked to you" ellipsed - a 13-character string truncating is the
       * column being too narrow, not the text being too long.
       */
      /* Read, not clicked: the sentence and nothing else. 160 fits
         "Locked to M. Torres - 1d" at 157 with the icon. */
      /* 180 is the brief's minimum. The widest cell is the 32px padlock, an
         8px gap and "Locked to M. Torres - 1d", plus 32 of cell padding. */

      /* 152: "200 Urgent" plus its info button is 116 - a 16px warning glyph,
         a 4px gap, the score, a 2px gap and the 24px button - plus 32 of cell
         padding. */
      .col-prio {
        width: 152px;
      }
      /* The breached pill at four digits is 119 now the dot is in it - 120
         left a single pixel, which is not slack, it is luck. */
      .col-sla {
        width: 132px;
      }
      /**
       * Measured, not guessed: 508 is the widest four-item row.
       *
       * It was 412, sized when the column held two chips and a button. Four
       * inline labels need more, and a clipped work label is the one thing
       * this column must not do - "Open source searche..." tells an agent
       * nothing they did not already know.
       */
      .col-work {
        width: 440px;
        /* Three required items at most - Contact player, Open source searches,
           EDD report - two dots and a count: 400px at the widest. */
      }
      /**
       * Trailing edge. 180 was given as a MINIMUM, and the widest pair needs
       * more: at the modal's button metrics Open case is 125 and Unlock 82,
       * plus a 4px gap and the cell's 32 of padding - 243. 248 is that with a
       * little slack.
       *
       * It was 208 while the buttons were a hand-built 28px size. Widening the
       * column is the cost of them being the modal's components instead.
       */
      /* 140 is the brief's minimum. Open case is 125 plus 32 of padding, and
         the column is empty on every row that is not mine. */
      /* 120 is the brief's floor: two 32px controls, an 8px gap and the
         cell's 32 of padding is 104. */
      .col-actions {
        min-width: 120px;
        width: 128px;
      }

      /**
       * The divider is on the ROW, not the cell, so it runs edge to edge
       * instead of stopping at each cell's padding box. border-collapse is
       * what lets a tr carry a border at all.
       */
      /**
       * Every selector below is scoped to .table, and the popovers are why.
       *
       * These were bare element selectors - th, td, tbody tr. The priority
       * breakdown renders a real table inside a menu overlay - still this
       * component's template, so still this component's styles - and
       * inherited all of it: labels came out uppercase at 12px, the popover's
       * own 4px-0 cell padding lost to .table td at 12px 16px so the amount
       * and the points collided, and
       * every breakdown line drew a row divider. One class on the outer table
       * is the fix, and it stops the next nested table finding the same trap.
       */
      .table tbody tr {
        min-height: 52px;
        border-bottom: 1px solid var(--line);
      }
      .table tbody tr:last-child {
        border-bottom: 0;
      }
      .table thead tr {
        border-bottom: 1px solid var(--line);
      }
      .table th,
      .table td {
        /**
         * 12 top and bottom, which is what a 52px row costs now.
         *
         * The tallest cell is the PLAYER column: a 24px id line (its hit
         * area) over a 20px status, 44 in all. 44 + 8 = 52. Triggers is 40
         * and the Actions controls 32, so both centre inside it. Every cell
         * centres in the space via vertical-align. min-height on a tr is
         * ignored by most engines, so this padding is what actually holds the
         * row open.
         */
        padding: 4px 16px;
        text-align: left;
        vertical-align: middle;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
      .table th {
        padding-top: 10px;
        padding-bottom: 10px;
        background: var(--stream-bg);
        font-size: 14px;
        font-weight: 600;
        /* Title case, so the tracking that made caps legible is no longer
           doing a job - at 14px it just loosens the words. */
        letter-spacing: 0;
        color: var(--foreground-primary);
        /* Headers read in full now the columns have room: the narrow tracks
           were clipping them to SEV and SLJ. */
        white-space: nowrap;
      }
      /**
       * A sortable header is a button, so it is reachable and Enter works.
       *
       * The arrow is always in the DOM and always takes its space - it fades
       * in rather than appearing, or the label would shift sideways the
       * moment a column became active.
       */
      /**
       * The header's contents, centred as a row.
       *
       * A th cannot be a flex container without leaving table layout, so the
       * flex lives on a wrapper inside it. This is what makes the sort arrow
       * land in the same place whether or not the cell also holds an info
       * icon - which is the whole reason it exists.
       */
      .th-inner {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .th-sort {
        display: inline-flex;
        align-items: center;
        /**
         * Centred on the line box, not sat on the baseline.
         *
         * These are inline-level, so by default they share a baseline with
         * whatever else is in the cell - and the Priority header also holds a
         * 24px info button, which grew the line box and pushed its sort button
         * 1.6px higher than the SLA one. Two headers, two arrow positions,
         * from a sibling neither arrow knows about.
         */
        vertical-align: middle;
        gap: 4px;
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        color: inherit;
        text-transform: inherit;
        letter-spacing: inherit;
        cursor: pointer;
      }
      .th-sort:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      /**
       * Always visible, never hover-only.
       *
       * At 0 opacity the affordance existed solely for a pointer that happened
       * to be over the header - invisible to anyone scanning the table and to
       * anyone not using a pointer at all. Half strength says "this sorts";
       * full says "this is the sort".
       */
      .th-sort__arrow {
        flex: none;
        width: 16px;
        height: 16px;
        color: var(--foreground-primary);
        opacity: 0.5;
        transition: opacity 150ms ease;
      }
      .table th:hover .th-sort__arrow {
        opacity: 0.75;
      }
      .th-sort__arrow--on,
      .table th:hover .th-sort__arrow--on {
        opacity: 1;
      }
      /**
       * No nudge, and that is the fix rather than the absence of one.
       *
       * The 1.5px here was tuned against the ink centre of the word
       * "Priority" - which its descender drags below the cap band. Aligning
       * to the CAP BAND instead (cap top to baseline, identical in both
       * headers) puts the arrow where it belongs with no correction at all.
       */
      .th-sort__arrow--up {
        transform: rotate(180deg);
      }

      /* Nothing in the header row is underlined. */
      .table th a {
        text-decoration: none;
      }
      /**
       * Colour per state, not opacity - and that was a contrast bug.
       *
       * This used to be currentColor at opacity .5, which composited #52525B
       * over the #F4F5F7 header to #A3A4A9: 2.28:1, under the 3:1 that 1.4.11
       * requires of a non-text control. Solid --foreground-secondary is the SAME token the
       * header already carries, at full strength, and measures 7.09:1.
       *
       * The hit area is 24px square for 2.5.8 (the glyph stays 16), which is
       * also what gives the pressed layer something to paint. The glyph is
       * spacing is the flex parent's job, not a margin here: .th-inner owns
       * the 4px gap, so one declaration spaces every header the same way and
       * no sibling needs an override to cancel it.
       */
      .th__info,
      .prio__info {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* Same reason as .th-sort: centred on the line box, so its own height
           cannot move the thing beside it. */
        vertical-align: middle;
        flex: none;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        background: none;
        border-radius: 50%;
        color: var(--foreground-secondary);
        cursor: pointer;
        /* Colour alone, per the link treatment: nothing here moves or
           resizes on hover. */
        transition: color 150ms ease;
      }
      .th__info:hover,
      .prio__info:hover {
        color: var(--foreground-primary);
      }
      /**
       * Pressed: the full-strength colour plus a state layer on the HIT AREA,
       * not on the glyph - a wash over the 24px box is what reads as a press.
       * Mixed from --foreground-primary rather than given a hex of its own, at the 0.08 the
       * outlined buttons already use for their pressed layer.
       */
      .th__info:active,
      .prio__info:active {
        color: var(--foreground-primary);
        background: color-mix(in srgb, var(--foreground-primary) 8%, transparent);
      }
      /**
       * Focus is the ring and ONLY the ring - the icon keeps its resting
       * colour. Grouping it with :hover, as this did, meant a keyboard user
       * got a colour change a mouse user only gets on hover, which makes the
       * ring the second signal instead of the first.
       */
      .th__info:focus-visible,
      .prio__info:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .th__info-svg,
      .prio__info-svg {
        width: 16px;
        height: 16px;
        /**
         * Half a pixel down, and it is an OPTICAL correction.
         *
         * The button box is centred on the line box, which is what
         * align-items does - but a line box is not where the text's ink is.
         * Measured off the rendered pixels rather than the box model: the
         * glyph sat 0.5px above the cap-height band beside the page title and
         * 1px above it beside the score. Both now read on the same line.
         */
        transform: translateY(0.5px);
      }
      .prio__info-svg {
        transform: translateY(1px);
      }
      /**
       * The column header is 14px title case, not the 20px page title the
       * shared nudge above was measured against - so it gets its own. Measured
       * off the rendered pixels: the glyph sat 1px below the header's ink.
       */
      thead .th__info-svg {
        /* The column header is 14px title case, not the 20px page title the
           shared nudge was measured against - and the target is the cap band,
           which needs none. */
        transform: none;
      }
      /**
       * A text button on the chips' 24px axis.
       *
       * Material's text button is 32px at 14/600 with 8px of side padding and
       * a 4px radius, so every one of those is set. The height is the load
       * bearing one: the pills beside it are 24, and a 32px control in the row
       * would break the rhythm the Work column reads on.
       *
       * No border and no fill at rest - it is the only thing in this column
       * that is not a statement about the case, and it should look like it.
       */
      /**
       * Neutral ink. Urgent is weight plus an icon, never a colour: SLA is the
       * row's only traffic light.
       */
      .prio-cell {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        /* Squeezed, "200 Urgent" broke over two lines and took its row to
           61px - a taller row, not a visible overflow, which is the failure
           that hides. */
        white-space: nowrap;
      }
      /* Inert: a score is a value, and the affordance is the icon beside it. */
      .prio {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--foreground-primary);
      }
      .prio--urgent {
        font-weight: 700;
        color: var(--foreground-primary);
      }
      .prio__icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /**
       * The lock control: one 32px disc, three states.
       *
       * Free is an open padlock; held is a monogram. An avatar says WHO in the
       * space a padlock was using to say only "someone", and the full name is
       * on the tooltip and the accessible name - the initials are decoration,
       * which is why they are aria-hidden.
       */
      .lock-av {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition: background-color 150ms ease;
      }
      .lock-av:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .lock-av__svg {
        width: 16px;
        height: 16px;
      }
      .lock-av--free {
        color: var(--foreground-primary);
      }
      .lock-av--mine {
        background: var(--success-bg-subtle);
        color: var(--success);
      }
      .lock-av--other {
        background: var(--background-tertiary);
        color: var(--foreground-primary);
      }
      .lock-av:hover {
        background: var(--surface-hover);
      }
      /**
       * Held by someone else: a darker step on hover, not the same grey.
       *
       * The disc rests on --background-tertiary, which is also what
       * --surface-hover resolves to - so the shared hover painted this one
       * state the colour it already was, and the click that opens force
       * unlock felt inert. An alpha over whatever the disc sits on reads as
       * one step down from it wherever the row is. Declared after the shared
       * hover because the two selectors tie on specificity.
       */
      .lock-av--other:hover {
        background: var(--colors-alpha-alpha-soft-hover, rgba(0, 0, 0, 0.06));
      }

      /**
       * Open case, icon only - square, on the same 32px axis as the lock.
       *
       * Material sizes its buttons from the label box, so with no label the
       * min-width has to go or a 32px button comes out 64 wide.
       */
      .open-case.mat-mdc-unelevated-button {
        flex: none;
        width: 32px;
        height: 32px;
        min-width: 0;
        padding: 0;
      }
      .open-case .mat-icon {
        margin: 0;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /**
       * Flush right, so the trailing edge of the table is one line however
       * many buttons a row has.
       */
      /**
       * Two fixed slots: the lock, then the way in.
       *
       * A grid rather than a flex row, because the lock must not move. With
       * flex, a row without Open case pulled its padlock 40px right and the
       * column read as two different columns depending on who held the case.
       */
      .actions {
        display: grid;
        grid-template-columns: 32px 32px;
        align-items: center;
        justify-content: end;
        gap: 8px;
      }
      .actions__slot {
        width: 32px;
        height: 32px;
      }
      /**
       * Open case arrives rather than appears. Removal is instant - the
       * element is gone, and there is nothing left to fade - so this is an
       * entry animation, not a two-way transition.
       */
      @media (prefers-reduced-motion: no-preference) {
        .open-case {
          animation: open-case-in 150ms ease;
        }
      }
      @keyframes open-case-in {
        from {
          opacity: 0;
        }
      }

      /**
       * The hover and fade transitions, off.
       *
       * This block named .lock-btn, .lock-btn--free and .lock--none - three
       * classes from the padlock-in-its-own-column design, deleted when the
       * lock moved into Actions. It had been guarding nothing for several
       * changes, while the controls that replaced them transitioned
       * unguarded. The backgrounds still CHANGE under reduced motion; they
       * just stop easing.
       */

      /* ---- popovers: priority breakdown and the full work list --------- */
      .pop__body {
        padding: 16px;
        /* The menu is a panel to read, so its own cursor should not promise a
           click target the way a menu of items does. */
        cursor: default;
      }
      /* The strip carries its own 20px gutters. The body gives up its sides so
         they are not doubled, and the heading takes the strip's gutter so the
         two left edges agree. */
      .pop__body--list {
        padding: 16px 0 0;
      }
      .pop__head--list {
        /* 16, the strip's STACKED gutter: at 320-400px the panel is always
           under the strip's 520px breakpoint, so the wide gutter never shows. */
        padding: 0 16px;
      }
      /**
       * 14/20, title case. It was 12/16 uppercase with tracking - the table
       * header's treatment, borrowed - which made a panel heading read like a
       * column label for the panel's own rows.
       *
       * The band no longer needs a rule of its own: it existed only to undo
       * the uppercase on "Urgent", and there is nothing left to undo.
       */
      .pop__head {
        margin: 0 0 8px;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        letter-spacing: 0;
        color: var(--foreground-primary);
      }
      .pop__lines {
        display: grid;
        /* Label takes the slack; amount and points size to their content. */
        grid-template-columns: 1fr auto auto;
        column-gap: 16px;
        row-gap: 8px;
        align-items: baseline;
      }
      .pop__label {
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
        /* Nothing truncates. Past the panel's max-width the label wraps and
           the panel grows taller instead. */
        overflow-wrap: anywhere;
      }
      /* The middle column is the evidence, the right one is the arithmetic. */
      .pop__amount {
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .pop__points {
        font-size: 14px;
        line-height: 20px;
        text-align: right;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--foreground-primary);
        white-space: nowrap;
      }
      .pop__link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 24px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
        width: 100%;
        box-sizing: border-box;
        font-size: 13px;
        line-height: 16px;
        font-weight: 600;
        color: var(--link);
        text-decoration: underline;
        transition: color 150ms ease;
      }
      .pop__link:hover {
        color: var(--link-hover);
      }
      .pop__link .mat-icon {
        margin: 0;
        font-size: 14px;
        width: 14px;
        height: 14px;
        line-height: 14px;
      }
      /**
       * Qualified by .table, and that is a regression being closed.
       *
       * This was .cell--actions at 0-1-0. When the element rules above were
       * scoped to .table to keep them out of the popover, they went from
       * 0-0-1 to 0-1-1 - and quietly started winning, silently un-aligning
       * whatever relied on a bare modifier class.
       */
      .table .cell--actions {
        text-align: right;
      }
      /**
       * The FLEX LIVES IN A WRAPPER, never on the td.
       *
       * display: flex on a table cell takes it out of table layout: it stops
       * stretching to the row height and vertical-align stops applying, so its
       * contents sat about 11px above every other cell in the row. The td
       * stays a table-cell and centres; the wrapper does the stacking.
       */
      /**
       * The Player column stays put while the rest scrolls.
       *
       * The background is NOT decoration: a sticky cell is transparent by
       * default and the other columns scroll straight through it. The header
       * sits one above the body so it stays on top at the corner where the two
       * stickies meet.
       */
      .table .cell--player {
        position: sticky;
        left: 0;
        z-index: 10;
        background: var(--surface-default);
      }
      .table thead .cell--player {
        z-index: 11;
        background: var(--surface-header);
      }
      /**
       * The edge, drawn as a pseudo-element rather than a box-shadow.
       *
       * box-shadow on a table cell is NOT PAINTED when the table is
       * border-collapse: collapse - Chrome computes it and renders nothing.
       * Measured: with collapse the pixels right of the boundary are pure
       * white; flip the same page to separate and the falloff appears. And
       * collapse cannot go, because it is the only thing that lets a tr carry
       * the row divider.
       *
       * So the falloff is painted by hand, just outside the cell's right edge:
       * 4px of 6% black fading out, which is what 2px 0 4px rgba(0,0,0,.06)
       * looks like. The cell is position: sticky, so it is already the
       * containing block this needs.
       *
       * It appears only once something is hidden behind the column. Flush
       * left it would be a line promising a column that is already in view.
       */
      .table .cell--player::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 4px;
        transform: translateX(100%);
        background: linear-gradient(to right, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0));
        opacity: 0;
        transition: opacity 100ms ease;
        pointer-events: none;
      }
      .table-scroll.is-scrolled .cell--player::after {
        opacity: 1;
      }

      /**
       * Row hover: background ONLY.
       *
       * Every cell, the sticky one included, or the highlight would stop dead
       * at the Player column's edge. 100ms rather than 200: the queue is
       * scanned quickly and a slow fade trails the pointer.
       *
       * Nothing else moves - not the text, not a pill, not the padlock - and
       * the row keeps the default cursor. Only the controls inside it are
       * pointers, because only they do anything.
       */
      .table tbody td {
        transition: background-color 100ms ease;
      }
      .table tbody tr:hover td {
        background: var(--surface-hover);
      }

      .cell--player {
        white-space: nowrap;
      }
      /**
       * ID and status on ONE line.
       *
       * Stacked, the cell was 52px of content in a 52px row and the padding
       * had nowhere to go. Inline, the tallest thing here is the 24px pill,
       * so the row has room again.
       *
       * nowrap is what makes the truncation land on the id: with wrapping
       * allowed the pill drops to a second line instead, which is the layout
       * this replaces.
       */
      /**
       * Two lines, the same rhythm as Triggers: the identifier, then what it
       * is. Inline with a pill the column read as two, and the id - the one
       * value you cannot infer - shared its line with a badge.
       */
      .player-line {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .player-status {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 20px;
        font-weight: 400;
        color: var(--foreground-secondary);
      }
      .linkish {
        /* The hit area is the ID, not the glyph box it happens to occupy. */
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        font-weight: 600;
        /* Tabular figures, so the ids stack in a column rather than ragging. */
        font-variant-numeric: tabular-nums;
        color: var(--link);
        text-decoration: underline;
        text-underline-offset: 2px;
        text-align: left;
        cursor: pointer;
        /**
         * Colour only, and fast. This is a high-frequency target in a list an
         * agent scans, so an animated underline would be movement on every
         * pass down the column. The property is named rather than a blanket
         * all, precisely so nothing else can start animating later without
         * someone deciding to.
         */
        transition-property: color;
        transition-duration: 120ms;
        transition-timing-function: ease-out;
      }
      .linkish:hover {
        color: var(--link-hover);
      }
      /* The same ring the buttons take, so a keyboard user sees one language. */
      .linkish:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
      .player-line .linkish {
        /* The id yields the space. Its own title carries the full number, so
           the digits lost to the ellipsis are still readable on hover. */
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
        line-height: 24px;
      }
      /**
       * Work chips stay on ONE line and on one axis.
       *
       * flex with a gap rather than margins between siblings, so the chips and
       * the "+N more" badge sit on a single baseline and the badge needs no
       * adjustment of its own to line up.
       */
      /* Same rule as the player cell: the td stays a table-cell so it fills
         the row and centres, and the wrapper is what holds the chips on one
         axis. */
      /**
       * One line of TEXT, ordered so the first item is the one to action.
       *
       * Weight and position carry that, never colour alone: green means DONE,
       * which is a different fact, and an agent who cannot see green still
       * reads the order.
       */
      .cell--work {
        overflow: hidden;
      }
      .work-row {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 8px;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        white-space: nowrap;
      }
      .work__item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 400;
        color: var(--foreground-secondary);
      }
      /* The one to action. */
      /* Done, wherever it lands in the order. */
      /**
       * Rafal (2 Oct): to-do is the statement, done is the record.
       *
       * Every to-do item at 600 in full ink - not only the first, now that the
       * row is the required set and each of them is one to action. Done items
       * muted at 400 behind their tick. The success green goes with D-12's
       * reading: completion is a tick, not a colour.
       */
      .work__item {
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .work__item--done {
        font-weight: 400;
        color: var(--foreground-secondary);
      }
      .work__tick {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .work__sep {
        flex: none;
        color: var(--foreground-subtle);
      }
      /* A control, but the quietest in the row: the four inline items are the
         scan, and this is only the way to the rest. */
      .work__more,
      .trig__more {
        display: inline-flex;
        align-items: center;
        flex: none;
        /* min-height, not height: the control may never be shorter than 32,
           and a fixed height would stop it growing if the text ever reflows. */
        min-height: 32px;
        padding: 0 8px;
        border: 0;
        border-radius: 4px;
        background: none;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        color: var(--foreground-subtle);
        cursor: pointer;
        transition: background-color 150ms ease;
      }
      .work__more:hover,
      .trig__more:hover {
        background: var(--surface-hover);
        color: var(--foreground-primary);
      }
      .work__more:focus-visible,
      .trig__more:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      .cases__empty {
        margin: 0;
        padding: 48px 0;
        text-align: center;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }

      /**
       * Every easing in this component, off - in ONE place, at the end.
       *
       * These were six blocks scattered through the file, and scattering is
       * what broke them: a guard at line 1290 cannot override a rule declared
       * at 1653, so the Work count kept easing under reduced motion while its
       * guard sat 360 lines too early. One block last in the cascade cannot
       * lose that way, and the policy is readable in one read.
       *
       * Backgrounds and colours still CHANGE; they stop easing. The two
       * exceptions are above and deliberate: Refresh swaps its spin for a
       * pulse, and Open case only animates in when motion is welcome.
       */
      @media (prefers-reduced-motion: reduce) {
        .linkish,
        .th__info,
        .prio__info,
        .th-sort__arrow,
        .lock-av,
        .work__more,
        .trig__more,
        .pop__link,
        .table tbody td,
        .table .cell--player::after {
          transition: none;
        }
      }

    `,
  ],
})
export class CasesTableComponent {
  readonly cases = inject(CasesStore);
  readonly nav = inject(NavStore);
  private readonly modal = inject(CaseStore);
  readonly tabs = CASES_TABS;

  /** Drives the Refresh glyph's 360deg turn - see refresh(). */
  readonly spinning = signal(false);
  private spinTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Placeholder. The real Confluence page is not linked from anywhere in the
   * repo yet - swap this for the actual URL before the walkthrough.
   */
  /** Placeholder, like SCORING_URL: the docs page does not exist yet. */
  readonly DOCS_URL = '#docs-url-pending';

  readonly SCORING_URL = 'https://confluence.example.com/aml-priority-scoring';

  /** "A. Kowalski" -> "AK". Whatever separates the parts, take their firsts. */
  initials(name: string | null | undefined): string {
    return (name ?? '?')
      .split(/[\s.]+/)
      .filter(Boolean)
      // Up to three: "A. Kowalski" is AK as before, and a three-part name
      // keeps its third letter rather than losing it to a two-letter cap.
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  /**
   * "Locked to you" / "Locked to M. Torres · 1d" - the WIDGET's sentence.
   *
   * This wrote its own, with the preposition reversed, while the panel beside
   * it said "Locked to": two vocabularies for one fact. It composes from
   * lockStatusLine() now, exactly as the row's own label does, so the table
   * cannot drift from the panel again - which is what rule 5 is for.
   */
  lockTip(c: CaseRecord): string {
    return this.lockLine(c);
  }

  /**
   * The same fact, spelled out. A screen reader saying "1d" reads it as the
   * letter d; the visible tooltip can be terse because the eye supplies the
   * rest.
   */
  lockedToLabel(c: CaseRecord): string {
    const who = c.lock.owner?.name ?? 'another agent';
    const age = c.lock.since ? relativeAge(c.lock.since, this.cases.now()) : '';
    const spelled = age.replace(/^(\d+)m$/, '$1 minutes').replace(/^(\d+)h$/, '$1 hours')
      .replace(/^1d$/, '1 day').replace(/^(\d+)d$/, '$1 days')
      .replace(/^(\d+)mo$/, '$1 months').replace(/^(\d+)y$/, '$1 years');
    return `Locked to ${who}${spelled ? ` ${spelled} ago` : ''}, click to force unlock`;
  }

  /** aria-sort for a header: the active column says which way, the other none. */
  ariaSort(col: 'priority' | 'sla'): 'ascending' | 'descending' | 'none' {
    if (this.cases.sort() !== col) return 'none';
    return this.cases.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  /** The trigger the case was opened for. The store sorts oldest first. */
  initiating(c: CaseRecord): TriggerRef {
    return c.triggers[0];
  }

  triggerAge(c: CaseRecord): string {
    return `${relativeAge(this.initiating(c).at, this.cases.now())} ago`;
  }

  /** The absolute stamp behind "2d ago", which is the wrong precision to
   *  decide anything on. */
  triggerStamp(c: CaseRecord): string {
    return new Date(this.initiating(c).at).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  /**
   * What the Work column says to a screen reader.
   *
   * One sentence for the whole cell, because the spans inside it are
   * aria-hidden: read one at a time they are a list of fragments, and the
   * order - which is the whole point of the column - does not survive.
   */
  workSummary(c: CaseRecord): string {
    const row = this.cases.workRow(c);
    const label = (w: WorkItem) => this.cases.workLabel(w.type);
    const todo = row.filter((w) => w.state === 'todo').map(label);
    const done = row.filter((w) => w.state === 'done').map(label);
    const more = this.cases.customCount(c);
    return (
      `${row.length} required actions, ${todo.length} to do` +
      (todo.length ? `: ${todo.join(', ')}` : '') +
      (done.length ? `; done: ${done.join(', ')}` : '') +
      (more > 0 ? `; ${more} more in the timeline` : '')
    );
  }

  /**
   * The full name and an absolute stamp, for when the name has ellipsed - and
   * because "2d ago" is the wrong precision for deciding anything.
   */
  triggerTitle(c: CaseRecord): string {
    const t = this.initiating(c);
    const more = c.triggers.length - 1;
    return (
      `${t.name} - ${new Date(t.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` +
      (more > 0 ? ` (+${more} since)` : '')
    );
  }

  /** Heading and strapline for whichever queue is showing. */
  readonly copy = computed(() => QUEUE_COPY[this.nav.tab()]);

  readonly rows = computed(() =>
    this.nav.tab() === 'compliance' ? this.cases.complianceCases() : this.cases.activeCases(),
  );

  /** Tab order is fixed, so the queue maps straight onto the index. */
  readonly selectedTabIndex = computed(() => (this.nav.tab() === 'compliance' ? 1 : 0));

  onTabChange(index: number): void {
    const tab = this.tabs[index];
    if (tab?.enabled) this.nav.showCases(tab.id as CasesTab);
  }

  /**
   * The count rides in the LABEL rather than in a badge beside it: the panel's
   * tabs are plain text, and a pill here would be the one visible difference
   * between the two bars.
   */
  tabLabel(t: { id: string; label: string; enabled: boolean }): string {
    if (!t.enabled) return t.label;
    const n = t.id === 'active' ? this.cases.activeCount() : this.cases.complianceCount();
    return `${t.label} (${n})`;
  }

  /**
   * Enum in the fixture, words on screen.
   *
   * Mapped in the template layer so the fixture keeps the real values the back
   * end sends; the raw enum is still on the title for anyone who needs it.
   */
  private static readonly STATUS_LABELS: Record<string, string> = {
    PLAYER_DUPLICATE: 'Duplicate',
    PLAYER_REGISTERED: 'Registered',
    GAMSTOP_RESTRICTED: 'GAMSTOP restricted',
    ENABLED: 'Enabled',
  };

  statusLabel(status: string): string {
    return CasesTableComponent.STATUS_LABELS[status] ?? status;
  }

  /** Four bands, one traffic light. Breached is the same red, filled. */
  slaTone(c: CaseRecord): 'success' | 'warn' | 'danger' | 'danger-solid' {
    switch (this.cases.slaBandOf(c)) {
      case 'fresh':
        return 'success';
      case 'warn':
        return 'warn';
      case 'late':
        return 'danger';
      default:
        return 'danger-solid';
    }
  }

  /** The widget's sentence, not a second one written here. */
  lockLine(c: CaseRecord): string {
    return lockStatusLine(c.lock.state, c.lock.owner?.name ?? null, {
      sinceIso: c.lock.since ?? undefined,
    });
  }

  /**
   * A real href, so the link behaves like one - keyboard, context menu, and a
   * target the browser can show. The click is intercepted so the prototype
   * navigates in place instead of reloading and losing the store.
   */
  playerHref(): string {
    return '?view=player';
  }

  /** Player details, same tab, per §5. The modal deep link is a separate act. */
  openPlayer(event: MouseEvent, c: CaseRecord): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    // Load the case first: the player header reads the modal store, so without
    // this the details page would open on whichever case was there before.
    this.modal.loadCase(c.id);
    this.nav.showPlayer();
  }

  /**
   * Whether the table has scrolled off its left edge.
   *
   * Drives the sticky column's shadow, and only that: flush left there is
   * nothing behind the Player column, so an edge there would promise a hidden
   * column that is in fact in view.
   */
  readonly scrolledX = signal(false);

  onScroll(event: Event): void {
    this.scrolledX.set((event.target as HTMLElement).scrollLeft > 0);
  }

  /**
   * Rule 4. Opens a NEW tab at ?view=player&case=<id>&modal=open.
   *
   * window.open rather than an anchor with target=_blank: the row already
   * carries a link on the player id, and a second thing that navigates but
   * looks like a button would give the cell two different grammars for the
   * same act. noopener is not optional here - without it the opened tab gets
   * a live handle on this one.
   */
  openCase(c: CaseRecord): void {
    window.open(this.nav.caseDeepLink(c.id), '_blank', 'noopener');
  }

  /**
   * Fallback only - it re-reads the store, it is not the update path.
   *
   * The class is dropped on a timer rather than on transitionend: under
   * reduced motion there is no transform and so no transitionend to listen
   * for, and the animation there would never be cleared. One timer covers
   * both, and re-clicking mid-spin restarts it rather than queueing.
   */
  refresh(): void {
    this.cases.now.set(Date.now());
    clearTimeout(this.spinTimer);
    this.spinning.set(false);
    // Next frame, so a click during a spin retriggers the transition instead
    // of the class never having left.
    requestAnimationFrame(() => {
      this.spinning.set(true);
      this.spinTimer = setTimeout(() => this.spinning.set(false), 200);
    });
  }
}
