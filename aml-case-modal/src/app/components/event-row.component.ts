import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { StampPipe } from '../core/format';
import { CaseCreatedEvent, EventItem, SeverityChangeEvent } from '../core/models';
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
  // On the HOST, not the inner .row: the gap beneath this event is the
  // stream's business, and the stream can only address the host element.
  host: {
    '[class.event-row--created]': "event.type === 'case-created'",
  },
  template: `
    <div class="row">
      <!--
        Line one is fixed-width parts only. Nothing here shrinks and nothing
        ellipsises, so the author and time cannot be pushed out or clipped by a
        long label or a wide pill - the only elastic thing in the row is the
        reason, and it is on the line below.
      -->
      <div class="row__head">
        <!-- One label slot for both kinds. The direction arrow is gone: the
             label already says escalation or de-escalation, and the pills say
             which way. -->
        <span class="row__label">{{ headLabel }}</span>

        <!--
          Pills belong to a severity change only. A creation reason is a
          provenance label, not a severity, and pill chrome would put it in the
          severity vocabulary it has nothing to do with.
        -->
        @if (severityChange; as sev) {
          <ui-pill size="sm" [severity]="sev.from">{{ sev.from }}</ui-pill>
          <mat-icon class="row__arrow">arrow_forward</mat-icon>
          <ui-pill size="sm" [severity]="sev.to">{{ sev.to }}</ui-pill>
        }

        <span class="row__meta">{{ event.actor }} · {{ event.at | stamp }}</span>
      </div>

      <!-- Line two either way: the severity reason, or the creation
           motivation. Same clamp, same hover title. -->
      <p class="row__reason" [title]="lineTwo">{{ lineTwo }}</p>
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
      /**
       * The card's geometry from 22319:5225 - 12px radius, 16px of side
       * padding - but no fill and no border. An outcome card carries both, so
       * an event with neither stays the lighter of the two.
       */
      .row {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 4px;
        /* No vertical padding on either event kind. These are unboxed
           annotations, and the stream's own 12px gap is what separates them
           from the cards either side; the row's own padding was additive on
           top of it and read as drift rather than rhythm. */
        padding: 0 16px;
        border-radius: 12px;
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
      /* 16px, matching the direction arrow. They are a pair on the same line
         and were a step apart at 14 and 16. */
      .row__arrow {
        color: var(--ink-3);
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .row__label {
        flex: none;
        font-weight: 600;
        color: var(--ink);
      }
      /**
       * The reason: its own line, full width, two lines then ellipsis.
       *
       * It HUGS. There is deliberately no height here of any kind: -webkit-box
       * with a line clamp is a maximum, not a size, so a one-line reason
       * occupies one line and only a genuinely overflowing one is cut at two.
       *
       * A min-height of two lines here reserved the second line whether it was
       * used or not, which bought uniform row heights at the price of 20px of
       * empty space under every short reason. The padding on .row is what
       * holds the rhythm instead, and it is the same above and below whichever
       * height the reason lands on.
       */
      .row__reason {
        margin: 0;
        min-width: 0;
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
  @Input({ required: true }) event!: EventItem;

  /**
   * Narrowed accessors rather than casts at the template's call sites: the
   * union is discriminated on `type`, and @if binding the narrowed value is
   * what lets the template read fields that only exist on one arm.
   */
  get severityChange(): SeverityChangeEvent | null {
    return this.event.type === 'severity-change' ? this.event : null;
  }

  get caseCreated(): CaseCreatedEvent | null {
    return this.event.type === 'case-created' ? this.event : null;
  }

  /** Line one. Both kinds get a label; only a severity change gets pills. */
  get headLabel(): string {
    if (this.event.type === 'case-created') {
      return `Manual case created - ${this.event.reason}`;
    }
    return this.event.direction === 'escalation' ? 'Severity escalation' : 'Severity de-escalation';
  }

  /** Line two: the severity reason, or the creation motivation. */
  get lineTwo(): string {
    return this.event.type === 'case-created' ? this.event.description : this.event.reason;
  }
}
