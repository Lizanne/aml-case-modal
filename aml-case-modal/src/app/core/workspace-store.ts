import { Injectable, computed, signal } from '@angular/core';

import { MODAL_GAP_PX, MODAL_MAX_PX, STACK_AUTO_MINIMISE_PX } from './models';

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
 * Docking is fixed: SG is always left, AML always right, whichever was opened
 * first. Order of arrival never moves a modal.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly _sg = signal<ModalState>({ ...CLOSED });
  private readonly _aml = signal<ModalState>({ ...CLOSED });

  readonly sg = this._sg.asReadonly();
  readonly aml = this._aml.asReadonly();

  /** Measured width of the stage the modals live in. */
  readonly stageWidth = signal(1400);

  /** Set briefly when a bar is auto-minimised, so it can pulse once. */
  readonly pulsingBar = signal<ModalId | null>(null);
  private pulseTimer?: ReturnType<typeof setTimeout>;

  readonly sgVisible = computed(() => this._sg().open && !this._sg().minimised);
  readonly amlVisible = computed(() => this._aml().open && !this._aml().minimised);

  readonly visibleCount = computed(() => (this.sgVisible() ? 1 : 0) + (this.amlVisible() ? 1 : 0));

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
    return Math.min(MODAL_MAX_PX, stage);
  });

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

    this.set(id, { open: true, minimised: false });
  }

  close(id: ModalId): void {
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
  }

  toggleMinimise(id: ModalId): void {
    this.state(id).minimised ? this.restore(id) : this.minimise(id);
  }

  /** @internal dev-only - lets the state switcher stage a scenario directly. */
  seed(patch: { sg?: Partial<ModalState>; aml?: Partial<ModalState> }): void {
    if (patch.sg) this._sg.set({ ...CLOSED, ...patch.sg });
    if (patch.aml) this._aml.set({ ...CLOSED, ...patch.aml });
  }

  reset(): void {
    this._sg.set({ ...CLOSED });
    this._aml.set({ ...CLOSED });
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
