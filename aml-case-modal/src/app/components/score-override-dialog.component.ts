import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';

import { AmlDashboardStore, ScoreRow } from '../core/aml-dashboard-store';
import { DialogShellComponent } from './dialog-shell.component';

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
  imports: [MatButtonModule, MatRadioModule, DialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (row; as row) {
      <dialog-shell
        [heading]="row.override ? 'Edit override' : 'Override score'"
        initialFocus="mat-radio-button input"
        (dismiss)="close()"
      >
        <div class="what">
          <p class="what__name">{{ row.parameter.label }}</p>
          <p class="what__now">
            System result: {{ row.met ? 'met' : 'not met' }}, {{ row.met ? row.parameter.points : 0 }}
            of {{ row.parameter.points }} points
          </p>
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
            <mat-radio-button value="days">For a number of days</mat-radio-button>
            @if (span() === 'days') {
              <label class="days">
                <input
                  class="days__input"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="365"
                  aria-label="Number of days"
                  [attr.aria-invalid]="daysValid() ? null : 'true'"
                  [value]="days()"
                  (input)="days.set($any($event.target).valueAsNumber)"
                  (change)="$event.stopPropagation()"
                />
                <span class="days__unit">days</span>
                @if (!daysValid()) {
                  <span class="days__error" role="alert">Enter a whole number from 1 to 365</span>
                }
              </label>
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
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
            placeholder="What did you learn that the system does not know?"
          ></textarea>
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
      .what {
        padding: var(--lds-core-spacing-3, 12px) var(--lds-core-spacing-4, 16px);
        border-radius: 8px;
        background: var(--background-tertiary);
      }
      .what__name {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .what__now {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      .group {
        margin: var(--lds-core-spacing-4, 16px) 0 0;
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
        gap: 4px;
        /* Material's radio carries its own 10px of touch padding; pull the
           group back so the first circle lines up with the legend above. */
        margin-left: -10px;
      }
      .choices--stack {
        flex-direction: column;
        gap: 0;
      }
      .days {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        /* Under its radio's label, not under the circle. */
        margin: 0 0 4px 50px;
      }
      .days__input {
        width: 88px;
        box-sizing: border-box;
        padding: 8px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-primary);
        font-variant-numeric: tabular-nums;
      }
      .days__input[aria-invalid='true'] {
        border-color: var(--danger);
      }
      .days__unit {
        font-size: 14px;
        color: var(--foreground-secondary);
      }
      .days__error {
        flex-basis: 100%;
        font-size: 14px;
        line-height: 20px;
        color: var(--danger);
      }
      .field {
        display: grid;
        gap: 8px;
        margin-top: var(--lds-core-spacing-3, 12px);
      }
      .field__input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        color: var(--foreground-primary);
        resize: vertical;
      }
      .field__input:focus-visible,
      .days__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -1px;
        border-color: var(--primary);
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
  private readonly store = inject(AmlDashboardStore);

  /** Read once: the dialog edits the row it was opened on, not a moving one. */
  readonly row: ScoreRow | null = this.store.targetRow();

  readonly points = signal<number>(this.initialPoints());
  readonly span = signal<Span>(this.row?.override?.days === null ? 'revoked' : 'days');
  /** Opens on the field's own exit window where it has one: the period the
      metric already thinks in. */
  readonly days = signal<number>(this.row?.override?.days ?? this.row?.parameter.exitDays ?? 30);
  readonly reason = signal(this.row?.override?.reason ?? '');

  readonly daysValid = computed(() => {
    const n = this.days();
    return Number.isInteger(n) && n >= 1 && n <= 365;
  });

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
