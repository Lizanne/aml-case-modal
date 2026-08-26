import { Injectable, computed, effect, signal } from '@angular/core';

import { MODAL_GAP_PX, SOLO_WIDTH_CSS, STACK_AUTO_MINIMISE_PX } from './models';

export type ModalId = 'sg' | 'aml';

export interface ModalState {
  /**
   * The underlying alert or case EXISTS on this surface.
   *
   * Separate from `open`, and the two are not degrees of the same thing.
   * `open` is whether its panel is on screen; this is whether there is
   * anything to open. A widget renders on `present`, so closing a panel puts
   * its widget back rather than taking the item off the surface - the only
   * thing that removes a widget is the alert or case ceasing to exist, which
   * is what this flag says and `open` never could.
   *
   * The two used to be one boolean, which is why closing the SG panel deleted
   * the SG widget with it and left no way back to the alert.
   */
  present: boolean;
  open: boolean;
  minimised: boolean;
}

/** Not on the surface at all: no panel, and no widget either. */
const ABSENT: ModalState = { present: false, open: false, minimised: false };

/**
 * On the surface, panel down.
 *
 * The base a seeded scenario starts from, so naming an item in a seed patch is
 * what brings it into existence. close() does NOT use this - it patches `open`
 * and `minimised` alone and leaves presence exactly as it found it.
 */
const CLOSED: ModalState = { present: true, open: false, minimised: false };

