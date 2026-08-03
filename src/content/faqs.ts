/**
 * The FAQ copy, and the only place it lives.
 *
 * Answers are plain strings rather than `React.ReactNode` on purpose: the same array
 * feeds both the visible accordions and the `FAQPage` JSON-LD built in
 * `src/lib/structured-data.ts`. If an answer could be JSX, the structured data would
 * silently stop matching what a reader sees, which is exactly the drift Google penalises.
 * `FaqEntry` is structurally assignable to `AccordionItem`, so the components take it
 * unchanged.
 *
 * Because they are plain strings they cannot interpolate, so **no answer may carry a
 * price or an allowance**. Every figure lives in `src/lib/plans.ts` and answers defer to
 * the pricing page rather than restating it. Eight hand-typed copies of one price is how
 * this site ended up quoting a figure the checkout did not charge.
 */
export interface FaqEntry {
  question: string;
  answer: string;
}

/** Six questions used on the home page. */
export const homeFaqs: FaqEntry[] = [
{
  question: 'Do I still need to read the safety data sheet myself?',
  answer:
  'You upload it, and we read the parts that matter for labelling. It is worth keeping a copy on file, because your supplier will send an updated one when a fragrance is reformulated, and we do not yet watch for that on your behalf. If the sheet is missing information we need, we tell you which line to ask your supplier about.'
},
{
  question: 'What is a UFI and do I need one?',
  answer:
  'A UFI is a Unique Formula Identifier, the 16 character code that links your product to the recipe you notified to the poison centres. If your product is classified as hazardous and you sell it to the public in the UK or EU, it belongs on the label. Batchlabel places it on the label where CLP requires it, but it does not generate the code yet: get it from ECHA\'s free UFI generator when you make your notification, and enter it here.'
},
{
  question: 'Is Batchlabel a substitute for a compliance consultant?',
  answer:
  'No. Batchlabel builds your label against published UK CLP and EU CLP requirements using the information you give us. It does not certify or approve anything, and responsibility for the finished label stays with you as the seller. You can use us for everyday labels and still take advice on an unusual product.'
},
{
  question: 'Which products does it cover?',
  answer:
  'Candles, wax melts, reed diffusers and room sprays, built against UK and EU CLP. That is the lot. We would like to cover cosmetics and other categories one day, but none of that is built and we are not promising a date. If you make something unusual, send us the safety data sheet and we will tell you honestly whether we can handle it.'
},
{
  question: 'What if I change my recipe?',
  answer:
  'Change the fragrance percentage and the label changes with it, including which precautionary statements apply. Nothing is hard coded into a spreadsheet, so a change of load does not mean rebuilding your formulas. Selling the same fragrance in a different pack size is a different SKU, because it is a different thing on a shelf: it gets its own label and it counts towards your plan.'
},
{
  question: 'Can I print the labels at home?',
  answer:
  'Not yet, and we would rather say so plainly. Batchlabel works out the exact wording, pictograms and minimum sizes and shows you the label at true size, but downloading it as a PDF or an SVG is still being built. When that lands it will be on every plan, including Free, and the file will be identical on all of them.'
}];


