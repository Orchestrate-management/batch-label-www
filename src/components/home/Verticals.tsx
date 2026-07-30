import { CheckIcon, ArrowRightIcon } from 'lucide-react';
import { Section, Heading, Eyebrow, Lead } from '../ui/Section';
import { Button } from '../ui/Button';
import {
  activeVerticals,
  plannedVerticals,
  type Vertical } from
'../../content/verticals';

const statusStyles: Record<Vertical['status'], string> = {
  'live': 'border-teal-600/25 bg-teal-50 text-teal-800',
  'coming-soon': 'border-clay-500/25 bg-clay-100 text-clay-600',
  'planned': 'border-paper-edge bg-paper text-ink-muted'
};

function VerticalCard({ vertical }: {vertical: Vertical;}) {
  const isLive = vertical.status === 'live';

  return (
    <li
      className={`flex flex-col rounded-2xl border p-5 sm:p-6 ${
      isLive ? 'border-teal-700/40 bg-white' : 'border-paper-edge bg-white'}`
      }>

      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          statusStyles[vertical.status]}`
          }>

          {vertical.statusLabel}
        </span>
      </div>

      <h3 className="mt-3 font-display text-[1.1rem] font-semibold text-ink">{vertical.name}</h3>
      <p className="mt-1 text-sm font-medium text-ink-soft">{vertical.tagline}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{vertical.description}</p>

      <ul className="mt-4 flex flex-wrap gap-1.5">
        {vertical.examples.map((example) =>
        <li
          key={example}
          className="rounded-full border border-paper-edge bg-paper px-2.5 py-0.5 text-xs text-ink-muted">

            {example}
          </li>
        )}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        Built against {vertical.regulation}.
      </p>

      {vertical.cta ?
      <div className="mt-5">
          {vertical.cta.to ?
        <Button
          to={vertical.cta.to}
          variant={isLive ? 'primary' : 'secondary'}
          track={{ label: vertical.cta.label, location: vertical.cta.location }}>

              {vertical.cta.label}
            </Button> :

        <Button
          href={vertical.cta.href as string}
          variant="secondary"
          track={{ label: vertical.cta.label, location: vertical.cta.location }}>

              {vertical.cta.label}
            </Button>
        }
        </div> :
      null}
    </li>);

}

export function Verticals() {
  return (
    <Section className="bg-white" ariaLabelledBy="verticals-heading">
      <Eyebrow>Who it is for</Eyebrow>
      <Heading id="verticals-heading">Candles today, more categories on the way</Heading>
      <Lead className="mt-3">
        The hard part is never the artwork, it is turning safety and regulatory data into the exact
        words the rules require. That engine is the same whatever you make, so we are opening it up
        one category at a time, starting where we started, with candles.
      </Lead>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {activeVerticals.map((vertical) =>
        <VerticalCard key={vertical.id} vertical={vertical} />
        )}
      </ul>

      {plannedVerticals.length > 0 ?
      <div className="mt-6 rounded-2xl border border-dashed border-paper-edge bg-paper p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
            <ArrowRightIcon size={14} aria-hidden="true" />
            Where this is heading
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {plannedVerticals.map((vertical) =>
          <li key={vertical.id} className="flex items-start gap-2.5 text-sm text-ink-soft">
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-teal-700/70" aria-hidden="true" />
                <span>
                  <span className="font-medium text-ink">{vertical.name}.</span> {vertical.description}
                </span>
              </li>
          )}
          </ul>
        </div> :
      null}
    </Section>);

}
