import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, HostListener } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AmlDashboardStore, DashboardTab, ScoreRow } from '../core/aml-dashboard-store';
import { ScoreParameter, RiskBand, RiskBandId } from '../core/aml-risk';
import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { WorkspaceStore } from '../core/workspace-store';
import { PillComponent, PillTone } from './ui-pill.component';

/**
 * A band is a pill tone and nothing else: no colour is made for the rating.
 * Critical is the same red as high, filled - the step the SLA pill already
 * takes from "at risk" to "breached".
 */
const BAND_TONE: Record<RiskBandId, PillTone> = {
  low: 'success',
  medium: 'warn',
  high: 'danger',
  critical: 'danger-solid',
};

const TABS: readonly DashboardTab[] = ['overview', 'archive', 'audit'];

const RELATIVE = new Intl.RelativeTimeFormat('en-GB', { numeric: 'always' });

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * APP-17691: the AML dashboard that replaces the AML Risks tab in player
 * details. Reached from Menu, SG / AML, AML Risks.
 *
 * What is on the first screen is decided by requirement 1: the current risk
 * must be visible the moment the dashboard opens. So the rating, the score and
 * the active case sit above the tabs and stay there on every tab; the tabs
 * change only what is underneath.
 */
@Component({
  selector: 'aml-dashboard',
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, MatIconModule, MatTabsModule, MatTooltipModule, PillComponent, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ad" aria-labelledby="ad-title">
      <header class="ad__head">
        <h2 class="ad__title" id="ad-title">AML risk</h2>
        <!-- Leaves the Back Office for Confluence, in a new tab - which is
             what the glyph says. The links in the case modal lost theirs
             because they stopped doing that; this one still does. -->
        <a class="ad__doc" [href]="DOCS_URL" target="_blank" rel="noopener noreferrer">
          AML framework documentation
          <mat-icon aria-hidden="true">open_in_new</mat-icon>
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      </header>

      <!-- ------------------------------------------------ current risk -->
      <!-- ------------------------------------------------ current risk -->
      <!--
        One card, two halves: how high the risk is, and what is making it so.
        The active case is a line of text here, not a card of its own - the
        widget above already carries the case and its Open button, and two of
        those 150px apart was one too many.
      -->
      <div class="hero card">
        <div class="risk">
          <div class="risk__head">
            <h3 class="eyebrow">Current AML risk</h3>
            <!-- How fresh the number is. Relative, because "4 days ago" is the
                 question being asked. The exact time is a tooltip on a
                 focusable element, not a title attribute: a title is reached
                 by a mouse and nothing else. -->
            @if (store.updatedAt(); as at) {
              <p class="risk__updated">
                Updated
                <time class="risk__when" tabindex="0" [attr.datetime]="at" [matTooltip]="at | stamp" matTooltipPosition="above">{{ since(at) }}</time>
              </p>
            }
          </div>
          <p class="risk__line">
            <ui-pill class="risk__band" rim [tone]="tone(store.band())">{{ store.band().label }}</ui-pill>
            <span class="risk__score">{{ store.total() | number }}</span>
            <span class="risk__unit">points</span>
          </p>

          <!-- One picture, one sentence for a screen reader. The four ranges
               are printed under the bar, so the thresholds need no tooltip. -->
          <div class="scale" role="img" [attr.aria-label]="scaleLabel()">
            <!--
              A gauge that fills. Only the band the player is in is drawn in
              colour, filled as far as the score has got; every other band is
              the track's one grey. Critical has no upper limit, so there it
              is simply full, with no marker claiming a position in it.
            -->
            <div class="scale__track" [attr.data-band]="store.band().id" [style.--i]="position().index" [style.--t]="position().through">
              @for (band of store.bands; track band.id; let i = $index) {
                <span class="scale__seg" [attr.data-band]="band.id" [class.is-current]="band.id === store.band().id">
                  <span class="scale__fill" [style.transform]="'scaleX(' + fill(i) + ')'"></span>
                </span>
              }
              <span class="scale__rail">
                <span class="scale__marker"></span>
              </span>
            </div>
            <div class="scale__legend" aria-hidden="true">
              @for (band of store.bands; track band.id) {
                <span class="scale__key" [class.is-current]="band.id === store.band().id">
                  <span class="scale__name">{{ band.label }}</span>
                  <span class="scale__range">{{ range(band) }}</span>
                </span>
              }
            </div>
          </div>

          <!-- The scale's own caption: how far to the next band is a fact
               about the scale, so it sits under it. It used to share a line
               with the "since" date at the foot of the card, which left 45px
               of nothing between the ranges and the two lines below. -->
          @if (store.nextBand(); as next) {
            <p class="risk__next">{{ next.start - store.total() }} points to {{ next.label }}</p>
          } @else {
            <!-- Critical has no next band. The line's room is kept, so the
                 card is the same height at every rating. -->
            <p class="risk__next-room" aria-hidden="true"></p>
          }

          <!-- Two lines, always two: where the rating stands, then the case.
               Run together they wrapped at some widths and not at others, and
               the card's height followed. -->
          <div class="risk__foot">
            <p class="risk__standing">
            <!-- New this morning, or standing for months: the rating alone
                   does not say. A date, not "3 days ago" - it is a fact about
                   the player, and it is quoted in case notes. -->
              @if (store.ratingSince(); as since) {
                <span class="risk__since">{{ store.band().label }} since {{ since | stamp: 'date' }}</span>
              }
            </p>
            <p class="risk__case">
            @if (hasActiveCase()) {
                <span class="case">
                  Active case
                  <button class="text-btn case__link" type="button" (click)="ws.open('aml')">#AML-1042</button>
                  · {{ cases.severity() }} · opened {{ cases.createdAt() | stamp: 'date' }}
                  <!-- Only when it is somebody else's. The link still opens the
                       case - reading it is not what the lock guards - and the
                       panel's own band says what can and cannot be done. -->
                  @if (cases.lockState() === 'locked-to-other') {
                    · <span class="case__lock">locked to {{ cases.lockOwner()?.name }}</span>
                  }
                </span>
              } @else {
                <!-- Nested, not "@else if (...; as made)": Angular 17 has no alias
                     on an else-if. -->
                @if (store.createdCase(); as made) {
                  <span class="case">
                    Active case #{{ made.id }} · {{ made.severity }} · opened {{ made.opened | stamp: 'date' }}
                  </span>
                } @else {
                  <!-- Create lives beside the fact that makes it possible. One
                       open case per player (rule 1), so with a case active there
                       is nothing to offer and the button is not here. -->
                  <span class="case">
                    No active AML case
                    <button class="text-btn case__create" type="button" (click)="store.creatingCase.set(true)">
                      Create AML case
                    </button>
                  </span>
                }
              }
            </p>
          </div>
        </div>

        <div class="why">
          <h3 class="eyebrow" id="ad-why">What is adding points</h3>
          @if (drivers().length) {
            <ol class="drivers" aria-labelledby="ad-why">
              @for (row of drivers().slice(0, DRIVERS_SHOWN); track row.parameter.id) {
                <li>
                  <button
                    class="text-btn"
                    type="button"
                    [attr.aria-label]="row.parameter.label + ': go to this field in the score-card'"
                    (click)="jump(row)"
                  >{{ row.parameter.label }}</button>
                  @if (row.override) {
                    <ui-pill size="sm" tone="info">Overridden</ui-pill>
                  }
                  <span class="drivers__pts">{{ row.points }}</span>
                </li>
              }
            </ol>
            @if (drivers().length > DRIVERS_SHOWN) {
              <p class="why__more">and {{ drivers().length - DRIVERS_SHOWN }} more in the score-card below</p>
            }
          } @else {
            <p class="why__none">Nothing is adding points.</p>
          }
        </div>
      </div>

      <mat-tab-group
        class="ad__tabs"
        [selectedIndex]="tabIndex()"
        (selectedIndexChange)="store.tab.set(TABS[$event])"
        [mat-stretch-tabs]="false"
        animationDuration="0"
        disablePagination
      >
        <!-- ------------------------------------------------- overview -->
        <mat-tab label="Overview">
          <div class="grid">
            <div class="grid__main">
              <section class="card" aria-labelledby="ad-edd">
                <h3 class="card__title" id="ad-edd">Next EDD checkpoints</h3>
                <div class="card__scroll">
                  <table class="tbl tbl--edd">
                    <colgroup>
                      <col style="width: 23%" />
                      <col style="width: 27%" />
                      <col style="width: 21%" />
                      <col />
                      <col style="width: 64px" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Checkpoint</th>
                        <th scope="col">Next threshold</th>
                        <th scope="col">Player position</th>
                        <th scope="col">Actions on crossing</th>
                        <th scope="col"><span class="sr-only">Edit</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (checkpoint of store.checkpoints(); track checkpoint.id) {
                        <tr>
                          <th scope="row">
                            {{ checkpoint.measure }}
                            <span class="sub">{{ checkpoint.label }}</span>
                          </th>
                          <td>{{ checkpoint.threshold }}</td>
                          <td class="figures">{{ checkpoint.position }}</td>
                          <td>
                            @if (checkpoint.actions) {
                              {{ checkpoint.actions }}
                            } @else {
                              <span class="quiet">None</span>
                            }
                          </td>
                          <td class="act">
                            <button
                              class="icon-btn is-stub"
                              type="button"
                              [attr.aria-label]="'Edit the ' + checkpoint.measure.toLowerCase() + ' checkpoint'"
                              aria-disabled="true"
                              matTooltip="Editing a checkpoint is not in this prototype"
                            >
                              <mat-icon fontSet="material-icons-outlined" aria-hidden="true">edit</mat-icon>
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="card" aria-labelledby="ad-score">
                <h3 class="card__title" id="ad-score">Risk score-card</h3>
                <div class="card__scroll">
                  <table class="tbl tbl--score">
                    <colgroup>
                      <col />
                      <col style="width: 112px" />
                      <col style="width: 120px" />
                      <col style="width: 96px" />
                      <col style="width: 132px" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Risk parameter</th>
                        <th scope="col">Exit criteria</th>
                        <th scope="col">Result</th>
                        <th scope="col" class="num">Points</th>
                        <th scope="col" class="act">Override</th>
                      </tr>
                    </thead>
                    @for (section of store.sections(); track section.category) {
                      <tbody>
                        <tr class="band">
                          <th scope="colgroup" colspan="3">{{ section.category }}</th>
                          <td class="num">{{ section.points }}</td>
                          <td></td>
                        </tr>
                        @for (row of section.rows; track row.parameter.id) {
                          <tr [id]="'score-' + row.parameter.id" [class.is-overridden]="row.override">
                            <th scope="row">
                              <span class="param">
                                <!-- The no-break space is load-bearing: it ties the
                                     icon to the last word, so a name that wraps
                                     takes the icon down with it and the icon is
                                     never left on a line of its own. -->
                                <span class="param__name">{{ row.parameter.label }}</span><span class="param__tail">&nbsp;<button
                                  class="info"
                                  type="button"
                                  [attr.aria-label]="'About ' + row.parameter.label"
                                  [matTooltip]="row.parameter.info"
                                  matTooltipPosition="above"
                                >
                                  <mat-icon fontSet="material-icons-outlined" aria-hidden="true">info</mat-icon>
                                </button></span>
                              </span>
                              @if (row.override; as override) {
                                <span class="param__override">
                                  Overridden to {{ override.points }} points {{ overrideSpan(row) }} by
                                  {{ override.by }}. System result: {{ row.met ? 'met' : 'not met' }}.
                                  {{ override.reason }}
                                </span>
                              }
                              <!-- An override that ran out. Without this the
                                   row is indistinguishable from one that was
                                   never overridden, and the points it now
                                   scores arrive with no explanation. -->
                              @if (row.ended; as ended) {
                                <span class="param__ended">
                                  Override ended {{ day(ended.at) }}. It set this to
                                  {{ ended.override.points }} points for {{ ended.override.days }} days, by
                                  {{ ended.override.by }}. Back on the system result.
                                </span>
                              }
                            </th>
                            <td class="exit">{{ row.parameter.exitDays ? row.parameter.exitDays + ' days' : 'None' }}</td>
                            <td>
                              @if (row.override) {
                                <ui-pill size="sm" tone="info">Overridden</ui-pill>
                              } @else if (row.met) {
                                <ui-pill size="sm" tone="danger" rim>Met</ui-pill>
                              } @else {
                                <span class="quiet">Not met</span>
                              }
                            </td>
                            <!-- A zero says what it is a zero OF: the field's
                                 worth is on the row, not behind a tooltip. -->
                            <td class="num">
                              <span class="pts" [class.pts--zero]="row.points === 0">{{ row.points }}</span>
                              @if (row.points === 0) {
                                <span class="pts__of">of {{ row.parameter.points }}</span>
                              }
                            </td>
                            <td class="act">
                              <button
                                class="text-btn reveal"
                                type="button"
                                [attr.aria-label]="(row.override ? 'Edit override: ' : 'Override: ') + row.parameter.label"
                                (click)="store.overrideTarget.set(row.parameter.id)"
                              >
                                {{ row.override ? 'Edit override' : 'Override' }}
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    }
                    <tfoot>
                      <tr>
                        <th scope="row" colspan="3">
                          Total
                          <span class="foot__note">{{ scoring().met }} of {{ scoring().all }} fields are adding points</span>
                        </th>
                        <td class="num"><span class="sum">{{ store.total() | number }}</span><span class="pts__of">points</span></td>
                        <td class="act">
                          <ui-pill size="sm" rim [tone]="tone(store.band())">{{ store.band().label }}</ui-pill>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </div>

            <aside class="grid__side">
              <section class="card" aria-labelledby="ad-latest">
                <h3 class="card__title" id="ad-latest">Latest AML events</h3>
                @if (store.latest().length) {
                  <ol class="events">
                    @for (event of store.latest(); track event.id) {
                      <li class="events__item">
                        <span class="events__what">{{ event.what }}</span>
                        <span class="events__meta">{{ event.who }} · {{ event.at | stamp }}</span>
                      </li>
                    }
                  </ol>
                  <button class="text-btn text-btn--block" type="button" (click)="showAuditLog()">
                    View the full audit log
                  </button>
                } @else {
                  <p class="empty empty--side">
                    <span class="empty__title">No AML events yet</span>
                    Score changes, overrides and cases are listed here as they happen.
                  </p>
                }
              </section>
            </aside>
          </div>
        </mat-tab>

        <!-- -------------------------------------------- case archive -->
        <mat-tab [label]="'Case archive (' + store.archive().length + ')'">
          <section class="card card--tab" aria-label="Case archive">
            <!-- Empty or not, this is the table: the headers say what will be
                 listed, and the first closed case takes the row the message
                 was holding. -->
            <div class="card__scroll">
              <table class="tbl tbl--archive">
                <colgroup>
                  <col style="width: 148px" />
                  <col />
                  <col style="width: 148px" />
                  <col style="width: 120px" />
                  <col style="width: 124px" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Date opened</th>
                    <th scope="col">Opening trigger</th>
                    <th scope="col">Date closed</th>
                    <th scope="col">Severity</th>
                    <th scope="col"><span class="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  @if (!store.archive().length) {
                    <tr class="say">
                      <td colspan="5">
                        <div class="say__in">
                        <span class="empty__title">No closed AML cases</span>
                        <span class="say__more">Cases for this player appear here once they are resolved.</span>
                        </div>
                      </td>
                    </tr>
                    <!-- The quieter of the two: no closed cases is how most
                         players look, so two rows, not three. -->
                    <tr class="ghost" aria-hidden="true"><td><span class="ghost__bar" style="width: 64px"></span></td><td><span class="ghost__bar" style="width: 46%"></span></td><td><span class="ghost__bar" style="width: 64px"></span></td><td><span class="ghost__bar" style="width: 44px"></span></td><td><span class="ghost__bar" style="width: 0"></span></td></tr>
                    <tr class="ghost" aria-hidden="true"><td><span class="ghost__bar" style="width: 64px"></span></td><td><span class="ghost__bar" style="width: 32%"></span></td><td><span class="ghost__bar" style="width: 64px"></span></td><td><span class="ghost__bar" style="width: 52px"></span></td><td><span class="ghost__bar" style="width: 0"></span></td></tr>
                  }
                  @for (closed of store.archive(); track closed.id) {
                    <tr>
                      <td class="figures nowrap">{{ closed.opened | stamp: 'date' }}</td>
                      <td>{{ closed.trigger }}</td>
                      <td class="figures nowrap">{{ closed.closed | stamp: 'date' }}</td>
                      <td><ui-pill size="sm" [severity]="closed.severity">{{ closed.severity }}</ui-pill></td>
                      <td class="act">
                        <button
                          class="text-btn is-stub"
                          type="button"
                          aria-disabled="true"
                          matTooltip="Opening a closed case is not in this prototype"
                          [attr.aria-label]="'Open closed case #' + closed.id"
                        >
                          Open case
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </mat-tab>

        <!-- ----------------------------------------------- audit log -->
        <mat-tab label="Audit log">
          <section class="card card--tab" aria-label="Audit log">
            <div class="card__scroll">
              <table class="tbl tbl--audit">
                <colgroup>
                  <col style="width: 176px" />
                  <col />
                  <col style="width: 184px" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">What</th>
                    <th scope="col">Who</th>
                  </tr>
                </thead>
                <tbody>
                  @if (!store.log().length) {
                    <tr class="say">
                      <td colspan="3">
                        <div class="say__in">
                        <span class="empty__title">No AML events yet</span>
                        <span class="say__more">Score changes, overrides and cases are listed here as they happen.</span>
                        </div>
                      </td>
                    </tr>
                    <tr class="ghost" aria-hidden="true"><td><span class="ghost__bar" style="width: 104px"></span></td><td><span class="ghost__bar" style="width: 52%"></span></td><td><span class="ghost__bar" style="width: 72px"></span></td></tr>
                    <tr class="ghost" aria-hidden="true"><td><span class="ghost__bar" style="width: 104px"></span></td><td><span class="ghost__bar" style="width: 38%"></span></td><td><span class="ghost__bar" style="width: 96px"></span></td></tr>
                    <tr class="ghost" aria-hidden="true"><td><span class="ghost__bar" style="width: 104px"></span></td><td><span class="ghost__bar" style="width: 46%"></span></td><td><span class="ghost__bar" style="width: 64px"></span></td></tr>
                  }
                  @for (event of store.visibleLog(); track event.id) {
                    <tr>
                      <td class="when">{{ event.at | stamp }}</td>
                      <td>{{ event.what }}</td>
                      <td>{{ event.who }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <!-- A long-standing player has hundreds of these. Ten at a time,
                 newest first, and the count says how far down the list is. -->
            @if (store.log().length) {
            <p class="more">
              <span>Showing {{ store.visibleLog().length }} of {{ store.log().length }}</span>
              @if (store.logRemaining(); as left) {
                <button class="text-btn" type="button" (click)="store.showMoreLog()">
                  Show {{ left < 10 ? left : 10 }} more
                </button>
              }
            </p>
            }
          </section>
        </mat-tab>
      </mat-tab-group>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        color: var(--foreground-primary);
        font-size: 14px;
        line-height: 20px;
      }
      /**
       * Full width, at any window size: the page runs to the edge the widget
       * row and the player bar run to. A cap was tried (1280px) and left a
       * band of empty page down the right of a wide monitor, which read as
       * the dashboard not belonging to its own page.
       *
       * What a wide window must not do is pull things that are read together
       * apart, so the extra width is handed out, not shared evenly: the rail
       * takes some (320 to 400px), "What is adding points" stops at 520px so
       * a field name stays near its points, and the scale and the tables,
       * which read well long, take the rest.
       */
      .ad {
        --rail: clamp(320px, 25%, 400px);
        display: grid;
        gap: var(--lds-core-spacing-4, 16px);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      /* ---- head ------------------------------------------------------- */
      .ad__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--lds-core-spacing-2, 8px) var(--lds-core-spacing-4, 16px);
      }
      .ad__title {
        flex: 1;
        margin: 0;
        font-size: 20px;
        line-height: 30px;
        font-weight: 600;
      }
      .ad__doc {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: 2px;
        color: var(--link);
        font-weight: 600;
        text-decoration: none;
        transition: color 150ms ease-out;
      }
      /* 20px of text, 40px to hit. */
      .ad__doc {
        position: relative;
      }
      /* Nothing added on the right: the link ends on the page's own edge,
         and 4px of invisible hit area past it was 4px of sideways scroll on
         the whole page. */
      .ad__doc::before {
        content: '';
        position: absolute;
        inset: -10px 0 -10px -4px;
      }
      .ad__doc mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      @media (hover: hover) and (pointer: fine) {
        .ad__doc:hover {
          color: var(--link-hover);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      }
      /* ---- cards ------------------------------------------------------ */
      .card {
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        /* So a lit row follows the card's corners instead of squaring them. */
        overflow: hidden;
      }
      .eyebrow {
        margin: 0;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--foreground-secondary);
      }

      /* ---- hero: how high, and why ------------------------------------- */
      /**
       * One height, whoever the player is.
       *
       * The card's height used to be its content's: two fields scoring made a
       * short card, five a tall one, and everything under it moved as an
       * agent went from one player to the next. Now the right half always
       * keeps room for five rows and the line that counts the rest, and the
       * left half pins its last two lines to the bottom - so both halves end
       * on one edge and the card is the same box for every player.
       */
      .hero {
        --driver-row: 32px;
        display: grid;
        /* Half and half until the summary reaches 520px, then the rating
           side takes whatever more there is. */
        grid-template-columns: minmax(0, 1fr) minmax(0, min(50%, 520px));
        gap: var(--lds-core-spacing-8, 32px);
        padding: var(--lds-core-spacing-5, 20px);
      }
      .risk,
      .why {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .why {
        padding-left: var(--lds-core-spacing-8, 32px);
        border-left: 1px solid var(--line);
      }
      .drivers {
        /* Five rows and the four hairlines between them, used or not. */
        min-height: calc(var(--driver-row) * 5 + 4px);
        margin: var(--lds-core-spacing-2, 8px) 0 0;
        padding: 0;
        list-style: none;
      }
      .drivers li {
        display: flex;
        align-items: center;
        gap: var(--lds-core-spacing-2, 8px);
        padding: 6px 0;
        border-top: 1px solid var(--line);
      }
      .drivers li:first-child {
        border-top: 0;
      }
      /* Regular weight: five semibold links in a column were louder than the
         rating they explain. The colour and the hover are still the link's. */
      .drivers .text-btn {
        text-align: left;
        font-weight: 400;
      }
      /* The rows are 32px apart, so the hit area is exactly a row: any taller
         and one field's target would overlap the next. */
      .drivers .text-btn::before {
        inset: -6px -4px;
      }
      .drivers__pts {
        margin-left: auto;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .why__none {
        min-height: calc(var(--driver-row) * 5 + 4px);
        margin: var(--lds-core-spacing-2, 8px) 0 0;
        padding-top: 6px;
        box-sizing: border-box;
        color: var(--foreground-secondary);
      }
      /* Its line is kept whether or not there is anything to count. */
      .why::after {
        content: '';
        display: block;
        height: 22px;
      }
      .why:has(.why__more)::after {
        display: none;
      }
      .why__more {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      .risk__head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 2px var(--lds-core-spacing-4, 16px);
      }
      .risk__updated {
        margin: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      .risk__line {
        display: flex;
        align-items: baseline;
        gap: var(--lds-core-spacing-2, 8px);
        margin: var(--lds-core-spacing-2, 8px) 0 0;
      }
      /* The pill is a fixed-height box, so it centres on the numeral rather
         than hanging off the shared baseline. */
      .risk__band {
        align-self: center;
        margin-right: var(--lds-core-spacing-1, 4px);
      }
      .risk__score {
        font-size: 32px;
        line-height: 40px;
        font-weight: 600;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
      }
      .risk__unit,
      .risk__foot {
        color: var(--foreground-secondary);
      }
      .risk__foot {
        /* Pinned to the bottom, so it shares an edge with the list beside it. */
        margin-top: auto;
        /* 10, not 16: with the caption above now under the scale, 16 made
           this half 10px taller than the list beside it. */
        padding-top: 10px;
        font-variant-numeric: tabular-nums;
      }
      .risk__standing,
      .risk__case {
        min-height: 20px;
        margin: 0;
      }
      /* The case line may wrap. Held to one line it ran 59px across the
         divider at a 1100px window when the case was locked to someone else;
         now "locked to ..." drops to a second line as one piece. Every
         separator on these lines is the same typed middle dot. */
      .risk__case {
        margin-top: 4px;
      }
      .case__lock {
        white-space: nowrap;
      }
      .risk__next,
      .risk__next-room {
        min-height: 20px;
        margin: var(--lds-core-spacing-2, 8px) 0 0;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      .risk__when {
        border-radius: 2px;
        cursor: default;
      }

      /**
       * Four equal segments, not four to scale. To scale, Low and Medium
       * together would be a tenth of the bar and Critical would have no end
       * to draw; what the agent needs is which band, and how far through it.
       */
      .scale {
        margin-top: var(--lds-core-spacing-4, 16px);
      }
      .scale__track {
        position: relative;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
      }
      .scale__seg {
        position: relative;
        height: 8px;
        border-radius: 4px;
        background: var(--line);
        overflow: hidden;
      }
      /* The part of the current band still ahead: the band's own tint, so the
         whole segment reads as the one the player is in. */
      /* Low keeps the track's grey for the part still ahead. The success
         tint is too pale to be seen on white, and the outline that used to
         rescue it made this one band a different shape from the other three. */
      .scale__seg.is-current[data-band='low'] {
        background: var(--line);
      }
      .scale__seg.is-current[data-band='medium'] {
        background: var(--warn-bg);
      }
      .scale__seg.is-current[data-band='high'],
      .scale__seg.is-current[data-band='critical'] {
        background: var(--danger-bg-strong);
      }
      .scale__fill {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        /* Only the current band's fill is drawn. A passed band used to be
           a darker grey than one not yet reached, which said again what the
           marker already says and read as two greys that did not match. Now
           every band the player is not in is the track's one grey. */
        background: transparent;
        transform-origin: left center;
        transition: transform 240ms cubic-bezier(0.77, 0, 0.175, 1);
      }
      .scale__seg.is-current[data-band='low'] .scale__fill {
        background: var(--success);
      }
      .scale__seg.is-current[data-band='medium'] .scale__fill {
        background: var(--warn);
      }
      .scale__seg.is-current[data-band='high'] .scale__fill,
      .scale__seg.is-current[data-band='critical'] .scale__fill {
        background: var(--danger);
      }
      /**
       * The rail is the track's own box, moved along it. A segment is a
       * quarter of the track less its share of the three 4px gaps (25% - 3px),
       * and starts one segment and one gap after the last (25% + 1px) - so
       * the marker lands on the end of the fill to the pixel, and slides
       * across a gap when the rating changes rather than jumping it.
       *
       * Clamped a radius in from both ends, so at 0 points it sits on the
       * start of the bar instead of hanging off it.
       */
      .scale__rail {
        position: absolute;
        inset: 0;
        pointer-events: none;
        transform: translateX(
          clamp(7px, calc(var(--i) * (25% + 1px) + var(--t) * (25% - 3px)), calc(100% - 7px))
        );
        transition: transform 240ms cubic-bezier(0.77, 0, 0.175, 1);
      }
      /**
       * A solid dot in the band's colour, cut out of the bar by a ring of the
       * card's own white, with a soft shadow under it. The ring is what makes
       * it sit ON the bar: without it a red dot on a red fill is only a bump.
       */
      .scale__marker {
        position: absolute;
        left: 0;
        top: 50%;
        width: 14px;
        height: 14px;
        margin: -7px 0 0 -7px;
        border-radius: 50%;
        background: var(--foreground-primary);
        box-shadow:
          0 0 0 2.5px var(--panel),
          0 1px 3px 2px rgba(24, 24, 27, 0.16);
        transition: opacity 150ms ease-out;
      }
      /* Nowhere to point to in a band with no end. */
      .scale__track[data-band='critical'] .scale__marker {
        opacity: 0;
      }
      .scale__track[data-band='low'] .scale__marker {
        background: var(--success);
      }
      .scale__track[data-band='medium'] .scale__marker {
        background: var(--warn);
      }
      .scale__track[data-band='high'] .scale__marker {
        background: var(--danger);
      }
      @media (prefers-reduced-motion: reduce) {
        .scale__rail,
        .scale__fill,
        .scale__marker {
          transition: none;
        }
      }
      .scale__legend {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        margin-top: var(--lds-core-spacing-2, 8px);
      }
      .scale__key {
        display: grid;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      .scale__key.is-current {
        color: var(--foreground-primary);
      }
      .scale__name {
        font-weight: 600;
      }
      .scale__range {
        font-variant-numeric: tabular-nums;
      }

      /* ---- tabs ------------------------------------------------------- */
      .ad__tabs {
        --mat-tab-header-divider-height: 1px;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--rail);
        align-items: start;
        gap: var(--lds-core-spacing-4, 16px);
        padding-top: var(--lds-core-spacing-4, 16px);
      }
      .grid__main {
        display: grid;
        gap: var(--lds-core-spacing-4, 16px);
        min-width: 0;
      }
      .card--tab {
        margin-top: var(--lds-core-spacing-4, 16px);
      }
      .card__title {
        flex: 1;
        margin: 0;
        padding: var(--lds-core-spacing-4, 16px) var(--lds-core-spacing-5, 20px)
          var(--lds-core-spacing-3, 12px);
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
      }
      .sum {
        color: var(--foreground-primary);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      /* A table too wide for its card scrolls inside the card, not the page. */
      .card__scroll {
        overflow-x: auto;
      }

      /* ---- tables -----------------------------------------------------
       *
       * One table, four uses. What makes it read as one:
       *
       *   fixed columns   widths come from a colgroup, not from the content,
       *                   so a row gaining an override note or a longer event
       *                   cannot push the columns beside it around.
       *   one rhythm      every row is 12px + a 20px line + 12px = 44px, and a
       *                   pill or a number sits on that same 20px line.
       *   lines between   a hairline separates two rows. Nothing is drawn
       *                   above the first or below the last - the card's own
       *                   edge is already there, and a second line against it
       *                   was the doubled border on the two tab tables.
       *   quiet header    small, secondary, no fill: it labels the columns
       *                   and then gets out of the way of the rows.
       */
      .tbl {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
      }
      .tbl th,
      .tbl td {
        padding: var(--lds-core-spacing-3, 12px);
        text-align: left;
        vertical-align: top;
        font-weight: 400;
        overflow-wrap: anywhere;
      }
      .tbl th:first-child,
      .tbl td:first-child {
        padding-left: var(--lds-core-spacing-5, 20px);
      }
      .tbl th:last-child,
      .tbl td:last-child {
        padding-right: var(--lds-core-spacing-5, 20px);
      }
      .tbl thead th {
        padding-top: var(--lds-core-spacing-2, 8px);
        padding-bottom: var(--lds-core-spacing-2, 8px);
        border-bottom: 1px solid var(--line);
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        color: var(--foreground-secondary);
        white-space: nowrap;
      }
      /* A table that opens its card has no title above it, so its header
         takes the title's top padding instead of crowding the corner. */
      .card--tab .tbl thead th {
        padding-top: var(--lds-core-spacing-3, 12px);
        padding-bottom: var(--lds-core-spacing-3, 12px);
      }
      .tbl tbody tr:not(:first-child) > * {
        border-top: 1px solid var(--line);
      }
      .tbl tbody td {
        transition: background-color 100ms ease;
      }
      .tbl tbody th {
        transition: background-color 100ms ease;
      }
      .tbl .num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .tbl .act {
        text-align: right;
        white-space: nowrap;
      }
      .nowrap {
        white-space: nowrap;
      }
      /* The second line of a cell: what set this belongs to, under what it is. */
      .sub {
        display: block;
        font-size: 12px;
        line-height: 16px;
        font-weight: 400;
        color: var(--foreground-secondary);
      }
      .tbl--edd tbody th {
        font-weight: 600;
      }
      .case__create {
        margin-left: var(--lds-core-spacing-2, 8px);
      }
      .empty {
        display: grid;
        gap: 2px;
        margin: 0;
        padding: var(--lds-core-spacing-8, 32px) var(--lds-core-spacing-5, 20px);
        color: var(--foreground-secondary);
        text-align: center;
      }
      /* In the rail the card is narrow and already titled, so the empty state
         is left-aligned under the title rather than centred in a void. */
      .empty--side {
        padding: 0 var(--lds-core-spacing-5, 20px) var(--lds-core-spacing-4, 16px);
        text-align: left;
      }
      .empty__title {
        font-weight: 600;
        color: var(--foreground-primary);
      }
      /**
       * An empty table is still the table.
       *
       * The headers stay, the message takes the first row on the first
       * column's gutter, and under it the rows that are not there yet are
       * drawn as bars in the line colour, each fainter than the last. So the
       * card keeps the shape of a short filled table, and says what it is
       * waiting for by showing it. Nothing here moves: the one moment that
       * does is the first real row arriving, which is washed (see onFirst).
       */
      .tbl .say td {
        color: var(--foreground-secondary);
      }
      /* On a phone the table is wider than its card and scrolls sideways.
         The message is held to the card's width and stays put, so it is
         read whole and never has to be scrolled to. */
      .card--tab .card__scroll {
        container-type: inline-size;
      }
      .say__in {
        position: sticky;
        left: var(--lds-core-spacing-5, 20px);
        width: fit-content;
        max-width: calc(100cqi - 2 * var(--lds-core-spacing-5, 20px));
      }
      .say__more {
        margin-left: var(--lds-core-spacing-2, 8px);
      }
      .tbl .ghost {
        pointer-events: none;
        user-select: none;
      }
      .tbl .ghost:nth-child(2) {
        opacity: 0.8;
      }
      .tbl .ghost:nth-child(3) {
        opacity: 0.5;
      }
      .tbl .ghost:nth-child(4) {
        opacity: 0.25;
      }
      /* 8px in a 20px line, so a ghost row is exactly a real row's height. */
      .ghost__bar {
        display: block;
        max-width: 100%;
        height: 8px;
        margin: 6px 0;
        border-radius: 4px;
        background: var(--line);
      }
      .more {
        display: flex;
        align-items: center;
        gap: var(--lds-core-spacing-4, 16px);
        margin: 0;
        padding: var(--lds-core-spacing-3, 12px) var(--lds-core-spacing-5, 20px);
        border-top: 1px solid var(--line);
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      /**
       * Drawn, focusable and named, but not built: the ticket asks for no
       * edit modal, and the prototype has one case to open. It says so on
       * hover and focus rather than doing nothing in silence.
       */
      .is-stub {
        color: var(--foreground-secondary);
        cursor: not-allowed;
      }
      .quiet {
        color: var(--foreground-secondary);
      }
      .figures,
      .when {
        font-variant-numeric: tabular-nums;
      }
      /* The time an event happened is the index, not the news. */
      .when {
        color: var(--foreground-secondary);
        white-space: nowrap;
      }

      /* Narrow cards scroll their table sideways; these are the widths below
         which a column would stop being readable. */
      .tbl--edd {
        min-width: 680px;
      }
      .tbl--score {
        min-width: 660px;
      }
      /* 700, not 620: the fixed columns take 540, and 80px left the trigger
         narrower than its own header. */
      .tbl--archive {
        min-width: 700px;
      }
      .tbl--audit {
        min-width: 560px;
      }

      /* The section band, as in the case modal: --background-tertiary, the
         field label's size, uppercase. It is a heading, not a row, so it
         carries no separator and does not answer to the pointer. */
      .tbl--score .band th,
      .tbl--score .band td {
        padding-top: var(--lds-core-spacing-2, 8px);
        padding-bottom: var(--lds-core-spacing-2, 8px);
        border-top: 0;
        background: var(--background-tertiary);
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .tbl--score .band td.num {
        letter-spacing: 0;
      }
      .tbl--score .band + tr > * {
        border-top: 0;
      }
      /**
       * The name and its (i) are one run of text, so they share a line.
       *
       * As a flex row the icon was pinned to the first line: on a name that
       * wrapped to two it sat up at the top right, level with nothing. In
       * the text flow it follows the last word, and because the button is
       * exactly one line tall (20px on a 20px line) and aligned to the line
       * box, its centre is the line's centre on every row.
       */
      .param {
        display: block;
      }
      .param .info {
        vertical-align: top;
      }
      /* No break inside the tail, and none before it: its no-break space
         glues it to the name's last word. */
      .param__tail {
        white-space: nowrap;
      }
      .param__ended,
      .param__override {
        display: block;
        margin-top: 2px;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      .pts {
        font-weight: 600;
      }
      .pts--zero {
        font-weight: 400;
        color: var(--foreground-secondary);
      }
      .pts__of {
        margin-left: 4px;
        font-size: 12px;
        color: var(--foreground-secondary);
      }
      /* The same hairline as every other row. The total is set apart by its
         weight, not by a heavier rule: a darker line here was the one border
         in the card that did not match the rest. */
      .tbl tfoot th,
      .tbl tfoot td {
        border-top: 1px solid var(--line);
        font-weight: 600;
      }
      /**
       * The score-card's last row is its answer, so it is built as one.
       *
       * It closes the table on the section bands' own surface: the bands
       * open each group with its subtotal, and this is the same kind of row
       * doing the same job for the whole card. The figure is a step larger
       * than a row's and carries its unit, the note says how many fields
       * the sum is made of, and everything sits on one centre line so the
       * larger figure does not push the label and the pill off it.
       */
      .tbl--score tfoot th,
      .tbl--score tfoot td {
        padding-top: var(--lds-core-spacing-4, 16px);
        padding-bottom: var(--lds-core-spacing-4, 16px);
        background: var(--background-tertiary);
        vertical-align: middle;
      }
      .tbl--score tfoot .sum {
        font-size: 16px;
        line-height: 24px;
      }
      .foot__note {
        margin-left: var(--lds-core-spacing-2, 8px);
        font-weight: 400;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }

      /**
       * With a mouse: the row under the pointer lights, and Override - the
       * same word on twenty-three rows - waits until its row is the one being
       * looked at. An existing override keeps its "Edit override" in view,
       * because that row has something to say.
       *
       * Never hover ALONE: keyboard focus inside the row shows it too, and on
       * a touch screen nothing is ever hidden.
       */
      @media (hover: hover) and (pointer: fine) {
        .tbl tbody tr:not(.band):not(.say):not(.ghost):hover > * {
          background: var(--surface-hover);
        }
        .tbl .reveal {
          opacity: 0;
          transition: opacity 100ms ease;
        }
        .tbl tr:hover .reveal,
        .tbl tr:focus-within .reveal,
        .tbl tr.is-overridden .reveal {
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .tbl tbody td,
        .tbl tbody th,
        .tbl .reveal {
          transition: none;
        }
      }

      /* ---- small controls -------------------------------------------- */
      .info,
      .icon-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--foreground-secondary);
        transition:
          background-color 150ms ease-out,
          color 150ms ease-out;
      }
      .info {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        cursor: help;
      }
      .icon-btn {
        width: 32px;
        height: 32px;
        margin: -6px 0;
        border-radius: 8px;
        cursor: pointer;
      }
      /* 20px and 32px to look at, 40px to hit. */
      .info::before,
      .icon-btn::before {
        content: '';
        position: absolute;
        inset: -10px;
      }
      .icon-btn::before {
        inset: -4px;
      }
      .info mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .icon-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        line-height: 18px;
      }
      .text-btn {
        position: relative;
        padding: 0;
        border: 0;
        border-radius: 2px;
        background: none;
        color: var(--link);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: color 150ms ease-out;
      }
      .text-btn::before {
        content: '';
        position: absolute;
        inset: -8px -4px;
      }
      .text-btn--block {
        margin: var(--lds-core-spacing-3, 12px) var(--lds-core-spacing-5, 20px)
          var(--lds-core-spacing-4, 16px);
      }
      .icon-btn:not(.is-stub):active,
      .text-btn:not(.is-stub):active {
        transform: scale(0.97);
      }
      @media (hover: hover) and (pointer: fine) {
        .info:hover,
        .icon-btn:hover {
          background: var(--colors-alpha-alpha-soft-hover, rgba(0, 0, 0, 0.06));
          color: var(--foreground-primary);
        }
        .text-btn:not(.is-stub):hover {
          color: var(--link-hover);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      }

      /* ---- latest events ---------------------------------------------- */
      .events {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .events__item {
        display: grid;
        gap: 2px;
        padding: var(--lds-core-spacing-2, 8px) var(--lds-core-spacing-5, 20px);
        border-top: 1px solid var(--line);
      }
      .events__meta {
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }

      /* ---- touch: every target reaches 44px ---------------------------- */
      @media (pointer: coarse) {
        .text-btn::before,
        .drivers .text-btn::before {
          inset: -12px -4px;
        }
        .info::before,
        .ad__doc::before {
          inset: -12px 0 -12px -12px;
        }
        .icon-btn::before {
          inset: -6px;
        }
        /* 44px rows, so two fields' targets meet and never overlap. */
        .hero {
          --driver-row: 44px;
        }
        .drivers li {
          padding-top: 12px;
          padding-bottom: 12px;
        }
      }

      /* ---- narrower --------------------------------------------------- */
      /* 1320, not 1280: beside a 320px rail the main column needs 680px for
         the checkpoints table, and between 1280 and 1320 it had 648, so both
         tables scrolled sideways inside their cards on a common laptop. */
      @media (max-width: 1319.98px) {
        .grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 899.98px) {
        .hero {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--lds-core-spacing-5, 20px);
        }
        .why {
          padding: var(--lds-core-spacing-4, 16px) 0 0;
          border-left: 0;
          border-top: 1px solid var(--line);
        }
        /* Stacked, the two halves no longer share an edge to hold, and a
           phone has no room to keep empty rows: the card fits its content. */
        .drivers,
        .why__none {
          min-height: 0;
        }
        .why::after {
          display: none;
        }
        .risk__standing,
        .risk__case {
          flex-wrap: wrap;
          gap: 0 var(--lds-core-spacing-4, 16px);
          white-space: normal;
        }
      }
      /**
       * Phone: the score-card stops being a table to look at. Scrolled
       * sideways, its Override column - the row's one action - was off screen.
       * Each row stacks instead: the field, then its result and points, then
       * its exit criteria and the action.
       */
      @media (max-width: 719.98px) {
        /* One 16px gutter on a phone, everywhere: every card edge that was
           20px at desktop. */
        .hero,
        .card__title,
        .empty,
        .empty--side,
        .more,
        .events__item {
          padding-left: var(--lds-core-spacing-4, 16px);
          padding-right: var(--lds-core-spacing-4, 16px);
        }
        .tbl th:first-child,
        .tbl td:first-child {
          padding-left: var(--lds-core-spacing-4, 16px);
        }
        .tbl th:last-child,
        .tbl td:last-child {
          padding-right: var(--lds-core-spacing-4, 16px);
        }
        .tbl--score {
          display: block;
          min-width: 0;
        }
        .tbl--score colgroup {
          display: none;
        }
        .tbl--score thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
        }
        .tbl--score tbody,
        .tbl--score tfoot {
          display: block;
        }
        .tbl--score tr {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 4px var(--lds-core-spacing-3, 12px);
          align-items: center;
          padding: var(--lds-core-spacing-3, 12px) var(--lds-core-spacing-4, 16px);
        }
        .tbl--score tbody tr:not(:first-child) {
          border-top: 1px solid var(--line);
        }
        .tbl--score tr > * {
          display: block;
          padding: 0 !important;
          border: 0 !important;
          background: none !important;
        }
        .tbl--score tbody tr:not(.band) > th {
          grid-column: 1 / -1;
        }
        .tbl--score .exit {
          grid-row: 3;
          color: var(--foreground-secondary);
        }
        .tbl--score .exit::before {
          content: 'Exit criteria: ';
        }
        .tbl--score .band {
          border-top: 0 !important;
          background: var(--background-tertiary);
        }
        .tbl--score .band > td:last-child {
          display: none;
        }
        /* Stacked, the cells no longer tile the row, so the row carries
           the surface itself. */
        .tbl--score tfoot tr {
          border-top: 1px solid var(--line);
          background: var(--background-tertiary);
        }
        .tbl--score tfoot .act {
          grid-column: 1 / -1;
          text-align: left;
        }
        .tbl--score .reveal {
          opacity: 1;
        }
        .ad__title {
          flex-basis: 100%;
        }
      }
    `,
  ],
})
export class AmlDashboardComponent {
  /**
   * The dashboard is its own scroller (see .stage__page). What scrolls off
   * its top fades over a length that grows with the first 16px of scroll,
   * so an unscrolled page is not dimmed and the fade never appears at once.
   */
  @HostListener('scroll', ['$event.target'])
  onScroll(scroller: HTMLElement): void {
    scroller.style.setProperty('--fade', Math.min(scroller.scrollTop, 16) + 'px');
  }

  readonly store = inject(AmlDashboardStore);
  readonly cases = inject(CaseStore);
  readonly ws = inject(WorkspaceStore);

  /** Placeholder: the Confluence space for the AML framework. */
  readonly DOCS_URL = 'https://lottomart.atlassian.net/wiki/spaces/AML/overview';
  readonly TABS = TABS;
  /**
   * The snippet's link changes tab, and the button that was pressed goes with
   * the tab it lived in - so focus goes to the tab that was opened, not back
   * to the top of the page.
   */
  showAuditLog(): void {
    this.store.tab.set('audit');
    setTimeout(() =>
      document.querySelector<HTMLElement>('aml-dashboard [role="tab"][aria-selected="true"]')?.focus(),
    );
  }

  /**
   * A case that is on the page and not resolved. Presence matters as well as
   * status: a player who has never had a case has no AML widget at all.
   */
  readonly hasActiveCase = computed(() => this.ws.isPresent('aml') && !this.cases.isResolved());

  /** The card is a summary: past five, the score-card below is the list. */
  readonly DRIVERS_SHOWN = 5;

  /** Every field adding points right now, biggest first. */
  /** How many fields the total is made of, for the table's last row. */
  readonly scoring = computed(() => {
    const rows = this.store.sections().flatMap((section) => section.rows);
    return { met: rows.filter((row) => row.points > 0).length, all: rows.length };
  });

  readonly drivers = computed<ScoreRow[]>(() =>
    this.store
      .sections()
      .flatMap((section) => section.rows)
      .filter((row) => row.points > 0)
      .sort((a, b) => b.points - a.points),
  );

  readonly tabIndex = computed(() => TABS.indexOf(this.store.tab()));

  /**
   * Where the score stands on the gauge: which band, and how far through it,
   * 0 to 1. Critical has no end, so it is drawn as if it were as wide as
   * everything below it.
   */
  readonly position = computed(() => {
    const band = this.store.band();
    // A band with no upper limit has no "how far through": it is full. It
    // used to be measured against twice its start, so 900 points and 2,000
    // both pinned the marker to the end and read as a maximum reached.
    const through =
      band.end === null
        ? 1
        : Math.min(1, Math.max(0, (this.store.total() - band.start) / (band.end + 1 - band.start)));
    return { index: this.store.bands.indexOf(band), through };
  });

  /** How full a segment is: every band passed is full, every band ahead empty. */
  fill(index: number): number {
    const at = this.position();
    return index < at.index ? 1 : index === at.index ? at.through : 0;
  }

  readonly scaleLabel = computed(
    () =>
      `${this.store.total().toLocaleString('en-GB')} points, ${this.store.band().label}. ` +
      this.store.bands.map((band) => `${band.label}: ${this.range(band, ' to ')}`).join('. ') +
      '.',
  );

  /**
   * A row that has just been changed is washed once, the same wash a jump
   * from the summary gives it: after a revoke the row has LOST something, and
   * an absence is the one change the eye does not find on its own.
   */
  private readonly onChange = effect(() => {
    const notice = this.store.notice();
    if (!notice) return;
    // After the row has been re-rendered with its new contents.
    setTimeout(() => this.wash(document.getElementById('score-' + notice.parameterId)));
  });

  /**
   * The first event, or the first closed case, lands in the row the empty
   * message was holding, and is washed once so the hand-over is seen. Only
   * on the change from none to some: a table that opens with rows is not
   * news.
   */
  private had = { log: -1, archive: -1 };
  private readonly onFirst = effect(() => {
    const now = { log: this.store.log().length, archive: this.store.archive().length };
    const first = (['log', 'archive'] as const).filter((key) => this.had[key] === 0 && now[key] > 0);
    this.had = now;
    for (const key of first) {
      const table = key === 'log' ? '.tbl--audit' : '.tbl--archive';
      setTimeout(() => this.wash(document.querySelector<HTMLElement>(`aml-dashboard ${table} tbody tr`)));
    }
  });

  private wash(row: HTMLElement | null): void {
    row?.animate(
      [{ backgroundColor: 'var(--color-background-info-subdued)' }, { backgroundColor: 'transparent' }],
      { duration: 800, easing: 'ease-out' },
    );
  }

  /**
   * Takes the agent from a line in the summary to that field's row in the
   * score-card: scrolled to the middle, washed once so the eye lands on it,
   * and focus left on its Override button - the likeliest next press.
   */
  jump(row: ScoreRow): void {
    // The score-card is on Overview. From either other tab the row is not in
    // the page at all, so the link used to do nothing: go there first, then
    // make the jump once the tab's content has been put back.
    if (this.store.tab() !== 'overview') {
      this.store.tab.set('overview');
      setTimeout(() => this.jump(row), 50);
      return;
    }
    const target = document.getElementById('score-' + row.parameter.id);
    if (!target) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    this.wash(target);
    target.querySelector<HTMLElement>('button.text-btn')?.focus({ preventScroll: true });
  }

  /** "just now", "5 minutes ago", "4 days ago" - the largest whole unit. */
  since(iso: string): string {
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const steps: [limit: number, size: number, unit: Intl.RelativeTimeFormatUnit][] = [
      [3600, 60, 'minute'],
      [86400, 3600, 'hour'],
      [86400 * 30, 86400, 'day'],
      [86400 * 365, 86400 * 30, 'month'],
      [Infinity, 86400 * 365, 'year'],
    ];
    const [, size, unit] = steps.find(([limit]) => seconds < limit)!;
    return RELATIVE.format(-Math.floor(seconds / size), unit);
  }

  tone(band: RiskBand): PillTone {
    return BAND_TONE[band.id];
  }

  range(band: RiskBand, join = '–'): string {
    return band.end === null ? `${band.start}+` : `${band.start}${join}${band.end}`;
  }

  day(date: Date): string {
    return DAY.format(date);
  }

  /** "until revoked", or "until 20 Dec 2026". */
  overrideSpan(row: ScoreRow): string {
    return row.overrideEnds ? `until ${DAY.format(row.overrideEnds)}` : 'until revoked';
  }
}