/** Longer set for the full FAQ page, grouped by theme. */
export const faqGroups: {title: string;items: FaqEntry[];}[] = [
{
  title: 'Which products we cover',
  items: [
  {
    question: 'Which product categories can I label today?',
    answer:
    'Candles, wax melts, reed diffusers and room sprays, all built against UK CLP and EU CLP. Nothing else, yet.'
  },
  {
    question: 'Do you do cosmetics labelling?',
    answer:
    'No. It is the category makers ask us for most and the one we would most like to add, but we have not started building it and there is no date. Email hello@batchlabel.co.uk if you want it and we will let you know if that changes. Whenever it arrives it would cover the label only, so it would still not replace a Cosmetic Product Safety Report.'
  },
  {
    question: 'Will Batchlabel work for other products, like wider consumer goods or electronics?',
    answer:
    'One day, we hope. The hard part of any label is turning safety data into the exact words the rules require, and that is not specific to candles. But nothing beyond candles and home fragrance exists, and we would rather say so than sell you a roadmap.'
  }]

},
{
  title: 'Getting started',
  items: [
  {
    question: 'What do I need before I start?',
    answer:
    'The safety data sheet from your fragrance oil supplier, the percentage of fragrance in your product, and your pack size. That is it. If you sell more than one size you can build a label for each, and each size is its own SKU, so each one counts towards your plan.'
  },
  {
    question: 'Where do I get a safety data sheet?',
    answer:
    'Your fragrance oil supplier must provide one free of charge. It is usually a PDF on the product page or available on request. Ask for the current version, because the classification changes when a fragrance is reformulated.'
  },
  {
    question: 'How long does the first label take?',
    answer:
    'About ten minutes on your first go, and a couple of minutes after that.'
  }]

},
{
  title: 'Regulation, in plain words',
  items: [
  {
    question: 'What is CLP?',
    answer:
    'CLP stands for Classification, Labelling and Packaging. In Great Britain it is the GB CLP Regulation, and in the EU and Northern Ireland it is EU CLP, Regulation 1272/2008. It sets out what has to appear on the label of a product that contains hazardous substances, including your candles and diffusers.'
  },
  {
    question: 'Does Batchlabel confirm that my label is compliant?',
    answer:
    'No, and you should be wary of any tool that says it does. We build the label against published CLP requirements from the details you enter. If the safety data sheet or the percentage you give us is wrong, the label will be wrong too. Responsibility for the final label rests with you as the seller.'
  },
  {
    question: 'Do I also need a CPSR for cosmetics?',
    answer:
    'If you sell cosmetics, yes. A CPSR is a Cosmetic Product Safety Report and it is separate from labelling. Batchlabel does not produce one, and we do not label cosmetics at all today.'
  },
  {
    question: 'What about poison centre notification?',
    answer:
    'Notification is a separate submission to the relevant authority, and you make it yourself. The UFI is the code that ties your notified recipe to the label. We place it on the label, but we do not generate it for you yet, so get it from ECHA\'s free UFI generator at the point you notify.'
  }]

},
{
  title: 'Labels and printing',
  items: [
  {
    question: 'What is on the generated label?',
    answer:
    'Product name and pack size, hazard pictograms, the signal word, hazard statements, precautionary statements, allergen declarations, the UFI, batch code, your business name and address, and any candle or diffuser safety wording that applies.'
  },
  {
    question: 'Can I match it to my brand?',
    answer:
    'Only a little, and not with a logo yet. You can choose the label size, set the type size and line spacing, and turn on an optional block carrying your business name. There is no way to upload a logo or artwork, and we are not going to pretend otherwise. The regulated text stays at the sizes and spacing the rules require whatever you change, because that is the part that gets a listing pulled down.'
  },
  {
    question: 'What file formats do I get?',
    answer:
    'None yet. File export is the piece we are building now: today you build the label in Batchlabel and read it at true size on screen. PDF and SVG export will be included on every plan, including Free, and identical on all of them. Plans differ by how many SKUs you can hold, never by what comes out of them.'
  }]

},
{
  title: 'Account and billing',
  items: [
  {
    question: 'Is there a free option?',
    answer:
    'Yes, and it is permanent rather than a trial. The Free plan gives you a small number of SKUs with no card, and the count is on the pricing page. The label is the real thing: nothing the regulations require is left off, and nothing about it is cut down because you have not paid.'
  },
  {
    question: 'Does the price include VAT?',
    answer:
    'No. Every price on the site excludes VAT. Stripe adds VAT at checkout based on where you are, and on your VAT number if you give one. Prices are in GBP wherever you are buying from.'
  },
  {
    question: 'Can I cancel?',
    answer:
    'Any time, from the billing portal. Your plan runs to the end of the period you have paid for, and we do not ask you why.'
  },
  {
    question: 'Do you refund?',
    answer:
    'If something is wrong within 14 days of paying and we cannot put it right, email us and we will refund you. Outside that, cancelling stops the next payment rather than refunding the current period, so you keep your plan until the period you paid for runs out.'
  }]

}];


/** Pricing page questions: how the meter works, VAT, cancellation and refunds. */
export const pricingFaqs: FaqEntry[] = [
{
  question: 'How is the price metered?',
  answer:
  'By SKU. One scent sold in three pack sizes counts as three, because each one is a separate thing on a shelf with its own label. Reading supplier safety data sheets is never counted, on any plan. There is no archive yet, so a SKU you have stopped selling still counts towards your plan.'
},
{
  question: 'Does the price include VAT?',
  answer:
  'No. Every price on this page excludes VAT. Stripe adds it at checkout based on where you are, and VAT registered businesses can add a VAT number at checkout so it is reflected on the invoice. Prices are in GBP for customers in every country.'
},
{
  question: 'How do I cancel?',
  answer:
  'Open the billing portal from your account and cancel in two clicks. You keep access until the end of the period you have paid for. No email, no retention call.'
},
{
  question: 'What is your refund policy?',
  answer:
  'If Batchlabel does not do what this page says within 14 days of your payment, email us and we will refund you in full. Outside that window, cancelling ends the plan at the end of the period you have already paid for rather than refunding it.'
},
{
  question: 'Do I need a card to start?',
  answer:
  'No. The Free plan needs an email address only, and it is permanent. We ask for a card when you want to hold more SKUs than Free covers, never to unlock something on the label itself.'
},
{
  question: 'Can I switch between monthly and annual?',
  answer:
  'Yes, from the billing portal, and which way you are going changes when it happens. Moving up, monthly to yearly or to a larger plan, takes effect straight away. Moving down, yearly back to monthly or to a smaller plan, is scheduled for the end of the period you have already paid for: you keep what you bought until then, and nothing is credited or refunded in the meantime.'
},
{
  question: 'Can more than one person use the account?',
  answer:
  'Not yet. Every account is a single login today. Editor seats and free read-only seats are designed and not built, so no plan currently admits a second person, and we are not selling one that does.'
}];

/** Every question on the FAQ page, flattened, in the order a reader meets them. */
export const allFaqEntries: FaqEntry[] = faqGroups.flatMap((group) => group.items);
