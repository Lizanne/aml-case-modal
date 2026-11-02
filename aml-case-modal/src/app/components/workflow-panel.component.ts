import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { RequiredActionState } from '../core/case-store';
import { OutcomeItem, StreamItem, isOutcome } from '../core/models';
import { joinLabels } from '../core/risk-assessment';
import { ActionPlaceholderComponent } from './action-placeholder.component';
import { AddActionMenuComponent } from './add-action-menu.component';
import { EventRowComponent } from './event-row.component';
import { OutcomeCardComponent } from './outcome-card.component';
import { RecordFormComponent } from './record-form.component';
import { RequiredChipsComponent } from './required-chips.component';

/**
 * The workflow panel - the point of the prototype.
 *
 * Layout contract: the chip bar and the footer are pinned; only the stream
 * between them scrolls.
 *
 * Stream order: saved items in the order they happened, then any outstanding
 * required-action placeholders (rule 4), then the Add action affordance (rule 7).
 * An open record-form takes the place of the placeholder it was started from,
 * or sits at the end of the stream when it came from the Add action menu.
 */
@Component({
  selector: 'workflow-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RequiredChipsComponent,
    OutcomeCardComponent,
    EventRowComponent,
    ActionPlaceholderComponent,
    RecordFormComponent,
    AddActionMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" aria-label="Case workflow">
      <!-- Pinned. Rule 10: no chips once resolved. -->
      @if (!store.isResolved()) {
        <required-chips />
      }

      <!-- No resync banner. A new trigger no longer blocks work: it is an
           entry in the stream, and Resync lives on the Risk assessment. -->

      <!-- Scrolls. -->
      <div class="stream" #stream tabindex="0" aria-label="Workflow stream" (scroll)="onScroll()">
        @for (item of store.stream(); track item.id) {
          @if (asOutcome(item); as outcome) {
            <outcome-card [outcome]="outcome" />
          } @else {
            <event-row [event]="$any(item)" />
          }
        }

        @for (pending of store.pendingPlaceholders(); track pending.key) {
          @if (draftFor(pending)) {
            <record-form />
          } @else {
            <action-placeholder
              [attr.data-key]="pending.key"
              [actionType]="pending.actionType"
              [label]="pending.fieldId ? pending.shortLabel : pending.label"
              [block]="store.recordBlock()"
              [available]="pending.available"
              [status]="pending.status"
              [unavailableReason]="finalizeReason()"
              (record)="store.startRecord(pending.actionType, true, pending.fieldId)"
            />
          }
        }

        <!-- A draft started from the Add action menu is appended, not slotted. -->
        @if (trailingDraft()) {
          <record-form />
        }

        <!-- Rule 10: no Add action once resolved. -->
        @if (!store.isResolved()) {
          <div class="stream__add">
            <add-action-menu />
          </div>
        }
      </div>

      <!-- Pinned. Rule 10: the footer disappears entirely once resolved. -->
      @if (store.showFooter()) {
        <!-- Two controls, hard right. Why Submit is disabled lives on its
             tooltip; the required chips at the top of the panel carry the same
             state persistently. -->
        <footer class="footer" #footer>
          <button
            mat-stroked-button
            type="button"
            [disabled]="!store.canAdjustSeverity()"
            (click)="store.openDialog.set('severity')"
          >
            <mat-icon>tune</mat-icon>
            Adjust severity
          </button>

          <span
            class="footer__submit"
            [matTooltip]="gateTooltip()"
            [matTooltipDisabled]="store.canSubmitDecision()"
          >
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="!store.canSubmitDecision()"
              (click)="store.openDialog.set('decision')"
            >
              Submit decision
            </button>
          </span>
        </footer>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        height: 100%;
      }
      /* Flex, not grid: the chip bar is conditional, so the stream
         must claim whatever is left rather than a fixed track. */
      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--panel);
      }
      /**
       * grid-template-columns: minmax(0, 1fr) is load-bearing.
       *
       * Without it the single implicit column is auto, and an auto track's
       * floor is the largest min-content contribution among its items. One
       * nowrap flex child (the severity event row) therefore sized the column
       * for every sibling, stretching the cards past the panel and scrolling
       * the stream sideways. minmax(0, ...) lets the track go narrower than its
       * content and hands the shrinking to the children.
       *
       * overflow-x: hidden is the backstop, not the fix - it would only have
       * hidden the symptom.
       */
      .stream {
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
        min-height: 0;
        padding: 20px;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
        align-content: start;
        /* The recessed well, not the page ground - see --stream-bg. */
        background: var(--stream-bg);
      }
      /* Grid items default to min-width: auto, which is what lets content push
         them wider than their track. */
      /**
       * 24 below the creation event, against 12 everywhere else.
       *
       * It is the case's provenance, not a step in the work, so it wants a
       * clear break before the first slot rather than sitting in the same
       * rhythm as the outcomes. 12 of margin on top of the grid's 12 gap.
       */
      .stream > event-row.event-row--created {
        margin-bottom: 12px;
      }
      .stream > * {
        min-width: 0;
        max-width: 100%;
      }
      .stream:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      /* One footer everywhere, narrow included: buttons at their natural
         width, hard right, 12px apart. Wrapping is the escape hatch if the
         pair ever outgrows the panel - a shrunk Material button crushes its
         own icon, so the buttons themselves must not give. */
      .footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 12px;
        padding: 16px 20px;
        border-top: 1px solid var(--line);
        background: var(--panel);
      }
      /* 16px sides on both footer buttons. Material's stroked button gives
         itself 15 because it spends a pixel on its border, which left Adjust
         severity a pixel narrower than Submit beside it; stating it puts the
         pair, and anything added here later, on the same 16 as every other
         button in the panel. */
      .footer button {
        padding-left: 16px;
        padding-right: 16px;
      }
      /* 16px glyph, matching Add action and Add files.
         mat-icon.mat-icon, not just the class: Material sets 24px at .mat-icon
         inside its own button rule, so the element tag is what wins. */
      .footer mat-icon.mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      /* flex: none - a shrinking Material button crushes its own icon before
         anything else gives. */
      .footer button {
        white-space: nowrap;
        flex: none;
      }

      /**
       * Stacked footer: full width, Submit first.
       *
       * column-reverse because Submit is LAST in the DOM, which is the right
       * reading order for a footer and must not change to satisfy a layout -
       * the same reason the dialog footer does it.
       *
       * The stream's bottom padding is the footer's own rendered height,
       * published as --footer-h: a stacked footer is more than twice the
       * height of a single row, and a fixed 20px left the last stream item
       * tight against it.
       */
      @media (max-width: 719.98px) {
        .footer {
          flex-direction: column-reverse;
          align-items: stretch;
          gap: 8px;
          padding: 16px;
        }
        .footer button,
        .footer .footer__submit,
        .footer .footer__submit > button {
          width: 100%;
          min-width: 0;
        }
        .footer .footer__submit {
          display: block;
        }
        /* The footer is the panel's last flex child, not an overlay - it is
           never OVER the stream, so height-derived padding would be dead space
           rather than clearance, and 92px of it at the end of a ~105px scroll
           area is worse than the problem. The footer's measured height drives
           scroll-padding instead, which is what keeps a focused item clear of
           it, and the visual bottom stays 20px. Verified: the last stream item
           is not clipped with the footer stacked and the stream at its end. */
        .stream {
          padding: 20px;
          scroll-padding-bottom: var(--footer-h, 0px);
        }
      }
    `,
  ],
})
export class WorkflowPanelComponent implements AfterViewInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly zone = inject(NgZone);

  @ViewChild('stream') private streamEl?: ElementRef<HTMLElement>;
  @ViewChild('footer') private footerEl?: ElementRef<HTMLElement>;
  private footerObserver?: ResizeObserver;

  /** A reflow rebuilds this panel, so the scroll offset lives in the store. */
  ngAfterViewInit(): void {
    // Publish the footer's height so the stream can clear it. Measured rather
    // than assumed: the footer is one row on a desktop and two stacked
    // full-width buttons on a phone, and the difference is what was leaving
    // the last stream item tight against it.
    const footer = this.footerEl?.nativeElement;
    if (footer) {
      this.footerObserver = new ResizeObserver((entries) => {
        const h = entries[0]?.contentRect.height ?? 0;
        this.zone.run(() =>
          this.host.nativeElement.style.setProperty('--footer-h', `${Math.round(h)}px`),
        );
      });
      this.footerObserver.observe(footer);
    }

    const el = this.streamEl?.nativeElement;
    if (el) el.scrollTop = this.store.streamScroll();
  }

  onScroll(): void {
    const el = this.streamEl?.nativeElement;
    if (el) this.store.streamScroll.set(el.scrollTop);
  }

  readonly store = inject(CaseStore);

  /**
   * Why Submit is disabled - shown as a tooltip where the sentence does not fit.
   * Only a finalized risk assessment lets a case close, so it is always named
   * when it is outstanding.
   */
  readonly gateTooltip = computed(() => {
    const outstanding = this.store.requiredActions().filter((r) => !r.done);
    if (!outstanding.length) return 'Lock the case to submit a decision.';
    const steps: string[] = [];
    if (outstanding.some((r) => r.actionType === 'assess-risk')) {
      steps.push('assess every field marked Action required');
    }
    if (outstanding.some((r) => r.actionType === 'player-contact')) {
      steps.push('record the player contact');
    }
    if (outstanding.some((r) => r.actionType === 'finalize-risk-assessment')) {
      steps.push('finalize the risk assessment');
    }
    const sentence = joinLabels(steps);
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} to submit a decision.`;
  });

  /** Why Finalize is still disabled: the fields that are left, by name. */
  readonly finalizeReason = computed(() => {
    const left = this.store.actionRequiredFields().map((f) => f.def.label);
    if (!left.length) return null;
    return `Assess ${joinLabels(left)} first.`;
  });

  /** True when the open draft belongs in this placeholder's slot. */
  draftFor(pending: RequiredActionState): boolean {
    const draft = this.store.draft();
    return (
      !!draft &&
      draft.fromPlaceholder &&
      draft.actionType === pending.actionType &&
      (draft.riskFieldId ?? null) === pending.fieldId
    );
  }

  /** True when the open draft came from the Add action menu (rule 7). */
  trailingDraft(): boolean {
    const draft = this.store.draft();
    return !!draft && !draft.fromPlaceholder;
  }

  asOutcome(item: StreamItem): OutcomeItem | null {
    return isOutcome(item) ? item : null;
  }

  ngOnDestroy(): void {
    this.footerObserver?.disconnect();
  }
}
