import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { SectionRisk } from '../core/models';
import { RiskStatusComponent } from './risk-status.component';

/**
 * The finalize table: one row per assessed section, Risk or No risk.
 *
 * A section is a risk if any field in it is. Account information is not in
 * it - those fields are informational and carry no risk to report.
 *
 * A real table, because it is one: two columns, a header row, and a row
 * header per section, so a screen reader reads "Payment methods, Risk".
 */
@Component({
  selector: 'section-risk-table',
  standalone: true,
  imports: [RiskStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="srt">
      <caption class="srt__caption">{{ caption }}</caption>
      <thead>
        <tr>
          <th scope="col">Section</th>
          <th scope="col" class="srt__result">Result</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows; track row.section) {
          <tr>
            <th scope="row">{{ row.section }}</th>
            <td class="srt__result">
              <risk-status [status]="row.risk ? 'risk' : 'no-risk'" />
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .srt {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
        line-height: 20px;
      }
      /* Read out, not shown: the form or card around it already says what it is. */
      .srt__caption {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      th,
      td {
        padding: 8px 0;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: middle;
      }
      tbody tr:last-child th,
      tbody tr:last-child td {
        border-bottom: 0;
      }
      thead th {
        padding-top: 0;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--foreground-secondary);
      }
      tbody th {
        font-weight: 400;
        color: var(--foreground-primary);
        padding-right: 12px;
      }
      .srt__result {
        text-align: right;
        white-space: nowrap;
      }
    `,
  ],
})
export class SectionRiskTableComponent {
  @Input({ required: true }) rows: SectionRisk[] = [];
  @Input() caption = 'Risk by section';
}
