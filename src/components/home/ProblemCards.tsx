import { Section, Heading, Eyebrow, Lead } from '../ui/Section';

/**
 * Three specific things that go wrong, replacing three manufactured ones.
 *
 * The old set opened "You did not start making candles so you could read regulations at
 * eleven at night", which is a sentence written about makers rather than for them. It
 * invented a general anguish to sell against, and no maker describes their own week that
 * way.
 *
 * Each card is now one concrete failure with the mechanism in it: what broke, why the label
 * was wrong, what it cost. A card that cannot name the thing that broke is decoration.
 */
const cards = [
{
  title: 'A listing gets flagged',
  body: 'A marketplace pulls a wax melt listing because the label is one hazard statement short. You find out from the email, the listing is down while you fix it, and the reviewer will not tell you which statement is missing.'
},
{
  title: 'Your supplier reformulates',
  body: 'A new safety data sheet lands for a fragrance you already sell. The classification has moved, so the label has moved with it, and every pack size using that oil needs redoing before the next batch goes out.'
},
{
  title: 'The wording will not fit',
  body: 'The text is right and the tin is 40 mm across. CLP sets a minimum size for the pictograms and for the regulated text, so shrinking it until it fits is the one thing you cannot do.'
}];


/**
 * Three failures, set as a ruled column rather than three bordered boxes.
 *
 * Bordered cards in a row give three unrelated things identical visual weight and no
 * order, and these three are a list of ways one job goes wrong. Numbered entries divided
 * by hairlines say that; a card grid says "features".
 */
export function ProblemCards() {
  return (
    <Section ariaLabelledBy="problem-heading" width="wide">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Why it exists</Eyebrow>
          <Heading id="problem-heading">Three ways a label goes wrong</Heading>
          <Lead className="mt-4">
            None of these are unusual, and all three cost an evening.
          </Lead>
        </div>

        <ul className="bl-numbered divide-y divide-paper-edge border-t border-paper-edge">
          {cards.map((card) =>
          <li key={card.title} className="grid gap-x-6 gap-y-2 py-7 sm:grid-cols-[3.25rem_1fr] sm:py-8">
              <span
              aria-hidden="true"
              className="bl-num bl-figures font-mono text-[0.78rem] font-medium tracking-[0.12em] text-clay-600 sm:pt-1" />

              <div>
                <h3 className="font-display text-[1.2rem] font-semibold leading-snug text-ink">
                  {card.title}
                </h3>
                <p className="mt-2.5 max-w-prose text-[0.98rem] leading-[1.65] text-ink-soft">
                  {card.body}
                </p>
              </div>
            </li>
          )}
        </ul>
      </div>
    </Section>);

}
