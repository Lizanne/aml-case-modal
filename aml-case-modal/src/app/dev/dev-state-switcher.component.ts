import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { WorkspaceStore } from '../core/workspace-store';
import { DEFAULT_SCENARIO, SCENARIOS, applyScenario } from '../core/scenarios';

/**
 * Dev-only harness. Not part of the product surface.
 *
 * Jumps straight to any of the 13 Figma frames, and exposes the two simulations
 * the spec asks for by hand: a mid-case system trigger (rule 11) and the resync
 * that clears it.
 *
 * Deep-linkable: ?state=03
 */
@Component({
  selector: 'dev-state-switcher',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatSelectModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dev">
      <span class="dev__tag">Dev</span>

      <label class="dev__field">
        <span class="dev__label">State</span>
        <select class="dev__select" (change)="select($event)">
          @for (scenario of scenarios; track scenario.id) {
            <!-- [selected] per option, not [value] on the select: the options are
                 rendered by @for after the select is bound, so [value] loses. -->
            <option [value]="scenario.id" [selected]="scenario.id === current()">
              {{ scenario.label }}
            </option>
          }
        </select>
      </label>

      <p class="dev__hint">{{ hint() }}</p>

      <div class="dev__actions">
        <button
          mat-stroked-button
          type="button"
          matTooltip="Rule 11 - inserts a system trigger and marks the snapshot out of sync"
          (click)="store.simulateNewTrigger()"
        >
          <mat-icon>bolt</mat-icon>
          New trigger
        </button>
        <button mat-stroked-button type="button" [disabled]="!store.snapshotOutOfSync()" (click)="store.resync()">
          <mat-icon>sync</mat-icon>
          Resync
        </button>
        <button mat-stroked-button type="button" (click)="reload()">
          <mat-icon>restart_alt</mat-icon>
          Reset state
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .dev {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px 16px;
        padding: 10px 16px;
        border-radius: 10px;
        background: #1f2430;
        color: #e6e9ef;
        font-size: 14px;
        line-height: 20px;
      }
      .dev__tag {
        font-size: 12px;
        line-height: 16px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
      }
      .dev__field {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dev__label {
        color: rgba(255, 255, 255, 0.62);
      }
      .dev__select {
        font: inherit;
        /* 16px each side. The right value is what the chevron sits on - a
           native select draws it inside the padding box, so it was 10px from
           the border and looked pinned to the edge. */
        padding: 6px 16px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: #12161f;
        color: #e6e9ef;
        min-width: 340px;
      }
      .dev__hint {
        margin: 0;
        flex: 1 1 240px;
        min-width: 200px;
        color: rgba(255, 255, 255, 0.62);
        line-height: 1.4;
      }
      .dev__actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dev__actions .mdc-button {
        --mdc-outlined-button-label-text-color: #e6e9ef;
        --mdc-outlined-button-outline-color: rgba(255, 255, 255, 0.24);
      }
      .dev__actions .mdc-button:disabled {
        --mdc-outlined-button-disabled-label-text-color: rgba(255, 255, 255, 0.34);
      }
    
      /**
       * Mobile: the select's 340px minimum was the single biggest source of
       * horizontal overflow on the whole page - it pushed the dev row to
       * 388px inside a 343px container and gave the document a scrollbar that
       * made every other measurement look wrong. Below 720px the field owns
       * the full row and the select fills it.
       */
      @media (max-width: 719.98px) {
        /* 279px of harness on an 844px phone was a third of the viewport, and
           it is not product. The explanatory hint goes; the switcher and its
           buttons stay. */
        .dev__hint {
          display: none;
        }
        .dev {
          align-items: stretch;
          flex-direction: column;
          gap: 8px;
          padding: 8px 12px;
        }
        .dev__field {
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          width: 100%;
        }
        .dev__select {
          min-width: 0;
          width: 100%;
        }
        .dev__hint {
          flex: 1 1 auto;
          min-width: 0;
        }
      }
`,
  ],
})
export class DevStateSwitcherComponent {
  readonly store = inject(CaseStore);
  readonly ws = inject(WorkspaceStore);
  readonly scenarios = SCENARIOS;

  private readonly _current = signal(DEFAULT_SCENARIO);
  readonly current = this._current.asReadonly();

  readonly hint = computed(
    () => SCENARIOS.find((s) => s.id === this._current())?.hint ?? '',
  );

  constructor() {
    const fromUrl = new URLSearchParams(window.location.search).get('state');
    this._current.set(applyScenario(this.store, this.ws, fromUrl ?? DEFAULT_SCENARIO));
    this.writeUrl(this._current());
  }

  select(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this._current.set(applyScenario(this.store, this.ws, id));
    this.writeUrl(id);
  }

  reload(): void {
    this._current.set(applyScenario(this.store, this.ws, this._current()));
  }

  private writeUrl(id: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set('state', id);
    window.history.replaceState({}, '', url);
  }
}
