import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { WorkspaceStore } from '../core/workspace-store';

/**
 * The back office surface behind the panels. Each widget opens its own panel
 * and only its own: nothing here ever opens both, so two panels on screen is
 * always something the agent did in two deliberate steps.
 *
 * STYLING IS ONE-TO-ONE WITH FIGMA, not with the rest of this app:
 *   desktop  22263:21255
 *   mobile   22263:20943
 *
 * Which is why the badges and buttons here are written out rather than reusing
 * ui-pill and mat-button. The design's count badge carries a border, its
 * severity badge carries a dot, and its buttons are 32px with a 4px radius -
 * none of which the shared components do. Copying the design into local markup
 * is honest about that; bending the shared components to match would have
 * changed every pill and button in the prototype to serve two widgets.
 *
 * The lock rule from the previous pass still holds: while a panel is open its
 * header owns the lock, so the widget's lock control goes and the primary
 * becomes Close.
 */
@Component({
  selector: 'back-office-widgets',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="widgets">
      <!-- ------------------------------------------------------- SG alerts -->
      <article class="w">
        <span class="w__type w__type--sg">
          <mat-icon fontSet="material-icons-outlined">shield</mat-icon>
        </span>

        <div class="w__inner">
          <div class="w__content">
            <div class="w__titles">
              <h2 class="w__name">SG Alerts</h2>
              <span class="w__count">41 triggers hit</span>
            </div>
            <p class="w__meta">12 snoozed · Last trigger 1mo ago</p>
          </div>

          <!--
            One chip, one place in the DOM. Desktop puts it in the actions
            group, mobile under the meta line - which is the same position in
            both once .w__inner turns from a row into a column, so it does not
            need rendering twice. The design shows NO chip while unlocked, so
            its absence is the unlocked signal rather than an "Unassigned"
            label.
          -->
          <span class="w__chip w__chip--mine">
            <span class="w__avatar" aria-hidden="true">LF</span>
            Locked to you
          </span>

          <div class="w__actions">
            @if (!ws.isOpen('sg')) {
              <button class="w__btn w__btn--compact" type="button">Unlock</button>
            }
            @if (ws.isOpen('sg')) {
              <button class="w__btn" type="button" (click)="ws.close('sg')">Close alert</button>
            } @else {
              <button class="w__btn w__btn--primary" type="button" (click)="ws.open('sg')">
                <mat-icon aria-hidden="true">done</mat-icon>
                Resolve and archive
              </button>
            }
          </div>
        </div>
      </article>

      <!-- -------------------------------------------------------- AML case -->
      <article class="w">
        <span class="w__type" [attr.data-sev]="store.severity()">
          <mat-icon fontSet="material-icons-outlined">business_center</mat-icon>
        </span>

        <div class="w__inner">
          <div class="w__content">
            <div class="w__titles">
              <h2 class="w__name">AML Case</h2>
              <span class="w__sev" [attr.data-sev]="store.severity()">
                <span class="w__dot" aria-hidden="true"></span>
                {{ store.severity() }}
              </span>
            </div>
            <p class="w__meta">#AML-1042 · {{ stage() }} · Opened 12d ago</p>
          </div>

          @if (lockChip(); as chip) {
            <span class="w__chip" [class.w__chip--mine]="chip.mine">
              <span class="w__avatar" aria-hidden="true">{{ chip.initials }}</span>
              {{ chip.label }}
            </span>
          }

          <div class="w__actions">
            @if (!ws.isOpen('aml') && !store.isResolved()) {
              @switch (store.lockState()) {
                @case ('locked-to-me') {
                  <button class="w__btn w__btn--compact" type="button" (click)="store.requestUnlock()">
                    Unlock
                  </button>
                }
                @case ('locked-to-other') {
                  <button class="w__btn w__btn--danger" type="button" (click)="store.requestUnlock()">
                    <mat-icon aria-hidden="true">lock</mat-icon>
                    Force unlock
                  </button>
                }
                @default {
                  <button class="w__btn w__btn--compact" type="button" (click)="store.lock()">
                    Lock
                  </button>
                }
              }
            }
            @if (ws.isOpen('aml')) {
              <button class="w__btn" type="button" (click)="ws.close('aml')">Close case</button>
            } @else if (canOpen()) {
              <button class="w__btn w__btn--primary" type="button" (click)="ws.open('aml')">
                <mat-icon aria-hidden="true">open_in_new</mat-icon>
                Open case
              </button>
            }
          </div>
        </div>
      </article>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /* auto-fit with a min() floor: a track whose floor is wider than the
         container overflows it rather than collapsing to one column. */
      .widgets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        gap: 12px;
      }

      /* ---- card: 22263:21085 ------------------------------------------- */
      .w {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        /* The wrap point belongs to the WIDGET's width, not the window's: two
           widgets sharing a wide viewport are each narrow. */
        container-type: inline-size;
      }

      /* ---- type icon: 32px, 8px radius, tinted by state ----------------- */
      .w__type {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        align-self: flex-start;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--page);
      }
      .w__type--sg {
        background: #e6f1fb;
      }
      .w__type[data-sev='AML'] {
        background: var(--sev-aml-bg);
      }
      .w__type[data-sev='EDD'] {
        background: var(--sev-edd-bg);
      }
      .w__type[data-sev='COMPLIANCE'] {
        background: var(--sev-compliance-bg);
      }
      .w__type mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        color: var(--ink);
      }

      /* ---- inner: content then actions ---------------------------------- */
      .w__inner {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .w__content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .w__titles {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .w__name {
        flex: 0 1 auto;
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

      /* ---- count badge: 22263:21125 ------------------------------------- */
      .w__count {
        flex: 0 1 auto;
        min-width: 0;
        padding: 2px 8px;
        border: 1px solid var(--line);
        border-radius: 100px;
        background: var(--page);
        font-size: 12px;
        line-height: 16px;
        color: var(--ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ---- severity badge: dot + label, 22263:21188 --------------------- */
      .w__sev {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 1 auto;
        min-width: 0;
        padding: 2px 6px;
        border: 1px solid transparent;
        border-radius: 100px;
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .w__dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
      }
      .w__sev[data-sev='AML'] {
        background: var(--sev-aml-bg);
        border-color: #fecaca;
        color: var(--sev-aml);
      }
      .w__sev[data-sev='EDD'] {
        background: var(--sev-edd-bg);
        border-color: #fee685;
        color: var(--sev-edd);
      }
      .w__sev[data-sev='COMPLIANCE'] {
        background: #f2edff;
        border-color: #e2e0ff;
        color: var(--sev-compliance);
      }

      /* ---- meta line: first to truncate --------------------------------- */
      .w__meta {
        margin: 0;
        min-width: 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--ink-3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ---- lock chip: 22263:21143 --------------------------------------- */
      .w__chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        flex: none;
        align-self: flex-start;
        height: 32px;
        max-width: 220px;
        padding: 4px 8px 4px 4px;
        border-radius: 99px;
        background: var(--page);
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        color: var(--ink-3);
        white-space: nowrap;
      }
      .w__chip--mine {
        background: var(--success-bg-subtle);
        color: var(--success);
      }
      .w__avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 24px;
        height: 24px;
        border-radius: 9999px;
        background: #71717a;
        color: #fff;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0;
      }
      .w__chip--mine .w__avatar {
        background: var(--foreground-success);
      }

      /* ---- buttons: 32px, 4px radius ------------------------------------ */
      .w__actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }
      .w__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex: none;
        height: 32px;
        padding: 0 16px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: var(--panel);
        font: inherit;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
        cursor: pointer;
      }
      .w__btn:hover {
        background: var(--page);
      }
      /* Lock / Unlock are the compact variant in the design: 13px on 12px of
         padding rather than 14px on 16px. */
      .w__btn--compact {
        padding: 0 12px;
        font-size: 13px;
        line-height: 16px;
      }
      .w__btn--primary {
        border-color: transparent;
        background: var(--primary);
        color: #fff;
      }
      .w__btn--primary:hover {
        background: var(--primary-ink);
      }
      .w__btn--danger {
        color: var(--danger);
      }
      .w__btn mat-icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      /**
       * Narrow: the mobile node, 22263:20943.
       *
       * The threshold is the desktop node's own card width, 640px, expressed
       * as a container width: a size container measures its CONTENT box, so
       * 640 outer minus 24px of padding and 2px of border is 614. Writing 640
       * here put a 646px card into the mobile layout. Below it
       * the desktop row cannot hold the design's own content - icon, chip,
       * Unlock and the primary come to about 552px, leaving the identity block
       * a dozen pixels - so this is where the design stops applying, measured
       * rather than picked.
       *
       * It has to be a CONTAINER query, and it is the one already in this
       * file rather than a new breakpoint: between 720px and roughly 1130px of
       * viewport the two widgets share a row at under 640px each, which no
       * viewport query can see because the viewport is wide while the widget
       * is not.
       *
       * Content and actions become two rows, the lock chip moves under the meta
       * line inside the content column, and the chip steps down to 24px with a
       * 20px avatar. Driven by the widget's own width rather than the
       * viewport's, so two widgets sharing a 1440px screen get it too - which
       * is the case a viewport query cannot see.
       */
      @container (max-width: 613.98px) {
        .w {
          align-items: flex-start;
        }
        .w__inner {
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
        }
        .w__content {
          min-width: 140px;
        }
        .w__actions {
          flex-wrap: wrap;
        }
        .w__chip {
          height: 24px;
          gap: 6px;
          padding: 0 8px 0 4px;
        }
        .w__avatar {
          width: 20px;
          height: 20px;
        }
        /* Mobile node draws the buttons at 8px, desktop at 4px - see the note
           in the commit. Each node governs its own width. */
        .w__btn {
          border-radius: 8px;
        }
      }

      /* Below the panel's own reflow point the two widgets stop sharing a row.
         Same breakpoint as the segmented layout and the 16px gutters. */
      @media (max-width: 719.98px) {
        .widgets {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class BackOfficeWidgetsComponent {
  readonly ws = inject(WorkspaceStore);
  readonly store = inject(CaseStore);

  /** "Open" / "In progress" / "Resolved", per the design's meta line. */
  readonly stage = computed(() => {
    if (this.store.isResolved()) return 'Resolved';
    return this.store.stream().length > 0 ? 'In progress' : 'Open';
  });

  /**
   * The lock chip, or null when there is no holder.
   *
   * Null rather than an "Unassigned" label: the design shows no chip at all in
   * the unlocked state, and the Lock button is the signal instead.
   */
  readonly lockChip = computed<{ label: string; initials: string; mine: boolean } | null>(() => {
    if (this.store.isResolved()) return null;
    switch (this.store.lockState()) {
      case 'locked-to-me':
        return { label: 'Locked to you', initials: 'LF', mine: true };
      case 'locked-to-other': {
        const name = this.store.lockOwner()?.name ?? 'another agent';
        return { label: `Locked to ${name}`, initials: initialsOf(name), mine: false };
      }
      default:
        return null;
    }
  });

  /** Rule 3: the case must be locked to you before it can be opened. */
  readonly canOpen = computed(() => this.store.lockState() === 'locked-to-me');
}

function initialsOf(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
