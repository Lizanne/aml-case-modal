import { Injectable, signal } from '@angular/core';

/** The two views the prototype has. No router - PROTOTYPE-TABLE.md §3. */
export type AppView = 'player' | 'cases';

/** Only two tabs carry content; Idle and Archive render disabled. */
export type CasesTab = 'active' | 'compliance';

export const CASES_TABS: readonly { id: string; label: string; enabled: boolean }[] = [
  { id: 'active', label: 'Active', enabled: true },
  { id: 'compliance', label: 'Compliance', enabled: true },
  { id: 'idle', label: 'Idle', enabled: false },
  { id: 'archive', label: 'Archive', enabled: false },
];

/**
 * Which view the prototype is showing, and how the URL says so.
 *
 * Follows the existing `?state=` pattern rather than introducing a router:
 * read the query string at startup, write it back with replaceState. One more
 * param on the same mechanism, so a link is still just a URL someone can paste.
 *
 *   ?view=cases&tab=active
 *   ?view=cases&tab=compliance
 *   ?view=player&case=<id>&modal=open
 *
 * Real routes are a dev-handoff note, not prototype work.
 */
@Injectable({ providedIn: 'root' })
export class NavStore {
  readonly view = signal<AppView>('player');
  readonly tab = signal<CasesTab>('active');

  /** The case the player view should open, from ?case=. */
  readonly deepLinkCaseId = signal<string | null>(null);
  readonly deepLinkModalOpen = signal(false);

  constructor() {
    const q = new URLSearchParams(window.location.search);
    if (q.get('view') === 'cases') this.view.set('cases');
    if (q.get('tab') === 'compliance') this.tab.set('compliance');
    this.deepLinkCaseId.set(q.get('case'));
    this.deepLinkModalOpen.set(q.get('modal') === 'open');
  }

  showCases(tab: CasesTab = 'active'): void {
    this.view.set('cases');
    this.tab.set(tab);
    this.writeUrl();
  }

  showPlayer(): void {
    this.view.set('player');
    this.writeUrl();
  }

  /**
   * The Open AML Case target, rule 4. Returned rather than navigated to: the
   * row opens it in a NEW tab, so the caller owns window.open.
   */
  caseDeepLink(id: string): string {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('view', 'player');
    url.searchParams.set('case', id);
    url.searchParams.set('modal', 'open');
    return url.toString();
  }

  private writeUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('view', this.view());
    if (this.view() === 'cases') url.searchParams.set('tab', this.tab());
    else url.searchParams.delete('tab');
    window.history.replaceState({}, '', url);
  }
}
