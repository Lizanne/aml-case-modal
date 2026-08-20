import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { WorkspaceStore } from '../core/workspace-store';
import { PillComponent } from './ui-pill.component';

/**
 * The back office surface behind the modals. Each widget opens its own modal
 * and only its own: nothing here ever opens both, so two modals on screen is
 * always something the agent did in two deliberate steps.
 *
 * The AML widget additionally requires the case to be locked to this agent -
 * you take the lock from the widget, then open the case. (Once open the modal
 * stays open through an unlock or a severity change, which is why frames 00a
 * and 00b exist.)
 */
@Component({
  selector: 'back-office-widgets',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="widgets">
      <!--
        Frame 09's two widget states, which are the ONLY way onto the stage.
        Icon, title and count on the first line, the secondary detail under it,
        and the actions hard right: lock state, Unlock, then the primary that
        opens the panel.
      -->
      <article class="widget">
        <mat-icon class="widget__icon" fontSet="material-icons-outlined">shield</mat-icon>
        <div class="widget__text">
          <div class="widget__head">
            <h2 class="widget__title">SG Alerts</h2>
            <ui-pill tone="info">41 triggers hit</ui-pill>
          </div>
          <p class="widget__body">12 snoozed · Last trigger 1mo ago</p>
        </div>
        <div class="widget__foot">
          <span class="widget__lock">
            <span class="widget__avatar" aria-hidden="true">LF</span>
            Locked by you
          </span>
          <button mat-stroked-button type="button">Unlock</button>
          @if (ws.isOpen('sg')) {
            <button mat-stroked-button type="button" (click)="ws.close('sg')">Close alert</button>
          } @else {
            <button mat-flat-button color="primary" type="button" (click)="ws.open('sg')">
              <mat-icon>check</mat-icon>
              Resolve and archive
            </button>
          }
        </div>
      </article>

      <article class="widget">
        <mat-icon class="widget__icon" fontSet="material-icons-outlined">work_outline</mat-icon>
        <div class="widget__text">
          <div class="widget__head">
            <h2 class="widget__title">AML Case</h2>
            <ui-pill [severity]="store.severity()">{{ store.severity() }}</ui-pill>
          </div>
          <p class="widget__body">
            #AML-1042 · {{ store.isResolved() ? 'Resolved' : 'In progress' }} · Opened 12d ago
          </p>
        </div>
        <div class="widget__foot">
          <span class="widget__lock">
            <span class="widget__avatar" aria-hidden="true">LF</span>
            {{ lockLine() }}
          </span>
          @if (!store.isResolved() && store.lockState() !== 'locked-to-me') {
            <button mat-stroked-button type="button" (click)="store.lock()" [disabled]="lockBlocked()">
              Lock case
            </button>
          } @else if (!store.isResolved()) {
            <button mat-stroked-button type="button" (click)="store.requestUnlock()">Unlock</button>
          }
          @if (ws.isOpen('aml')) {
            <button mat-stroked-button type="button" (click)="ws.close('aml')">Close case</button>
          } @else {
            <button mat-flat-button color="primary" type="button" (click)="ws.open('aml')">
              <mat-icon>open_in_new</mat-icon>
              Open case
            </button>
          }
        </div>
      </article>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /* min(260px, 100%) rather than a bare 260px: an auto-fit track whose
         floor is wider than the container overflows it instead of collapsing
         to one column, which is exactly what a 260px minimum does on a phone
         narrower than that. */
      .widgets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        gap: 12px;
      }
      /* One row: icon, the text column, then the actions hard right.
         min-width: 0 so a widget may be narrower than its own content -
         without it a grid item floors at min-content and the pair stops
         sharing the row long before the stacking point. */
      .widget {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        padding: 12px 16px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
      }
      mat-icon.widget__icon {
        flex: none;
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        color: var(--ink-2);
      }
      .widget__text {
        flex: 1;
        min-width: 0;
      }
      .widget__head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .widget__title {
        min-width: 0;
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* The secondary line is what gives way first: one line, ellipsised. The
         buttons are the widget's whole purpose, so they must never be the
         thing that wraps or clips to make room for a sentence. */
      .widget__body {
        margin: 2px 0 0;
        min-width: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .widget__lock {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: none;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        color: var(--foreground-success);
        white-space: nowrap;
      }
      .widget__avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: var(--success-bg-subtle);
        color: var(--success);
        font-size: 10px;
        letter-spacing: 0;
      }
      /* flex: none on the buttons: a Material button that shrinks crushes its
         own label and icon rather than ellipsising cleanly. They keep their
         size and the row wraps instead - and below the stacking width there is
         a full column each, so it never comes to that. */
      .widget__foot {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .widget__foot button {
        flex: none;
        max-width: 100%;
      }

      /* Mobile: one card per row, full width inside the page's 16px gutter, and
         the buttons share that width rather than huddling at the left. */
      /* Not enough room for text and actions on one line: the actions drop
         under the text, still right-aligned, before anything truncates away
         to nothing. */
      @media (max-width: 1279.98px) {
        .widget {
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .widget__text {
          flex: 1 1 100%;
        }
        .widget__foot {
          flex: 1 1 100%;
        }
      }

      @media (max-width: 719.98px) {
        .widgets {
          grid-template-columns: minmax(0, 1fr);
        }
        .widget__foot button {
          flex: 1 1 auto;
        }
      }
    `,
  ],
})
export class BackOfficeWidgetsComponent {
  readonly ws = inject(WorkspaceStore);
  readonly store = inject(CaseStore);

  /** Rule 3, at the door: you hold the lock or you do not get in. */
  readonly canOpenAml = computed(
    () => this.store.lockState() === 'locked-to-me' || this.store.isResolved(),
  );

  readonly lockBlocked = computed(() => this.store.lockState() === 'locked-to-other');

  readonly lockLine = computed(() => {
    if (this.store.isResolved()) return 'Resolved. Read-only.';
    switch (this.store.lockState()) {
      case 'locked-to-me':
        return 'Locked to you.';
      case 'locked-to-other':
        return `Locked to ${this.store.lockOwner()?.name ?? 'another agent'}.`;
      default:
        return 'Not locked.';
    }
  });

  readonly openBlockedReason = computed(() =>
    this.store.lockState() === 'locked-to-other'
      ? `${this.store.lockOwner()?.name ?? 'Another agent'} holds this case. Open it from their lock or force unlock inside.`
      : 'Lock the case before opening it.',
  );
}
