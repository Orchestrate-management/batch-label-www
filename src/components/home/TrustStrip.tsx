
const included = [
'Hazard pictograms',
'Hazard statements',
'Precautionary statements',
'Allergen declarations',
'UFI'];


export function TrustStrip() {
  return (
    <section aria-label="What the labels are built against" className="border-b border-paper-edge bg-white px-5 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          Labels are built against UK CLP and EU CLP, that is Regulation 1272/2008 on
          Classification, Labelling and Packaging.
        </p>
        <ul className="flex flex-wrap gap-2">
          {included.map((item) =>
          <li
            key={item}
            className="rounded-full border border-paper-edge bg-paper px-3 py-1 text-xs font-medium text-ink-soft">
            
              {item}
            </li>
          )}
        </ul>
      </div>
    </section>);

}