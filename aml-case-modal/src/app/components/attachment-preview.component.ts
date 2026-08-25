import { A11yModule } from '@angular/cdk/a11y';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { FileSizePipe } from '../core/format';
import { Attachment } from '../core/models';

let previewSeq = 0;

/**
 * The attachment preview. One overlay, two sizes.
 *
 * Images are WINDOWED TO THE IMAGE: the panel hugs whatever the image measures,
 * up to a viewport cap. A 600px screenshot in a 90% box would be a small
 * picture marooned in a large empty frame, and the frame would read as the
 * thing that failed to load.
 *
 * PDFs take ~90% of the viewport in an <iframe>, which hands the file to the
 * browser's own PDF viewer - paging, zoom, search and print, none of which we
 * write, and all of which a four-page adverse-media report needs. That size is
 * not a preference: a PDF page at anything smaller is a page you cannot read.
 * If the iframe ever proves unreliable the fallback is a new tab, NOT a
 * bundled PDF library.
 *
 * That difference is why the header is not the same header twice: a PDF gets
 * filename, size and Close, because the viewer beneath it already offers
 * Download; an image gets Download as well, because nothing else will.
 *
 * Same accessibility debt as dialog-shell, paid the same way: a real focus
 * trap behind the aria-modal claim, focus captured on open and handed back to
 * the attachment button on close, Escape to dismiss.
 */
