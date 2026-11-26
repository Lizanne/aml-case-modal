import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import { AmlDashboardStore, ScoreRow } from '../core/aml-dashboard-store';
import { RiskBandId, bandFor } from '../core/aml-risk';
import { DialogShellComponent } from './dialog-shell.component';
import { PillComponent, PillTone } from './ui-pill.component';

/** The dashboard's own mapping: a band is a pill tone, never a new colour. */
const BAND_TONE: Record<RiskBandId, PillTone> = {
  low: 'success',
  medium: 'warn',
  high: 'danger',
  critical: 'danger-solid',
};

type Span = 'days' | 'revoked';

/**
 * APP-17691 5.3.4: any score-card field can be overridden by an agent.
 *
 * Three answers, in the order the agent thinks them: what the field should
 * score, for how long, and why. Points are a choice of two because the ticket
 * allows only two - zero or the field's fixed amount - so there is no number
 * to type and nothing to get wrong.
 *
 * Opens on the answer the agent most likely came for: the opposite of what the
 * field scores now. Overriding a field to the value it already has is allowed
 * (it pins the result against the system changing it) but it is not the
 * common case.
 */
@Component({
  selector: 'score-override-dialog',
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, MatIconModule, MatRadioModule, DialogShellComponent, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (row; as row) {
      <!--
        No initialFocus. The shell then focuses the dialog itself, and Tab
        goes to the selected radio. Naming a radio here put focus on the FIRST
        one - "0 points", the one not chosen - and Material paints a grey disc
        behind any focused radio, so the dialog opened with a mark on the
        answer it had not picked.
      -->
      <dialog-shell [heading]="row.override ? 'Edit override' : 'Override score'" (dismiss)="close()">
        <!--
          Three things, in the order they are needed: which field, what the
          system made of it, and what saving will change. The change is the
          only part in a box, because it is the only part that moves as the
          answers below it do - and it is drawn as before and after, the way
          the Adjust severity dialog draws its own.
        -->
        <div class="what">
          <p class="what__name">{{ row.parameter.label }}</p>
          <p class="what__system">
            The system has this as {{ row.met ? 'met' : 'not met' }}. Worth
            {{ row.parameter.points }} points when met.
          </p>

          <dl class="effect" aria-live="polite">
            <div class="effect__row">
              <dt>This field</dt>
              <dd>
                @if (points() !== row.points) {
                  <span class="effect__from">{{ row.points }}</span>
                  <mat-icon class="effect__arrow" aria-hidden="true">arrow_forward</mat-icon>
                  <span class="sr-only">changes to</span>
                }
                <span class="effect__to">{{ points() }}</span>
                <span class="effect__unit">points</span>
                @if (points() === row.points) {
                  <span class="effect__same">unchanged</span>
                }
              </dd>
            </div>
            <div class="effect__row">
              <dt>Player total</dt>
              <dd>
                @if (newTotal() !== store.total()) {
                  <span class="effect__from">{{ store.total() | number }}</span>
                  <mat-icon class="effect__arrow" aria-hidden="true">arrow_forward</mat-icon>
                  <span class="sr-only">changes to</span>
                }
                <span class="effect__to what__total">{{ newTotal() | number }}</span>
                <span class="effect__unit">points</span>
                @if (newTotal() === store.total()) {
                  <span class="effect__same">unchanged</span>
                }
              </dd>
            </div>
            <!-- The rating is a reading of its own, with its own label - not
                 a tag hung on the total. It is the consequence the other two
                 lead to, so it is the last line. -->
            <div class="effect__row">
              <dt>Risk rating</dt>
              <dd>
                @if (newBand().id !== store.band().id) {
                  <ui-pill size="sm" rim [tone]="tone(store.band().id)">{{ store.band().label }}</ui-pill>
                  <mat-icon class="effect__arrow" aria-hidden="true">arrow_forward</mat-icon>
                  <span class="sr-only">changes to</span>
                }
                <ui-pill size="sm" rim [tone]="tone(newBand().id)">{{ newBand().label }}</ui-pill>
                @if (newBand().id === store.band().id) {
                  <span class="effect__same">unchanged</span>
                }
              </dd>
            </div>
          </dl>
        </div>

        <fieldset class="group">
          <legend class="group__label">Points while overridden</legend>
          <mat-radio-group class="choices" [value]="points()" (change)="onPoints($event)">
            <mat-radio-button [value]="0">0 points</mat-radio-button>
            <mat-radio-button [value]="row.parameter.points">
              {{ row.parameter.points }} points
            </mat-radio-button>
          </mat-radio-group>
        </fieldset>

        <fieldset class="group">
          <legend class="group__label">How long</legend>
          <mat-radio-group class="choices choices--stack" [value]="span()" (change)="onSpan($event)">
            <!-- One line: "For [30] days". The field is always there, so
                 choosing the other answer does not change the dialog's height
                 and send it jumping up the screen.

                 While the other answer is chosen the field is out of the Tab
                 order. It used to choose this answer on FOCUS, so tabbing
                 from Points to Reason passed through it and changed "Until
                 revoked" to "For 30 days" without a key being pressed on it.
                 A pointer can still press into it, which chooses this answer;
                 a keyboard chooses "For" with the arrow keys, and the field
                 is then the next stop. -->
            <div class="days" [class.days--idle]="span() !== 'days'">
              <mat-radio-button value="days" aria-label="For a number of days">For</mat-radio-button>
              <input
                class="days__input"
                type="number"
                inputmode="numeric"
                min="1"
                max="365"
                aria-label="Number of days"
                [attr.tabindex]="span() === 'days' ? null : -1"
                [attr.aria-invalid]="daysError() ? 'true' : null"
                [attr.aria-describedby]="daysError() ? 'days-error' : null"
                [value]="days()"
                (click)="span.set('days')"
                (focus)="daysLeft.set(false)"
                (blur)="daysLeft.set(true)"
                (input)="span.set('days'); days.set($any($event.target).valueAsNumber)"
                (change)="$event.stopPropagation()"
              />
              <span class="days__unit" aria-hidden="true">days</span>
            </div>
            @if (daysError()) {
              <p class="days__error" id="days-error" role="alert">Enter a whole number from 1 to 365</p>
            }
            <mat-radio-button value="revoked">Until the override is revoked</mat-radio-button>
          </mat-radio-group>
        </fieldset>

        <label class="field">
          <span class="field__label">Reason</span>
          <textarea
            class="field__input"
            rows="3"
            aria-required="true"
            aria-describedby="reason-hint"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
            placeholder="What did you learn that the system does not know?"
          ></textarea>
          <span class="field__hint" id="reason-hint">Required. It is recorded in the audit log.</span>
        </label>

        <ng-container dialogActions>
          @if (row.override) {
            <button class="revoke" mat-button type="button" (click)="revoke(row)">Revoke override</button>
          }
          <button mat-button type="button" (click)="close()">Cancel</button>
          <button mat-flat-button color="primary" type="button" [disabled]="!valid()" (click)="save(row)">
            Save override
          </button>
        </ng-container>
      </dialog-shell>
    }
  `,
  styles: [
    `
      /* ---- what is being overridden, and what saving will do ----------- */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      /* The subject of the dialog, so it is set as one: a step up from the
         labels below it, on the panel itself rather than inside a box. */
      .what__name {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        color: var(--foreground-primary);
        text-wrap: balance;
      }
      .what__system {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      /**
       * Three readings down one column: the field, the total it feeds, the
       * rating the total gives. Labels share a left edge and values share
       * another, so a number, a pair of numbers and a pill all start on the
       * same line and the eye runs straight down them.
       *
       * Always three rows of 24px, whatever the answer below - so nothing
       * under this box moves when the answer changes.
       */
      .effect {
        display: grid;
        gap: var(--lds-core-spacing-1, 4px);
        margin: var(--lds-core-spacing-3, 12px) 0 0;
        padding: var(--lds-core-spacing-3, 12px) var(--lds-core-spacing-4, 16px);
        border-radius: 8px;
        background: var(--background-tertiary);
      }
      .effect__row {
        display: grid;
        grid-template-columns: 112px minmax(0, 1fr);
        align-items: center;
        min-height: 24px;
      }
      .effect dt {
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
      .effect dd {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-variant-numeric: tabular-nums;
      }
      /* What it is now recedes; what it will be is the reading. */
      .effect__from {
        color: var(--foreground-secondary);
      }
      .effect__to {
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .effect__unit,
      .effect__same {
        color: var(--foreground-secondary);
      }
      /* Set off from the value it qualifies. */
      .effect__same::before {
        content: '·';
        margin-right: 6px;
      }
      mat-icon.effect__arrow {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }

      /* ---- the two questions ------------------------------------------- */
      .group {
        margin: var(--lds-core-spacing-5, 20px) 0 0;
        padding: 0;
        border: 0;
        min-width: 0;
      }
      .group__label,
      .field__label {
        padding: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .choices {
        display: flex;
        flex-wrap: wrap;
        gap: 0 var(--lds-core-spacing-2, 8px);
        /* Material's radio carries 10px of touch padding around its circle;
           pull the group back so the circle, not the padding, lines up with
           the legend above it. */
        margin: 0 0 -10px -10px;
      }
      .choices--stack {
        flex-direction: column;
        align-items: flex-start;
      }
      .days {
        display: flex;
        align-items: center;
        gap: var(--lds-core-spacing-2, 8px);
      }
      .days__input {
        width: 76px;
        height: 36px;
        box-sizing: border-box;
        padding: 0 4px 0 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        background: var(--panel);
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
        font-variant-numeric: tabular-nums;
        transition:
          border-color 150ms ease-out,
          color 150ms ease-out;
      }
      .days__unit {
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
      }
      /* The other answer is chosen: the number stays where it is, quieter,
         and pressing into it chooses this answer again. */
      .days--idle .days__input {
        border-color: var(--line);
        color: var(--foreground-secondary);
      }
      .days--idle .days__unit {
        color: var(--foreground-secondary);
      }
      .days__input[aria-invalid='true'] {
        border-color: var(--danger);
      }
      .days__error {
        /* Under the field, not under the radio's circle. */
        margin: 0 0 0 10px;
        font-size: 14px;
        line-height: 20px;
        color: var(--danger);
      }

      /* ---- why --------------------------------------------------------- */
      .field {
        display: grid;
        gap: var(--lds-core-spacing-2, 8px);
        margin-top: var(--lds-core-spacing-5, 20px);
      }
      .field__input {
        width: 100%;
        min-height: 80px;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
        resize: vertical;
      }
      .field__input::placeholder {
        color: var(--foreground-secondary);
      }
      .field__hint {
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      .field__input:focus-visible,
      .days__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -1px;
        border-color: var(--primary);
      }
      /* iOS zooms the page on focus into any field set under 16px. */
      @media (pointer: coarse) {
        .field__input,
        .days__input {
          font-size: 16px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .days__input {
          transition: none;
        }
      }
      /* Away from Save and Cancel: it undoes something, they do not. */
      .revoke {
        margin-right: auto;
        --mdc-text-button-label-text-color: var(--danger);
      }
    `,
  ],
})
export class ScoreOverrideDialogComponent {
  readonly store = inject(AmlDashboardStore);

  /** Read once: the dialog edits the row it was opened on, not a moving one. */
  readonly row: ScoreRow | null = this.store.targetRow();

  readonly points = signal<number>(this.initialPoints());
  readonly span = signal<Span>(this.row?.override?.days === null ? 'revoked' : 'days');
  /** Opens on the field's own exit window where it has one: the period the
      metric already thinks in. */
  readonly days = signal<number>(this.row?.override?.days ?? this.row?.parameter.exitDays ?? 30);
  readonly reason = signal(this.row?.override?.reason ?? '');

  /** The player's total if this is saved: this field's points swapped out. */
  readonly newTotal = computed(() => this.store.total() - (this.row?.points ?? 0) + this.points());
  readonly newBand = computed(() => bandFor(this.newTotal()));

  tone(band: RiskBandId): PillTone {
    return BAND_TONE[band];
  }

  readonly daysValid = computed(() => {
    const n = this.days();
    return Number.isInteger(n) && n >= 1 && n <= 365;
  });

  /**
   * The field has been left. The error waits for that: someone clearing "30"
   * to type "45" passes through an empty field, and being told off mid-word
   * is noise. Save is disabled on daysValid alone, so nothing invalid can be
   * saved in the meantime.
   */
  readonly daysLeft = signal(false);
  readonly daysError = computed(() => this.span() === 'days' && !this.daysValid() && this.daysLeft());

  readonly valid = computed(
    () => this.reason().trim().length > 0 && (this.span() === 'revoked' || this.daysValid()),
  );

  /**
   * (change) on mat-radio-group is the group's output AND the DOM event of
   * the same name, and the number field sits inside the group. Its native
   * change - fired by the stepper arrows, and on blur - bubbled up here as a
   * plain Event with no .value, set the span to undefined, and the field
   * removed itself from under the pointer. The field stops its own event;
   * these two also refuse anything that is not one of their answers, so the
   * next control put inside a group cannot do the same.
   */
  onSpan(event: unknown): void {
    const value = (event as { value?: unknown }).value;
    if (value === 'days' || value === 'revoked') this.span.set(value);
  }

  onPoints(event: unknown): void {
    const value = (event as { value?: unknown }).value;
    if (typeof value === 'number') this.points.set(value);
  }

  save(row: ScoreRow): void {
    if (!this.valid()) return;
    this.store.setOverride(row.parameter.id, {
      points: this.points(),
      days: this.span() === 'revoked' ? null : this.days(),
      reason: this.reason().trim(),
    });
  }

  revoke(row: ScoreRow): void {
    this.store.revokeOverride(row.parameter.id);
  }

  close(): void {
    this.store.overrideTarget.set(null);
  }

  private initialPoints(): number {
    const row = this.row;
    if (!row) return 0;
    if (row.override) return row.override.points;
    return row.points === 0 ? row.parameter.points : 0;
  }
}
