import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { StampPipe } from '../core/format';
import { SeverityChangeEvent } from '../core/models';
import { PillComponent } from './ui-pill.component';

/**
 * A severity change, rendered as an annotation between outcome cards rather
 * than as a card of its own.
 *
 * Unboxed on purpose: no background, no border, secondary ink, 4px of vertical
 * padding. The cards are the record of what was done; an event is a margin note
 * about the case changing underneath them, and giving it a card's chrome
 * overstates it.
 *
 * Lock and unlock used to render here too. They do not any more - they are case
 * history and belong to the Timeline tab alone, so `EventItem` no longer admits
 * them and this component only ever sees a severity change.
 */
@Component({
  selector: 'event-row',
  standalone: true,
  imports: [MatIconModule, StampPipe, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <mat-icon class="row__icon" [class.row__icon--escalation]="event.direction === 'escalation'">
        {{ event.direction === 'escalation' ? 'arrow_upward' : 'arrow_downward' }}
      </mat-icon>

      <span class="row__label">
        {{ event.direction === 'escalation' ? 'Severity escalation' : 'Severity de-escalation' }}
      </span>

      <ui-pill [severity]="event.from">{{ event.from }}</ui-pill>
      <mat-icon class="row__arrow">arrow_forward</mat-icon>
      <ui-pill [severity]="event.to">{{ event.to }}</ui-pill>

      <span class="row__reason" [title]="event.reason">{{ event.reason }}</span>

      <span class="row__meta">{{ event.actor }} · {{ event.at | stamp }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      /* One line, no box. */
      /* min-width: 0 so this row can be narrower than its content: it is a
         nowrap line of nowrap parts, so its min-content is its full width, and
         as a grid item that would size the whole stream. The reason ellipsises
         to absorb the difference. */
      .row {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 8px;
        padding: 4px 2px;
        background: none;
        border: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
      }
      .row__icon,
      .row__arrow {
        flex: none;
        color: var(--ink-2);
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      /* PROTOTYPE.md: "Severity escalation shows an up arrow in the warn
         colour." Only escalation - the spec names that direction alone, and
         warn on a de-escalation would be saying the wrong thing. The rest of
         the row stays secondary ink so the event still reads as an annotation.
         3.92:1 against the stream background, clear of the 3:1 non-text bar. */
      .row__icon--escalation {
        color: var(--warn);
      }
      .row__arrow {
        color: var(--ink-3);
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .row__label {
        flex: none;
        font-weight: 600;
        color: var(--ink-2);
      }
      /* The reason takes what is left and ellipsises, so the row stays one
         line; the full text is on the title attribute. */
      .row__reason {
        flex: 1 1 auto;
        min-width: 0;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .row__meta {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-left: auto;
        text-align: right;
        white-space: nowrap;
        font-size: 12px;
        color: var(--ink-3);
      }

      /**
       * Mobile: the one-line rule is what has to give.
       *
       * At ~310px the reason had 9px to ellipsise into, which is not an
       * annotation, it is a smudge. The row wraps instead: label and arrows
       * hold the first line, the reason wraps below at full width, and the
       * timestamp trails it.
       */
      @media (max-width: 719.98px) {
        .row {
          flex-wrap: wrap;
          row-gap: 2px;
        }
        .row__reason {
          flex: 1 1 100%;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
        }
        .row__meta {
          margin-left: 0;
          text-align: left;
        }
      }
    `,
  ],
})
export class EventRowComponent {
  @Input({ required: true }) event!: SeverityChangeEvent;
}
