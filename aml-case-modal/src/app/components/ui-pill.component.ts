import { ChangeDetectionStrategy, Component, Input, booleanAttribute } from '@angular/core';

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
 * Shape is uniform and size is a CLOSED set of two:
 *   md  24px tall, 8px of horizontal padding, 14px/20px type - the default
 *   sm  20px tall, 6px of horizontal padding, 12px/16px type
 *
 * Two named sizes is the opposite of the free-for-all this component replaced.
 * The widget severity badge was a ninth local copy, kept out because it was
 * smaller than the pill; as a size it is the same component, and a change to
 * pill colour or radius now reaches it like everything else. Anything that
 * wants a THIRD size wants a design decision, not another value here.
 *
 * An lg step existed briefly for the cases table. The table is on md now, so
 * it is gone rather than left behind unused - an unused size is the first of
 * the copies this component was made to end.
 *
 * Usage: sm in the widget title rows, md in the case panel header and in every
 * pill in the cases table.
 *
 * Vertical padding would fight the fixed height, so the height and
 * align-items do the centring instead.
 */
export type PillSize = 'sm' | 'md';

export type PillTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warn'
  | 'warn-solid'
  | 'danger'
  | 'danger-solid'
  | 'outline'
  | 'dashed';

@Component({
  selector: 'ui-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (dot) {
      <span class="pill__dot" aria-hidden="true"></span>
    }
    <ng-content />`,
  host: {
    '[attr.data-tone]': 'severity ? null : tone',
    '[attr.data-sev]': 'severity',
    '[attr.data-size]': 'size',
    '[attr.data-dot]': 'dot ? "" : null',
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
        color: var(--foreground-primary);
      }

      /**
       * The leading dot, per Figma 24029:714.
       *
       * A 12px halo at 6% and a 6px core, which is the design's own
       * construction: its SVG draws r=6 white at fill-opacity .6 inside a
       * group at opacity .1 - 0.6 x 0.1 = 0.06 - and r=3 solid on top. Built
       * from currentColor rather than a per-tone colour, so one rule serves
       * every tone: white on the solid red, the tone's own ink on the tints.
       *
       * Opt-in. Off everywhere it is not asked for, because a dot on a pill
       * that is not reporting a status is decoration.
       */
      .pill__dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: color-mix(in srgb, currentColor 6%, transparent);
      }
      .pill__dot::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      /* The halo scales with the pill; the core does not - at sm it would be
         two pixels and read as grit rather than a dot. */
      :host([data-size='sm']) .pill__dot {
        width: 10px;
        height: 10px;
      }

      /**
       * Rims, on a dotted pill only - which is to say the SLA column.
       *
       * Scoped to [data-dot] rather than set on the tones, and that is not
       * fussiness: warn and success are worn by the work chips, the severity
       * dialog and the case header, none of which should grow an edge because
       * the SLA column wanted one.
       *
       * The solid pill has none. Its Figma node is a flat fill with no stroke,
       * and a rim on a saturated red would be a second edge fighting the first.
       */
      :host([data-dot][data-tone='warn']) {
        border-color: var(--border-warning-subdued);
      }
      :host([data-dot][data-tone='success']) {
        border-color: var(--border-success-subdued);
      }
      /**
       * Breached-but-not-yet-solid takes the deepest red in the family for its
       * label AND its dot - the dot is currentColor, so one declaration moves
       * both. It reads 9.16:1 on the tint, against 5.91 for the --danger it
       * replaces.
       */
      :host([data-dot][data-tone='danger']) {
        border-color: var(--border-negative-subdued);
        color: var(--danger-deep);
      }
      :host([data-dot][data-tone='danger-solid']) {
        border-color: transparent;
      }

      /* The small step. Size carries no colour and colour carries no size, so
         sm composes with every tone and every severity without a matrix. */
      :host([data-size='sm']) {
        height: 20px;
        padding: 0 6px;
        font-size: 12px;
        line-height: 16px;
      }

      /* ---- tones. Colours are unchanged from the blocks these replaced. ---- */
      /**
       * Neutral is the default tone, so before this it fell through to the
       * base and took --page. On a white panel #FAFAFA is 2% off its ground,
       * which reads as a rendering artefact rather than a filled chip.
       * --background-tertiary is the surface that step is actually for.
       *
       * Severity pills are unaffected: the host binding sets data-tone OR
       * data-sev, never both, so a severity pill never matches this.
       */
      :host([data-tone='neutral']) {
        background: var(--background-tertiary);
      }
      :host([data-tone='info']) {
        background: var(--color-background-info-subdued);
        color: var(--color-foreground-on-info);
      }
      :host([data-tone='success']) {
        background: var(--success-bg-subtle);
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
      /**
       * The danger pair, added for the cases table's SLA column: there was no
       * red tone, and the SLA band is the one traffic light in that row. Added
       * HERE rather than restyled locally, so a red pill is the same red pill
       * wherever one appears next.
       *
       * danger-solid is not a fifth colour - it is the same red, filled, for a
       * breached SLA.
       */
      :host([data-tone='danger']) {
        background: var(--danger-bg);
        color: var(--danger);
      }
      :host([data-tone='danger-solid']) {
        background: var(--danger);
        color: #fff;
      }
      :host([data-tone='outline']) {
        background: var(--panel);
        color: var(--foreground-secondary);
        border-color: var(--line);
      }
      :host([data-tone='dashed']) {
        background: transparent;
        color: var(--foreground-secondary);
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

  /**
   * A leading status dot and a matching rim - Figma 24029:714.
   *
   * Opt-in, and the SLA column is the only caller. Every other pill in the
   * table states a fact about the case; the SLA pill reports a condition that
   * is changing while you look at it, and the dot is what says so.
   */
  @Input({ transform: booleanAttribute }) dot = false;
  /** When set, the severity language applies and `tone` is ignored. */
  @Input() severity: string | null = null;
  /** md unless asked otherwise, so every existing call site is unchanged. */
  @Input() size: PillSize = 'md';
}
