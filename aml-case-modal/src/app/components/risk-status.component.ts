import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { RISK_STATUS_LABEL, RiskStatus } from '../core/risk-assessment';
import { PillComponent, PillSize, PillTone } from './ui-pill.component';

/* The pill tone each status wears. Informational never renders. */
const TONE: Record<RiskStatus, PillTone> = {
  informational: 'neutral',
  risk: 'danger',
  'no-risk': 'success',
  'action-required': 'warn',
};

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
 * It IS the pill - a ui-pill in the danger, success or warn tone with the
 * rim its dotted form wears, so a status is the same red, green or amber it
 * is in the case header and the table, at the pill's own two sizes. Nothing
 * here is drawn twice.
 *
 * Always a label, never a control. A pill is how this product states a fact
 * (severity, SLA, the chip bar); a pill that is also a button is one shape
 * with two meanings. The action lives beside it on the row, in the product's
 * button vocabulary.
 *
 * Sizes are the pill's: sm (20 tall, 12px word, 12px icon) in the Risk
 * assessment rows, the outcome card, the placeholder and the finalise table,
 * where the status sits among 12px meta text; md (24 tall, 14px word, 16px
 * icon) in the required-actions chip bar, where it stands next to the other
 * chips and must be the same size as them.
 */
@Component({
  selector: 'risk-status',
  standalone: true,
  imports: [MatIconModule, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-size]': 'size' },
  template: `
    <ui-pill
      class="status"
      rim
      [tone]="tone"
      [size]="size"
      [attr.data-risk]="status"
      [attr.aria-label]="name"
      [attr.title]="name ? statusWord : null"
    >
      @if (icon) {
        <mat-icon class="status__icon" aria-hidden="true">{{ icon }}</mat-icon>
      }
      <span class="status__text">{{ text }}</span>
    </ui-pill>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
      }
      /* Icons are sized by the caller, per ui-pill: 16 beside a 14px word,
         12 beside a 12px one. */
      mat-icon.status__icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        flex: none;
      }
      :host([data-size='sm']) mat-icon.status__icon {
        font-size: 12px;
        width: 12px;
        height: 12px;
        line-height: 12px;
      }
    `,
  ],
})
export class RiskStatusComponent {
  @Input({ required: true }) status!: RiskStatus;
  /** The pill's size. sm unless the status stands among md pills, as in the chip bar. */
  @Input() size: PillSize = 'sm';
  /**
   * Overrides the word - a field name on a required-actions chip. Never a
   * synonym for the status: the finalise table once said "Risk" where the
   * rows said "Risk flagged", and one status with two words is two statuses.
   */
  @Input() label: string | null = null;
  /**
   * Accessible name, when the visible word is not the status - a chip that
   * shows the field name. The status word then goes on the title, so a hover
   * still gets it.
   */
  @Input() name: string | null = null;

  get tone(): PillTone {
    return TONE[this.status];
  }

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
