import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

interface NavItem {
  label: string;
  count?: number;
  expandable?: boolean;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

/**
 * The back-office left navigation, per frame 09.
 *
 * Static, and deliberately so: it is the surrounding product, not this epic.
 * What it owes the prototype is that it stays PRESENT and CLICKABLE while a
 * panel is open - the panels dock beside it rather than over it, so an agent
 * can still see where they are and leave.
 */
@Component({
  selector: 'side-nav',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="nav" aria-label="Back office">
      @for (group of groups; track group.heading) {
        <p class="nav__heading">{{ group.heading }}</p>
        <ul class="nav__list">
          @for (item of group.items; track item.label) {
            <li>
              <button class="nav__item" type="button">
                <span class="nav__label">{{ item.label }}</span>
                @if (item.count !== undefined) {
                  <span class="nav__count">{{ item.count }}</span>
                }
                @if (item.expandable) {
                  <mat-icon class="nav__caret" aria-hidden="true">chevron_right</mat-icon>
                }
              </button>
            </li>
          }
        </ul>
      }
    </nav>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        background: var(--panel);
        border-right: 1px solid var(--line);
      }
      /* Scrolls on its own. The page behind is locked while a panel is open,
         so this is the only thing left that may scroll besides the panels. */
      .nav {
        height: 100%;
        overflow-y: auto;
        padding: 8px 16px 24px;
      }
      .nav__heading {
        margin: 16px 0 4px;
        padding: 0 12px;
        font-size: 14px;
        line-height: 24px;
        font-weight: 700;
        color: var(--ink);
      }
      .nav__heading:first-child {
        margin-top: 4px;
      }
      .nav__list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .nav__item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 44px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        font: inherit;
        font-size: 16px;
        line-height: 24px;
        color: var(--ink-2);
        text-align: left;
        cursor: pointer;
      }
      .nav__item:hover {
        background: var(--page);
      }
      .nav__item:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .nav__label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nav__count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--primary);
        color: #fff;
        font-size: 12px;
        line-height: 20px;
        font-weight: 600;
      }
      mat-icon.nav__caret {
        flex: none;
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--ink-3);
      }
    `,
  ],
})
export class SideNavComponent {
  readonly groups: NavGroup[] = [
    {
      heading: 'Players',
      items: [
        { label: 'Alerts', count: 2 },
        { label: 'Triggered snoozes' },
        { label: 'Sessions' },
        { label: 'Documents', count: 8 },
        { label: 'Timers' },
        { label: 'Tags' },
        { label: 'Commentary' },
        { label: 'Diagnostics' },
        { label: 'Duplicate links', count: 12 },
      ],
    },
    {
      heading: 'Payments',
      items: [{ label: 'Deposits' }, { label: 'Withdrawals', count: 75 }],
    },
    {
      heading: 'Gaming',
      items: [
        { label: 'Casino', expandable: true },
        { label: 'Lottos V2', expandable: true },
        { label: 'Lottos', expandable: true },
        { label: 'Scratch', expandable: true },
        { label: 'Bundles', expandable: true },
      ],
    },
    {
      heading: 'Offers',
      items: [
        { label: 'Promotions' },
        { label: 'Promotions V2' },
        { label: 'Promotions mappings' },
        { label: 'Test Users' },
        { label: 'Campaigns' },
      ],
    },
  ];
}
