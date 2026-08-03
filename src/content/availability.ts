/**
 * What Batchlabel does not do yet, said out loud.
 *
 * The register exists because the alternative failed. The site previously advertised a
 * watermarked PNG preview, print-ready PDF and SVG export, UFI generation, saved recipes
 * and five people on an account — none of which had any code behind them, and three of
 * which had reached the terms of service and the machine-readable `Offer` markup that
 * answer engines quote. A claim with no mechanism is not optimism; it is something a
 * customer paid for and did not get.
 *
 * The rule this file enforces: anything not built is either struck from the site or listed
 * here and rendered under a heading that says plainly it is not available. Nothing sits in
 * between, and nothing appears as a plain feature row until it ships.
 *
 * Deleting a row is how a feature ships. If a row here ever needs softening rather than
 * deleting, it was not ready.
 */

export interface NotYetBuilt {
  /** Short label, sentence case, no "coming soon" flourish. */
  title: string;
  /** What a customer can do in the meantime, or what the absence actually means. */
  body: string;
}

/**
 * Ordered by how likely a maker is to ask about it. File export is first because it is the
 * one people arrive expecting.
 */
export const NOT_YET_BUILT: NotYetBuilt[] = [
  {
    title: 'Downloading the label as a file',
    body: 'PDF and SVG export is being built and is not available yet. Today you build the label in Batchlabel and read it on screen at true size. We will not charge for the export when it lands — it is included on every plan, including Free.'
  },
  {
    title: 'Generating your UFI',
    body: 'We place the UFI on the label where CLP requires it, but we do not generate the code itself yet. Generate it with ECHA\'s free UFI generator when you make your poison centre notification, and enter it here.'
  },
  {
    title: 'Archiving a SKU you have stopped selling',
    body: 'There is no archive yet, so every SKU you make counts towards your plan whether you still sell it or not. This one matters if you run a seasonal range: plan for the number of SKUs you will have made by the end of the year, not the number on sale this month.'
  },
  {
    title: 'Putting your logo or your artwork on the label',
    body: 'Not built. You can choose the label size and adjust the type size and line spacing, and there is an optional block carrying your business name, but nothing accepts an uploaded image.'
  },
  {
    title: 'More than one person on an account',
    body: 'Every account is one login today. Editor seats and read-only seats are designed and not built, so no plan currently lets a second person in.'
  },
  {
    title: 'Alerts when a supplier reissues a safety data sheet',
    body: 'Not built. Keep the PDF your supplier sent you and check for a new version yourself — a reformulated fragrance changes the classification, and therefore the label.'
  },
  {
    title: 'Bulk generation, CSV import and the API',
    body: 'Not built. These are the things the Consultant plan is meant to add, and until they exist Consultant differs from Studio only by how many SKUs it holds.'
  },
  {
    title: 'Removing Batchlabel branding',
    body: 'Not built. Nothing on the regulated part of the label carries our name, but there is no setting to change the rest yet.'
  }
];
