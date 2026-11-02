import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
 * for a field waiting on the agent - and they are ui-pill's colours, token
 * for token: the danger, success and warn tones with their subdued rims. A
 * status here is the same green or red it is in the case header and the
 * table, so nothing new is introduced for this one surface.
 *
 * Always a label, never a control. A pill is how this product states a fact
 * (severity, SLA, the chip bar); a pill that is also a button is one shape
 * with two meanings, and with the pill's own colours the only thing left to
 * say "press me" was a 14px pencil. The action lives beside it on the row -
 * an Assess button, or a Change assessment icon button - in the product's
 * button vocabulary.
 */
@Component({
  selector: 'risk-status',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status" [attr.data-risk]="status" [attr.aria-label]="name" [attr.title]="name ? statusWord : null">
      @if (icon) {
        <mat-icon class="status__icon" aria-hidden="true">{{ icon }}</mat-icon>
      }
      <span class="status__text">{{ text }}</span>
    </span>
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
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        white-space: nowrap;
      }
      /* Label and icon in the deepest red, as ui-pill's danger tone does on
         its dotted form: 9.16:1 on the tint against 5.91 for --danger. */
      .status[data-risk='risk'] {
        background: var(--danger-bg);
        border-color: var(--border-negative-subdued);
        color: var(--danger-deep);
      }
      .status[data-risk='no-risk'] {
        background: var(--success-bg-subtle);
        border-color: var(--border-success-subdued);
        color: var(--success);
      }
      .status[data-risk='action-required'] {
        background: var(--warn-bg);
        border-color: var(--border-warning-subdued);
        color: var(--warn);
      }
      mat-icon.status__icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        line-height: 14px;
        flex: none;
      }
    `,
  ],
})
export class RiskStatusComponent {
  @Input({ required: true }) status!: RiskStatus;
  /** Overrides the word, e.g. "Risk" for a whole section, or a field name on a chip. */
  @Input() label: string | null = null;
  /**
   * Accessible name, when the visible word is not the status - a chip that
   * shows the field name. The status word then goes on the title, so a hover
   * still gets it.
   */
  @Input() name: string | null = null;

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
