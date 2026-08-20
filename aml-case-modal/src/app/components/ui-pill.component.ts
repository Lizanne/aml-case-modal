import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * The one pill. Severity pills, status pills, count chips, required-action
 * chips, widget tags, the NEW badge and the escalation badge were eight
 * near-identical blocks of CSS across nine components, free to drift on size,
 * padding and type. They are all this component now; only tone, shape and
 * severity vary.
 *
 * Semantics: a pill is not a control and never has been. It renders as a plain
 * inline element with no role, no tabindex and no interaction, so it reads as
 * the text it contains. Where the text alone is ambiguous out of context - the
 * required-action chips, for instance - the CALLER supplies aria-label, because
 * only the caller knows what the pill is describing.
 *
 * Sizing and shape are uniform: 24px tall, 8px of horizontal padding,
 * 14px/20px type, fully rounded. Only the colours vary - there is no size or
 * shape variant, because every exception to that was a copy waiting to drift.
 *
 * Sizing detail: 24px tall, 8px of horizontal padding, 14px/20px type.
 * Vertical padding would fight the fixed height, so the height and
 * align-items do the centring instead.
 */
export type PillTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warn'
  | 'warn-solid'
  | 'outline'
  | 'dashed';

@Component({
  selector: 'ui-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    '[attr.data-tone]': 'severity ? null : tone',
    '[attr.data-sev]': 'severity',
  },
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        /* Icon to text. One value for every pill: a per-instance override here
           is how eight near-copies started last time. */
        gap: 4px;
        flex: none;
        height: 24px;
        padding: 0 8px;
        box-sizing: border-box;
        border: 1px solid transparent;
        border-radius: 999px;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        letter-spacing: 0.01em;
        white-space: nowrap;
        background: var(--page);
        color: var(--ink);
      }

      /* ---- tones. Colours are unchanged from the blocks these replaced. ---- */
      :host([data-tone='info']) {
        background: var(--color-background-info-subdued);
        color: var(--color-foreground-on-info);
      }
      :host([data-tone='success']) {
        background: var(--success-bg);
        color: var(--success);
      }
      :host([data-tone='warn']) {
        background: var(--warn-bg);
        color: var(--warn);
      }
      /* Solid amber, white text - the NEW marker. 6.32:1. */
      :host([data-tone='warn-solid']) {
        background: var(--warn);
        color: #fff;
      }
      :host([data-tone='outline']) {
        background: var(--panel);
        color: var(--ink-2);
        border-color: var(--line);
      }
      :host([data-tone='dashed']) {
        background: transparent;
        color: var(--ink-3);
        border-style: dashed;
        border-color: var(--line-strong);
      }

      /* ---- severity is its own language and always wins over tone ---- */
      :host([data-sev='AML']) {
        background: var(--sev-aml-bg);
        color: var(--sev-aml);
      }
      :host([data-sev='EDD']) {
        background: var(--sev-edd-bg);
        color: var(--sev-edd);
      }
      :host([data-sev='COMPLIANCE']) {
        background: var(--sev-compliance-bg);
        color: var(--sev-compliance);
      }


      /**
       * Projected icons are sized by the CALLER, not here.
       *
       * ::ng-deep would be the obvious tool and it is a trap: it de-scopes the
       * rule to a bare global "mat-icon" element selector, so it leaks to every
       * icon in the app AND still loses to Material's own ".mat-icon" class
       * rule. Sizing at the call site is scoped, wins on specificity, and lets
       * different pills carry different icon sizes if they ever need to.
       */
    `,
  ],
})
export class PillComponent {
  @Input() tone: PillTone = 'neutral';
  /** When set, the severity language applies and `tone` is ignored. */
  @Input() severity: string | null = null;
}
