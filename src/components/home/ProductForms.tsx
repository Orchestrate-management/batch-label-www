import { Section, Heading, Eyebrow, Lead } from '../ui/Section';
import { Button } from '../ui/Button';
import { productForms } from '../../content/product-forms';

/**
 * Replaces the categories section.
 *
 * The old one was a status ladder — a live card, a dashed "further off, and not started"
 * row — and it read as a roadmap because it was one. It also had a job: a maker landing here
 * wants to know whether Batchlabel handles the thing they make. That job survives; the
 * comparison it used to be wrapped in does not.
 *
 * So the four product forms get equal weight and no badges, and each says what is actually
 * different about labelling it. That is the part a category list never told anyone.
 */
export function ProductForms() {
  return (
    <Section className="bg-white" ariaLabelledBy="forms-heading">
      <Eyebrow>What we cover</Eyebrow>
      <Heading id="forms-heading">Candles, melts, diffusers and sprays</Heading>
      <Lead className="mt-3">
        The calculation behind all four is the same one. What ends up on the label is not,
        and Batchlabel knows the difference.
      </Lead>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {productForms.map((form) =>
        <li
          key={form.id}
          className="flex flex-col rounded-2xl border border-paper-edge bg-paper p-5 sm:p-6">

            <h3 className="font-display text-[1.1rem] font-semibold text-ink">{form.name}</h3>
            <p className="mt-1 text-sm font-medium text-ink-soft">{form.what}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{form.changes}</p>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              Built against {form.rules}.
            </p>
          </li>
        )}
      </ul>

      <div className="mt-8">
        <Button to="/sign-up" track={{ label: 'Make a label free', location: 'home_product_forms' }}>
          Make a label free
        </Button>
      </div>
    </Section>);

}
