import { ChangeDetectionStrategy, Component, ElementRef, Injector, Input, afterNextRender, effect, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { StampPipe } from '../core/format';
import { CaseStore, resyncSummary } from '../core/case-store';
import { scrollWithin } from '../core/scroll';
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
 * them.
 *
 * Four kinds now: a severity change, the case's own creation, a trigger that
 * arrived while the case was open (with a warning icon, and nothing else -
 * no amber, no banner), and the result of a Risk assessment resync.
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
    <!--
      The gutter: every event kind has a glyph, in one 16px column, so every
      event title starts on the same edge and the detail sits under its
      title. Cards are the agent's work; iconed lines are what happened to
      the case. The words carry the meaning; the glyphs are hidden from
      assistive tech.
    -->
    <div class="row">
      <mat-icon
        class="row__icon"
        [class.row__icon--warn]="glyphWarn"
        fontSet="material-icons-outlined"
        aria-hidden="true"
      >{{ glyph }}</mat-icon>
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

        <span class="row__meta">{{ actorLabel }} · {{ event.at | stamp }}</span>
      </div>

      <!-- Line two either way: the severity reason, or the creation
           motivation. Same clamp, same hover title. -->
      <p class="row__reason" [title]="lineTwo">
        {{ lineTwo }}
        <!-- The arrival's next step, in the Assess / Change vocabulary. Only
             on the newest trigger, only while its values are still pending
             and a resync can run - a link on every old trigger would offer an
             action already done. -->
        @if (showResync()) {
          <span class="row__sep" aria-hidden="true">·</span>
          <button type="button" class="row__link" (click)="store.requestResync()">Resync</button>
          to update the risk assessment
        }
      </p>
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
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        column-gap: 8px;
        row-gap: 4px;
        min-width: 0;
        /* 4px above and below: events are separate moments, and flush they
           ran together into one paragraph. The stream's 12px gap still does
           most of the separating. Chosen over a tinted-disc marker (too heavy;
           brought back the amber) and an inline compact row (titles stopped
           being scannable), 11 Nov 2026. */
        padding: 4px 16px;
        border-radius: 12px;
        background: none;
        border: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
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
      .row__icon {
        grid-row: 1;
        align-self: center;
      }
      .row__head,
      .row__reason {
        grid-column: 2;
      }
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
        color: var(--foreground-secondary);
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      /* Warn ink on the warnings only - a new trigger, and an escalation
         (PROTOTYPE.md: "Severity escalation shows an up arrow in the warn
         colour"). A de-escalation's down arrow stays secondary: warn there
         would say the wrong thing. 3.92:1 on the stream, past the 3:1 bar. */
      .row__icon--warn {
        color: var(--warn);
      }
      .row__sep {
        margin: 0 4px;
      }
      .row__link {
        position: relative;
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        font-weight: 600;
        color: var(--link);
        cursor: pointer;
        border-radius: 2px;
      }
      /* 20px to look at, 40px to hit. */
      .row__link::before {
        content: '';
        position: absolute;
        inset: -10px -4px;
      }
      .row__link:hover {
        color: var(--link-hover);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .row__link:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      /* 16px, matching the direction arrow. They are a pair on the same line
         and were a step apart at 14 and 16. */
      .row__arrow {
        color: var(--foreground-secondary);
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .row__label {
        flex: none;
        font-weight: 600;
        color: var(--foreground-primary);
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
        color: var(--foreground-secondary);
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
        color: var(--foreground-secondary);
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

  readonly store = inject(CaseStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /**
   * A system arrival - a new trigger - lands at its place in time, which in
   * any case with recorded work is below the fold. Nothing the agent did put
   * it there, so nothing would bring it into view: the stream scrolls to it,
   * within the workflow panel only. Not while a form is open - the agent's
   * draft does not move under them; the live region still says it arrived.
   */
  constructor() {
    effect(
      () => {
        if (!this.event || this.store.revealEventId() !== this.event.id) return;
        this.store.revealEventId.set(null);
        if (this.store.draft()) return;
        afterNextRender(() => void scrollWithin(this.host.nativeElement, { block: 'nearest' }), { injector: this.injector });
      },
      { allowSignalWrites: true },
    );
  }

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

  /** The gutter glyph: one per event kind. */
  get glyph(): string {
    switch (this.event.type) {
      case 'case-created':
        return 'description';
      case 'trigger-added':
        return 'warning_amber';
      case 'resync-completed':
        return 'sync';
      default:
        return this.event.direction === 'escalation' ? 'arrow_upward' : 'arrow_downward';
    }
  }

  /** Warn ink for the warnings only: a new trigger, an escalation. */
  get glyphWarn(): boolean {
    return this.event.type === 'trigger-added' || (this.event.type === 'severity-change' && this.event.direction === 'escalation');
  }

  /** The Resync link: the newest trigger, values pending, a resync possible. */
  showResync(): boolean {
    if (this.event.type !== 'trigger-added' || !this.store.pendingRegeneration() || !this.store.canResync()) return false;
    const triggers = this.store.stream().filter((i) => i.kind === 'event' && i.type === 'trigger-added');
    return triggers.length > 0 && triggers[triggers.length - 1].id === this.event.id;
  }

  /** Line one. Every kind gets a label; only a severity change gets pills. */
  get headLabel(): string {
    switch (this.event.type) {
      case 'case-created':
        return `Manual case created - ${this.event.reason}`;
      case 'trigger-added':
        // The brief's wording: "New trigger added - <type>". A trigger's
        // name is "<source> - <type>", and the source is already the actor
        // on the right ("System · <stamp>"); saying it twice made a chain
        // of dashes that read as one long name.
        return `New trigger added - ${this.event.name.split(' - ').pop()}`;
      case 'resync-completed':
        return 'Resync completed';
      default:
        return this.event.direction === 'escalation'
          ? 'Severity escalation'
          : 'Severity de-escalation';
    }
  }

  /** Line two: the reason, the motivation, the trigger's detail or what the resync changed. */
  get lineTwo(): string {
    switch (this.event.type) {
      case 'case-created':
        return this.event.description;
      case 'trigger-added':
        return this.event.detail;
      case 'resync-completed':
        return resyncSummary(this.event);
      default:
        return this.event.reason;
    }
  }

  /** 'system' is stored lower case; it is shown as a name. */
  get actorLabel(): string {
    return this.event.actor === 'system' ? 'System' : this.event.actor;
  }
}
