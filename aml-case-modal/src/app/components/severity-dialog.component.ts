import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import { CaseStore } from '../core/case-store';
import { SEVERITY_LABEL, SEVERITY_ORDER, Severity, severityDirection } from '../core/models';
import { DialogShellComponent } from './dialog-shell.component';
import { PillComponent } from './ui-pill.component';

/** Most severe first, straight from the ranking - never an ad-hoc list. */
const ALL_SEVERITIES: readonly Severity[] = SEVERITY_ORDER;

/**
 * Rule 8. Always reachable while the case is open.
 *
 * The dialog has to say two things plainly before the agent commits: whether
 * this is an escalation or a de-escalation, and that saving lifts the lock.
 */
@Component({
  selector: 'severity-dialog',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatRadioModule, DialogShellComponent, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog-shell heading="Adjust severity" (dismiss)="close()">
      <div class="pair">
        <ui-pill [severity]="store.severity()">
          {{ label(store.severity()) }}
        </ui-pill>
        <mat-icon class="pair__arrow">arrow_forward</mat-icon>
        @if (target(); as to) {
          <ui-pill [severity]="to">{{ label(to) }}</ui-pill>
          <ui-pill tone="warn" [attr.data-direction]="direction()">
            <!-- The word beside it already names the direction. -->
            <mat-icon class="badge__arrow" aria-hidden="true">{{
              direction() === 'escalation' ? 'arrow_upward' : 'arrow_downward'
            }}</mat-icon>
            {{ direction() === 'escalation' ? 'Escalation' : 'De-escalation' }}
          </ui-pill>
        } @else {
          <ui-pill tone="dashed">Choose</ui-pill>
        }
      </div>

      <mat-radio-group class="choices" [value]="target()" (change)="target.set($any($event).value)">
        @for (option of options(); track option) {
          <mat-radio-button [value]="option">{{ label(option) }}</mat-radio-button>
        }
      </mat-radio-group>

      <label class="field">
        <span class="field__label">Reason <span class="field__req">required</span></span>
        <textarea
          class="field__input"
          rows="3"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
          placeholder="Why is the severity changing?"
        ></textarea>
      </label>

      <p class="warn-note">
        <mat-icon>lock_open</mat-icon>
        The lock is lifted on severity change. You can lock the case again from the header.
      </p>

      <ng-container dialogActions>
        <button mat-button type="button" (click)="close()">Cancel</button>
        <button mat-flat-button color="primary" type="button" [disabled]="!valid()" (click)="save()">
          Save severity
        </button>
      </ng-container>
    </dialog-shell>
  `,
  styles: [
    `
      .pair {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        padding: 4px 0 16px;
      }
      /* mat-icon.<class>, not just .<class>: Material's own .mat-icon rule sets
         24px at the same class specificity, so the element tag is what wins.
         ui-pill deliberately does not size projected icons - the caller does. */
      mat-icon.badge__arrow {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .pair__arrow {
        color: var(--ink-3);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .choices {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        padding-bottom: 8px;
      }
      .field {
        display: grid;
        gap: 6px;
      }
      .field__label {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--ink);
      }
      .field__req {
        font-weight: 400;
        font-size: 12px;
        color: var(--ink-3);
        margin-left: 6px;
      }
      .field__input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        font: inherit;
        font-size: 14px;
        color: var(--ink);
        resize: vertical;
      }
      .field__input:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -1px;
        border-color: var(--primary);
      }
      .warn-note {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 16px 0 4px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--warn-bg);
        color: var(--warn);
        font-size: 14px;
        line-height: 20px;
      }
      .warn-note mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex: none;
      }
    `,
  ],
})
export class SeverityDialogComponent {
  readonly store = inject(CaseStore);

  readonly target = signal<Severity | null>(null);
  readonly reason = signal('');

  readonly options = computed(() => ALL_SEVERITIES.filter((s) => s !== this.store.severity()));

  readonly direction = computed(() => {
    const to = this.target();
    return to ? severityDirection(this.store.severity(), to) : null;
  });

  readonly valid = computed(() => this.target() !== null && this.reason().trim().length > 0);

  label(severity: Severity): string {
    return SEVERITY_LABEL[severity];
  }

  save(): void {
    const to = this.target();
    if (!to || !this.valid()) return;
    this.store.changeSeverity(to, this.reason());
    this.reset();
  }

  close(): void {
    this.store.openDialog.set(null);
    this.reset();
  }

  private reset(): void {
    this.target.set(null);
    this.reason.set('');
  }
}
