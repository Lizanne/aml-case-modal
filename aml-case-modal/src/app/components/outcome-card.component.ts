import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { OutcomeItem } from '../core/models';
import { AttachmentListComponent } from './attachment-list.component';

/**
 * Rule 6. A saved outcome. Immutable - no edit affordance anywhere on this card,
 * attachments are frozen, and the snapshot reference it captured is offered as
 * a read-only view.
 *
 * The card header already carries the moment (actor + timestamp), so the button
 * is just "View snapshot"; it does not restate when the snapshot was taken.
 */
@Component({
  selector: 'outcome-card',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, AttachmentListComponent, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="card"
      [class.card--decision]="outcome.actionType === 'decision'"
      [class.card--narrow]="store.layoutNarrow()"
      [class.card--viewing]="isViewing()"
    >
      <div class="card__head">
        <h3 class="card__title">{{ outcome.title }}</h3>
        <p class="card__meta">{{ outcome.actor }} · {{ outcome.at | stamp }}</p>
      </div>

      <p class="card__note">{{ outcome.note }}</p>

      <!-- Narrow: attachments and View snapshot share one row instead of a
           separate divided footer, which costs two lines per card. -->
      <footer class="card__foot">
        @if (outcome.attachments.length) {
          <attachment-list class="card__files" [attachments]="outcome.attachments" [removable]="false" />
        }
        <div class="card__actions">
          <!--
            One control both ways: pressed and reading "Viewing" while this
            card's snapshot is up, and clicking it again returns to current.
            aria-pressed carries the state, because a label that changes is
            not by itself a state a screen reader can report.
          -->
          <button
            mat-stroked-button
            type="button"
            class="card__snap"
            [class.card__snap--on]="isViewing()"
            [attr.aria-pressed]="isViewing()"
            (click)="viewSnapshot.emit(outcome)"
          >
            <mat-icon>history</mat-icon>
            {{ isViewing() ? 'Viewing' : 'View snapshot' }}
          </button>
        </div>
      </footer>
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
      /**
       * The card whose snapshot the left panel is showing. Persistent, not a
       * hover: it is the answer to "which of these am I looking at", and it has
       * to hold while the agent reads the other panel.
       *
       * The tint carries it alone - no border, and no left accent either. The
       * selected card is the only tinted thing in the stream, so an outline
       * around it is a second marker for a state that is already unambiguous,
       * and it fought the tint at the corners.
       *
       * border-color: transparent, not border: 0. The card is border-box with
       * 16px of padding, so dropping the border outright would hand its
       * content 2px more width than every unselected card beside it and shift
       * the text as selection moved down the stream.
       */
      .card--viewing {
        border-color: transparent;
        background: var(--primary-bg);
      }
      /* Pressed, not merely hovered - it stays down while the snapshot is up. */
      .card__snap--on {
        --mdc-outlined-button-outline-color: var(--primary);
        --mdc-outlined-button-label-text-color: var(--primary-ink);
        background: rgba(26, 115, 201, 0.12);
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
        border-color: var(--success);
        border-width: 2px;
      }
      /**
       * On the tinted card a transparent button melts into the background, so
       * the one action here gets its own white surface to sit on.
       *
       * The outline stays Material's default. That composites to roughly
       * 1.26:1 against the tint, so the outline is not what identifies this
       * control - its label does, at 21:1. WCAG 1.4.11 asks 3:1 only of visual
       * information REQUIRED to identify a component, so the faint edge is not
       * a failure here; it just means the label is carrying it.
       */
      .card--decision .card__actions button {
        background-color: var(--panel);
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
        color: var(--ink);
      }
      .card__meta {
        margin: 0;
        font-size: 12px;
        color: var(--ink-3);
      }
      .card__note {
        /* Long unbroken tokens (a URL, a reference) must not set the floor. */
        overflow-wrap: anywhere;
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.55;
        color: var(--ink-2);
        white-space: pre-wrap;
      }
      .card__foot {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        min-width: 0;
        gap: 12px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
      }
      .card__actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        min-width: 0;
        gap: 12px;
      }

      /* Narrow: tighter card, and the footer loses its rule - the attachment
         chips and View snapshot sit on one line with the note. */
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
        padding-top: 0;
        border-top: 0;
        gap: 8px;
      }
    `,
  ],
})
export class OutcomeCardComponent {
  readonly store = inject(CaseStore);

  @Input({ required: true }) outcome!: OutcomeItem;
  @Output() viewSnapshot = new EventEmitter<OutcomeItem>();

  /**
   * Whether THIS card is the one the left panel is showing.
   *
   * Derived from the single viewedSnapshot signal rather than held per card,
   * which is what makes "only one selected at a time" structural: there is one
   * value, so there is nothing to keep in step. Clearing it - by Back, or by
   * pressing this button again - deselects everything at once.
   */
  isViewing(): boolean {
    return this.store.viewedSnapshot()?.outcomeId === this.outcome.id;
  }
}
