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

/**
 * Rule 4. A dashed slot for a mandatory action that has not been recorded yet.
 * The Record button is disabled unless the agent holds the lock and the
 * snapshot is in sync (rules 3 and 11); the reason is always stated, never mimed.
 */
@Component({
  selector: 'action-placeholder',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot" [class.slot--narrow]="store.layoutNarrow()">
      <div class="slot__text">
        <p class="slot__title">{{ label }} - not recorded</p>
        @if (blockReason(); as reason) {
          <p class="slot__reason">{{ reason }}</p>
        }
      </div>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!!block"
        (click)="record.emit(actionType)"
      >
        <mat-icon>edit_note</mat-icon>
        Record
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
        padding: 16px 18px;
        border: 1px dashed var(--line-strong);
        border-radius: 12px;
        background: transparent;
      }
      .slot__text {
        flex: 1;
      }
      .slot__title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--ink-2);
      }
      .slot__reason {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--ink-3);
      }
      /* Narrow: a single row - label left, Record right. */
      .slot--narrow {
        padding: 8px 10px 8px 14px;
        gap: 10px;
      }
      .slot--narrow .slot__title {
        font-size: 14px;
        line-height: 20px;
        font-weight: 400;
        color: var(--ink-3);
      }
    `,
  ],
})
export class ActionPlaceholderComponent {
  readonly store = inject(CaseStore);

  @Input({ required: true }) actionType!: ActionTypeId;
  @Input({ required: true }) label = '';
  @Input() block: RecordBlock = null;

  @Output() record = new EventEmitter<ActionTypeId>();

  blockReason(): string | null {
    switch (this.block) {
      case 'unlocked':
        return 'Lock the case to record an outcome.';
      case 'locked-to-other':
        return 'Another agent holds the lock.';
      case 'out-of-sync':
        return 'Resync the snapshot before recording outcomes.';
      case 'resolved':
        return 'This case is resolved.';
      default:
        return null;
    }
  }
}
