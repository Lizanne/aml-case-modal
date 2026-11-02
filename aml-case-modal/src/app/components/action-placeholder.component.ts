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
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore, RecordBlock } from '../core/case-store';
import { ActionTypeId } from '../core/models';
import { RiskStatus } from '../core/risk-assessment';
import { RiskStatusComponent } from './risk-status.component';

/**
 * Rule 4. A dashed slot for a mandatory action that has not been recorded yet.
 * The button is disabled unless the agent holds the lock (rule 3), and
 * Finalize risk assessment is also disabled - but still shown - until every
 * field is assessed. The reason is always stated, never mimed.
 */
@Component({
  selector: 'action-placeholder',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, RiskStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot" [class.slot--narrow]="store.layoutNarrow()">
      <div class="slot__text">
        <p class="slot__title">
          <span>{{ label }}{{ pendingSuffix }}</span>
          <!-- The field's status, the same pill its row shows: an assessment
               slot says Action required in the panel's own words. -->
          @if (status) {
            <risk-status [status]="status" />
          }
        </p>
        @if (blockReason(); as reason) {
          <p class="slot__reason">{{ reason }}</p>
        }
      </div>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!!block || !available"
        [attr.aria-label]="buttonName"
        (click)="record.emit(actionType)"
      >
        <mat-icon>{{ actionType === 'finalize-risk-assessment' ? 'task_alt' : 'edit_note' }}</mat-icon>
        {{ buttonLabel }}
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .slot {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        border: 1px dashed var(--line-strong);
        border-radius: 12px;
        background: transparent;
      }
      .slot__text {
        flex: 1;
      }
      .slot__title {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--foreground-secondary);
      }
      .slot__reason {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--foreground-secondary);
      }
      /* Narrow: a single row - label left, Record right. The box is now
         identical to the wide slot, so the padding is inherited rather than
         restated - a second copy of the value here is what drifts later. Only the
         type inside the box changes. */
      .slot--narrow {
        gap: 12px;
      }
      .slot--narrow .slot__title {
        font-size: 14px;
        line-height: 20px;
        font-weight: 400;
        color: var(--foreground-secondary);
      }
    `,
  ],
})
export class ActionPlaceholderComponent {
  readonly store = inject(CaseStore);

  @Input({ required: true }) actionType!: ActionTypeId;
  @Input({ required: true }) label = '';
  @Input() block: RecordBlock = null;
  /** False keeps the slot in view with its button disabled - Finalize, before every field is assessed. */
  @Input() available = true;
  /** Why it is not available yet. Shown under the title when the lock is not the reason. */
  @Input() unavailableReason: string | null = null;
  /** An assessment's current status, shown as the pill beside the title. */
  @Input() status: RiskStatus | null = null;

  @Output() record = new EventEmitter<ActionTypeId>();

  blockReason(): string | null {
    switch (this.block) {
      case 'unlocked':
        return 'Lock the case to record an outcome.';
      case 'locked-to-other':
        return 'Another agent holds the lock.';
      case 'resolved':
        return 'This case is resolved.';
      default:
        return this.available ? null : this.unavailableReason;
    }
  }

  get buttonLabel(): string {
    if (this.actionType === 'assess-risk') return 'Assess';
    if (this.actionType === 'finalize-risk-assessment') return 'Finalize';
    return 'Record';
  }

  /**
   * Several placeholders can say "Assess", so each button's accessible name
   * carries what it assesses. Finalize's label already says it in full.
   */
  get buttonName(): string | null {
    return this.actionType === 'finalize-risk-assessment' ? null : `${this.buttonLabel} ${this.label}`;
  }

  /** "Contact player - not recorded". An assessment's pill says its state; Finalize needs none. */
  get pendingSuffix(): string {
    return this.actionType === 'player-contact' || this.actionType === 'note' ? ' - not recorded' : '';
  }
}
