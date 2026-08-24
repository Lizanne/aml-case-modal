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
      <!--
        Line one is fixed-width parts only. Nothing here shrinks and nothing
        ellipsises, so the author and time cannot be pushed out or clipped by a
        long label or a wide pill - the only elastic thing in the row is the
        reason, and it is on the line below.
      -->
      <div class="row__head">
        <mat-icon class="row__icon" [class.row__icon--escalation]="event.direction === 'escalation'">
          {{ event.direction === 'escalation' ? 'arrow_upward' : 'arrow_downward' }}
        </mat-icon>

        <span class="row__label">
          {{ event.direction === 'escalation' ? 'Severity escalation' : 'Severity de-escalation' }}
        </span>

        <ui-pill [severity]="event.from">{{ event.from }}</ui-pill>
        <mat-icon class="row__arrow">arrow_forward</mat-icon>
        <ui-pill [severity]="event.to">{{ event.to }}</ui-pill>

        <span class="row__meta">{{ event.actor }} · {{ event.at | stamp }}</span>
      </div>

      <p class="row__reason" [title]="event.reason">{{ event.reason }}</p>
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
      /* Two lines, no border and no fill: an event is an annotation between
         outcome cards, and a box around it would give it their weight. */
      .row {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
        padding: 4px 2px;
        background: none;
        border: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
      }
      /**
       * Wraps, at every width - not just on mobile.
       *
       * Nothing on this line may truncate, so when it will not fit there are
       * only two outcomes available: overflow, or wrap. It was overflowing at
       * around 430px of stream, which is narrower than the dual half but well
       * inside what a 900px window gives, and an author and time pushed past
       * the edge is the failure this rule exists to prevent. Wrapping drops
       * them to their own line intact instead.
       */
      .row__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        row-gap: 2px;
        min-width: 0;
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
      /**
       * The reason: its own line, full width, two lines then ellipsis.
       *
       * min-height reserves the second line whether or not it is used, so a
       * one-line reason and a clamped three-line one make the same shape. It
       * costs 20px of white under short reasons; the alternative is a stream
       * whose rows jump height with the length of someone's sentence.
       *
       * 2 x the 20px line-height. Derived from the same line-height the box
       * clamps with, not a measured 40.
       */
      .row__reason {
        margin: 0;
        min-width: 0;
        min-height: calc(2 * 20px);
        color: var(--ink-3);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      /* Right-aligned and unshrinkable. flex: none is the whole guarantee:
         given any shrink it would be the first thing to give, because it is
         the longest run of text on the line. */
      .row__meta {
        flex: none;
        margin-left: auto;
        text-align: right;
        white-space: nowrap;
        font-size: 12px;
        color: var(--ink-3);
      }

      /**
       * Mobile: line one wraps rather than overflowing.
       *
       * Nothing on it may truncate, so when it will not fit the only honest
       * move left is to let it wrap - the author and time drop to their own
       * line intact rather than being clipped.
       */
      @media (max-width: 719.98px) {
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
