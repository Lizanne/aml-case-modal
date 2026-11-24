import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AmlDashboardStore, DashboardTab, ScoreRow } from '../core/aml-dashboard-store';
import { RiskBand, RiskBandId } from '../core/aml-risk';
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
  imports: [MatButtonModule, MatIconModule, MatTabsModule, MatTooltipModule, PillComponent, StampPipe],
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
            <p class="eyebrow">Current AML risk</p>
            <!-- How fresh the number is. Relative, because "4 days ago" is the
                 question being asked; the exact time is on hover and in the
                 datetime for anything that reads it. -->
            @if (store.updatedAt(); as at) {
              <p class="risk__updated">
                Updated <time [attr.datetime]="at" [title]="at | stamp">{{ since(at) }}</time>
              </p>
            }
          </div>
          <p class="risk__line">
            <ui-pill class="risk__band" rim [tone]="tone(store.band())">{{ store.band().label }}</ui-pill>
            <span class="risk__score">{{ store.total() }}</span>
            <span class="risk__unit">points</span>
          </p>

          <!-- One picture, one sentence for a screen reader. The four ranges
               are printed under the bar, so the thresholds need no tooltip. -->
          <div class="scale" role="img" [attr.aria-label]="scaleLabel()">
            <div class="scale__track">
              @for (band of store.bands; track band.id) {
                <span class="scale__seg" [attr.data-band]="band.id" [class.is-current]="band.id === store.band().id"></span>
              }
              <!-- Moved with transform, not left: the rail is the track's own
                   width, so a percentage of it is a percentage of the track. -->
              <span class="scale__rail" [style.transform]="'translateX(' + markerAt() + '%)'">
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

          <p class="risk__foot">
            <!-- New this morning, or standing for months: the rating alone
                 does not say. A date, not "3 days ago" - it is a fact about
                 the player, and it is quoted in case notes. -->
            @if (store.ratingSince(); as since) {
              <span class="risk__since">{{ store.band().label }} since {{ since | stamp: 'date' }}</span>
            }
            @if (store.nextBand(); as next) {
              <span class="risk__next">{{ next.start - store.total() }} points to {{ next.label }}</span>
            }
            @if (hasActiveCase()) {
              <span class="case">
                Active case
                <button class="text-btn case__link" type="button" (click)="ws.open('aml')">#AML-1042</button>
                · {{ cases.severity() }} · opened {{ cases.createdAt() | stamp: 'date' }}
                <!-- Only when it is somebody else's. The link still opens the
                     case - reading it is not what the lock guards - and the
                     panel's own band says what can and cannot be done. -->
                @if (cases.lockState() === 'locked-to-other') {
                  <span class="case__lock">· locked to {{ cases.lockOwner()?.name }}</span>
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

        <div class="why">
          <h3 class="eyebrow" id="ad-why">What is adding points</h3>
          @if (drivers().length) {
            <ol class="drivers" aria-labelledby="ad-why">
              @for (row of drivers().slice(0, DRIVERS_SHOWN); track row.parameter.id) {
                <li>
                  <button class="text-btn" type="button" (click)="jump(row)">{{ row.parameter.label }}</button>
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
            <p class="why__more">Nothing is adding points.</p>
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
                                <span class="param__name">{{ row.parameter.label }}</span>
                                <button
                                  class="info"
                                  type="button"
                                  [attr.aria-label]="'About ' + row.parameter.label"
                                  [matTooltip]="row.parameter.info"
                                  matTooltipPosition="above"
                                >
                                  <mat-icon fontSet="material-icons-outlined" aria-hidden="true">info</mat-icon>
                                </button>
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
                        <th scope="row" colspan="3">Total</th>
                        <td class="num"><span class="sum">{{ store.total() }}</span></td>
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
            @if (!store.archive().length) {
              <p class="empty">
                <span class="empty__title">No closed AML cases</span>
                Cases for this player appear here once they are resolved.
              </p>
            } @else {
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
            }
          </section>
        </mat-tab>

        <!-- ----------------------------------------------- audit log -->
        <mat-tab label="Audit log">
          <section class="card card--tab" aria-label="Audit log">
            @if (!store.log().length) {
              <p class="empty">
                <span class="empty__title">No AML events yet</span>
                Score changes, overrides and cases are listed here as they happen.
              </p>
            } @else {
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
      /* No max-width: the widget row above runs the full width of the page,
         and a dashboard that stopped short of it left the two with different
         right edges. The rail is a fixed width, so only the main column
         stretches. */
      .ad {
        --rail: 320px;
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
      .ad__doc::before {
        content: '';
        position: absolute;
        inset: -10px -4px;
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
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--lds-core-spacing-8, 32px);
        padding: var(--lds-core-spacing-5, 20px);
      }
      .why {
        padding-left: var(--lds-core-spacing-8, 32px);
        border-left: 1px solid var(--line);
      }
      .drivers {
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
      .drivers .text-btn {
        text-align: left;
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
      /* Two facts on one line while there is room, each whole when not. */
      .risk__foot {
        display: flex;
        flex-wrap: wrap;
        gap: 4px var(--lds-core-spacing-5, 20px);
        margin: var(--lds-core-spacing-4, 16px) 0 0;
        font-variant-numeric: tabular-nums;
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
        height: 8px;
        border-radius: 4px;
        background: var(--line);
      }
      .scale__seg.is-current[data-band='low'] {
        background: var(--success);
      }
      .scale__seg.is-current[data-band='medium'] {
        background: var(--warn);
      }
      .scale__seg.is-current[data-band='high'],
      .scale__seg.is-current[data-band='critical'] {
        background: var(--danger);
      }
      .scale__rail {
        position: absolute;
        inset: 0;
        pointer-events: none;
        /* Only an override moves it, and then it should be seen to move. */
        transition: transform 240ms cubic-bezier(0.77, 0, 0.175, 1);
      }
      .scale__marker {
        position: absolute;
        left: 0;
        top: 50%;
        width: 16px;
        height: 16px;
        margin: -8px 0 0 -8px;
        box-sizing: border-box;
        border: 3px solid var(--foreground-primary);
        border-radius: 50%;
        background: var(--panel);
      }
      @media (prefers-reduced-motion: reduce) {
        .scale__rail {
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
      .tbl--archive {
        min-width: 620px;
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
      .param {
        display: flex;
        align-items: flex-start;
        gap: 2px;
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
       * With a mouse: the row under the pointer lights, and Override - the
       * same word on twenty-three rows - waits until its row is the one being
       * looked at. An existing override keeps its "Edit override" in view,
       * because that row has something to say.
       *
       * Never hover ALONE: keyboard focus inside the row shows it too, and on
       * a touch screen nothing is ever hidden.
       */
      @media (hover: hover) and (pointer: fine) {
        .tbl tbody tr:not(.band):hover > * {
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
          inset: -12px;
        }
        .icon-btn::before {
          inset: -6px;
        }
        /* 44px rows, so two fields' targets meet and never overlap. */
        .drivers li {
          padding-top: 12px;
          padding-bottom: 12px;
        }
      }

      /* ---- narrower --------------------------------------------------- */
      @media (max-width: 1279.98px) {
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
      }
      /**
       * Phone: the score-card stops being a table to look at. Scrolled
       * sideways, its Override column - the row's one action - was off screen.
       * Each row stacks instead: the field, then its result and points, then
       * its exit criteria and the action.
       */
      @media (max-width: 719.98px) {
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
        .tbl--score tfoot tr {
          border-top: 1px solid var(--line);
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
  readonly drivers = computed<ScoreRow[]>(() =>
    this.store
      .sections()
      .flatMap((section) => section.rows)
      .filter((row) => row.points > 0)
      .sort((a, b) => b.points - a.points),
  );

  readonly tabIndex = computed(() => TABS.indexOf(this.store.tab()));

  /**
   * Where the marker sits, as a percentage of the track: its band's quarter,
   * plus how far through that band the score is. Critical has no end, so it
   * is drawn as if it were as wide as everything below it.
   */
  readonly markerAt = computed(() => {
    const band = this.store.band();
    const index = this.store.bands.indexOf(band);
    const end = band.end ?? band.start * 2;
    const through = Math.min(1, (this.store.total() - band.start) / (end - band.start));
    // Kept a marker's half-width inside the track at both ends.
    return Math.min(99, Math.max(1, ((index + through) / this.store.bands.length) * 100));
  });

  readonly scaleLabel = computed(
    () =>
      `${this.store.total()} points, ${this.store.band().label}. ` +
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
