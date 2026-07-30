import React from 'react';
import { QuoteIcon } from 'lucide-react';
import { Section, Heading, Eyebrow, Lead } from '../ui/Section';

const placeholders = [
{
  prompt: 'A candle maker on how long labelling used to take.',
  meta: 'Candle maker, Yorkshire'
},
{
  prompt: 'A wax melt seller on changing a fragrance without redoing the maths.',
  meta: 'Wax melt seller, Etsy'
},
{
  prompt: 'A two person studio on getting through a market season.',
  meta: 'Diffuser studio, Cornwall'
}];


export function Testimonials() {
  return (
    <Section className="bg-white" ariaLabelledBy="testimonials-heading">
      <Eyebrow>Early days</Eyebrow>
      <Heading id="testimonials-heading">We would rather leave this blank than invent it</Heading>
      <Lead className="mt-3">
        Batchlabel is new. When makers tell us what changed for them, their words go here, with
        their name and their shop.
      </Lead>

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {placeholders.map((item) =>
        <li
          key={item.prompt}
          className="rounded-2xl border border-dashed border-paper-edge bg-paper p-5">
          
            <QuoteIcon size={20} className="text-teal-700/60" aria-hidden="true" />
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Space reserved for a real quote. {item.prompt}
            </p>
            <p className="mt-4 text-xs font-medium text-ink-muted/80">{item.meta}</p>
          </li>
        )}
      </ul>

      <p className="mt-6 text-sm text-ink-muted">
        Used Batchlabel and happy to be quoted? Email{' '}
        <a
          href="mailto:hello@batchlabel.co.uk"
          className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
          
          hello@batchlabel.co.uk
        </a>
        .
      </p>
    </Section>);

}