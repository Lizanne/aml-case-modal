import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { CaseStore } from '../core/case-store';
import { WorkspaceStore } from '../core/workspace-store';
import { NavStore } from '../core/nav-store';
import { MenuTarget, PlayerMenuComponent } from './player-menu.component';

/**
 * The black player bar, per frame 09.
 *
 * The panels anchor directly beneath this, so its height is part of the
 * layout contract rather than decoration: see .shell__main in app.component.
 */
@Component({
  selector: 'player-header',
  standalone: true,
  imports: [MatIconModule, PlayerMenuComponent],
  host: {
    '(document:pointerdown)': 'onOutsidePress($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ph">
      <button class="ph__icon" type="button" aria-label="Back to players">
        <mat-icon>chevron_left</mat-icon>
      </button>
      <span class="ph__flag" aria-hidden="true">🇬🇧</span>
      <h1 class="ph__title">
        {{ store.player().name }} #{{ store.player().id }}
        <span class="ph__state">(ENABLED)</span>
      </h1>

      <!-- A disclosure, not a menu role: what it reveals is a page of links,
           and aria-expanded on the button is the whole contract. -->
      <button
        #menuButton
        class="ph__action"
        type="button"
        aria-controls="player-menu"
        [attr.aria-expanded]="menuOpen()"
        (click)="menuOpen.set(!menuOpen())"
      >
        <mat-icon aria-hidden="true">menu</mat-icon>
        Menu
      </button>
      <button class="ph__action" type="button">
        <mat-icon>more_vert</mat-icon>
        Actions
      </button>
      <button class="ph__icon" type="button" aria-label="Refresh">
        <mat-icon>refresh</mat-icon>
      </button>
    </div>

    @if (menuOpen()) {
      <player-menu id="player-menu" (choose)="onChoose($event)" />
    }
  `,
  styles: [
    `
      /* The Menu panel hangs from the bar's bottom edge and has to sit over
         the page and its panels, so the bar is its positioning context. */
      :host {
        display: block;
        position: relative;
        z-index: 20;
      }
      .ph {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 64px;
        padding: 0 12px 0 16px;
        background: var(--player-bar);
        color: var(--player-bar-ink);
      }
      .ph__flag {
        flex: none;
        font-size: 22px;
        line-height: 1;
      }
      /* The only h1 on the page: the player is what the page is about. The
         modal's own heading is an h2 under it. */
      .ph__title {
        flex: 1;
        min-width: 0;
        margin: 0 8px;
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ph__state {
        font-weight: 400;
      }
      .ph__icon,
      .ph__action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex: none;
        height: 36px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .ph__icon,
      .ph__action {
        transition:
          background-color 150ms ease,
          transform 120ms ease-out;
      }
      .ph__icon:active,
      .ph__action:active {
        transform: scale(0.97);
      }
      .ph__action[aria-expanded='true'] {
        background: rgba(255, 255, 255, 0.16);
      }
      @media (prefers-reduced-motion: reduce) {
        .ph__icon,
        .ph__action {
          transition: none;
        }
        .ph__icon:active,
        .ph__action:active {
          transform: none;
        }
      }
      .ph__icon {
        width: 36px;
      }
      .ph__action {
        padding: 0 12px;
      }
      .ph__icon:hover,
      .ph__action:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .ph__icon mat-icon,
      .ph__action mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
      }

      /* Narrow: the labels go, the targets stay. */
      @media (max-width: 719.98px) {
        .ph {
          /* One 16px gutter on a phone, everywhere. */
          padding: 0 16px;
          height: 56px;
        }
        .ph__action {
          width: 36px;
          padding: 0;
          font-size: 0;
          gap: 0;
        }
      }
    `,
  ],
})
export class PlayerHeaderComponent {
  readonly store = inject(CaseStore);
  private readonly ws = inject(WorkspaceStore);
  private readonly nav = inject(NavStore);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly menuOpen = signal(false);

  @ViewChild('menuButton') private menuButton?: ElementRef<HTMLButtonElement>;

  /**
   * The AML entry point: Menu, SG / AML, AML Case.
   *
   * The same call the widget's Open case makes, so the panel arrives the same
   * way from either place and takes focus itself - which is why this does not
   * hand focus back to the Menu button the way Escape does.
   */
  onChoose(target: MenuTarget): void {
    this.menuOpen.set(false);
    if (target === 'aml-case') {
      this.ws.open('aml');
      return;
    }
    // AML Risks: the dashboard is the page, so a panel standing on it would
    // hide the thing just asked for. The panels step down to their bars - not
    // closed, nothing in them is lost - and focus goes to the dashboard.
    for (const id of this.ws.visibleOrder()) this.ws.minimise(id);
    this.nav.showSection('aml-risks');
    setTimeout(() => document.querySelector<HTMLElement>('aml-dashboard')?.focus());
  }

  onOutsidePress(event: Event): void {
    if (!this.menuOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  /** Tabbing out of the last link leaves the menu, so the menu goes too. */
  onFocusOut(event: FocusEvent): void {
    if (!this.menuOpen()) return;
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) this.menuOpen.set(false);
  }

  onEscape(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.menuButton?.nativeElement.focus();
  }
  /** From the frame. Not in the fixture - it is host-app data, not case data. */
  /**
   * Removed: the account number was a constant, so every player showed one
   * number. Now that the table can open any player's details, it has to be
   * the loaded player's own id - which is the 15-digit account number.
   */
}
