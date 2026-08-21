import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { CaseStore } from '../core/case-store';
import { focusPanelHeader } from './sg-alert-modal.component';
import { NARROW_BREAKPOINT_PX } from '../core/models';
import { WorkspaceStore } from '../core/workspace-store';
import { CaseHeaderComponent } from './case-header.component';
import { ConfirmUnlockDialogComponent } from './confirm-unlock-dialog.component';
import { DecisionDialogComponent } from './decision-dialog.component';
import { PlayerInfoPanelComponent } from './player-info-panel.component';
import { SeverityDialogComponent } from './severity-dialog.component';
import { TriggerStripComponent } from './trigger-strip.component';
import { WorkflowPanelComponent } from './workflow-panel.component';

/**
 * The modal shell. Owns one thing of its own: the layout mode.
 *
 * That mode is width-driven and nothing else. Above 720px of MODAL width it is
 * a two-panel split - player info fixed at 420px, workflow taking the rest.
 * Below it, the split is replaced by a segmented control rather than squeezed.
 *
 * There is no dual-modal flag. When a second modal opens, the workspace hands
 * this one half the stage, that number drops under 720, and the panels reflow.
 * The same rule serves a small screen, so the two cases cannot drift apart.
 */
@Component({
  selector: 'aml-case-modal',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    CaseHeaderComponent,
    TriggerStripComponent,
    PlayerInfoPanelComponent,
    WorkflowPanelComponent,
    SeverityDialogComponent,
    DecisionDialogComponent,
    ConfirmUnlockDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width]': 'ws.panelCss()',
  },
  template: `
    <div class="modal" [class.modal--narrow]="isNarrow()">
      <case-header (minimise)="ws.minimise('aml')" (close)="ws.close('aml')" />
      <trigger-strip />

      @if (isNarrow()) {
        <div class="segments">
          <mat-button-toggle-group
            class="segments__group"
            [value]="store.activeSegment()"
            (change)="onSegment($any($event).value)"
            aria-label="Panel"
          >
            <mat-button-toggle value="workflow">Workflow</mat-button-toggle>
            <mat-button-toggle value="player-info">Player info</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      }

      <!-- focusin marks which panel the agent is working in, so a reflow into
           the segmented layout lands on the one they were already using. -->
      <div class="body">
        @if (isNarrow()) {
          @if (store.activeSegment() === 'workflow') {
            <workflow-panel (focusin)="store.lastActivePanel.set('workflow')" />
          } @else {
            <player-info-panel (focusin)="store.lastActivePanel.set('player-info')" />
          }
        } @else {
          <player-info-panel
            class="body__left"
            (focusin)="store.lastActivePanel.set('player-info')"
            (pointerdown)="store.lastActivePanel.set('player-info')"
          />
          <workflow-panel
            class="body__right"
            (focusin)="store.lastActivePanel.set('workflow')"
            (pointerdown)="store.lastActivePanel.set('workflow')"
          />
        }
      </div>

      @switch (store.openDialog()) {
        @case ('severity') {
          <severity-dialog />
        }
        @case ('decision') {
          <decision-dialog />
        }
        @case ('confirm-unlock') {
          <confirm-unlock-dialog />
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        /* The width is set inline from the measured stage. This is the
           backstop: whatever that number says, the modal never exceeds the
           viewport and never creates a horizontal scrollbar. */
        max-width: 100vw;
        /* The reflow. Width is animated, never opacity or pointer-events, so
           the modal stays fully interactive throughout. */
      }
      .modal {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        /* Fills the stage, which is already sized to what the chrome leaves.
           Leave room for any docked bars, or one will cover the footer. */
        height: 100%;
        max-height: calc(100% - var(--dock-h, 0px));
        min-height: 0;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
        box-shadow: 0 20px 56px rgba(24, 24, 27, 0.14);
        overflow: hidden;
      }
      /* Full-bleed, two equal halves - the segmented control is the primary
         navigation in this mode, not a secondary toggle. */
      .segments {
        padding: 16px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }
      .segments__group {
        display: flex;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--page);
        padding: 4px;
      }
      /* 32px tall segments. Material sizes these off the label's line-height,
         so the height has to be set on the toggle AND the line box centred
         inside it, or the text sits high in a taller button. */
      .segments__group ::ng-deep .mat-button-toggle {
        flex: 1 1 0;
        min-width: 0;
        height: 32px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        transition: background-color 120ms ease-out;
      }
      /* Hover on the segment you can move TO. The current one is already a
         raised white card and clicking it does nothing, so tinting it would
         advertise an action that is not there. */
      .segments__group ::ng-deep .mat-button-toggle:not(.mat-button-toggle-checked):hover {
        background: rgba(0, 0, 0, 0.06);
      }
      @media (prefers-reduced-motion: reduce) {
        .segments__group ::ng-deep .mat-button-toggle {
          transition: none;
        }
      }
      /* Material paints its own hover overlay on top of ours; two stacked
         tints never give the 6% that was asked for. */
      .segments__group ::ng-deep .mat-button-toggle-focus-overlay {
        opacity: 0;
      }
      .segments__group ::ng-deep .mat-button-toggle .mat-button-toggle-button {
        height: 32px;
      }
      .segments__group ::ng-deep .mat-button-toggle-label-content {
        width: 100%;
        text-align: center;
        line-height: 32px;
        font-size: 14px;
      }
      /* The selected half reads as a raised card on the track. Material's
         default is a grey fill plus a checkmark, which reads as "checked"
         rather than "current". */
      .segments__group ::ng-deep .mat-button-toggle-checked {
        background: var(--panel);
        border-radius: 6px;
        box-shadow: 0 1px 2px rgba(24, 24, 27, 0.12);
      }
      .segments__group ::ng-deep .mat-button-toggle-checked .mat-button-toggle-label-content {
        font-weight: 600;
        color: var(--ink);
      }
      .segments__group ::ng-deep .mat-pseudo-checkbox {
        display: none;
      }
      .body {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
      }
      .body__left {
        flex: 0 0 420px;
        width: 420px;
        border-right: 1px solid var(--line);
      }
      .body__right {
        flex: 1 1 auto;
        min-width: 0;
      }
      .modal--narrow .body > * {
        flex: 1 1 auto;
        min-width: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        :host {
          transition: none;
        }
      }
    `,
  ],
})
export class AmlCaseModalComponent implements AfterViewInit {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  ngAfterViewInit(): void {
    focusPanelHeader(this.hostEl, this.ws, 'aml');
  }

  readonly store = inject(CaseStore);
  readonly ws = inject(WorkspaceStore);

  readonly isNarrow = computed(() => this.ws.modalWidth() < NARROW_BREAKPOINT_PX);

  private wasNarrow = false;

  constructor() {
    effect(
      () => {
        const narrow = this.isNarrow();

        // Published because the compact treatment reaches components that are
        // not children of this template.
        this.store.layoutNarrow.set(narrow);

        // On the reflow into segmented, land on whichever panel the agent was
        // actually working in. Only on the transition - never override their
        // choice once they are already in segmented mode.
        if (narrow && !this.wasNarrow) {
          this.store.activeSegment.set(this.store.lastActivePanel());
        }
        this.wasNarrow = narrow;
      },
      { allowSignalWrites: true },
    );
  }

  onSegment(value: 'workflow' | 'player-info'): void {
    this.store.activeSegment.set(value);
    this.store.lastActivePanel.set(value);
  }
}
