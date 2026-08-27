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
import { MIN_DUAL_PANEL_PX, NARROW_BREAKPOINT_PX } from '../core/models';
import { WorkspaceStore } from '../core/workspace-store';
import { CaseHeaderComponent } from './case-header.component';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width]': 'ws.panelCss()',
  },
  template: `
    <div class="modal" [class.modal--narrow]="isNarrow()" [class.modal--dual]="ws.visibleCount() === 2">
      <case-header (minimise)="ws.minimise('aml')" (close)="ws.close('aml')" />

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
      <!--
        THE TRIGGER STRIP IS PART OF THE LEFT COLUMN, not a band across the
        panel. It used to sit between the header and the body, spanning both
        columns, which cost the workflow that height for a list the workflow
        never reads. The workflow now starts at the top of the body, directly
        under the header, and the triggers sit above the tabs whose content
        they belong with - the snapshot, the timeline, the case's history.

        It travels with the left column in BOTH layouts. Narrow has no columns,
        so "the left column" there is the Player info segment: the strip is on
        that segment and not on Workflow, which is the same division by another
        name. Consequence worth stating: at narrow the triggers are one tap
        away rather than always on screen, and the workflow segment gets the
        whole panel.
      -->
      <div class="body">
        @if (isNarrow()) {
          @if (store.activeSegment() === 'workflow') {
            <workflow-panel (focusin)="store.lastActivePanel.set('workflow')" />
          } @else {
            <div class="body__left" (focusin)="store.lastActivePanel.set('player-info')">
              <trigger-strip />
              <player-info-panel />
            </div>
          }
        } @else {
          <div
            class="body__left"
            (focusin)="store.lastActivePanel.set('player-info')"
            (pointerdown)="store.lastActivePanel.set('player-info')"
          >
            <trigger-strip />
            <player-info-panel />
          </div>
          <workflow-panel
            class="body__right"
            (focusin)="store.lastActivePanel.set('workflow')"
            (pointerdown)="store.lastActivePanel.set('workflow')"
          />
        }
      </div>

      <!--
        Severity and decision only. Both are reached from controls inside this
        panel, so neither can be asked for while the panel is shut.

        confirm-unlock is NOT here, and the omission is the point: Force unlock
        also appears on the WIDGET, which only shows its actions while this
        panel is closed. Hosted here, that click set openDialog and rendered
        nothing, because there was no panel to render it in. It lives in
        app.component instead, alongside the attachment preview, for the same
        reason - a viewport-fixed overlay should not depend on a panel.
      -->
      @switch (store.openDialog()) {
        @case ('severity') {
          <severity-dialog />
        }
        @case ('decision') {
          <decision-dialog />
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
        /* The reflow is INSTANT - no width transition here or on the SG panel.
           A panel arriving or leaving is what covers it: the newcomer's slide
           on the way in, the leaver's fade on the way out. Animating width as
           well would put a second motion under one that is already covering
           it, and cost a layout pass per frame on a panel this size. */
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
      /**
       * Square by default; rounded only in the dual state.
       *
       * Solo, the panel is flush to the viewport on three sides, and a radius
       * on an edge with nothing beyond it just cuts a notch out of the screen.
       * In dual the panels are two cards on a page, so they keep the 12px.
       */
      .modal--dual {
        border-radius: 12px;
      }
      /* A view, not a floating card: flat and edge to edge. The slide-in is
         untouched - it still arrives from the right, which is what makes it
         read as a view being pushed on rather than a sheet appearing. */
      @media (max-width: 719.98px) {
        .modal {
          border-left: 0;
          border-right: 0;
          box-shadow: none;
        }
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
      /**
       * A COLUMN now, not a single component: the trigger strip above, the
       * tabs and their content below.
       *
       * The strip is flex: none and the info panel takes what is left, so the
       * strip's own two heights - a collapsed pair, or five rows expanded -
       * are what move, and they move the tab content rather than anything in
       * the workflow beside it. min-height: 0 on both, or the info panel's
       * internal scroller cannot shrink and the column grows past the body.
       */
      .body__left {
        flex: 0 0 420px;
        width: 420px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-right: 1px solid var(--line);
      }
      .body__left trigger-strip {
        flex: none;
      }
      .body__left player-info-panel {
        flex: 1 1 auto;
        min-height: 0;
      }
      /* Narrow: the column IS the segment, so it takes the whole body. */
      .modal--narrow .body__left {
        flex: 1 1 auto;
        width: auto;
        border-right: 0;
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

  /** See CaseStore.layoutStacked. MIN_DUAL_PANEL_PX is the dual-fit width. */
  readonly isStacked = computed(() => this.ws.modalWidth() < MIN_DUAL_PANEL_PX);

  private wasNarrow = false;

  constructor() {
    effect(
      () => {
        const narrow = this.isNarrow();

        // Published because the compact treatment reaches components that are
        // not children of this template.
        this.store.layoutNarrow.set(narrow);
        this.store.layoutStacked.set(this.isStacked());

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
