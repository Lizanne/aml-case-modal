import { Injectable, computed, signal } from '@angular/core';

import { MODAL_GAP_PX, STACK_AUTO_MINIMISE_PX } from './models';

export type ModalId = 'sg' | 'aml';

export interface ModalState {
  open: boolean;
  minimised: boolean;
}

const CLOSED: ModalState = { open: false, minimised: false };

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
 * Docking is ORDER-BASED: the incumbent ends left, the newest arrival ends
 * right. There are no fixed sides - which panel sits where is a consequence of
 * which was opened first, nothing else.
 *
 * The order is set when a panel is OPENED from its widget, and a restore does
 * not re-order: a panel coming back from its bar returns to the slot it left,
 * because having it jump sides on the way back would be the surprising thing.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly _sg = signal<ModalState>({ ...CLOSED });
  private readonly _aml = signal<ModalState>({ ...CLOSED });

  readonly sg = this._sg.asReadonly();
  readonly aml = this._aml.asReadonly();

  /** Open order, oldest first. Drives which side each panel docks to. */
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
   * widget row fills, so a panel expressed as a percentage of it shares the
   * widget row's edges by construction - there is no second measurement that
   * could round differently or lag a resize by a frame.
   *
   * modalWidth stays, but only to decide the 720px layout rule. It sizes
   * nothing.
   */
  readonly panelCss = computed(() =>
    this.visibleCount() === 2 ? `calc(50% - ${MODAL_GAP_PX / 2}px)` : '100%',
  );

  /** True when the stage is too tight to show two modals side by side. */
  readonly tooTightForTwo = computed(() => this.stageWidth() < STACK_AUTO_MINIMISE_PX);

  state(id: ModalId): ModalState {
    return id === 'sg' ? this._sg() : this._aml();
  }

  isOpen(id: ModalId): boolean {
    return this.state(id).open;
  }

  /**
   * Opened only from that modal's own widget. Nothing here ever opens the
   * other one - two modals on screen is always the result of the agent opening
   * the second while the first was up.
   */
  open(id: ModalId): void {
    const otherId: ModalId = id === 'sg' ? 'aml' : 'sg';
    const other = this.state(otherId);

    // Under the threshold there is no room to share, so the incumbent steps
    // aside to its bar rather than both being squeezed. It pulses so the agent
    // can see where it went.
    if (other.open && !other.minimised && this.tooTightForTwo()) {
      this.set(otherId, { open: true, minimised: true });
      this.pulse(otherId);
    }

    // Opening is what sets the slot. Re-opening something that was closed
    // makes it the newest again, so it docks right.
    this._order.update((order) => [...order.filter((x) => x !== id), id]);
    this.set(id, { open: true, minimised: false });
    this.pendingFocus.set(id);
  }

  close(id: ModalId): void {
    this._order.update((order) => order.filter((x) => x !== id));
    this.set(id, { ...CLOSED });
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
    if (patch.sg) this._sg.set({ ...CLOSED, ...patch.sg });
    if (patch.aml) this._aml.set({ ...CLOSED, ...patch.aml });
    // Seeded scenarios have no click history, so the order is stated here:
    // SG first, matching frame 09.
    this._order.set((['sg', 'aml'] as ModalId[]).filter((id) => this.state(id).open));
  }

  reset(): void {
    this._sg.set({ ...CLOSED });
    this._aml.set({ ...CLOSED });
    this._order.set([]);
    this.pendingFocus.set(null);
    this.pulsingBar.set(null);
    clearTimeout(this.pulseTimer);
  }

  private set(id: ModalId, state: ModalState): void {
    (id === 'sg' ? this._sg : this._aml).set(state);
  }

  private pulse(id: ModalId): void {
    clearTimeout(this.pulseTimer);
    this.pulsingBar.set(id);
    this.pulseTimer = setTimeout(() => this.pulsingBar.set(null), 900);
  }
}
