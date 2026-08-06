
const included = [
'Hazard pictograms',
'Hazard statements',
'Precautionary statements',
'Allergen declarations',
'UFI'];


/**
 * The regulation strip.
 *
 * It was a white band with five grey pills in it, which made the one piece of hard
 * regulatory fact on the home page look like a tag cloud. It is now the darkest warm
 * stock on the site with the sentence set as a caption in the mono face and the five
 * elements as a ruled row, so the band reads as a colophon: the thing that says what this
 * is built against.
 */
export function TrustStrip() {
  return (
    <section
      aria-label="What the labels are built against"
      className="border-y border-paper-edge bg-paper-shade px-5 py-8 sm:px-8 sm:py-9">

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-center lg:gap-12">
        <p className="max-w-md text-[0.95rem] leading-[1.6] text-ink-soft lg:border-r lg:border-paper-edge lg:pr-12">
          Labels are built against UK CLP and EU CLP, that is Regulation 1272/2008 on
          Classification, Labelling and Packaging.
        </p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
          {included.map((item) =>
          <li
            key={item}
            className="flex items-center gap-2.5 font-mono text-[0.72rem] font-medium uppercase tracking-[0.11em] text-ink-soft">

              <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-clay-500" />
              {item}
            </li>
          )}
        </ul>
      </div>
    </section>);

}
