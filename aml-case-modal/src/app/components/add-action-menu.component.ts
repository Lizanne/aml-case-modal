import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';

import { CaseStore } from '../core/case-store';
import { ActionTypeId } from '../core/models';

/**
 * Rule 7. Extra actions, uncapped. Recording one of these produces an ordinary
 * outcome card and never re-gates Submit decision - the required set (rule 4)
 * is checked by membership, so extras cannot un-satisfy it.
 */
@Component({
  selector: 'add-action-menu',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      mat-stroked-button
      type="button"
      class="add-btn"
      [matMenuTriggerFor]="menu"
      [disabled]="!store.canAct()"
      (menuOpened)="store.addMenuOpen.set(true)"
      (menuClosed)="store.addMenuOpen.set(false)"
    >
      <mat-icon>add</mat-icon>
      Add action
    </button>

    <mat-menu #menu="matMenu">
      @for (type of extraTypes(); track type.id) {
        <button mat-menu-item type="button" (click)="start(type.id)">
          <span class="item">
            <span class="item__label">{{ type.label }}</span>
            <span class="item__hint">{{ type.hint }}</span>
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .item {
        display: flex;
        flex-direction: column;
        line-height: 1.3;
        padding: 4px 0;
      }
      .item__label {
        font-size: 14px;
        color: var(--ink);
      }
      .item__hint {
        font-size: 12px;
        color: var(--ink-3);
      }
    `,
  ],
})
export class AddActionMenuComponent implements AfterViewInit {
  readonly store = inject(CaseStore);

  @ViewChild(MatMenuTrigger) private trigger?: MatMenuTrigger;
  private readonly viewReady = signal(false);

  constructor() {
    // Lets the dev state switcher land directly on frame 08 with the menu open.
    effect(
      () => {
        const shouldBeOpen = this.store.addMenuOpen();
        if (!this.viewReady()) return;
        const trigger = this.trigger;
        if (!trigger) return;
        if (shouldBeOpen && !trigger.menuOpen) trigger.openMenu();
        if (!shouldBeOpen && trigger.menuOpen) trigger.closeMenu();
      },
      { allowSignalWrites: true },
    );
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  /** The three menu items. `decision` is never here - it has its own footer button. */
  extraTypes() {
    return this.store.actionTypes().filter((t) => t.id !== 'decision');
  }

  start(id: ActionTypeId): void {
    this.store.startRecord(id, false);
  }
}
