import { Component, Input, effect, inject, untracked } from '@angular/core';
import { CaseStore } from '../core/case-store';
import { CasesStore } from '../core/cases-store';
import { Trigger } from '../core/models';
import { TriggerStripComponent } from './trigger-strip.component';

/**
 * The modal's trigger strip, in a popover, for one row of the table.
 *
 * The strip is not changed and takes no input: it reads the nearest CaseStore,
 * which in the modal is the root one. This host PROVIDES a CaseStore of its
 * own, so the strip inside it reads this instance - loaded with the row's case
 * by the same loadCase() the modal uses, then expanded, so every trigger shows
 * oldest first. The list is the modal's list by construction: same component,
 * same loader, same case.
 *
 * Live arrivals. That instance is a projection taken when the popover opens,
 * so on its own it would not see a trigger that lands while the panel is up.
 * The effect below watches the collection the table reads and appends what is
 * new since open - by id, and only what arrived after - into this instance.
 * The seeded list is left alone: it is the modal's, and the modal excludes
 * unresynced arrivals at load, which the collection does not.
 */
@Component({
  selector: 'trigger-popover',
  standalone: true,
  imports: [TriggerStripComponent],
  providers: [CaseStore],
  template: `<trigger-strip />`,
  styles: [
    `
      :host {
        display: block;
      }
      /**
       * The strip's items, without the strip's collapse.
       *
       * The divider and its "Show N more" belong to the modal, where two
       * anchors and a gap is the right amount of a case to show beside the
       * workflow. A popover opened to see the list has already asked for all
       * of it: every row, flat, oldest first.
       *
       * ::ng-deep, under :host, because the strip is frozen and offers no
       * input for this: its elements carry its own scope attribute, which the
       * popover's styles cannot otherwise reach. Three classes deep so it
       * outranks the strip's own --expanded rule on specificity, not on the
       * order the two stylesheets happened to load in.
       */
      /* The strip tints its block and rules it off at the bottom: in the modal
         it is one surface among several. In a popover it is the only thing
         there, so it sits on the panel's white with no rule. This panel only -
         the Work popover has no strip, and the modal keeps its ground. */
      :host ::ng-deep trigger-strip .strip {
        background: var(--panel);
        border-bottom: 0;
      }
      :host ::ng-deep .strip .strip__gap-slot {
        display: none;
      }
      /* The list rules the table asked for: a flat list, 12px between items,
         16px padding, 360px then scroll. The strip's row chrome - its rules,
         its gutters, its arrival tint - stays in the modal with its collapse;
         the New badge still says what the tint said. */
      :host ::ng-deep .strip .strip__list {
        display: grid;
        /* One column. The strip's wide layout puts a three-track template on
           this list, and a grid with that template packs three rows per line. */
        grid-template-columns: minmax(0, 1fr);
        row-gap: 12px;
        padding: 0 16px 16px;
        max-height: 360px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: transparent transparent;
      }
      :host ::ng-deep .strip .strip__list:hover,
      :host ::ng-deep .strip .strip__list:focus-visible {
        scrollbar-color: var(--line-strong) transparent;
      }
      :host ::ng-deep .strip .trigger,
      :host ::ng-deep .strip .trigger--new {
        height: auto;
        min-height: 0;
        padding: 0;
        border: 0;
        background: transparent;
      }
      :host ::ng-deep .strip .trigger .cell {
        height: auto;
      }
    `,
  ],
})
export class TriggerPopoverComponent {
  /** This element's own instance - the one the strip inside will inject. */
  private readonly own = inject(CaseStore);
  private readonly collection = inject(CasesStore);

  private id = '';
  /** Ids present when the popover opened. Anything else is an arrival. */
  private seen = new Set<string>();

  @Input({ required: true })
  set caseId(id: string) {
    this.id = id;
    this.own.loadCase(id);
    this.own.triggersExpanded.set(true);
    this.seen = new Set(
      untracked(() => this.collection.byId(id)?.triggers ?? []).map((t) => t.id),
    );
  }

  constructor() {
    effect(
      () => {
        const record = this.collection.byId(this.id);
        if (!record) return;
        const fresh = record.triggers.filter((t) => !this.seen.has(t.id));
        if (fresh.length === 0) return;
        for (const t of fresh) this.seen.add(t.id);
        // isNew: an arrival since the panel opened is, by the modal's own
        // rule, new until the next resync - so it carries the same badge.
        const arrivals: Trigger[] = fresh.map((t) => ({ ...t, isNew: true }));
        this.own.triggers.update((list) => [...list, ...arrivals]);
      },
      { allowSignalWrites: true },
    );
  }
}
