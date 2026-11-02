import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { OutcomeItem } from '../core/models';
import { RISK_STATUS_LABEL } from '../core/risk-assessment';
import { AttachmentListComponent } from './attachment-list.component';
import { RiskStatusComponent } from './risk-status.component';
import { SectionRiskTableComponent } from './section-risk-table.component';

/**
 * Rule 6. A saved outcome. Immutable - no edit affordance anywhere on this card,
 * and attachments are frozen.
 *
 * View snapshot is gone. The snapshot became the Risk assessment, which shows
 * current values only: what an assessment decided is on its own card, and
 * what a resync changed is on the Resync completed entry.
 *
 * An assessment card says the field's new status, and what it was before
 * when the agent changed it. A finalize card carries the section table.
 */
@Component({
  selector: 'outcome-card',
  standalone: true,
  imports: [AttachmentListComponent, StampPipe, RiskStatusComponent, SectionRiskTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- tabindex -1: focus lands here after a save, so a keyboard user is
         put on what they just recorded. Not a tab stop. -->
    <article
      class="card"
      tabindex="-1"
      [attr.aria-label]="outcome.title"
      [class.card--decision]="outcome.actionType === 'decision'"
      [class.card--narrow]="store.layoutNarrow()"
    >
      <div class="card__head">
        <h3 class="card__title">{{ outcome.title }}</h3>
        <p class="card__meta">{{ outcome.actor }} · {{ outcome.at | stamp }}</p>
      </div>

      @if (outcome.assessment; as a) {
        <p class="card__assessment">
          <risk-status [status]="a.risk" />
          @if (changedFrom(); as was) {
            <span class="card__was">Was {{ was }}</span>
          }
        </p>
      }

      <p class="card__note">{{ outcome.note }}</p>

      @if (outcome.finalized; as rows) {
        <section-risk-table class="card__table" [rows]="rows" caption="Risk by section, as finalized" />
      }

      @if (outcome.attachments.length) {
        <footer class="card__foot">
          <attachment-list class="card__files" [attachments]="outcome.attachments" [removable]="false" />
        </footer>
      }
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .card {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        padding: 16px;
      }
      /* An assessment's result, under its title: the status, then what it
         replaced when the agent changed it. */
      .card:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .card:focus:not(:focus-visible) {
        outline: none;
      }
      .card__assessment {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 8px 0 0;
      }
      .card__was {
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      .card__table {
        margin-top: 12px;
      }
      /**
       * The decision card (state 07). Background, border colour and border
       * width only - every text colour inside is inherited unchanged, which is
       * exactly what the paler tint is chosen to allow. On the flat tint the
       * meta line and the button label would both sit at 4.25:1, under AA.
       *
       * The previous inset left-edge accent is dropped: the target is one
       * uniform border, and the two together read as two competing rules.
       */
      .card--decision {
        background: var(--success-bg-subtle);
        /* --foreground-success (#15803D), not --success (#14532D). The lighter
           of the two greens: it is the border, not text, so it is held to the
           3:1 non-text bar rather than 4.5, and the paler tone reads as a
           frame around the tint instead of a second dark rule. Reuses the
           existing token rather than adding a border-specific one - two names
           for one colour is just somewhere for them to diverge again. */
        border-color: var(--foreground-success);
        border-width: 2px;
      }
      .card__head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 4px 12px;
      }
      .card__title {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .card__meta {
        margin: 0;
        font-size: 12px;
        color: var(--foreground-secondary);
      }
      .card__note {
        /* Long unbroken tokens (a URL, a reference) must not set the floor. */
        overflow-wrap: anywhere;
        margin: 8px 0 0;
        font-size: 14px;
        line-height: 1.55;
        color: var(--foreground-secondary);
        white-space: pre-wrap;
      }
      /**
       * The attachments, when there are any. Rendered only then, so a card
       * without them ends at its note rather than on an empty band.
       *
       * align-items is left at its stretch default deliberately: the list takes
       * the card's width, which is what lets the chips wrap inside it rather
       * than the list shrinking to its content and pushing a long row of them
       * past the card's edge.
       */
      .card__foot {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 12px;
        margin-top: 16px;
      }

      /* Narrow: a tighter card. */
      .card--narrow {
        padding: 16px;
      }
     
      .card--narrow .card__title {
        font-size: 16px;
      }
      .card--narrow .card__meta {
        margin-top: 2px;
      }
      .card--narrow .card__note {
        margin-top: 6px;
        font-size: 14px;
        line-height: 20px;
      }
      .card--narrow .card__foot {
        margin-top: 10px;
        gap: 8px;
      }
    `,
  ],
})
export class OutcomeCardComponent {
  readonly store = inject(CaseStore);

  @Input({ required: true }) outcome!: OutcomeItem;

  /** What the field said before, when the agent's answer changed it. */
  changedFrom(): string | null {
    const a = this.outcome.assessment;
    if (!a || a.previous === a.risk || a.previous === 'informational') return null;
    return RISK_STATUS_LABEL[a.previous];
  }
}
