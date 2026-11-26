import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
  inject,
} from '@angular/core';

/** 'aml-case' opens the case panel; 'aml-risks' shows the AML dashboard. */
export type MenuTarget = 'aml-case' | 'aml-risks';

interface MenuItem {
  label: string;
  /** Set on the one entry the prototype acts on. Everything else is the host
      app's own navigation, drawn so the entry has its real neighbours. */
  opens?: MenuTarget;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const item = (label: string): MenuItem => ({ label });

/**
 * The player Menu, as production draws it, plus the one addition: AML Case.
 *
 * The groups and their order are production's. The AML entry sits in SG / AML
 * directly under AML Dashboard, its nearest relative, rather than at the end of
 * the column where a new thing would normally be parked.
 */
const GROUPS: readonly MenuGroup[] = [
  {
    title: 'General',
    items: [
      'Overall',
      'Session Statistics',
      'Commentaries',
      'Financial Summary',
      'Transactions',
      'Deposits',
      'Withdraws',
      'Refunds',
      'Documents',
      'Timers',
      'Linked Accounts',
    ].map(item),
  },
  {
    title: 'SG / AML',
    items: [
      item('SG Interactions'),
      item('In-App Messages'),
      item('Trigger Snoozes'),
      item('Alerts'),
      item('Limits & Affordability'),
      { label: 'AML Dashboard', opens: 'aml-risks' },
      { label: 'AML Case', opens: 'aml-case' },
      item('Occupation'),
      item('Reminders'),
    ],
  },
  {
    title: 'Products',
    items: [
      'Jackpot Contributions',
      'Lotto Tickets',
      'Product Summary',
      'Scratch Lines',
      'Casino Lines',
      'Future Buys',
      'Bundles Used',
      'Lotto Lines (Deprecated)',
    ].map(item),
  },
  {
    title: 'Shopping',
    items: ['Active Cart', 'Carts', 'Purchase Orders', 'Top Ups'].map(item),
  },
  {
    title: 'Offers',
    items: [
      'Promotions',
      'Bundle Purchases',
      'Casino Free Spins',
      'Bonus Funds',
      'Bonus Targeting',
      'Bonus Transactions',
      'Promotions (Deprecated)',
      'Campaigns (Deprecated)',
    ].map(item),
  },
  {
    title: 'Insights',
    items: [
      'TransUnion',
      'Session History',
      'Access Snapshots',
      'Analytics',
      'Devices',
      'Links',
      'Logs',
      'SEON',
      'Gbg Requests',
      'Notifications',
      'HooYu (Deprecated)',
      'Sessions (Deprecated)',
      'Aggregated Sessions (Deprecated)',
    ].map(item),
  },
];

@Component({
  selector: 'player-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="pm" #panel tabindex="-1" aria-labelledby="pm-title">
      <h2 class="pm__title" id="pm-title">Menu</h2>

      <div class="pm__groups">
        @for (group of groups; track group.title) {
          <div class="pm__group">
            <h3 class="pm__group-title">{{ group.title }}</h3>
            <ul class="pm__list">
              @for (entry of group.items; track entry.label) {
                <li>
                  @if (entry.opens) {
                    <!-- A button, not a link: the prototype has no routes, so
                         these change what this page shows rather than going
                         anywhere. They wear the link style so the column
                         still reads as one list. -->
                    <button class="pm__link" type="button" (click)="choose.emit(entry.opens)">
                      {{ entry.label }}
                    </button>
                  } @else {
                    <a class="pm__link" href="#" (click)="$event.preventDefault()">
                      {{ entry.label }}
                    </a>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        position: absolute;
        top: 100%;
        left: 20px;
        right: 20px;
        z-index: 20;
      }
      .pm {
        /* --pm-top is where the panel starts, measured when it opens: what
           sits above the bar (the dev harness, the top bar) is not a fixed
           height, so a sum of tokens here would be wrong at some width. */
        max-height: calc(100vh - var(--pm-top, 220px) - 16px);
        padding: var(--lds-core-spacing-6, 24px) var(--lds-core-spacing-10, 40px)
          var(--lds-core-spacing-8, 32px);
        overflow-y: auto;
        overscroll-behavior: contain;
        background: var(--panel);
        color: var(--foreground-primary);
        box-shadow:
          0 1px 2px rgba(24, 24, 27, 0.06),
          0 8px 24px rgba(24, 24, 27, 0.12),
          0 24px 48px rgba(24, 24, 27, 0.08);
        /* It grows out of the Menu button, which sits near the right end of
           the bar above it - so that is the corner it scales from. */
        transform-origin: calc(100% - 140px) 0;
        animation: pm-in 180ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      /* Focus lands on the panel when it opens, so Tab goes straight into the
         list. The panel is not a control, so it shows no ring of its own. */
      .pm:focus,
      .pm:focus-visible {
        outline: none !important;
        box-shadow:
          0 1px 2px rgba(24, 24, 27, 0.06),
          0 8px 24px rgba(24, 24, 27, 0.12),
          0 24px 48px rgba(24, 24, 27, 0.08) !important;
      }
      @keyframes pm-in {
        from {
          opacity: 0;
          transform: translateY(-4px) scale(0.98);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .pm {
          animation: pm-fade 120ms ease-out;
        }
        @keyframes pm-fade {
          from {
            opacity: 0;
          }
        }
      }
      .pm__title {
        margin: 0;
        padding-bottom: var(--lds-core-spacing-2, 8px);
        border-bottom: 1px solid var(--line);
        font-size: 24px;
        line-height: 32px;
        font-weight: 400;
      }
      .pm__groups {
        /* Columns as wide as their longest link, spread across the panel:
           six equal tracks would wrap "Aggregated Sessions (Deprecated)" long
           before they ran out of room for "Carts". When the panel narrows the
           trailing groups drop to a second row instead of squeezing. */
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: var(--lds-core-spacing-6, 24px) var(--lds-core-spacing-8, 32px);
        margin-top: var(--lds-core-spacing-6, 24px);
      }
      .pm__link {
        white-space: nowrap;
      }
      .pm__group-title {
        margin: 0 0 var(--lds-core-spacing-1, 4px);
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
      }
      .pm__list {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .pm__link {
        display: inline-block;
        padding: 3px 0;
        border: 0;
        border-radius: 2px;
        background: none;
        color: var(--link);
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        text-align: left;
        /* No underline at rest. An underline separates a link from the prose
           around it, and nothing here is prose: every item in the panel is a
           link, so fifty rules would mark nothing and only add texture. It
           arrives on hover and on focus, as it does on the modal's link. */
        text-decoration: none;
        text-underline-offset: 2px;
        cursor: pointer;
        /* The modal's link, colour for colour: --link at rest, --link-hover
           under the pointer, on the same 150ms. See .ra-link. */
        transition: color 150ms ease-out;
      }
      @media (hover: hover) and (pointer: fine) {
        .pm__link:hover {
          color: var(--link-hover);
          text-decoration: underline;
        }
      }
      .pm__link:focus-visible {
        text-decoration: underline;
      }
      /* Fingers get a full-height row; a mouse keeps production's density. */
      @media (pointer: coarse) {
        .pm__link {
          padding: 10px 0;
        }
      }
      @media (max-width: 1199.98px) {
        :host {
          left: 16px;
          right: 16px;
        }
      }
      @media (max-width: 719.98px) {
        .pm {
          padding: var(--lds-core-spacing-4, 16px);
        }
        .pm__groups {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--lds-core-spacing-6, 24px) var(--lds-core-spacing-4, 16px);
        }
        .pm__link {
          white-space: normal;
        }
      }
    `,
  ],
})
export class PlayerMenuComponent implements AfterViewInit {
  readonly groups = GROUPS;

  /** One of the live entries was chosen. The header decides what it opens. */
  @Output() readonly choose = new EventEmitter<MenuTarget>();

  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;
    el.style.setProperty('--pm-top', `${Math.round(el.getBoundingClientRect().top)}px`);
    this.panel?.nativeElement.focus({ preventScroll: true });
  }
}
