import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CasesStore } from '../core/cases-store';
import { StampPipe } from '../core/format';
import { WorkItem } from '../core/models';

interface WorkEntry extends WorkItem {
  key: string;
  label: string;
}

let popoverSeq = 0;

/**
 * The Work count's popover: the case's actions, and only its actions.
 *
 * Not the modal's Timeline. That list also carries the case being created,
 * triggers arriving, severity changes, locks and resyncs - the case's history.
 * This is the work on it, in two labelled groups: the required actions still
 * TO DO, unticked and without a stamp because they have not happened; and
 * everything COMPLETED, required or custom, newest first as the modal orders
 * its timeline. Each label carries its group's count, live. An empty group
 * is not shown; with both empty the popover says so.
 *
 * Read from the collection, the same record the row reads, so the popover is
 * live by construction: an action recorded in the modal writes through to the
 * collection and moves here with its stamp and agent.
 *
 * Same list as the Triggers popover: 12px between entries, 16px padding, no
 * rules, 360px then scroll with a thin bar that shows on hover. Eight between
 * a label and its first entry; twenty above the second label.
 */
@Component({
  selector: 'work-popover',
  standalone: true,
  imports: [MatIconModule, StampPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (todo().length === 0 && done().length === 0) {
      <p class="empty">No work items</p>
    } @else {
      <div class="groups">
        @if (todo().length > 0) {
          <section class="group" [attr.aria-labelledby]="todoId">
            <p class="group__label" [id]="todoId">To do ({{ todo().length }})</p>
            <ol class="list" role="list">
              @for (w of todo(); track w.key) {
                <li class="entry" role="listitem">
                  <span class="entry__name">
                    <!-- An empty ring: the state is in the glyph, the group
                         label, and the missing second line. -->
                    <mat-icon class="entry__mark" aria-hidden="true">radio_button_unchecked</mat-icon>
                    {{ w.label }}
                  </span>
                </li>
              }
            </ol>
          </section>
        }
        @if (done().length > 0) {
          <section class="group" [attr.aria-labelledby]="doneId">
            <p class="group__label" [id]="doneId">Completed ({{ done().length }})</p>
            <ol class="list" role="list">
              @for (w of done(); track w.key) {
                <li class="entry entry--done" role="listitem">
                  <span class="entry__name">
                    <!-- The same Round outlined check the row draws. -->
                    <svg class="entry__mark" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
                      <path d="M8.00016 1.33331C4.32016 1.33331 1.3335 4.31998 1.3335 7.99998C1.3335 11.68 4.32016 14.6666 8.00016 14.6666C11.6802 14.6666 14.6668 11.68 14.6668 7.99998C14.6668 4.31998 11.6802 1.33331 8.00016 1.33331ZM8.00016 13.3333C5.06016 13.3333 2.66683 10.94 2.66683 7.99998C2.66683 5.05998 5.06016 2.66665 8.00016 2.66665C10.9402 2.66665 13.3335 5.05998 13.3335 7.99998C13.3335 10.94 10.9402 13.3333 8.00016 13.3333ZM10.5868 5.52665L6.66683 9.44665L5.4135 8.19331C5.1535 7.93331 4.7335 7.93331 4.4735 8.19331C4.2135 8.45331 4.2135 8.87331 4.4735 9.13331L6.20016 10.86C6.46016 11.12 6.88016 11.12 7.14016 10.86L11.5335 6.46665C11.7935 6.20665 11.7935 5.78665 11.5335 5.52665C11.2735 5.26665 10.8468 5.26665 10.5868 5.52665Z" />
                    </svg>
                    {{ w.label }}
                  </span>
                  @if (w.at) {
                    <!-- One line. A long agent name ellipsises and the full
                         "stamp · agent" sits on the title. -->
                    <span class="entry__meta" [attr.title]="(w.at | stamp) + (w.by ? ' · ' + w.by : '')">
                      <time [attr.datetime]="w.at">{{ w.at | stamp }}</time>
                      @if (w.by) {
                        <span aria-hidden="true"> · </span><span>{{ w.by }}</span>
                      }
                    </span>
                  }
                </li>
              }
            </ol>
          </section>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /* The scroll region holds both groups: one window, not one per group. */
      .groups {
        padding: 0 16px 16px;
        max-height: 360px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: transparent transparent;
      }
      .groups:hover,
      .groups:focus-visible {
        scrollbar-color: var(--line-strong) transparent;
      }
      .group {
        display: grid;
        /* Eight between the label and its first entry. */
        row-gap: 8px;
      }
      /* Twenty above the second label. */
      .group + .group {
        margin-top: 20px;
      }
      /**
       * 12/16 at 600, muted, tracked and uppercased by the stylesheet - the
       * text stays "To do (2)" for a reader and for the verifier. The count
       * is part of the label, so it is announced with the group's name.
       */
      .group__label {
        margin: 0;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--foreground-secondary);
      }
      .list {
        display: grid;
        row-gap: 12px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .entry {
        display: grid;
        row-gap: 2px;
        min-width: 0;
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
      /* The ring takes the name's ink: a to-do is one thing, mark and name
         alike. Done is the quieter pair, below. */
      .entry__mark {
        flex: none;
        width: 16px;
        height: 16px;
        font-size: 16px;
        line-height: 16px;
        color: var(--foreground-primary);
      }
      .entry--done .entry__mark {
        color: var(--foreground-secondary);
      }
      /* The tick is 16 and the text starts 20 in; the second line starts
         under the text, not under the glyph. */
      .entry__meta {
        min-width: 0;
        padding-left: 20px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
      /* Tabular figures, so a column of stamps lines up digit under digit. */
      .entry__meta time {
        font-variant-numeric: tabular-nums;
      }
      .empty {
        margin: 0;
        padding: 0 16px 16px;
        font-size: 14px;
        line-height: 20px;
        color: var(--foreground-secondary);
      }
    `,
  ],
})
export class WorkPopoverComponent {
  private readonly cases = inject(CasesStore);
  private readonly id = signal('');
  private readonly seq = ++popoverSeq;
  readonly todoId = `work-todo-${this.seq}`;
  readonly doneId = `work-done-${this.seq}`;

  @Input({ required: true })
  set caseId(id: string) {
    this.id.set(id);
  }

  private readonly record = computed(() => this.cases.byId(this.id()));

  private entry(w: WorkItem, i: number): WorkEntry {
    return { ...w, key: `${w.type}-${w.at ?? 'todo'}-${i}`, label: this.cases.workLabel(w.type) };
  }

  /** The required actions still to do, in the required order - as the row. */
  readonly todo = computed<WorkEntry[]>(() => {
    const c = this.record();
    if (!c) return [];
    return this.cases.requiredWork(c).filter((w) => w.state === 'todo').map((w, i) => this.entry(w, i));
  });

  /** Everything recorded, newest first - the order the modal gives its timeline. */
  readonly done = computed<WorkEntry[]>(() => {
    const c = this.record();
    if (!c) return [];
    return c.actions
      .filter((w) => w.state === 'done')
      .sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''))
      .map((w, i) => this.entry(w, i));
  });
}
