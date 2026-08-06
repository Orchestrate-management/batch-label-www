import { Section, Heading, Eyebrow, Lead } from '../ui/Section';
import { Button } from '../ui/Button';
import { ProductFormIcon } from '../ProductFormIcon';
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
 *
 * VISUALLY: they were four text-only boxes, which is the worst possible shape for the one
 * question this section answers — "do you do the thing I make". Each entry now leads with a
 * drawing of the object, and the rules line is set as a footer inside a hairline so it is
 * legible as a citation rather than as another sentence.
 */
export function ProductForms() {
  return (
    <Section className="bg-paper-shade" ariaLabelledBy="forms-heading" width="wide">
      <div className="max-w-2xl">
        <Eyebrow>What we cover</Eyebrow>
        <Heading id="forms-heading">Candles, melts, diffusers and sprays</Heading>
        <Lead className="mt-4">
          One calculation sits behind all four. It produces a different label for each of them,
          and this is what changes.
        </Lead>
      </div>

      <ul className="mt-12 grid gap-px overflow-hidden rounded-[0.5rem] border border-paper-edge bg-paper-edge sm:grid-cols-2">
        {productForms.map((form) =>
        <li key={form.id} className="flex flex-col bg-white p-6 sm:p-8">
            <ProductFormIcon id={form.id} />
            <h3 className="mt-5 font-display text-[1.28rem] font-semibold text-ink">{form.name}</h3>
            <p className="mt-1.5 text-[0.95rem] font-medium leading-snug text-clay-600">{form.what}</p>
            <p className="mt-4 flex-1 text-[0.95rem] leading-[1.65] text-ink-soft">{form.changes}</p>
            <p className="mt-6 border-t border-paper-edge pt-3.5 font-mono text-[0.68rem] uppercase leading-relaxed tracking-[0.09em] text-ink-muted">
              Built against {form.rules}.
            </p>
          </li>
        )}
      </ul>

      <div className="mt-12">
        <Button to="/sign-up" size="lg" track={{ label: 'Make a label free', location: 'home_product_forms' }}>
          Make a label free
        </Button>
      </div>
    </Section>);

}
