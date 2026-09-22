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
import { CASES_TABS, CasesTab, NavStore } from '../core/nav-store';
import { CaseRecord, lockStatusLine } from '../core/models';
import { PillComponent } from './ui-pill.component';

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
        <h1 class="cases__title" id="cases-title">AML cases</h1>
        <p class="cases__sub">
          Open cases across the estate. Pick one, lock it, and open it.
        </p>
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
        <p class="cases__empty">
          {{ nav.tab() === 'compliance' ? 'No open Compliance AML cases' : 'No open AML cases' }}
          <button class="linkish" type="button">View past cases</button>
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
          cdkScrollable
          tabindex="0"
          role="region"
          aria-label="Cases table"
        >
          <table class="table">
            <colgroup>
              <col class="col-player" />
              <col class="col-sev" />
              <col class="col-lock" />
              <col class="col-linked" />
              <col class="col-prio" />
              <col class="col-sla" />
              <col class="col-work" />
              <col class="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Severity</th>
                <th scope="col">Lock</th>
                <th scope="col" class="cell--num">Linked</th>
                <th scope="col">
                  Priority<a
                    class="th__info"
                    [href]="SCORING_URL"
                    target="_blank"
                    rel="noopener noreferrer"
                    role="link"
                    aria-label="How priority scoring works"
                    matTooltip="How priority scoring works"
                  >
                    <!-- An SVG, not a mat-icon: the stroke weight is specified,
                         and a font glyph has no stroke to set. -->
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
                </th>
                <th scope="col">SLA</th>
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
                      <ui-pill tone="outline" [title]="c.player.status">{{
                        statusLabel(c.player.status)
                      }}</ui-pill>
                    </span>
                  </td>

                  <td>
                    <ui-pill [severity]="c.severity">{{ c.severity }}</ui-pill>
                  </td>

                  <!--
                    State only. The buttons moved to the trailing Actions
                    column, so this cell is read and never clicked: one place
                    to look for what the lock IS, one place to act on it.

                    Not locked carries no icon - an icon on the absence of a
                    lock says "lock" to anyone scanning the column quickly,
                    which is the opposite of what the row means.
                  -->
                  <td class="cell--lock">
                    @if (c.lock.state === 'unlocked') {
                      <span class="lock lock--none">Not locked</span>
                    } @else {
                      <span class="lock" [attr.data-lock]="c.lock.state" [title]="lockLine(c)">
                        <mat-icon class="lock__icon" aria-hidden="true">
                          {{ c.lock.state === 'locked-to-me' ? 'lock' : 'lock_outline' }}
                        </mat-icon>
                        <span class="lock__text">{{ lockLine(c) }}</span>
                      </span>
                    }
                  </td>

                  <td class="cell--num">{{ c.linkedAccounts }}</td>

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

                  <td>
                    <!-- The same pill as everything else; only the tone varies. -->
                    <ui-pill [tone]="slaTone(c)">{{ cases.slaText(c) }}</ui-pill>
                  </td>

                  <!-- To-do first. Two chips, then the count. Nothing is actionable. -->
                  <td class="cell--work">
                    <span class="work-row">
                    @for (w of visibleWork(c); track w.type) {
                      <!-- The modal's required-action chip, same component and
                           same tones: outline while to do, success with a tick
                           once done. -->
                      <ui-pill
                        [tone]="w.state === 'done' ? 'success' : 'outline'"
                        [title]="cases.workLabel(w.type)"
                        [attr.aria-label]="
                          cases.workLabel(w.type) + ': ' + (w.state === 'done' ? 'done' : 'to do')
                        "
                      >
                        <mat-icon class="chip__icon" aria-hidden="true">{{
                          w.state === 'done' ? 'check_circle' : 'radio_button_unchecked'
                        }}</mat-icon>
                        <span class="chip__label">{{ cases.workLabel(w.type) }}</span>
                      </ui-pill>
                    }
                    @if (hiddenWork(c) > 0) {
                      <!-- The pill on a button, rather than a button styled to
                           look like the pill: same component, one extra job. -->
                      <button
                        class="chip-more-btn"
                        type="button"
                        #workTrigger="matMenuTrigger"
                        [matMenuTriggerFor]="workMenu"
                        [matMenuTriggerData]="{ c: c }"
                        (keydown.escape)="workTrigger.closeMenu()"
                        [attr.aria-label]="
                          'Show all ' + c.actions.length + ' work items for player ' + c.player.id
                        "
                      >
                        <ui-pill tone="neutral" class="chip--more"
                          >+{{ hiddenWork(c) }} more</ui-pill
                        >
                      </button>
                    }
                    </span>
                  </td>

                  <!--
                    Actions, trailing edge. One button, or two when the case is
                    yours. Only Open case carries the primary token, and only
                    on a row the agent can actually act on - which is what
                    makes the fill mean something when it appears.

                    Every button names the player in its aria-label: ten rows
                    of "Lock" are indistinguishable to a screen reader
                    otherwise, and the visible text cannot carry the id
                    without repeating it down the column.
                  -->
                  <td class="cell--actions">
                    <span class="actions">
                      @switch (c.lock.state) {
                        @case ('locked-to-me') {
                          <!--
                            Unlock first in the DOM so the PRIMARY is last -
                            rightmost on screen, and last in the tab order.
                            Every row's trailing element is then the strongest
                            action it has, and the one-button rows put their
                            single button on that same edge.
                          -->
                          <button
                            mat-button
                            type="button"
                            [attr.aria-label]="'Unlock case for player ' + c.player.id"
                            (click)="cases.unlock(c.id)"
                          >
                            Unlock
                          </button>
                          <!-- Rule 4: this exists ONLY on a row locked to me,
                               and it is the one filled button in the table. -->
                          <button
                            mat-flat-button
                            color="primary"
                            type="button"
                            [attr.aria-label]="'Open AML case for player ' + c.player.id"
                            (click)="openCase(c)"
                          >
                            <mat-icon aria-hidden="true">open_in_new</mat-icon>
                            Open case
                          </button>
                        }
                        @case ('locked-to-other') {
                          <!-- The modal's own danger button: red outline, red
                               label, #FEE2E2 hover, all from .danger-button in
                               styles.scss. No icon, because the modal's has
                               none. -->
                          <button
                            mat-stroked-button
                            class="danger-button"
                            type="button"
                            [attr.aria-label]="'Force unlock case for player ' + c.player.id"
                            (click)="cases.requestForceUnlock(c.id)"
                          >
                            Force unlock
                          </button>
                        }
                        @default {
                          <button
                            mat-stroked-button
                            type="button"
                            [attr.aria-label]="'Lock case for player ' + c.player.id"
                            (click)="cases.lock(c.id)"
                          >
                            Lock
                          </button>
                        }
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
      <mat-menu #prioMenu="matMenu" class="pop pop--prio">
        <ng-template matMenuContent let-c="c">
          <!-- stopPropagation: a mat-menu closes on any click inside it, and
               the panel is a table to read, not a list to pick from. -->
          <div class="pop__body" (click)="$event.stopPropagation()">
            <p class="pop__head">
              Priority {{ c.priority.score }}
              <span class="pop__band">{{ cases.priorityText(c.priority).split(' ')[1] }}</span>
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

      <mat-menu #workMenu="matMenu" class="pop pop--work">
        <ng-template matMenuContent let-c="c">
          <div class="pop__body" (click)="$event.stopPropagation()">
            <p class="pop__head">Work</p>
            <!-- ALL of them, not just the hidden ones: the popover is the
                 full list, and a reader should not have to join it to the two
                 chips still visible behind the overlay. -->
            <ul class="pop__work">
              @for (w of cases.workOrdered(c); track w.type) {
                <li>
                  <ui-pill [tone]="w.state === 'done' ? 'success' : 'outline'">
                    <mat-icon class="chip__icon" aria-hidden="true">{{
                      w.state === 'done' ? 'check_circle' : 'radio_button_unchecked'
                    }}</mat-icon>
                    <span>{{ cases.workLabel(w.type) }}</span>
                  </ui-pill>
                </li>
              }
            </ul>
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
        margin: 0;
        font-size: 20px;
        line-height: 30px;
        font-weight: 600;
        color: var(--ink);
      }
      .cases__sub {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
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
        width: 248px;
      }
      .col-sev {
        width: 110px;
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
      .col-lock {
        width: 160px;
      }
      .col-linked {
        width: 80px;
      }
      /* 152: "200 Urgent" plus its info button is 116 - a 16px warning glyph,
         a 4px gap, the score, a 2px gap and the 24px button - plus 32 of cell
         padding. */
      .col-prio {
        width: 152px;
      }
      /* The breached pill at four digits is 117, so 116 was one pixel short. */
      .col-sla {
        width: 120px;
      }
      /* Measured, not guessed: 412 is the widest chip row on either tab.
         Was 448, sized back when the chips were the lg pill - they went to md
         and the column never followed. */
      .col-work {
        width: 412px;
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
      .col-actions {
        min-width: 180px;
        width: 248px;
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
         * The tallest cell is the Actions column's button, and it is the
         * modal's 32px - not a table-only size free to be chosen. 32 + 20 =
         * 52. Every other cell is 24 or less and centres in the space via
         * vertical-align. min-height on a tr is ignored by most engines, so
         * this padding is what actually holds the row open.
         */
        padding: 10px 16px;
        text-align: left;
        vertical-align: middle;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
      }
      .table th {
        padding-top: 10px;
        padding-bottom: 10px;
        background: var(--stream-bg);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--ink-3);
        text-transform: uppercase;
        /* Headers read in full now the columns have room: the narrow tracks
           were clipping them to SEV and SLJ. */
        white-space: nowrap;
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
       * requires of a non-text control. Solid --ink-2 is the SAME token the
       * header already carries, at full strength, and measures 7.09:1.
       *
       * The hit area is 24px square for 2.5.8 (the glyph stays 16), which is
       * also what gives the pressed layer something to paint. The glyph is
       * centred in it, so the margin is 2 rather than 6 - the box contributes
       * the other 4 and the optical gap is unchanged.
       */
      .th__info,
      .prio__info {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 24px;
        height: 24px;
        padding: 0;
        margin-left: 2px;
        vertical-align: middle;
        border: 0;
        background: none;
        border-radius: 50%;
        color: var(--ink-2);
        cursor: pointer;
        /* Colour alone, per the link treatment: nothing here moves or
           resizes on hover. */
        transition: color 150ms ease;
      }
      .th__info:hover,
      .prio__info:hover {
        color: var(--ink);
      }
      /**
       * Pressed: the full-strength colour plus a state layer on the HIT AREA,
       * not on the glyph - a wash over the 24px box is what reads as a press.
       * Mixed from --ink rather than given a hex of its own, at the 0.08 the
       * outlined buttons already use for their pressed layer.
       */
      .th__info:active,
      .prio__info:active {
        color: var(--ink);
        background: color-mix(in srgb, var(--ink) 8%, transparent);
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
      }
      @media (prefers-reduced-motion: reduce) {
        .th__info,
        .prio__info {
          transition: none;
        }
      }
      /* The "+N more" pill, made operable without being restyled. */
      .chip-more-btn {
        display: inline-flex;
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        cursor: pointer;
      }
      .chip-more-btn:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-radius: 999px;
      }

      /* ---- popovers: priority breakdown and the full work list --------- */
      .pop__body {
        padding: 16px;
        /* The menu is a panel to read, so its own cursor should not promise a
           click target the way a menu of items does. */
        cursor: default;
      }
      .pop__head {
        margin: 0 0 8px;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--ink-3);
        text-transform: uppercase;
      }
      .pop__band {
        text-transform: none;
        letter-spacing: 0;
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
        color: var(--ink);
        /* Nothing truncates. Past the panel's max-width the label wraps and
           the panel grows taller instead. */
        overflow-wrap: anywhere;
      }
      /* The middle column is the evidence, the right one is the arithmetic. */
      .pop__amount {
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .pop__points {
        font-size: 14px;
        line-height: 20px;
        text-align: right;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--ink);
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
      .pop__work {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .pop__link {
          transition: none;
        }
      }
      /**
       * Qualified by .table, and that is a regression being closed.
       *
       * These were .cell--num and .cell--actions, at 0-1-0. When the element
       * rules above were scoped to .table to keep them out of the popover,
       * they went from 0-0-1 to 0-1-1 - and quietly started winning. The
       * Linked column reverted to left-aligned, which put its number three
       * pixels from the end of the lock sentence beside it and read as a
       * stray value on the end of the lock cell.
       */
      .table .cell--num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
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
      .player-line {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 8px;
        min-width: 0;
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
      .player-line ui-pill {
        /* Never the one that gives: a truncated status is not a status. */
        flex: none;
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
      .cell--work {
        overflow: hidden;
      }
      .work-row {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 6px;
        min-width: 0;
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
        /* Tabular figures, so the rule under the id is the same width on every
           row rather than ragging with the digits above it. */
        font-variant-numeric: tabular-nums;
        color: var(--link);
        text-decoration: underline;
        text-underline-offset: 2px;
        text-align: left;
        cursor: pointer;
        /**
         * Colour only, and fast. This is a high-frequency target in a list an
         * agent scans, so an animated underline or a scale would be movement
         * on every pass down the column. transition-property is named rather
         * than a blanket all, precisely so nothing else can start animating
         * later without someone deciding to.
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
      @media (prefers-reduced-motion: reduce) {
        .linkish {
          transition: none;
        }
      }
      /* The header's text link is gone - an icon carries it now. This style
         returns when the priority breakdown popover lands, which is where the
         spec puts "How scoring works" for good. */

      /* Lock: the widget's vocabulary, unchanged. */
      .lock {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        max-width: 100%;
        color: var(--ink-2);
      }
      /**
       * NO size, colour or type rules here, and that is the point.
       *
       * These are the modal's buttons - mat-flat-button, mat-stroked-button,
       * mat-button, plus .danger-button for the destructive one - so their
       * 32px height, 0-16px padding, 14px/600 label, 1.25px tracking, 4px
       * radius and every hover, focus and pressed state arrive from Material
       * and styles.scss exactly as they do in the case header.
       *
       * The previous version was a hand-built .row-btn at 28px on 13px, which
       * matched the modal on nothing - not even letter-spacing, which it had
       * zeroed while every button in the modal carries 1.25px.
       *
       * The one rule left is the icon, and the modal's own components each
       * carry the same: Material's default glyph is 18px and the buttons this
       * table borrows from were set to 16.
       */
      /* A label that wraps is not a shorter button, it is a taller one - and
         a taller one silently breaks the 52px row. Wider is the honest
         failure: it shows up as overflow and gets the column resized. */
      .actions .mat-mdc-button-base {
        white-space: nowrap;
        /* flex: none as well as nowrap. As a shrinkable flex child the button
           was squeezed to the column rather than overflowing it, which read as
           "it fits" to every measurement while the label wrapped. */
        flex: none;
      }
      /* Material gives a text button 8px of side padding against 16 on the
         filled and outlined ones, so Unlock sat narrower than Open case
         beside it. dialog-shell corrects the same thing for the same reason;
         this is that correction, not a table-only size. */
      .actions .mat-mdc-button:not(.mat-mdc-unelevated-button):not(.mat-mdc-outlined-button) {
        padding-left: 16px;
        padding-right: 16px;
      }
      .actions .mat-mdc-button-base .mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /**
       * Flush right, so the trailing edge of the table is one line however
       * many buttons a row has. The wrapper carries the flex, never the td -
       * see the note on .cell--player for what that costs.
       */
      .actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: nowrap;
        gap: 8px;
      }
      .lock {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        max-width: 100%;
        color: var(--ink-2);
      }
      /**
       * The row button. 28px on 13px - its own scale, not the widget's 32/14.
       *
       * The widget's button sits alone in a card; these sit ten deep in a
       * column, where 32px of chrome per row reads as a toolbar rather than a
       * list. Same family, tighter step.
       */
      /**
       * Never wraps, never widens the column: past its cap the agent's name
       * ellipsises and the full sentence is on the title - the same rule the
       * widget applies when its own cell runs short.
       */
      .lock__text {
        /**
         * flex: none, and it is a sub-pixel bug that put it there.
         *
         * As a shrinkable flex item this box came out at 83.19px for text that
         * measures 83.42 - a quarter of a pixel short, with 48px of unused
         * room in the cell. That is enough for the renderer to ellipse, so
         * "Locked to you" drew as "Locked to y...". scrollWidth and clientWidth
         * both round to 83, which is why an integer overflow check called it
         * clean; the range measures the real width and does not.
         *
         * Sized to content now, and capped by max-width, so the ellipsis only
         * appears when the name genuinely exceeds 160px.
         */
        flex: none;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lock[data-lock='locked-to-me'] {
        color: var(--foreground-success);
        font-weight: 600;
      }
      .lock--none {
        color: var(--ink-3);
      }
      .lock__icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /**
       * Priority carries NO colour. Row order already says what is urgent -
       * it is the sort - so a second signal here would compete with the SLA
       * traffic light, which is the one that earns it.
       */
      /**
       * Inert, and deliberately so.
       *
       * This was the popover trigger - a button that read as text, with a
       * pointer cursor and a hover underline. A score is a value, and dressing
       * a value as a control means every row offers something to click that
       * does nothing a reader wants. The affordance moved to the icon beside
       * it, which is what an affordance is for.
       */
      .prio-cell {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        /* Squeezed, "200 Urgent" broke over two lines and took its row to
           61px - a taller row rather than a visibly overflowing one, which is
           the failure that hides. */
        white-space: nowrap;
      }
      /**
       * Inert, and deliberately so. A score is a value; the affordance is the
       * icon beside it.
       */
      .prio {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--ink);
      }
      /* The row icon IS the header's icon - both take the .th__info rules
         below. Only the open state is its own: an icon whose panel is up
         stays at full strength so the source of the popover is obvious. */
      .prio__info[aria-expanded='true'] {
        color: var(--ink);
      }
      .prio--urgent {
        font-weight: 700;
        color: var(--ink);
      }
      .prio__icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /* SLA is a ui-pill now - its four bands are tones on the shared
         component, not a local pill drawn to look like one. */

      /**
       * The chip itself must NOT clip - that would eat its own padding and cut
       * the pill's right edge. Only the label clips, and it ellipsises rather
       * than slicing a glyph in half. The full text is on the title.
       */
      .work-row ui-pill {
        overflow: visible;
        /**
         * ui-pill is flex: none by default, which is right everywhere else.
         * Here the chips may give a little if a future label outgrows the
         * column - and min-width: 0 is what lets the label ellipsise rather
         * than the chip simply overflowing its cell.
         */
        min-width: 0;
        flex-shrink: 1;
      }
      /* The count never gives: it is the thing that says work is hidden. */
      .chip--more {
        flex-shrink: 0;
      }
      /**
       * No width cap. A chip is as wide as its label needs.
       *
       * The cap was the bug: it cut "Open source searches" - the longest of the
       * six work types - even when the column had room for it. Overflow and
       * ellipsis stay as a LAST RESORT, for a label longer than any that
       * exists today; they should never fire on the current six.
       */
      .chip__label {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Never shrinks, so the label is the only thing that gives. */
      mat-icon.chip__icon {
        flex-shrink: 0;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .chip--more {
        color: var(--ink-3);
      }

      .cases__empty {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 32px 0;
        font-size: 14px;
        color: var(--ink-3);
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
  readonly SCORING_URL = 'https://confluence.example.com/aml-priority-scoring';

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
    PLAYER_VERIFY: 'Verify',
    SELF_EXCLUDED: 'Self excluded',
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    DORMANT: 'Dormant',
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

  /** Two chips, then a count. To-do first. */
  visibleWork(c: CaseRecord) {
    return this.cases.workOrdered(c).slice(0, 2);
  }

  hiddenWork(c: CaseRecord): number {
    return Math.max(0, c.actions.length - 2);
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
