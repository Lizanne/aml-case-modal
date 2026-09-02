import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CaseStore } from '../core/case-store';
import { StampPipe } from '../core/format';
import { SEVERITY_LABEL, lockStatusLine } from '../core/models';
import { PillComponent } from './ui-pill.component';

/**
 * ONE ROW, and only one: title, severity pill, status pill, lock status, lock
 * button, then minimise and close. Per 22377:2084.
 *
 * The identity line under it is gone. It read "Howard Williams · Player 88213"
 * directly below a black player bar that already says who this is - the same
 * name, twice, a few pixels apart. The header names the CASE; the bar above it
 * names the player.
 *
 * The lock was a 56px band under this row until it folded in here. A case's
 * lock is part of its state, so it reads as the third item after the two state
 * pills rather than as a strip of its own - and the height the band was
 * holding goes back to the workflow below.
 *
 * Rule 3: the lock button changes verb with the lock state, and "Force unlock"
 * says what it does rather than hiding the consequence behind "Unlock".
 * Rule 10: once resolved there is nothing to lock, so the control goes away.
 *
 * The row never wraps, at any width. Only the lock text gives - see
 * .head__title-row.
 */
@Component({
  selector: 'case-header',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, StampPipe, PillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- tabindex -1: not in the tab order, but a place focus can be SENT when
         the panel opens. -->
    <div
      class="head"
      data-panel-header
      tabindex="-1"
      [class.head--narrow]="store.layoutNarrow()"
      [class.head--stacked]="store.layoutStacked()"
      [class.head--resolved]="store.isResolved()"
    >
      <div class="head__main">
        <div class="head__titles">
          <!--
            ONE ROW: identity, state, lock, controls. Per 22377:2084.

            The lock used to be a band of its own under this, 56px tall and
            fixed so its own copy could not move the content below it. Folding
            it in here gives that height back to the workflow and puts the lock
            where it belongs - a case's lock is part of its state, and the
            status pill it now sits after is the rest of that state.

            Nothing in this row wraps. The lock text is the one flexible item:
            it takes what is left and ellipsises, so the pills, the button and
            the controls hold their positions at every width. See the note on
            .head__title-row.
          -->
          <div class="head__title-row">
            <h2 class="head__title">AML case #{{ store.caseId() }}</h2>
            <!-- Pills sit directly beside the title, not flushed to the far
                 right: they qualify the case name, so they belong next to it. -->
            <!--
              sm at the narrow width. The row is a few pixels over there with
              the longest lock state in it, and the pills are where those come
              from: md is 24px on 14px type, sm is 20px on 12px, and 22377:2084
              draws these at 11px - so the smaller step is the one CLOSER to
              the node, not a squeeze away from it. It is also what the widget
              row uses, so a narrow panel and the card above it agree.

              Full width keeps md, because there it has the room and md is what
              every other pill in the panel is.
            -->
            <div class="head__pills">
              <ui-pill [severity]="store.severity()" [size]="pillSize()">
                {{ severityLabel() }}
              </ui-pill>
              <ui-pill [tone]="store.isResolved() ? 'success' : 'neutral'" [size]="pillSize()">
                {{ store.isResolved() ? 'Resolved' : 'Open' }}
              </ui-pill>
            </div>

            <!--
              The lock and its action travel together, in one wrapper.
              
              That is what lets the two lay out as one row on a wide panel and
              as their own row underneath on a narrow one, without the DOM
              changing: wide, it is a flexible item between the pills and the
              window controls; stacked, it takes a full basis and drops below
              them. See .head__lockline.
            -->
            <!--
              NOTHING LOCK-SHAPED ON A RESOLVED CASE - not the glyph, not the
              line, not the control.

              The header used to carry a padlock and "Resolved - read-only"
              beside a pill already reading Resolved: one fact, three times, in
              the one state where none of it can be acted on. The pill carries
              the status. Read-only is carried by what is absent - no lock
              control here, no Record in the stream, no footer at all - which
              is a stronger statement than a sentence saying so, because it
              cannot disagree with the buttons.

              The whole wrapper goes, not just its contents: an empty one still
              claims its grid area and the row-gap above it.
            -->
            @if (!store.isResolved()) {
            <div class="head__lockline">
              <span
                class="head__lock"
                role="status"
                [attr.data-lock]="store.lockState()"
                [attr.title]="lockTitle()"
                [attr.aria-label]="'Lock status: ' + lockLine()"
              >
                <mat-icon class="head__lock-icon" aria-hidden="true">{{ lockIcon() }}</mat-icon>
                <span class="head__lock-text">{{ lockLine() }}</span>
              </span>

              <!-- Unconditional on resolution: the wrapper above already is.
                   The switch is about which lock control this state calls
                   for. -->
              @switch (store.lockState()) {
                @case ('unlocked') {
                  <button mat-flat-button color="primary" type="button" (click)="store.lock()">
                    Lock to me
                  </button>
                }
                @case ('locked-to-me') {
                  <button mat-stroked-button type="button" (click)="store.requestUnlock()">Unlock</button>
                }
                @case ('locked-to-other') {
                  <button mat-stroked-button class="danger-button" type="button" (click)="store.requestUnlock()">
                    Force unlock
                  </button>
                }
              }
            </div>
            }

            <!--
              Minimise and close, pinned right in every layout - the last thing
              on the single row, and the last thing on ROW ONE when the header
              stacks. Grouped so the 12px between the two is its own value,
              independent of the wider gap that holds them off the lock action.
            -->
            <div class="head__actions">
                <button
                  class="head__close"
                  type="button"
                  aria-label="Minimise case"
                  matTooltip="Minimise"
                  (click)="minimise.emit()"
                >
                  <mat-icon>remove</mat-icon>
                </button>
                <!-- One glyph at every width: the control closes, and an X is
                     what closing looks like. -->
              <button class="head__close" type="button" aria-label="Close case" (click)="close.emit()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .head {
        background: var(--panel);
        /* Focus lands here when the panel opens, and a ring on a whole header
           is noise - but it must not be silently removed either, so the
           replacement is an inset ring on the panel edge. */
        outline: none;
        border-bottom: 1px solid var(--line);
      }
      .head:focus-visible {
        box-shadow: inset 0 3px 0 0 var(--primary);
      }
      .head__main {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 16px 20px;
      }
      .head__titles {
        flex: 1;
        min-width: 0;
      }
      /**
       * ONE LINE, always. nowrap is the rule this row exists to keep.
       *
       * It used to wrap, which was survivable while it held a title and two
       * pills. It now holds the lock and every control as well, and a wrap
       * there would drop the close button onto a second line - so the row is
       * held to one line and the LOCK TEXT is the single item allowed to give.
       * Everything else is flex: none.
       *
       * 8px, per 22377:2089, rather than the 12px a title and two pills could
       * afford. The pair of icon buttons keeps its own 12px and the lock action
       * gets 24px - see .head__actions.
       */
      .head__title-row {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 8px;
        min-width: 0;
      }
      /* The title identifies the case, so it is the last thing to give - but it
         can, below the width where even an ellipsised lock line has run out. */
      .head__title {
        flex: 0 1 auto;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
        font-size: 20px;
        line-height: 30px;
        font-weight: 600;
        color: var(--ink);
        letter-spacing: -0.01em;
      }
      .head__pills {
        display: flex;
        align-items: center;
        flex: none;
        gap: 8px;
      }
      /**
       * The lock and its action, as one item.
       *
       * flex: 1 on the WRAPPER and flex: 1 on the lock inside it, so the lock
       * text takes the slack and the button is carried to the far end of it -
       * which lands it right beside the window controls, exactly where the old
       * the old .head__tail put it. The difference is that the pair is now one
       * thing the row can move, which is what the stacked layout needs.
       */
      .head__lockline {
        display: flex;
        align-items: center;
        flex: 1 1 auto;
        min-width: 0;
        gap: 8px;
      }
      /**
       * 24px off the lock action, against the pair's own 12px, per 22379:4858.
       * Force unlock is destructive and sits on the same line as a close
       * button; the gap is what stops one being taken for the other. A margin
       * rather than the row's gap, because it is a different distance from the
       * 8px everything else on the row uses.
       */
      .head__actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: none;
        margin-left: 24px;
      }
      /**
       * Resolved: pinned right by an auto margin instead.
       *
       * Normally the LOCKLINE holds these against the right edge - it is
       * flex: 1 and absorbs every spare pixel of the row. A resolved case
       * renders no lockline, so nothing was absorbing anything and the
       * controls sat wherever the pills happened to end, a third of the way
       * across the header.
       *
       * The 24px it replaces was a gap from the lock action. There is no lock
       * action here, so there is nothing to be held away from - only an edge
       * to be pinned to.
       *
       * Beaten deliberately by the stacked rule below, which sets
       * margin-left: 0 and pins with justify-self on the grid instead - equal
       * specificity, later in the file. The narrow rule is excluded by a :not
       * rather than by order, because order is what it won on.
       */
      .head--resolved .head__actions {
        margin-left: auto;
      }
      .head__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ink-3);
        cursor: pointer;
      }
      .head__close mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .head__close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--ink);
      }
      /**
       * In the row, not under it. No fixed height any more: the band needed one
       * because it swapped a filled button for a stroked one and changed copy
       * length, and none of that could be allowed to move the content below.
       * Inline in a row whose height is set by the title, there is nothing left
       * for it to push.
       *
       * THE ONE FLEXIBLE ITEM in the row: it takes what the fixed parts leave
       * and ellipsises. min-width: 0 is load-bearing - a flex item's default
       * min-width is auto, which refuses to shrink below its content and would
       * push the controls off the end instead.
       */
      .head__lock {
        display: inline-flex;
        align-items: center;
        flex: 0 1 auto;
        min-width: 0;
        gap: 4px;
      }
      .head__lock-icon {
        flex: none;
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--ink-2);
      }
      /* Success green is the only "you can act here" signal. */
      .head__lock[data-lock='locked-to-me'] .head__lock-icon {
        color: var(--foreground-success);
      }
      .head__lock-text {
        min-width: 0;
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--ink-2);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .head__lock[data-lock='locked-to-me'] .head__lock-text {
        color: var(--foreground-success);
      }

      /* Narrow / dual-modal: two tight rows instead of a title block and a
         separate lock strip. */
      /* align-items is inherited from .head__main (flex-start) on purpose.
         Narrow used to centre, which measured the buttons against the WHOLE
         title block - title row plus the identity line - and pushed them down
         past the title they belong to. Top-aligned, they sit level with it,
         the same way they do at full width. */
      .head--narrow .head__main {
        padding: 16px 20px;
      }
      .head--narrow .head__title {
        font-size: 16px;
        line-height: 24px;
      }
      /**
       * Narrow has the least room and the same row to fit.
       *
       * 6px, and the pills step down to sm - see the note in the template.
       * Measured rather than picked: at md the longest state, Force unlock
       * beside someone else's lock, came out 6px over and ellipsised both the
       * title and the lock line.
       *
       * The BUTTON is not what gives, at any width. Its padding and its 16px
       * separation from the window controls are the two things holding a
       * destructive action away from a close button, and buying 5px out of
       * either would be paying for it in mis-clicks.
       */
      .head--narrow .head__title-row {
        gap: 6px;
      }
      /* The tighter gap from the LOCK ACTION - so it applies only when there
         is one. Resolved has no lock action and needs the auto margin instead;
         written as :not rather than left to source order, which is what let a
         16px margin beat it here and strand the controls mid-header. */
      .head--narrow:not(.head--resolved) .head__actions {
        margin-left: 16px;
      }
      .head--narrow .head__lock-text {
        font-size: 13px;
      }

      /**
       * BELOW THE DUAL-FIT WIDTH, THE HEADER IS TWO ROWS.
       *
       *   row one   AML case #4821, severity, status ......... minimise close
       *   row two   ..................................... lock  [lock action]
       *
       * 560px is MIN_DUAL_PANEL_PX - the narrowest a panel gets while two
       * still fit side by side. At that width the single row holds, measured;
       * below it there is no arrangement of one row that keeps the case number
       * whole, and the case number is the one thing that must not go. Packed
       * onto one line at 390 it rendered 3px wide - "AML case #4821" shown as
       * "A." - and at 343 the row ran 41px past the panel.
       *
       * flex-wrap plus a full basis on the lockline, rather than a second grid
       * or a duplicated block of markup: the DOM is identical in both layouts,
       * so nothing can render in one and not the other.
       */
      /**
       * BELOW THE DUAL-FIT WIDTH, THE HEADER IS TWO ROWS.
       *
       *   row one   AML case #4821, severity, status ......... minimise close
       *   row two   lock status ......................... [ lock action ]
       *
       * Keyed on a class the modal publishes from the panel's own width, not a
       * container query - the same threshold decides the COPY on row two, and
       * a query in the stylesheet plus a computed in TypeScript would be two
       * thresholds to keep in step. See CaseStore.layoutStacked.
       *
       * At that width the single row holds, measured; below it there is no
       * arrangement of one row that keeps the case number whole, and the case
       * number is the one thing that must not go. Packed onto one line at 390
       * it rendered 3px wide - "AML case #4821" shown as "A." - and at 343 the
       * row ran 41px past the panel.
       */

      /**
       * ROW ONE IS A GRID, not a wrapping flex row.
       *
       * Flexbox breaks lines using each item's HYPOTHETICAL size - its content
       * width - and only shrinks what is left afterwards. So the pills were
       * measured at their full 86px when the row decided where to break, the
       * three items came to exactly the 279px available at 343, and a
       * sub-pixel over sent minimise and close to a third row. They could have
       * shrunk; they were never asked to, because the break had already
       * happened.
       *
       * Grid sizes the tracks first, so "the pills give way" is expressible:
       * the title and the controls take auto tracks and keep their content,
       * the pills take minmax(0, 1fr) and absorb whatever is left.
       *
       * Placement is by area, so the lock sits on row two without reordering
       * the DOM. The reading order stays identity, state, lock, then the
       * controls that act on the window - which is the right order to hear.
       * The cost is that the tab sequence reaches the lock action before
       * minimise and close, which are visually above it; the alternative is a
       * DOM that reads the window chrome out in the middle of the case's state
       * at EVERY width, to fix an order that only differs at this one.
       */
      .head--stacked .head__title-row {
        display: grid;
        align-items: center;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          'title pills actions'
          'lock  lock   lock';
        column-gap: 6px;
        row-gap: 8px;
      }
      /**
       * Resolved: one row, because there is no second one.
       *
       * The lockline is not rendered at all on a resolved case, and an area
       * declared in grid-template-areas keeps its track whether or not
       * anything occupies it - so the empty row would have contributed nothing
       * but the 8px row-gap above it, as a strip of dead space under the
       * title.
       */
      .head--stacked.head--resolved .head__title-row {
        grid-template-areas: 'title pills actions';
      }
      /* An auto track floors at min-content, and nowrap text's min-content is
         the whole string - so the case number cannot be shrunk into an ellipsis
         by the track. It is the case's identity, and half of it is not a
         smaller version of it. */
      .head--stacked .head__title {
        grid-area: title;
        min-width: auto;
        overflow: visible;
        text-overflow: clip;
      }
      /* The 1fr track: what gives. They wrap within their own box first, and
         ellipsise only if even that is not enough. */
      .head--stacked .head__pills {
        grid-area: pills;
        flex-wrap: wrap;
        min-width: 0;
      }
      /* Pinned right on row one, whatever the title and pills came to. */
      .head--stacked .head__actions {
        grid-area: actions;
        justify-self: end;
        margin-left: 0;
      }
      /**
       * ROW TWO: the lock reads from the left, its action sits hard right.
       *
       * They were a right-aligned pair, which put the lock label somewhere
       * different on every case - it moved with the length of the button
       * beside it, and a status you have to find is a status you read late.
       * Anchored left it starts in the same place every time.
       *
       * margin-left: auto on the button does BOTH jobs, which is why there is
       * no justify-content here: sharing the row it takes the slack and lands
       * right, and on a row of its own it still has an auto left margin, so it
       * is still right. One rule, both cases, nothing to switch between them.
       */
      .head--stacked .head__lockline {
        grid-area: lock;
        flex-wrap: wrap;
        justify-content: flex-start;
        row-gap: 8px;
      }
      /**
       * NEVER TRUNCATES, and never shrinks to make room.
       *
       * flex: none plus a visible overflow, so the label is measured at its
       * full length - which is what makes the button wrap rather than the text
       * ellipsise when the two do not fit. Shrinking here would hide the one
       * thing the row exists to say, to keep a button company.
       */
      .head--stacked .head__lock {
        flex: none;
        min-width: 0;
      }
      .head--stacked .head__lock-text {
        overflow: visible;
        text-overflow: clip;
      }
      .head--stacked .head__lockline > button {
        margin-left: auto;
      }
      /**
       * Mobile gutters: 16px, matching the page and info__body.
       *
       * Both selectors, because a mobile header is always ALSO narrow, and
       * ".head--narrow .head__main" is two classes to this one's one - it
       * would win on specificity and put 20px back regardless of order.
       */
      @media (max-width: 719.98px) {
        .head__main,
        .head--narrow .head__main {
          padding-left: 16px;
          padding-right: 16px;
        }
      }

    `,
  ],
})
export class CaseHeaderComponent {
  readonly store = inject(CaseStore);
  @Output() close = new EventEmitter<void>();
  @Output() minimise = new EventEmitter<void>();

  readonly severityLabel = computed(() => SEVERITY_LABEL[this.store.severity()]);

  /** See the note in the template: the row's width is the reason. */
  readonly pillSize = computed<'sm' | 'md'>(() => (this.store.layoutNarrow() ? 'sm' : 'md'));

  readonly lockIcon = computed(() =>
    this.store.lockState() === 'unlocked' ? 'lock_open' : 'lock',
  );

  /**
   * The lock line, at every width. ONE line now, not two.
   *
   * There used to be a pair - a full one for the band and a short one for the
   * narrow layout - and the band's added a hint on top: "Not locked. Lock the
   * case to record outcomes." In a row beside the button that does exactly
   * that, the second sentence was the button saying itself twice, and it was
   * the longest string in the state that has the least room for one.
   *
   * So it is lockStatusLine and nothing else: "Locked to you", "Not locked",
   * "Locked to M. Torres · 3d". The absolute stamp is not in it at any width -
   * see lockTitle.
   *
   * sinceIso, never `since`: the helper turns the ISO into a relative age for
   * SOMEONE ELSE'S lock, which is the number that decides whether you take it,
   * and ignores it for your own. Handing it the formatted stamp as well is
   * what used to put "since 11 Aug 2026, 12:05" in this row.
   *
   * compact ONLY while the header is fighting for a single row - narrow, but
   * not yet stacked. There "Locked to M. Torres · 15d" is 40px wider than the
   * row, so it drops the two words the lock glyph already says and keeps both
   * facts, with lockTitle carrying the full sentence instead.
   *
   * Stacked, the lock has a row to itself and the words go back. The reason to
   * shorten it was the row, and the row is no longer shared.
   */
  readonly lockLine = computed(() =>
    this.composeLockLine(this.store.layoutNarrow() && !this.store.layoutStacked()),
  );

  /** The same sentence at full length, whatever the row is currently showing. */
  private composeLockLine(compact: boolean): string {
    return lockStatusLine(this.store.lockState(), this.store.lockOwner()?.name, {
      sinceIso: this.store.lockedSince() ?? undefined,
      compact,
    });
  }

  /**
   * The hover title, and the only place your own lock's timestamp appears.
   *
   * You took the lock, so when is a detail you can ask for rather than one the
   * header spends a row's width on - and this row has controls in it now.
   *
   * Null for every other state, deliberately. A title on someone else's lock
   * would be a second, absolute reading of an age the line already gives
   * relatively, and a tooltip that repeats its own element is noise. Null on a
   * resolved case too: there is no live lock to date.
   */
  readonly lockTitle = computed(() => {
    if (this.store.isResolved()) return null;
    if (this.store.lockState() === 'locked-to-me') {
      const since = this.store.lockedSince();
      return since ? `Locked to you since ${new StampPipe().transform(since)}` : null;
    }
    // Someone else's lock, in the one layout that trims "Locked to" off the
    // visible line: the title is where the full sentence still exists. Compared
    // rather than re-tested, so a title can never appear beside a line that
    // already says the same thing - which is what it would be at every other
    // width, and which is noise.
    const full = this.composeLockLine(false);
    return full !== this.lockLine() ? full : null;
  });
}
