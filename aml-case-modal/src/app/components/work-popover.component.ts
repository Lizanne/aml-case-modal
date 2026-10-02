import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CasesStore } from '../core/cases-store';
import { StampPipe } from '../core/format';
import { WorkItem } from '../core/models';

interface WorkEntry extends WorkItem {
  key: string;
  label: string;
  /** The first recorded entry after a to-do block: it opens the second group. */
  opensDone: boolean;
}

/**
 * The Work count's popover: the case's actions, and only its actions.
 *
 * Not the modal's Timeline. That list also carries the case being created,
 * triggers arriving, severity changes, locks and resyncs - the case's history.
 * This is the work on it: every recorded action, required or custom, newest
 * first as the modal orders its timeline, with the required actions still to
 * do in a block above them - unticked, no timestamp, because they have not
 * happened yet.
 *
 * Read from the collection, the same record the row reads, so the popover is
 * live by construction: an action recorded in the modal writes through to the
 * collection and appears here with its stamp and agent.
 *
 * Same list as the Triggers popover: 12px between entries, 16px padding, no
 * rules, 360px then scroll with a thin bar that shows on hover.
 */
@Component({
  selector: 'work-popover',
  standalone: true,
  imports: [MatIconModule, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="list" role="list" aria-label="Work on this case">
      @for (w of items(); track w.key) {
        <li
          class="entry"
          [class.entry--done]="w.state === 'done'"
          [class.entry--opens-done]="w.opensDone"
          role="listitem"
        >
          <span class="entry__name">
            <!-- The state is in the glyph AND the position: done is ticked and
                 below, to do is an empty ring and above. The second line is
                 the third signal - a to-do has no stamp to show. -->
            <mat-icon class="entry__mark" aria-hidden="true">{{
              w.state === 'done' ? 'check_circle' : 'radio_button_unchecked'
            }}</mat-icon>
            {{ w.label }}
            <span class="sr-only">{{ w.state === 'done' ? ', done' : ', to do' }}</span>
          </span>
          @if (w.state === 'done' && w.at) {
            <span class="entry__meta">
              <time [attr.datetime]="w.at">{{ w.at | stamp }}</time>
              @if (w.by) {
                <span aria-hidden="true"> · </span><span>{{ w.by }}</span>
              }
            </span>
          }
        </li>
      }
    </ol>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .list {
        display: grid;
        row-gap: 12px;
        margin: 0;
        padding: 0 16px 16px;
        list-style: none;
        max-height: 360px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: transparent transparent;
      }
      .list:hover,
      .list:focus-visible {
        scrollbar-color: var(--line-strong) transparent;
      }
      .entry {
        display: grid;
        row-gap: 2px;
        min-width: 0;
      }
      /* 12 within a group, 20 between the two: the grid gives the 12, and
         the first recorded entry after a to-do block adds the other 8. */
      .entry--opens-done {
        margin-top: 8px;
      }
      .entry__name {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--foreground-primary);
      }
      .entry--done .entry__name {
        font-weight: 400;
      }
      .entry__mark {
        flex: none;
        width: 16px;
        height: 16px;
        font-size: 16px;
        line-height: 16px;
        color: var(--foreground-subtle);
      }
      .entry--done .entry__mark {
        color: var(--foreground-secondary);
      }
      /* The tick is 16 and the text starts 20 in; the second line starts
         under the text, not under the glyph. */
      .entry__meta {
        padding-left: 20px;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
      /* Tabular figures, so a column of stamps lines up digit under digit. */
      .entry__meta time {
        font-variant-numeric: tabular-nums;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `,
  ],
})
export class WorkPopoverComponent {
  private readonly cases = inject(CasesStore);
  private readonly id = signal('');

  @Input({ required: true })
  set caseId(id: string) {
    this.id.set(id);
  }

  /**
   * To do above, done below. Done newest first - the order the modal gives
   * its timeline - and the to-do block in the required order, as the row.
   */
  readonly items = computed<WorkEntry[]>(() => {
    const c = this.cases.byId(this.id());
    if (!c) return [];
    const label = (w: WorkItem) => this.cases.workLabel(w.type);
    const todo = this.cases.requiredWork(c).filter((w) => w.state === 'todo');
    const done = c.actions
      .filter((w) => w.state === 'done')
      .sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''));
    return [...todo, ...done].map((w, i) => ({
      ...w,
      key: `${w.type}-${w.at ?? 'todo'}-${i}`,
      label: label(w),
      opensDone: todo.length > 0 && i === todo.length,
    }));
  });
}
