import React from 'react';
import { Section, Heading, Eyebrow, Lead } from '../ui/Section';

const cards = [
{
  title: 'Getting it wrong is expensive',
  body: 'A missing hazard statement can get a listing pulled from Etsy or Shopify, and Trading Standards can fine you. Most makers only find out when the email lands.'
},
{
  title: 'Consultants charge per fragrance',
  body: 'A one off assessment often costs more than a whole market stall takes in a day. Add a new scent and you pay again, then again when the supplier reformulates.'
},
{
  title: 'Spreadsheets break quietly',
  body: 'Change the fragrance load from 8 per cent to 10 per cent and half the formulas are wrong, but the sheet still prints something that looks fine.'
}];


export function ProblemCards() {
  return (
    <Section ariaLabelledBy="problem-heading">
      <Eyebrow>The bit nobody enjoys</Eyebrow>
      <Heading id="problem-heading">Labelling is where good products get stuck</Heading>
      <Lead className="mt-3">
        You did not start making candles so you could read regulations at eleven at night.
      </Lead>

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((card) =>
        <li
          key={card.title}
          className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">
          
            <h3 className="font-display text-[1.05rem] font-semibold text-ink">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.body}</p>
          </li>
        )}
      </ul>
    </Section>);

}