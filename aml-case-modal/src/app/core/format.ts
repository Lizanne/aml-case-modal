import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pinned to Europe/London rather than the machine's zone. The fixture is in UTC
 * and this is a UK back office, so a reviewer opening the prototype anywhere
 * sees the same stamps the spec talks about.
 */
const ZONE = 'Europe/London';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ZONE,
});

const TIME_ONLY = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ZONE,
});

/** "11 Aug 2026, 12:15" - UK format, sentence case, used everywhere a stamp appears. */
@Pipe({ name: 'stamp', standalone: true })
export class StampPipe implements PipeTransform {
  transform(iso: string | null | undefined, mode: 'full' | 'time' = 'full'): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return mode === 'time' ? TIME_ONLY.format(d) : DATE_TIME.format(d);
  }
}

/** "2.1 MB" / "480 KB". */
@Pipe({ name: 'fileSize', standalone: true })
export class FileSizePipe implements PipeTransform {
  transform(sizeKb: number): string {
    if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`;
    return `${Math.round(sizeKb)} KB`;
  }
}
