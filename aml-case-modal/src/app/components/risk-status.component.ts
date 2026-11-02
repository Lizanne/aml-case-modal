import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { RISK_STATUS_LABEL, RiskStatus } from '../core/risk-assessment';

const ICON: Record<RiskStatus, string | null> = {
  informational: null,
  risk: 'flag',
  'no-risk': 'check_circle',
  'action-required': 'help_outline',
};

/**
 * A risk status: Risk flagged, No risk or Action required.
 *
 * Three signals, never colour alone: a tinted fill, an icon and the word.
 * The PDF's colours are kept - red for a flagged risk, green for none, amber
 * for a field waiting on the agent.
 *
 * Two forms. Static is a label. Interactive is a real button, because the
 * status is how an agent assesses or overrides a field: it opens the Assess
 * risk form. The button carries an edit glyph so it does not read as a
 * passive badge, and its accessible name says what pressing it does.
 */
@Component({
  selector: 'risk-status',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (interactive) {
      <button
        type="button"
        class="status status--button"
        [attr.data-risk]="status"
        [attr.aria-label]="(fieldLabel ? fieldLabel + ': ' : '') + text + '. Assess risk'"
        (click)="activate.emit()"
      >
        @if (icon) {
          <mat-icon class="status__icon" aria-hidden="true">{{ icon }}</mat-icon>
        }
        <span class="status__text">{{ text }}</span>
        <mat-icon class="status__edit" aria-hidden="true">edit</mat-icon>
      </button>
    } @else {
      <span class="status" [attr.data-risk]="status" [attr.aria-label]="name" [attr.title]="name ? statusWord : null">
        @if (icon) {
          <mat-icon class="status__icon" aria-hidden="true">{{ icon }}</mat-icon>
        }
        <span class="status__text">{{ text }}</span>
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        box-sizing: border-box;
        padding: 0 8px;
        border: 1px solid transparent;
        border-radius: 999px;
        font: inherit;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        white-space: nowrap;
      }
      .status[data-risk='risk'] {
        background: var(--danger-bg);
        border-color: var(--border-negative-subdued);
        color: var(--danger);
      }
      /* No risk is the background state, so it is the one without a fill:
         an outline, green ink and the tick. Red and amber stay filled, which
         leaves danger and work as the only solid things on the panel. */
      .status[data-risk='no-risk'] {
        background: transparent;
        border-color: color-mix(in srgb, var(--success) 32%, transparent);
        color: var(--success);
      }
      .status[data-risk='action-required'] {
        background: var(--warn-bg);
        border-color: var(--border-warning-subdued);
        color: var(--warn);
      }
      mat-icon.status__icon,
      mat-icon.status__edit {
        font-size: 14px;
        width: 14px;
        height: 14px;
        line-height: 14px;
        flex: none;
      }
      /* The edit glyph says "this changes"; it is quieter than the status. */
      mat-icon.status__edit {
        opacity: 0.7;
        margin-left: 2px;
      }
      .status--button {
        position: relative;
        cursor: pointer;
        transition:
          background-color 120ms ease-out,
          border-color 120ms ease-out;
      }
      /* Hover deepens the field's own tint rather than swapping to grey, so
         the colour still says which status this is under the cursor. */
      .status--button[data-risk='risk']:hover {
        background: var(--danger-bg-strong);
      }
      .status--button[data-risk='no-risk']:hover {
        background: var(--success-bg-subtle);
      }
      .status--button[data-risk='action-required']:hover {
        background: color-mix(in oklch, var(--warn-bg) 88%, var(--warn));
      }
      /* 24px tall to look at, 40px to hit. */
      .status--button::before {
        content: '';
        position: absolute;
        inset: -8px -4px;
      }
      .status--button:hover mat-icon.status__edit {
        opacity: 1;
      }
      .status--button:active {
        transform: scale(0.97);
      }
      .status--button:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        .status--button {
          transition: none;
        }
        .status--button:active {
          transform: none;
        }
      }
    `,
  ],
})
export class RiskStatusComponent {
  @Input({ required: true }) status!: RiskStatus;
  @Input() interactive = false;
  /** The field it belongs to, for the button's accessible name. */
  @Input() fieldLabel = '';
  /** Overrides the word, e.g. "Risk" for a whole section, or a field name on a chip. */
  @Input() label: string | null = null;
  /**
   * Accessible name for the label form, when the visible word is not the
   * status - a chip that shows the field name. The status word then goes on
   * the title, so a hover still gets it.
   */
  @Input() name: string | null = null;
  @Output() activate = new EventEmitter<void>();

  get icon(): string | null {
    return ICON[this.status];
  }

  get text(): string {
    return this.label ?? RISK_STATUS_LABEL[this.status];
  }

  get statusWord(): string {
    return RISK_STATUS_LABEL[this.status];
  }
}
