import { Injectable, signal } from '@angular/core';

import { Attachment } from './models';

/**
 * Which attachment, if any, is being previewed.
 *
 * A store rather than an output chain, because the overlay has to exist ONCE.
 * Attachment chips render in two places - the draft in record-form and every
 * saved outcome-card - and the preview is not owned by either of them: it
 * covers the whole composition. Routing a click up through the card, the
 * stream and the modal only to come back down again would give every level a
 * say in something none of them own.
 *
 * Deliberately separate from CaseStore: nothing here is case state. Opening a
 * preview changes what is on screen and nothing about the case, which is
 * exactly why the panel behind it keeps its draft, its scroll and its lock.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentPreviewStore {
  private readonly _current = signal<Attachment | null>(null);

  readonly current = this._current.asReadonly();

  open(file: Attachment): void {
    this._current.set(file);
  }

  close(): void {
    this._current.set(null);
  }
}
