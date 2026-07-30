/**
 * The FAQ copy, and the only place it lives.
 *
 * Answers are plain strings rather than `React.ReactNode` on purpose: the same array
 * feeds both the visible accordions and the `FAQPage` JSON-LD built in
 * `src/lib/structured-data.ts`. If an answer could be JSX, the structured data would
 * silently stop matching what a reader sees, which is exactly the drift Google penalises.
 * `FaqEntry` is structurally assignable to `AccordionItem`, so the components take it
 * unchanged.
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
  'You upload it, and we read the parts that matter for labelling. It is worth keeping a copy on file, because your supplier will send an updated one when a fragrance is reformulated. If the sheet is missing information we need, we tell you which line to ask your supplier about.'
},
{
  question: 'What is a UFI and do I need one?',
  answer:
  'A UFI is a Unique Formula Identifier, the 16 character code that links your product to the recipe you notified to the poison centres. If your product is classified as hazardous and you sell it to the public in the UK or EU, it belongs on the label. Batchlabel generates the code and places it for you.'
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
  'Open the saved recipe, change the fragrance percentage or the pack size, and download a new label. Nothing is hard coded into a spreadsheet, so a change of fragrance load does not mean rebuilding your formulas.'
},
{
  question: 'Can I print the labels at home?',
  answer:
  'Yes. Paid plans give you a print ready PDF at true size plus an SVG if your printer asks for vector artwork. Both keep the pictograms and regulated text at the minimum sizes the rules require.'
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
    'The safety data sheet from your fragrance oil supplier, the percentage of fragrance in your product, and your pack size. That is it. If you sell more than one size, you can produce a label for each.'
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
    'Notification is a separate submission to the relevant authority. Batchlabel generates the UFI, which is the code that ties your notified recipe to the label, but you still make the submission yourself.'
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
    'You can set the label size, choose a layout, and place your own logo. The regulated text stays at the sizes and spacing the rules require, because that is the part that gets a listing pulled down.'
  },
  {
    question: 'What file formats do I get?',
    answer:
    'The free plan gives you a watermarked PNG preview. The Maker plan gives you print ready PDF and SVG with no watermark.'
  }]

},
{
  title: 'Account and billing',
  items: [
  {
    question: 'Is there a free option?',
    answer:
    'Yes. You can make one label and see the full preview without entering a card. It is watermarked and PNG only, but the wording on it is the real thing.'
  },
  {
    question: 'Is VAT included?',
    answer:
    'Prices shown are inclusive of VAT for consumers. If you are a VAT registered business, enter your VAT number at checkout and Stripe will show the correct treatment on your invoice.'
  },
  {
    question: 'Can I cancel?',
    answer:
    'Any time, from the billing section in your dashboard. Your plan runs to the end of the period you have paid for, and we do not ask you why.'
  },
  {
    question: 'Do you refund?',
    answer:
    'If something is wrong within 14 days of paying and we cannot put it right, email us and we will refund you. Annual plans cancelled part way through are refunded pro rata on request.'
  }]

}];


/** Pricing page questions: VAT, cancellation and refunds. */
export const pricingFaqs: FaqEntry[] = [
{
  question: 'Is VAT included in the price?',
  answer:
  'Yes. The £14 monthly and £140 annual prices are inclusive of VAT for consumers. VAT registered businesses can add a VAT number at checkout and it will be reflected on the invoice.'
},
{
  question: 'How do I cancel?',
  answer:
  'Open Billing in your dashboard and cancel in two clicks. You keep access until the end of the period you have paid for. No email, no retention call.'
},
{
  question: 'What is your refund policy?',
  answer:
  'If Batchlabel does not do what this page says within 14 days of your payment, email us and we will refund you in full. Cancelled annual plans are refunded pro rata on request.'
},
{
  question: 'Do I need a card for the free label?',
  answer:
  'No. The free label needs an email address only. We ask for a card when you decide you want unwatermarked, print ready files.'
},
{
  question: 'Can I switch between monthly and annual?',
  answer:
  'Yes, from the billing portal. Changes are prorated by Stripe, so you are only charged for the difference.'
},
{
  question: 'Do you offer anything for larger teams?',
  answer:
  'The Maker plan covers teams of up to five people. If you run something bigger, email us and we will talk it through rather than sell you a tier you do not need.'
}];

/** Every question on the FAQ page, flattened, in the order a reader meets them. */
export const allFaqEntries: FaqEntry[] = faqGroups.flatMap((group) => group.items);