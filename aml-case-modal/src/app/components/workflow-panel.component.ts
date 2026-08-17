import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { ActionTypeId, OutcomeItem, StreamItem, isOutcome } from '../core/models';
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

      <!-- Rule 11: the resync gate sits above the stream, where it blocks work. -->
      @if (store.snapshotOutOfSync() && !store.isResolved()) {
        <div class="resync" role="alert">
          <mat-icon>sync_problem</mat-icon>
          <div class="resync__text">
            <p class="resync__title">Snapshot is out of sync</p>
            <p class="resync__body">
              A new trigger arrived after this snapshot was taken. Resync before recording outcomes.
            </p>
          </div>
          <button mat-flat-button color="primary" type="button" (click)="store.resync()">
            Resync
          </button>
        </div>
      }

      <!-- Scrolls. -->
      <div class="stream" #stream tabindex="0" aria-label="Workflow stream" (scroll)="onScroll()">
        @if (isEmpty()) {
          <p class="stream__empty">No outcomes recorded yet.</p>
        }

        @for (item of store.stream(); track item.id) {
          @if (asOutcome(item); as outcome) {
            <outcome-card [outcome]="outcome" (viewSnapshot)="store.viewSnapshot($event)" />
          } @else {
            <event-row [event]="$any(item)" />
          }
        }

        @for (pending of store.pendingPlaceholders(); track pending.id) {
          @if (draftFor(pending.id)) {
            <record-form />
          } @else {
            <action-placeholder
              [actionType]="pending.id"
              [label]="pending.label"
              [block]="store.recordBlock()"
              (record)="store.startRecord($event, true)"
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
        <!-- Narrow: two equal-width buttons, and the gate explanation moves to
             the disabled button's tooltip - there is no room for a sentence. -->
        <footer class="footer" [class.footer--narrow]="store.layoutNarrow()">
          <button
            mat-stroked-button
            type="button"
            [disabled]="!store.canAdjustSeverity()"
            (click)="store.openDialog.set('severity')"
          >
            <mat-icon>tune</mat-icon>
            Adjust severity
          </button>

          <div class="footer__right">
            @if (!store.allRequiredRecorded() && !store.layoutNarrow()) {
              <span class="footer__gate">Record both required actions to submit a decision.</span>
            }
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
          </div>
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
      /* Flex, not grid: the chip bar and resync banner are conditional, so the
         stream must claim whatever is left rather than a fixed track. */
      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--panel);
      }
      .resync {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        background: var(--warn-bg);
        color: var(--warn);
        border-bottom: 1px solid var(--line);
      }
      .resync mat-icon {
        flex: none;
      }
      .resync__text {
        flex: 1;
      }
      .resync__title {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
      }
      .resync__body {
        margin: 2px 0 0;
        font-size: 12px;
        line-height: 1.4;
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
        padding: 18px 20px 24px;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
        align-content: start;
        background: var(--page);
      }
      /* Grid items default to min-width: auto, which is what lets content push
         them wider than their track. */
      .stream > * {
        min-width: 0;
        max-width: 100%;
      }
      .stream:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .stream__empty {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-3);
      }
      .stream__add {
        margin-top: 4px;
      }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 20px;
        border-top: 1px solid var(--line);
        background: var(--panel);
      }
      .footer button {
        white-space: nowrap;
        /* The gate sentence is the flexible thing here, not the controls. A
           shrinking button crushes its own icon before anything else gives. */
        flex: none;
      }
      .footer__gate {
        flex: 0 1 auto;
      }
      .footer__right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .footer__gate {
        font-size: 12px;
        color: var(--ink-3);
        max-width: 220px;
        text-align: right;
        line-height: 1.35;
      }
      /* Narrow: two equal halves, matching the segmented control above.
         Grid rather than flex - Material's button box does not honour
         flex-basis: 0 consistently, so two flex:1 children came out 341 vs
         309. Equal grid tracks are not negotiable in the same way. */
      .footer--narrow {
        display: grid;
        grid-template-columns: 1fr 1fr;
        padding: 11px 16px;
        gap: 10px;
      }
      .footer--narrow > button,
      .footer--narrow .footer__right,
      .footer--narrow .footer__submit,
      .footer--narrow .footer__submit > button {
        width: 100%;
        min-width: 0;
      }
      .footer--narrow .footer__submit {
        display: block;
      }
    `,
  ],
})
export class WorkflowPanelComponent implements AfterViewInit {
  @ViewChild('stream') private streamEl?: ElementRef<HTMLElement>;

  /** A reflow rebuilds this panel, so the scroll offset lives in the store. */
  ngAfterViewInit(): void {
    const el = this.streamEl?.nativeElement;
    if (el) el.scrollTop = this.store.streamScroll();
  }

  onScroll(): void {
    const el = this.streamEl?.nativeElement;
    if (el) this.store.streamScroll.set(el.scrollTop);
  }

  readonly store = inject(CaseStore);

  readonly isEmpty = computed(() => this.store.stream().length === 0 && !this.store.draft());

  /** Why Submit is disabled - shown as a tooltip where the sentence does not fit. */
  readonly gateTooltip = computed(() => {
    const outstanding = this.store.requiredActions().filter((r) => !r.done);
    if (!outstanding.length) return 'Lock the case to submit a decision.';
    return `Record ${outstanding.map((r) => r.label.toLowerCase()).join(' and ')} to submit a decision.`;
  });

  /** True when the open draft belongs in this placeholder's slot. */
  draftFor(actionType: ActionTypeId): boolean {
    const draft = this.store.draft();
    return !!draft && draft.fromPlaceholder && draft.actionType === actionType;
  }

  /** True when the open draft came from the Add action menu (rule 7). */
  trailingDraft(): boolean {
    const draft = this.store.draft();
    return !!draft && !draft.fromPlaceholder;
  }

  asOutcome(item: StreamItem): OutcomeItem | null {
    return isOutcome(item) ? item : null;
  }
}
