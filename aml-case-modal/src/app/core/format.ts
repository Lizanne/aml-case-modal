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

/**
 * Same day/month/year as DATE_TIME, without the clock.
 *
 * For facts where the time of day is not information: the day a case was
 * opened is a date, and "09:12" on the end of it is precision nobody asked
 * for. Built from the same parts as the full stamp, so the two cannot
 * disagree about how a date is written.
 */
const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: ZONE,
});

/** "11 Aug 2026, 12:15" - UK format, sentence case, used everywhere a stamp appears. */
@Pipe({ name: 'stamp', standalone: true })
export class StampPipe implements PipeTransform {
  transform(iso: string | null | undefined, mode: 'full' | 'time' | 'date' = 'full'): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    if (mode === 'time') return TIME_ONLY.format(d);
    if (mode === 'date') return DATE_ONLY.format(d);
    return DATE_TIME.format(d);
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