/**
 * Window management for the back office surface: which modals are open, which
 * are minimised to their dock bar, and how wide each one gets.
 *
 * Deliberately separate from CaseStore. CaseStore owns the AML case and its
 * rules; this owns the furniture. The AML modal's layout mode is then a pure
 * consequence of the width this hands it - there is no "dual mode" flag
 * anywhere, because dual mode is not a mode. It is what you get when two
 * modals are open at once.
 *
 * Docking is SLOT-BASED: an item claims a column when it joins the surface and
 * keeps it until it leaves. There are still no fixed sides - which panel sits
 * where is a consequence of arrival order - but arrival means arriving on the
 * SURFACE, not arriving on the stage.
 *
 * That distinction did not exist while closing a panel also removed its widget:
 * a closed item had nothing left in its column, so releasing the slot cost
 * nothing and a re-open could reasonably count as a fresh arrival. Now the
 * widget stays, holding the column and offering the button that reopens it, so
 * a slot released on close would send the panel back up under the OTHER item's
 * widget. Restore already refused to jump sides on the way back; close and
 * re-open follow the same rule for the same reason.
 *
 * The widget row reads its order from here too, which is what keeps every card
 * over its own panel without either side counting the other's items.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly _sg = signal<ModalState>({ ...ABSENT });
  private readonly _aml = signal<ModalState>({ ...ABSENT });

  readonly sg = this._sg.asReadonly();
  readonly aml = this._aml.asReadonly();

  /**
   * Slot order, oldest first. Drives which side each panel docks to - and,
   * because the widget row reads from it too, which side each CARD sits on.
   *
   * A slot is claimed the first time an item appears on the surface and held
   * until it leaves it. Closing a panel does not give the slot up: the item is
   * still present, its widget is still on the row holding that column, and a
   * panel that came back on the other side of the screen from its own widget
   * would be the surprise the restore rule already refuses to spring.
   *
   * It used to be released on close, on the argument that a re-open is a fresh
   * arrival and belongs on the right. That was true while closing also deleted
   * the widget - there was nothing left in the slot to contradict. There is
   * now.
   */
  private readonly _order = signal<ModalId[]>([]);

  /** Measured width of the stage the modals live in. */
  readonly stageWidth = signal(1400);

  /**
   * The panel that was just opened by an agent, so it can take focus.
   *
   * Set by open()/restore() only, never by seed(): a dev scenario that lands
   * with a panel already up has not "opened" anything, and stealing focus
   * there would put the keyboard user past the skip link before they have
   * pressed a key.
   */
  readonly pendingFocus = signal<ModalId | null>(null);

  /** Set briefly when a bar is auto-minimised, so it can pulse once. */
  readonly pulsingBar = signal<ModalId | null>(null);
  private pulseTimer?: ReturnType<typeof setTimeout>;

  readonly sgVisible = computed(() => this._sg().open && !this._sg().minimised);
  readonly amlVisible = computed(() => this._aml().open && !this._aml().minimised);

  readonly visibleCount = computed(() => (this.sgVisible() ? 1 : 0) + (this.amlVisible() ? 1 : 0));

  /**
   * The panels on the stage, in the order they dock: oldest left, newest
   * right. The template renders straight from this, so docking needs no side
   * rule anywhere - position IS order.
   */
  readonly visibleOrder = computed<ModalId[]>(() =>
    this._order().filter((id) => (id === 'sg' ? this.sgVisible() : this.amlVisible())),
  );

  /** Bars stack in fixed order too: SG above AML. */
  readonly minimisedBars = computed<ModalId[]>(() => {
    const bars: ModalId[] = [];
    if (this._sg().open && this._sg().minimised) bars.push('sg');
    if (this._aml().open && this._aml().minimised) bars.push('aml');
    return bars;
  });

  /**
   * The width each visible modal is given.
   *
   * Computed as a target rather than read back from the DOM. Reading the live
   * width during the 300ms reflow would sweep it through the 720px breakpoint
   * and flip the AML panel layout mid-animation; the target is stable from the
   * first frame, so the panels reflow once, cleanly.
   */
  readonly modalWidth = computed(() => {
    const stage = this.stageWidth();
    if (this.visibleCount() === 2) {
      return Math.max(0, Math.floor((stage - MODAL_GAP_PX) / 2));
    }
    return stage;
  });

  /**
   * The width a panel is actually GIVEN, as CSS relative to the stage.
   *
   * Deliberately not the pixel number above. The stage is the same box the
   * widget row fills, so a panel expressed relative to it tracks the row by
   * construction - there is no second measurement that could round differently
   * or lag a resize by a frame.
   *
   * A solo panel stops at SOLO_MAX_PX and the stage docks it right, so its
   * RIGHT edge stays on the row's right edge while the left pulls in. Two
   * panels still split the whole row.
   *
   * modalWidth stays, but only to decide the 720px layout rule. It sizes
   * nothing.
   */
  readonly panelCss = computed(() =>
    this.visibleCount() === 2 ? `calc(50% - ${MODAL_GAP_PX / 2}px)` : SOLO_WIDTH_CSS,
  );

  /**
   * The widget row's width: the box the PANELS occupy, whatever that is.
   *
   * Full bleed in the dual state, where two panels between them span
   * everything; otherwise the same capped, right-docked width a solo panel
   * takes - and deliberately panelCss's own expression rather than a second
   * one that happens to agree today, so the row and the panels below it share
   * their outer edges by construction.
   *
   * It tracks the PANELS, never the cards. How many widgets are on the row is
   * not an input here: the row is the panel area, and the grid inside it is
   * what divides that area between however many cards there are. So an item
   * whose panel is shut still gets a card, and the row does not grow to make
   * room for it.
   */
  readonly rowCss = computed(() => (this.visibleCount() === 2 ? '100%' : SOLO_WIDTH_CSS));

  /** True when the stage is too tight to show two modals side by side. */
  readonly tooTightForTwo = computed(() => this.stageWidth() < STACK_AUTO_MINIMISE_PX);

  /**
   * Below the dual-fit width there is only ever ONE panel on the stage.
   *
   * open() and restore() already refuse to put a second one up when the stage
   * is too tight, but that is a decision taken at the moment of opening. It
   * does not cover a stage that BECOMES too tight - a resize, a rotation, or a
   * dev scenario seeded straight into the dual state on a phone - and that is
   * how two 171px columns ended up side by side at 390px.
   *
   * So the rule is enforced continuously: whenever two are visible and the
   * stage cannot hold them, the older one steps back to its bar. The newest
   * arrival keeps the workspace, which is the same precedence open() uses.
   */
  private readonly enforceSingleOnNarrow = effect(
    () => {
      if (this.visibleCount() !== 2 || !this.tooTightForTwo()) return;
      const oldest = this.visibleOrder()[0];
      if (!oldest) return;
      this.set(oldest, { open: true, minimised: true });
      this.pulse(oldest);
    },
    { allowSignalWrites: true },
  );

  state(id: ModalId): ModalState {
    return id === 'sg' ? this._sg() : this._aml();
  }

  isOpen(id: ModalId): boolean {
    return this.state(id).open;
  }

  /**
   * Whether this item is on the surface at all - which is what its widget
   * renders on, in every state, open or shut.
   */
  isPresent(id: ModalId): boolean {
    return this.state(id).present;
  }

  /**
   * The widgets on the surface, in SLOT order - the same order the panels dock
   * in, so card n sits over panel n and each widget is above its own panel.
   *
   * Not a fixed SG-then-AML list, which is what let the row and the stage
   * disagree: reopen SG while the case is up and its panel takes the right
   * slot, so a card pinned left would be sitting over the wrong panel.
   *
   * The trailing filter is a backstop for a present item that somehow never
   * claimed a slot. Nothing produces one - seed() and open() both claim - and
   * a missing widget is a bad enough failure to be worth the line.
   */
  readonly presentIds = computed<ModalId[]>(() => {
    const order = this._order().filter((id) => this.state(id).present);
    const rest = (['sg', 'aml'] as ModalId[]).filter(
      (id) => this.state(id).present && !order.includes(id),
    );
    return [...order, ...rest];
  });

  /**
   * Opened only from that modal's own widget. Nothing here ever opens the
   * other one - two modals on screen is always the result of the agent opening
   * the second while the first was up.
   */
  open(id: ModalId): void {
    // The widget label is static now, so this can be pressed while its panel
    // is already up. Re-ordering then would slide the panel to the other side
    // for no reason; take focus to it instead.
    if (this.state(id).open && !this.state(id).minimised) {
      this.pendingFocus.set(id);
      return;
    }

    const otherId: ModalId = id === 'sg' ? 'aml' : 'sg';
    const other = this.state(otherId);

    // Under the threshold there is no room to share, so the incumbent steps
    // aside to its bar rather than both being squeezed. It pulses so the agent
    // can see where it went.
    if (other.open && !other.minimised && this.tooTightForTwo()) {
      this.set(otherId, { open: true, minimised: true });
      this.pulse(otherId);
    }

    // Arriving is what claims a slot; being re-opened is not arriving. An
    // item already on the surface - which, since close() keeps the widget,
    // includes everything you can press Open on - keeps the column its widget
    // is standing in, and the panel comes back underneath it.
    this._order.update((order) => (order.includes(id) ? order : [...order, id]));
    this.set(id, { present: true, open: true, minimised: false });
    this.pendingFocus.set(id);
  }

  /**
   * The panel comes down; the item stays on the surface.
   *
   * It says nothing at all about `present`, which is the point: this is a
   * patch, so whatever the item's existence was, it survives. Closing is "I am
   * done looking at this for now", and the widget is what makes that
   * reversible. Only dismiss() takes an item off the surface, and nothing in
   * the UI calls it: an alert or a case stops existing because it was resolved
   * upstream, not because someone pressed X.
   */
  close(id: ModalId): void {
    this.set(id, { open: false, minimised: false });
  }

  /**
   * The item no longer exists: panel down AND widget gone.
   *
   * The only route to a missing widget. Unused by the UI today and kept
   * anyway, because it is the thing close() must not be mistaken for - without
   * it there is nothing to point at when someone asks why X leaves the widget
   * behind.
   */
  dismiss(id: ModalId): void {
    this._order.update((order) => order.filter((x) => x !== id));
    this.set(id, { ...ABSENT });
  }

  minimise(id: ModalId): void {
    if (!this.state(id).open) return;
    this.set(id, { open: true, minimised: true });
  }

  /** Restoring while the other is up re-splits the stage between them. */
  restore(id: ModalId): void {
    if (!this.state(id).open) return;
    const otherId: ModalId = id === 'sg' ? 'aml' : 'sg';
    const other = this.state(otherId);

    if (other.open && !other.minimised && this.tooTightForTwo()) {
      this.set(otherId, { open: true, minimised: true });
      this.pulse(otherId);
    }

    this.set(id, { open: true, minimised: false });
    this.pendingFocus.set(id);
  }

  toggleMinimise(id: ModalId): void {
    this.state(id).minimised ? this.restore(id) : this.minimise(id);
  }

  /** @internal dev-only - lets the state switcher stage a scenario directly. */
  seed(patch: { sg?: Partial<ModalState>; aml?: Partial<ModalState> }): void {
    // Naming an item in the patch is what puts it on the surface. A scenario
    // that never mentions SG has no SG alert at all, and therefore no SG
    // widget - which is how every frame but 09 stays exactly as drawn.
    if (patch.sg) this._sg.set({ ...CLOSED, ...patch.sg });
    if (patch.aml) this._aml.set({ ...CLOSED, ...patch.aml });
    // Seeded scenarios have no click history, so the order is stated here:
    // SG first, matching frame 09. Keyed on presence, not open - a slot
    // belongs to the item, and an item on the surface has one whether or not
    // its panel happens to be up.
    this._order.set((['sg', 'aml'] as ModalId[]).filter((id) => this.state(id).present));
  }

  reset(): void {
    this._sg.set({ ...ABSENT });
    this._aml.set({ ...ABSENT });
    this._order.set([]);
    this.pendingFocus.set(null);
    this.pulsingBar.set(null);
    clearTimeout(this.pulseTimer);
  }

  /**
   * A PATCH, merged onto what is there. Deliberately not a whole state.
   *
   * Every caller below that only means "put the panel down" or "bring it back
   * up" is talking about `open` and `minimised`; none of them has an opinion
   * about whether the item exists, and merging is what stops each of them
   * having to restate it correctly. The two that DO mean it - close, dismiss -
   * pass a full constant and say so by name.
   */
  private set(id: ModalId, state: Partial<ModalState>): void {
    const signal = id === 'sg' ? this._sg : this._aml;
    signal.update((current) => ({ ...current, ...state }));
  }

  private pulse(id: ModalId): void {
    clearTimeout(this.pulseTimer);
    this.pulsingBar.set(id);
    this.pulseTimer = setTimeout(() => this.pulsingBar.set(null), 900);
  }
}
