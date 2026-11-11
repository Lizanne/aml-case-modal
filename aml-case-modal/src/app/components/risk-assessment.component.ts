import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { riskTooltip } from '../core/risk-assessment';
import { RiskStatusComponent } from './risk-status.component';

/**
 * The Risk assessment tab. It replaced the snapshot.
 *
 * Grouped player information, section by section, with the risk on every
 * field that can carry one. Account information is informational and shows
 * no status at all - only the fields that can be a risk say whether they are.
 *
 * Each row: the label and an info button on line one, the status on the
 * right of that line; the value below. The info button's tooltip says what
 * the field is and when it counts as a risk - text only, so a hover tooltip
 * is enough, and the button makes it reachable by keyboard.
 *
 * The status is a label; the action sits beside it. While the agent can
 * assess, a field still to assess carries an Assess button and an assessed
 * one a Change assessment icon button - both open the Assess risk form in the
 * workflow. Once the assessment is finalised, the case is resolved or the
 * lock is someone else's, the buttons go and the statuses stay.
 *
 * Resync is always on screen, in the header. It asks first, then covers the
 * section with a Resyncing overlay until the new values are in.
 */
@Component({
  selector: 'risk-assessment',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    StampPipe,
    RiskStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ra-head">
      <div class="ra-head__text">
        <p class="ra-head__label">Generated</p>
        <p class="ra-head__value">{{ store.riskGeneratedAt() | stamp }}</p>
      </div>
      @if (!store.isResolved()) {
        <!--
          Always visible. When it cannot be used it is disabledInteractive -
          Material's disabled look and aria-disabled, but still focusable -
          so focus is not dropped while a resync runs, and a keyboard user can
          reach it and hear why through the described-by line. The tooltip
          says the same on hover.
        -->
        <button
          mat-stroked-button
          type="button"
          class="ra-head__resync"
          [disabled]="!store.canResync()"
          disabledInteractive
          [attr.aria-describedby]="store.resyncBlockReason() ? 'ra-resync-why' : null"
          [matTooltip]="store.resyncBlockReason() ?? ''"
          [matTooltipDisabled]="store.canResync()"
          #resyncTip="matTooltip"
          (click)="onResync()"
        >
          <mat-icon>sync</mat-icon>
          Resync
        </button>
        <span id="ra-resync-why" class="ra-sr">{{ store.resyncBlockReason() }}</span>
      }
    </div>

    <!--
      What needs doing, where the eye lands. The count is a toggle: pressed,
      the panel shows only the fields still to assess - all of them at once,
      under their own section bands, however far apart they sit in the full
      list - and "Show all" brings the rest back. The counts after it mirror
      the chip bar, which is the same list.
    -->
    <p class="ra-sum">
      @if (counts().todo > 0 || filtered()) {
        <button
          type="button"
          class="ra-sum__filter"
          [attr.aria-pressed]="filtered()"
          (click)="toggleToAssess()"
        >
          {{ counts().todo }} to assess
        </button>
      } @else {
        <span class="ra-sum__part">Nothing to assess</span>
      }
      <span class="ra-sum__dot" aria-hidden="true">·</span>
      <span class="ra-sum__part">{{ counts().risk }} flagged</span>
      <span class="ra-sum__dot" aria-hidden="true">·</span>
      <span class="ra-sum__part">{{ counts().noRisk }} no risk</span>
      @if (filtered()) {
        <span class="ra-sum__dot" aria-hidden="true">·</span>
        <button type="button" class="ra-sum__all" (click)="toggleToAssess()">Show all</button>
      }
    </p>

    @if (store.riskFinalization(); as done) {
      <p class="ra-final">
        <mat-icon fontSet="material-icons-outlined" aria-hidden="true">task_alt</mat-icon>
        Finalised by {{ done.actor }} · {{ done.at | stamp }}
      </p>
    }

    <div class="ra-body" [attr.aria-busy]="store.resyncing()">
      @for (group of store.riskSections(); track group.section) {
        @if (shownFields(group).length > 0) {
        <section class="ra-sec" [attr.aria-labelledby]="sectionId(group.section)">
          @if (isInformational(group)) {
            <!--
              Informational only, so it opens closed: six rows of context
              that have no status and nothing to do, which put the first
              field needing the agent a screenful down. Its place at the top
              is kept, so the PDF's order is still recognisable.
            -->
            <h3 class="ra-sec__title ra-sec__title--toggle" [id]="sectionId(group.section)">
              <button
                type="button"
                class="ra-toggle"
                [attr.aria-expanded]="store.accountInfoExpanded()"
                [attr.aria-controls]="sectionId(group.section) + '-list'"
                (click)="store.accountInfoExpanded.set(!store.accountInfoExpanded())"
              >
                <!-- Label first, chevron last: every band's title starts on the
                     same gutter whether or not it is a disclosure. -->
                <span class="ra-sec__label">{{ group.section }}</span>
                <span class="ra-toggle__count">· {{ group.fields.length }} fields</span>
                <mat-icon class="ra-toggle__icon" aria-hidden="true">{{
                  store.accountInfoExpanded() ? 'expand_less' : 'expand_more'
                }}</mat-icon>
              </button>
            </h3>
          } @else {
            <h3 class="ra-sec__title" [id]="sectionId(group.section)">
              <span class="ra-sec__label">{{ group.section }}</span>
            </h3>
          }
          @if (!isInformational(group) || store.accountInfoExpanded()) {
          <ul class="ra-list" [id]="sectionId(group.section) + '-list'">
            @for (field of shownFields(group); track field.def.id) {
              <!--
                The row whose assessment is open in the workflow is tinted,
                and stays tinted while the form is up. It answers the PRD's
                question - which workflow action did this row open - the same
                way the old viewed-snapshot card did: one tinted thing, held
                until the form is saved or cancelled. aria-current carries it
                for a screen reader.
              -->
              <li
                class="ra-row"
                [class.ra-row--open]="isOpen(field.def.id)"
                [attr.aria-current]="isOpen(field.def.id) ? 'true' : null"
                [attr.data-field]="field.def.id"
              >
                <div class="ra-row__head">
                  <span class="ra-row__label">{{ field.def.label }}</span>
                  <button
                    type="button"
                    class="ra-info"
                    [attr.aria-label]="'About ' + field.def.label"
                    [matTooltip]="tooltip(field.def)"
                    matTooltipClass="ra-tooltip"
                    matTooltipPosition="above"
                  >
                    <mat-icon fontSet="material-icons-outlined" aria-hidden="true">info</mat-icon>
                  </button>
                  @if (field.status !== 'informational') {
                    <risk-status class="ra-row__status" size="sm" [status]="field.status" />
                  }
                </div>
                <div class="ra-row__value">
                  @for (line of field.value; track $index) {
                    <span class="ra-row__line">{{ line }}</span>
                  }
                </div>
                <!--
                  Who set the status, and the action on it. The pill holds the
                  right edge of line 1 alone, so the statuses read as one
                  column; the verb lives here, with the assessment it changes,
                  as a text link - no icon next to the pill. The line is shown
                  whether or not the agent can act, so taking or releasing the
                  lock never changes a row's height.
                -->
                @if (field.status !== 'informational') {
                  <p class="ra-row__meta">
                    <span>{{ provenance(field) }}</span>
                    <!-- The open row: the word takes the action's place, so the
                         link that is missing is explained where it would be,
                         and line 1 never reflows. -->
                    @if (isOpen(field.def.id)) {
                      <span class="ra-row__sep" aria-hidden="true">·</span>
                      <span class="ra-row__assessing">Assessing</span>
                    } @else if (store.canAssessRisk()) {
                      <span class="ra-row__sep" aria-hidden="true">·</span>
                      @if (field.status === 'action-required') {
                        <button
                          type="button"
                          class="ra-act ra-act--assess"
                          [attr.aria-label]="'Assess ' + field.def.label"
                          (click)="store.assessRisk(field.def.id)"
                        >
                          Assess
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="ra-act ra-act--change"
                          [attr.aria-label]="'Change assessment of ' + field.def.label"
                          (click)="store.assessRisk(field.def.id)"
                        >
                          Change
                        </button>
                      }
                    }
                  </p>
                }
              </li>
            }
          </ul>
          }
        </section>
        }
      }

      @if (store.resyncing()) {
        <div class="ra-overlay">
          <div class="ra-overlay__inner">
            <mat-spinner diameter="24" strokeWidth="3" aria-hidden="true" />
            <p class="ra-overlay__text">Resyncing</p>
          </div>
        </div>
      }
    </div>

    <!-- Announced, not shown: the overlay and the workflow entry are what a
         sighted agent reads. -->
    <p class="ra-live" role="status" aria-live="polite">
      {{ store.resyncing() ? 'Resyncing risk assessment' : (viewNote() || store.lastResyncSummary()) }}
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
        /* The body's side padding, which the full-bleed pieces (section bands,
           the open row) pay back as their own so content stays on the gutter.
           20 on the desktop panel, 16 narrow - both on the LDS scale. */
        --ra-gutter: var(--lds-core-spacing-5);
      }
      @media (max-width: 719.98px) {
        :host {
          --ra-gutter: var(--lds-core-spacing-4);
        }
      }
      /* The snapshot header's geometry, kept: label over value on the left,
         the one control on the right, a 40px floor so nothing jumps. */
      .ra-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 40px;
      }
      .ra-head__text {
        min-width: 0;
      }
      .ra-head__label {
        margin: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
      }
      .ra-head__value {
        margin: 2px 0 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .ra-head__resync {
        padding-left: 16px;
        padding-right: 16px;
      }
      .ra-head__resync mat-icon.mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      /* The summary: 12/16 secondary, one line, the jump as a text link. */
      .ra-sum {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 6px;
        margin: 8px 0 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      .ra-sum__filter,
      .ra-sum__all {
        padding: 0;
        border: 0;
        background: none;
        font: inherit;
        font-weight: 600;
        color: var(--link);
        cursor: pointer;
        border-radius: 2px;
      }
      .ra-sum__filter:hover,
      .ra-sum__all:hover {
        color: var(--link-hover);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      /* Pressed: the underline stays, and the colour is the panel's own
         ink - a view that is ON is a fact, no longer an invitation. */
      .ra-sum__filter[aria-pressed='true'] {
        color: var(--foreground-primary);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .ra-sum__filter:focus-visible,
      .ra-sum__all:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .ra-final {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--success);
      }
      .ra-final mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        flex: none;
      }
      /* isolation keeps the bands' and overlay's z-index local: they stack
         against each other, never against the modal's own popovers. */
      .ra-body {
        position: relative;
        isolation: isolate;
        margin-top: var(--lds-core-spacing-2);
      }
      /**
       * A section break has to be visibly larger than the row rhythm it
       * interrupts. Rows sit 21px apart; a title used to sit 26px above its
       * section in the same ink as the values, and the list read as one run.
       *
       * The title is a BAND now: --page fill to the panel edges, a hairline
       * on top, 16 (spacing-4) of clear space above it, and primary ink so
       * it outranks the row labels it introduces. It is also sticky inside
       * its section, so the current section's name stays at the top of the
       * scroll area until the next band pushes it off. The fill is what lets
       * it cover rows passing beneath.
       */
      .ra-sec {
        padding-top: var(--lds-core-spacing-4);
      }
      .ra-sec__title {
        position: sticky;
        /* The body has 16px of top padding, and a sticky offset is measured
           from inside it - at 0 the band stopped 16px short of the top and a
           strip of scrolled rows showed above it. */
        top: calc(-1 * var(--lds-core-spacing-4));
        z-index: 1;
        margin: 0 calc(-1 * var(--ra-gutter));
        padding: var(--lds-core-spacing-2) var(--ra-gutter);
        background: var(--page);
        border-top: var(--lds-core-spacing-px) solid var(--line);
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--foreground-primary);
      }
      /* The informational block's title is its disclosure: the whole title
         line is the button, so there is no small chevron to hunt for. */
      /* The disclosure is the band's content: same band, a button inside it.
         The button's own 4px of padding is paid back with a negative margin
         so its label stays on the gutter like every other title. */
      .ra-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--lds-core-spacing-1);
        margin: calc(-1 * var(--lds-core-spacing-1)) 0 calc(-1 * var(--lds-core-spacing-1)) calc(-1 * var(--lds-core-spacing-1));
        padding: var(--lds-core-spacing-1);
        border: 0;
        border-radius: 4px;
        background: none;
        font: inherit;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--foreground-primary);
        cursor: pointer;
      }
      .ra-toggle:hover {
        color: var(--foreground-primary);
        background: var(--colors-alpha-alpha-soft-hover, rgba(0, 0, 0, 0.06));
      }
      .ra-toggle:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 0;
      }
      mat-icon.ra-toggle__icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .ra-toggle__count {
        font-weight: 400;
        letter-spacing: 0.04em;
      }
      .ra-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      /* Rows, not cards: a rule between them, nothing around them. */
      .ra-row {
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
      }
      .ra-row:last-child {
        border-bottom: 0;
      }
      /**
       * The open row's tint runs to the panel edges, not to the text: it
       * bleeds into the body's gutter and pays it back as padding, so the
       * content stays on the shared gutter and only the fill moves - the
       * same trick the section bands and the Past AML cases rows use.
       */
      .ra-row--open {
        margin: 0 calc(-1 * var(--ra-gutter));
        padding-left: var(--ra-gutter);
        padding-right: var(--ra-gutter);
        background: var(--color-background-info);
      }
      /* Primary ink, not blue: it sits where Change does, and a blue word
         there would read as a link that does nothing. The tint carries the
         colour; the word carries the state. 16.31:1 on the tint. */
      .ra-row__assessing {
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .ra-row__head {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 24px;
      }
      .ra-row__label {
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      /* The status holds the right edge; the label gives way first. */
      .ra-row__status {
        margin-left: auto;
        padding-left: 8px;
      }
      /**
       * The row's action: a text link on the provenance line, in the summary
       * jump's vocabulary - the same verb, the same look. 16px tall to look
       * at, 40px to hit; the extra lands in the row padding, and meets the
       * next row's info button without overlapping it.
       */
      .ra-act {
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
      .ra-act::before {
        content: '';
        position: absolute;
        inset: -12px -4px;
      }
      .ra-act:hover {
        color: var(--link-hover);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .ra-act:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .ra-row__sep {
        margin: 0 6px;
      }
      .ra-info {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: var(--foreground-secondary);
        cursor: help;
      }
      /* 24px to look at, 40px to hit: the extra lands in the row's own padding. */
      .ra-info::before {
        content: '';
        position: absolute;
        inset: -8px;
      }
      .ra-info:hover {
        background: var(--colors-alpha-alpha-soft-hover, rgba(0, 0, 0, 0.06));
        color: var(--foreground-primary);
      }
      .ra-info:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 0;
      }
      .ra-info mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .ra-row__value {
        display: flex;
        flex-direction: column;
        /* spacing-1 under the head: the pill fills the head's 24px, so this
           is the whole gap between the pill and the first value line. */
        margin-top: var(--lds-core-spacing-1);
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }
      .ra-row__meta {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--foreground-secondary);
        font-variant-numeric: tabular-nums;
      }
      /**
       * The overlay covers the section, not the tab bar or the header: the
       * agent can still see what is being resynced and when it was last done.
       * The message sticks to the top of the visible area, so it is on screen
       * however far down the list the agent had scrolled.
       */
      .ra-overlay {
        position: absolute;
        inset: 0;
        /* Above the sticky bands. */
        z-index: 2;
        background: color-mix(in srgb, var(--panel) 82%, transparent);
      }
      .ra-overlay__inner {
        position: sticky;
        top: 96px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding-top: 48px;
      }
      .ra-overlay__text {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      @media (prefers-reduced-motion: reduce) {
        .ra-overlay mat-spinner {
          display: none;
        }
      }
      .ra-live,
      .ra-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        margin: 0;
      }
    `,
  ],
})
export class RiskAssessmentComponent {
  readonly store = inject(CaseStore);
  readonly tooltip = riskTooltip;
  private readonly stampPipe = new StampPipe();

  @ViewChild('resyncTip') private resyncTip?: MatTooltip;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;

  /** What the panel adds up to. The chip bar shows the same "to assess" count. */
  readonly counts = computed(() => {
    const fields = this.store.riskFields();
    return {
      todo: fields.filter((f) => f.status === 'action-required').length,
      risk: fields.filter((f) => f.status === 'risk').length,
      noRisk: fields.filter((f) => f.status === 'no-risk').length,
    };
  });

  isInformational(group: { fields: { status: string }[] }): boolean {
    return group.fields.every((f) => f.status === 'informational');
  }

  /**
   * Resync pressed. When it is available this opens the confirm. When it is
   * not, the press is not ignored: the reason shows as the tooltip for a
   * moment, which is what a hover gets - a press on an unavailable control
   * should explain itself rather than do nothing.
   */
  onResync(): void {
    if (this.store.canResync()) {
      this.store.requestResync();
      return;
    }
    const tip = this.resyncTip;
    if (!tip) return;
    tip.show(0);
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => tip.hide(0), 2000);
  }

  /** For the live region: what the view is showing, once it has been toggled. */
  readonly viewNote = computed(() => {
    const only = this.store.toAssessOnly();
    if (only === null) return this.viewTouched() ? 'Showing all fields' : '';
    return `Showing ${only.size} ${only.size === 1 ? 'field' : 'fields'} to assess`;
  });
  private readonly viewTouched = signal(false);

  /** Whether the "to assess" view is on. */
  readonly filtered = computed(() => this.store.toAssessOnly() !== null);

  /**
   * The summary's count, pressed: pin every field still to assess and show
   * only those - both of them on one screen, with nothing to scroll past.
   * Pressed again, or "Show all": the whole panel. A field assessed while
   * the view is on stays in it, so the agent watches the two amber pills
   * turn and nothing disappears from under the pointer.
   */
  toggleToAssess(): void {
    this.viewTouched.set(true);
    if (this.store.toAssessOnly()) {
      this.store.toAssessOnly.set(null);
      return;
    }
    const ids = this.store
      .riskFields()
      .filter((f) => f.status === 'action-required')
      .map((f) => f.def.id);
    this.store.toAssessOnly.set(new Set(ids));
  }

  /** The rows a section shows: all of them, or, in the "to assess" view, the pinned ones and any new Action required. */
  shownFields<T extends { def: { id: string }; status: string }>(group: { fields: T[] }): T[] {
    const only = this.store.toAssessOnly();
    if (!only) return group.fields;
    return group.fields.filter((f) => only.has(f.def.id) || f.status === 'action-required');
  }

  /** Who set the status: the agent who assessed it, the system, or nobody yet. */
  provenance(field: { status: string; assessedBy?: string | null; assessedAt?: string | null }): string {
    if (field.assessedBy) return `Assessed by ${field.assessedBy} · ${this.stampPipe.transform(field.assessedAt ?? '')}`;
    return field.status === 'action-required' ? 'Not assessed yet' : 'From the system';
  }

  /** Whether this field's assessment form is the one open in the workflow. */
  isOpen(fieldId: string): boolean {
    const d = this.store.draft();
    return !!d && d.actionType === 'assess-risk' && d.riskFieldId === fieldId;
  }

  sectionId(section: string): string {
    return `ra-sec-${section.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  }
}