@Component({
  selector: 'attachment-preview',
  standalone: true,
  imports: [MatIconModule, A11yModule, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'onEscape($event)',
  },
  template: `
    <!--
      Dismissive, unlike dialog-shell's. That scrim is inert because a stray
      click there costs you a half-written note; there is nothing to lose here,
      so the largest target on screen may as well be the way out. aria-hidden
      because it is redundant with Close and Escape, not an extra control.
    -->
    <div class="scrim" aria-hidden="true" (click)="dismiss.emit()"></div>

    <div
      class="panel"
      [class.panel--pdf]="file.kind === 'pdf'"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="headingId"
      tabindex="-1"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="false"
    >
      <div class="panel__head">
        <mat-icon class="panel__icon" fontSet="material-icons-outlined" aria-hidden="true">{{
          file.kind === 'pdf' ? 'picture_as_pdf' : 'image'
        }}</mat-icon>
        <h2 class="panel__title" [id]="headingId" [attr.title]="file.name">{{ file.name }}</h2>
        <span class="panel__size">{{ file.sizeKb | fileSize }}</span>
        <!--
          Images only. The PDF path hands the file to the browser's own viewer,
          whose toolbar already carries download, print and paging - a second
          Download drawn directly above it is the same control twice, and ours
          is the weaker of the two. An image gets no such toolbar, so there
          this is the only way to save the file.

          An <a download>, not a button: the browser's own save, under the
          file's own name, and it still works from the keyboard.
        -->
        @if (file.kind !== 'pdf') {
          <a
            class="panel__action"
            [href]="file.url"
            [attr.download]="file.name"
            [attr.aria-label]="'Download ' + file.name"
            title="Download"
          >
            <mat-icon aria-hidden="true">download</mat-icon>
          </a>
        }
        <button
          type="button"
          class="panel__action"
          aria-label="Close preview"
          title="Close"
          (click)="dismiss.emit()"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>

      <div class="panel__body">
        @if (file.kind === 'pdf') {
          <iframe class="viewer" [src]="safeUrl" [title]="file.name"></iframe>
        } @else {
          <img class="image" [src]="file.url" [alt]="file.name" />
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* Above dialog-shell's 60. The two never coexist today, but a preview
         opened from a dialog would be the newer surface, so it wins. */
      :host {
        position: fixed;
        inset: 0;
        z-index: 70;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .scrim {
        position: absolute;
        inset: 0;
        /* Darker than a dialog's. A dialog wants its form read against the
           page it belongs to; a preview wants the page gone. */
        background: rgba(24, 24, 27, 0.62);
      }
      .panel {
        position: relative;
        outline: none;
        display: flex;
        flex-direction: column;
        max-width: 100%;
        max-height: 100%;
        background: var(--panel);
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(24, 24, 27, 0.32);
        overflow: hidden;
      }
      /* The 90% size. Both dimensions are clamped by the :host padding above,
         so this is a target rather than a promise - which is the right way
         round on a short viewport, where 90vh plus chrome would not fit. */
      .panel--pdf {
        width: min(1400px, 90vw);
        height: 90vh;
      }
      .panel__head {
        flex: none;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 12px 12px 16px;
        border-bottom: 1px solid var(--line);
      }
      mat-icon.panel__icon {
        flex: none;
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
        color: var(--ink);
      }
      /* min-width: 0 is what lets the title ellipsise instead of pushing
         Download and Close off the end of the header. */
      .panel__title {
        flex: 1;
        min-width: 0;
        margin: 0;
        font-size: 15px;
        line-height: 22px;
        font-weight: 600;
        color: var(--ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .panel__size {
        flex: none;
        font-size: 13px;
        line-height: 20px;
        color: var(--ink-3);
        font-variant-numeric: tabular-nums;
      }
      .panel__action {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .panel__action:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--ink);
      }
      .panel__action mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
      }
      /* Centres the image, fills for the iframe. The page-coloured ground is
         for transparent PNGs, which would otherwise have no edges at all. */
      .panel__body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
        background: var(--page);
      }
      .panel--pdf .panel__body {
        flex: 1 1 auto;
      }
      .viewer {
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        min-height: 0;
        border: 0;
      }
      /* The window. Capped against the viewport less the :host padding and the
         header, so a large screenshot stops at the screen and a small one
         keeps its own size. */
      .image {
        display: block;
        max-width: calc(100vw - 48px);
        max-height: calc(100vh - 48px - 47px);
        object-fit: contain;
      }

      /**
       * Mobile: full screen, both kinds.
       *
       * There is no useful "windowed" size on a phone - an image windowed to
       * itself is either the whole screen already or too small to read, and a
       * PDF page at less than full width is unreadable outright. So the panel
       * takes the viewport and drops its radius, the way the modal does.
       */
      @media (max-width: 719.98px) {
        :host {
          padding: 0;
        }
        .panel,
        .panel--pdf {
          width: 100%;
          height: 100%;
          max-width: none;
          max-height: none;
          border-radius: 0;
        }
        .panel__body {
          flex: 1 1 auto;
        }
        .image {
          max-width: 100%;
          max-height: 100%;
        }
      }
    `,
  ],
})
export class AttachmentPreviewComponent implements AfterViewInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);

  private _file!: Attachment;
  private _safeUrl!: SafeResourceUrl;

  @Input({ required: true })
  set file(value: Attachment) {
    this._file = value;
    // Sanitised ONCE per file, in the setter. A getter that sanitised on
    // demand would hand [src] a new SafeResourceUrl object on every change
    // detection run, and the iframe would reload the PDF each time - losing
    // the page you had scrolled to, which is the whole point of the viewer.
    this._safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(value.url);
  }
  get file(): Attachment {
    return this._file;
  }

  get safeUrl(): SafeResourceUrl {
    return this._safeUrl;
  }

  @Output() dismiss = new EventEmitter<void>();

  readonly headingId = `attachment-preview-heading-${++previewSeq}`;

  /** The attachment button that opened this, so focus can be handed back. */
  private readonly opener = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    // The panel, not the first tabbable: the first tabbable is Download, and
    // landing on Download is landing past the thing you came to look at.
    this.host.nativeElement.querySelector<HTMLElement>('.panel')?.focus({ preventScroll: true });
  }

  onEscape(event: Event): void {
    // Stops at this host, so app.component's document listener does not also
    // read the same keypress as "close the panel behind me".
    event.stopPropagation();
    this.dismiss.emit();
  }

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }
}
