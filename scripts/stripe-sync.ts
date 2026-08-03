/**
 * Creates or brings up to contract every Batchlabel product and price, in one mode.
 *
 *   npx vite-node scripts/stripe-sync.ts --dry-run     # print the plan, write nothing
 *   npx vite-node scripts/stripe-sync.ts               # test mode (test key required)
 *   npx vite-node scripts/stripe-sync.ts --live        # live mode, deliberately
 *
 * Idempotent: run it twice and the second run reports "ok" for everything. That is what
 * makes it the authority rather than a one-off migration — the catalogue is re-provable at
 * any time, in either mode, and `stripe-verify.ts` checks the same facts from the outside.
 *
 * WHAT IT WILL NOT DO SILENTLY
 *
 * `unit_amount`, `currency`, `tax_behavior` and `recurring.interval` are immutable on a
 * Stripe price. When one of them differs from the contract the price cannot be edited, so a
 * REPLACEMENT is created, the lookup key is transferred to it atomically, and the old price
 * is archived — but only after checking that no subscription is riding it. Archiving a price
 * does not cancel its subscriptions: they keep billing, their id leaves the environment, and
 * the webhook then resolves them to nothing. A price with live subscriptions therefore stops
 * the run and prints the subscription ids instead of quietly stranding a customer.
 */

import type Stripe from 'stripe';
import {
  ALL_PRICES,
  BRAND,
  CATALOGUE,
  CURRENCY,
  LOOKUP_KEYS,
  PORTAL_CONFIG_ENV,
  STATEMENT_DESCRIPTOR,
  TAX_BEHAVIOUR,
  TAX_CODE,
  fail,
  openStripe,
  priceMetadata,
  productMetadata,
  type CataloguePrice,
  type CatalogueProduct,
  type ModeContext } from
'./stripe-catalogue';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const KEEP_LEGACY = argv.includes('--keep-legacy');

const mode = openStripe(argv);
if (DRY_RUN) console.log('[stripe] DRY RUN — nothing will be written\n');

const resolved = new Map<string, string>();
const notes: string[] = [];

function did(action: string, detail: string): void {
  console.log(`  ${DRY_RUN ? 'would' : 'did  '} ${action.padEnd(16)} ${detail}`);
}

function ok(detail: string): void {
  console.log(`  ok${' '.repeat(20)}${detail}`);
}

async function allBrandProducts(stripe: Stripe): Promise<Stripe.Product[]> {
  const products = await stripe.products.list({ limit: 100 }).autoPagingToArray({ limit: 1000 });
  return products.filter((product) => product.metadata?.brand === BRAND);
}

/**
 * The product this catalogue entry already has, if any.
 *
 * Two ways to match, and the second one is why the existing test-mode Maker product is
 * reused instead of duplicated: it predates the contract, so it carries `brand` but no
 * `plan` metadata. Matching on the exact product name recovers it. Duplicating it would
 * leave two "Batchlabel Maker" rows in the portal's plan picker.
 */
function findProduct(products: Stripe.Product[], entry: CatalogueProduct): Stripe.Product | undefined {
  return (
    products.find((product) => product.metadata?.plan === entry.slug) ??
    products.find((product) => product.name === entry.name));

}

function productNeedsUpdate(product: Stripe.Product, entry: CatalogueProduct): boolean {
  return (
    product.name !== entry.name ||
    product.description !== entry.description ||
    product.tax_code !== TAX_CODE ||
    product.statement_descriptor !== STATEMENT_DESCRIPTOR ||
    product.metadata?.plan !== entry.slug ||
    product.metadata?.brand !== BRAND ||
    product.active !== true);

}

async function syncProduct(
mode: ModeContext,
products: Stripe.Product[],
entry: CatalogueProduct)
: Promise<string> {
  const existing = findProduct(products, entry);
  const params = {
    name: entry.name,
    description: entry.description,
    tax_code: TAX_CODE,
    statement_descriptor: STATEMENT_DESCRIPTOR,
    metadata: productMetadata(entry.slug)
  };

  if (!existing) {
    if (DRY_RUN) {
      did('create product', `${entry.name}`);
      return `prod_DRYRUN_${entry.slug}`;
    }
    const created = await mode.stripe.products.create(params);
    did('create product', `${entry.name}  ${created.id}`);
    return created.id;
  }

  if (productNeedsUpdate(existing, entry)) {
    if (!DRY_RUN) await mode.stripe.products.update(existing.id, { ...params, active: true });
    did('update product', `${entry.name}  ${existing.id}`);
  } else {
    ok(`${entry.name}  ${existing.id}`);
  }
  return existing.id;
}

/** Immutable on a Stripe price, so a difference means replace-and-transfer, not edit. */
function priceIsIncompatible(price: Stripe.Price, wanted: CataloguePrice): boolean {
  return (
    price.unit_amount !== wanted.point.amountPence ||
    price.currency !== CURRENCY ||
    price.tax_behavior !== TAX_BEHAVIOUR ||
    price.recurring?.interval !== wanted.stripeInterval ||
    price.recurring?.usage_type !== 'licensed');

}

async function subscriptionsOn(mode: ModeContext, priceId: string): Promise<string[]> {
  const subscriptions = await mode.stripe.subscriptions.list({
    price: priceId,
    status: 'all',
    limit: 100
  });
  return subscriptions.data.
  filter((subscription) => subscription.status !== 'canceled').
  map((subscription) => subscription.id);
}

async function archive(mode: ModeContext, price: Stripe.Price, why: string): Promise<void> {
  const riders = DRY_RUN ? [] : await subscriptionsOn(mode, price.id);
  if (riders.length > 0) {
    fail(
      `${price.id} (${why}) still has ${riders.length} live subscription(s): ${riders.join(', ')}\n` +
      '  Archiving it would leave them billing on a price no environment names, which the\n' +
      '  webhook then cannot resolve. Cancel or migrate them first:\n' +
      riders.map((id) => `    stripe subscriptions cancel ${id}`).join('\n')
    );
  }
  if (!DRY_RUN) await mode.stripe.prices.update(price.id, { active: false });
  did('archive price', `${price.id}  (${why})`);
}

async function syncPrice(
mode: ModeContext,
productId: string,
wanted: CataloguePrice,
byLookupKey: Map<string, Stripe.Price>)
: Promise<string> {
  const params: Stripe.PriceCreateParams = {
    product: productId,
    currency: CURRENCY,
    unit_amount: wanted.point.amountPence,
    recurring: { interval: wanted.stripeInterval, usage_type: 'licensed' },
    tax_behavior: TAX_BEHAVIOUR,
    lookup_key: wanted.point.lookupKey,
    nickname: wanted.nickname,
    metadata: priceMetadata(wanted)
  };

  const existing = byLookupKey.get(wanted.point.lookupKey);

  if (!existing) {
    if (DRY_RUN) {
      did('create price', `${wanted.point.lookupKey}`);
      return `price_DRYRUN_${wanted.slug}_${wanted.interval}`;
    }
    const created = await mode.stripe.prices.create(params);
    did('create price', `${wanted.point.lookupKey}  ${created.id}`);
    return created.id;
  }

  if (priceIsIncompatible(existing, wanted)) {
    if (DRY_RUN) {
      did('replace price', `${wanted.point.lookupKey}  (amount/currency/tax/interval changed)`);
      return `price_DRYRUN_${wanted.slug}_${wanted.interval}`;
    }
    const replacement = await mode.stripe.prices.create({ ...params, transfer_lookup_key: true });
    did('replace price', `${wanted.point.lookupKey}  ${existing.id} -> ${replacement.id}`);
    await archive(mode, existing, 'superseded');
    return replacement.id;
  }

  const drifted =
  existing.nickname !== wanted.nickname ||
  existing.metadata?.brand !== BRAND ||
  existing.metadata?.plan !== wanted.slug ||
  existing.metadata?.billing_interval !== wanted.interval ||
  existing.active !== true ||
  existing.product !== productId;

  if (existing.product !== productId) {
    // A price cannot be moved between products. Recreating under the right product is the
    // only fix, and it is not something to do implicitly.
    fail(
      `${existing.id} holds ${wanted.point.lookupKey} but hangs off ${String(existing.product)}, ` +
      `not ${productId}. A price cannot change product; archive it by hand and re-run.`
    );
  }

  if (drifted) {
    if (!DRY_RUN) {
      await mode.stripe.prices.update(existing.id, {
        nickname: wanted.nickname,
        metadata: priceMetadata(wanted),
        active: true
      });
    }
    did('update price', `${wanted.point.lookupKey}  ${existing.id}`);
  } else {
    ok(`${wanted.point.lookupKey}  ${existing.id}`);
  }
  return existing.id;
}

/**
 * `default_price` on the three sellable products, and deliberately NOT on the rail test.
 *
 * The dashboard's one-click "sell this" affordances — Payment Links, the Share button —
 * key off `default_price`. The rail test must not be one click away from being sold to a
 * stranger, so its stays null and this reports it if anything ever sets one.
 */
async function syncDefaultPrice(
mode: ModeContext,
entry: CatalogueProduct,
productId: string)
: Promise<void> {
  const monthly = entry.prices.find((price) => price.interval === 'monthly');
  const product = DRY_RUN ? null : await mode.stripe.products.retrieve(productId);

  if (!entry.publiclyListed) {
    if (product?.default_price) {
      notes.push(
        `${entry.name} (${productId}) has default_price ${String(product.default_price)}. ` +
        'The rail test must have none — clear it in the dashboard.'
      );
    }
    return;
  }

  if (!monthly) return;
  const wantedId = resolved.get(`${entry.slug}:monthly`);
  if (!wantedId || wantedId.startsWith('price_DRYRUN')) {
    did('default_price', `${entry.name} -> monthly`);
    return;
  }
  const current = typeof product?.default_price === 'string' ?
  product.default_price :
  product?.default_price?.id ?? null;
  if (current === wantedId) {
    ok(`${entry.name} default_price ${wantedId}`);
    return;
  }
  await mode.stripe.products.update(productId, { default_price: wantedId });
  did('default_price', `${entry.name} -> ${wantedId}`);
}

/**
 * Anything Batchlabel-branded and still sellable that the contract does not name.
 *
 * This is the half that matters most for the two pre-existing test-mode Maker prices: they
 * are `tax_behavior: inclusive`, which under the decided pricing is not a stale amount but a
 * WRONG one — a checkout through them charges VAT-inclusive against copy that says exc VAT.
 * Leaving them active is worse than breaking an environment that still names them, and the
 * replacement ids are printed at the bottom of this run.
 */
async function archiveLegacy(mode: ModeContext, productIds: string[]): Promise<void> {
  for (const productId of productIds) {
    if (productId.startsWith('prod_DRYRUN')) continue;
    const prices = await mode.stripe.prices.
    list({ product: productId, active: true, limit: 100 }).
    autoPagingToArray({ limit: 500 });
    for (const price of prices) {
      if (price.lookup_key && LOOKUP_KEYS.includes(price.lookup_key)) continue;
      if (KEEP_LEGACY) {
        notes.push(`${price.id} on ${productId} is active but not in the contract (kept: --keep-legacy).`);
        continue;
      }
      await archive(mode, price, 'not in the contract');
    }
  }
}

/**
 * The block below is pasted verbatim into a shell, so it may only ever contain values that
 * are true at the moment it is printed. Two names are therefore held back rather than filled
 * with something that looks like one.
 *
 * `STRIPE_PORTAL_CONFIGURATION_ID` is emitted only when a real `bpc_…` id is already in the
 * environment — this script does not create the configuration, stripe-portal-config.ts does,
 * and it prints the line. A placeholder would be worse than nothing: it is truthy, so
 * readServerConfig passes it to Stripe as `configuration` and every "Manage billing" click
 * 502s, while the branch that exists to report a MISSING portal id never fires because the
 * var IS set. The result reads as a Stripe outage rather than an unset env var.
 *
 * `RAIL_TEST_ALLOWED_EMAILS` is never emitted at all. With `--live` the targets here are
 * ['production'], so pasting it would set one of the two gates the rail-test checkout
 * requires — permanently, in live mode — and the £0.01 item is then purchasable by an
 * ordinary customer, which the decided pricing forbids outright. It is a flag for the minutes
 * a live rail test takes: set by hand, removed straight after.
 */
function envBlock(): string {
  const targets = mode.live ? ['production'] : ['preview', 'development'];
  const portalId = process.env[PORTAL_CONFIG_ENV]?.trim();
  const portalKnown = portalId?.startsWith('bpc_') === true;

  const lines: string[] = [];

  // On a dry run every id below is a `price_DRYRUN_*` placeholder, because nothing was
  // created. The block is still printed so the shape can be reviewed — but it is emitted
  // COMMENTED OUT, because it is otherwise a fully executable script that begins by
  // deleting the real values (`vercel env rm`) and then writes fakes over them. With
  // `--dry-run --live` that is a production outage handed to the founder by the one flag
  // whose entire promise is that it writes nothing. Reviewable and inert beats copyable.
  const inert = (line: string): string => (DRY_RUN ? (line === '' ? '#' : `# ${line}`) : line);

  if (DRY_RUN) {
    lines.push('# ══════════════════════════════════════════════════════════════════');
    lines.push('# DRY RUN — every id below is a PLACEHOLDER. Nothing was created.');
    lines.push('# This block is commented out on purpose: it starts with `vercel env rm`,');
    lines.push('# so running it would delete real values and write fakes over them.');
    lines.push('# Re-run without --dry-run to get a block that is safe to paste.');
    lines.push('# ══════════════════════════════════════════════════════════════════');
  }

  lines.push(inert('cd ~/Documents/Orchestrate/batch-label'));
  lines.push(inert(''));
  lines.push(`# ${mode.label.toUpperCase()} mode ids -> ${targets.join(' + ')}.`);
  lines.push('# printf, never echo: echo appends a newline and Stripe then reports the price');
  lines.push('# id as not found, which reads exactly like the price does not exist.');
  lines.push(inert('VALUES=('));
  for (const price of ALL_PRICES) {
    lines.push(inert(`  "${price.point.envVar}=${resolved.get(`${price.slug}:${price.interval}`) ?? 'MISSING'}"`));
  }
  if (portalKnown) lines.push(inert(`  "${PORTAL_CONFIG_ENV}=${portalId}"`));
  lines.push(inert(')'));
  lines.push(inert('for PAIR in "${VALUES[@]}"; do'));
  lines.push(inert('  NAME="${PAIR%%=*}"; VALUE="${PAIR#*=}"'));
  lines.push(inert(`  for ENV in ${targets.join(' ')}; do`));
  lines.push(inert('    vercel env rm "$NAME" "$ENV" --yes 2>/dev/null || true'));
  lines.push(inert('    printf \'%s\' "$VALUE" | vercel env add "$NAME" "$ENV"'));
  lines.push(inert('  done'));
  lines.push(inert('done'));
  lines.push(inert(''));
  lines.push('# NOT set above, deliberately — do not add either by hand:');
  if (!portalKnown) {
    lines.push(`#   ${PORTAL_CONFIG_ENV} — no configuration id is known to this run. Run`);
    lines.push('#     scripts/stripe-portal-config.ts; it prints the real bpc_ id to set. Leave the');
    lines.push('#     var UNSET until then: any placeholder is truthy, so the portal session would');
    lines.push('#     send it to Stripe and every "Manage billing" click would 502, while the check');
    lines.push('#     that reports a missing portal id stays silent because the var is set.');
  }
  lines.push('#   RAIL_TEST_ALLOWED_EMAILS — a comma-separated allow-list of the people who may');
  lines.push('#     buy the rail-test price. Unset authorises nobody. It is not emitted here');
  lines.push('#     because who may run a live rail test is a decision, not a deployment step.');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const products = await allBrandProducts(mode.stripe);
  const productIds: string[] = [];

  console.log('products');
  for (const entry of CATALOGUE) {
    const productId = await syncProduct(mode, products, entry);
    resolved.set(`product:${entry.slug}`, productId);
    productIds.push(productId);
  }

  // One call for all seven: lookup keys are unique account-wide, so this is also how a key
  // held by a price on the WRONG product is discovered.
  const byLookupKey = new Map<string, Stripe.Price>();
  if (!DRY_RUN) {
    const held = await mode.stripe.prices.list({ lookup_keys: [...LOOKUP_KEYS], limit: 100 });
    for (const price of held.data) {
      if (price.lookup_key) byLookupKey.set(price.lookup_key, price);
    }
  }

  console.log('\nprices');
  for (const entry of CATALOGUE) {
    const productId = resolved.get(`product:${entry.slug}`) as string;
    for (const price of entry.prices) {
      resolved.set(`${price.slug}:${price.interval}`, await syncPrice(mode, productId, price, byLookupKey));
    }
  }

  console.log('\ndefault price');
  for (const entry of CATALOGUE) {
    await syncDefaultPrice(mode, entry, resolved.get(`product:${entry.slug}`) as string);
  }

  console.log('\nlegacy');
  if (DRY_RUN) {
    console.log('  (skipped in a dry run — it reads live subscription state)');
  } else {
    await archiveLegacy(mode, productIds);
    console.log('  done');
  }

  console.log('\n─── resolved ids ───────────────────────────────────────────────');
  for (const entry of CATALOGUE) {
    console.log(`  ${entry.name.padEnd(22)} ${resolved.get(`product:${entry.slug}`)}`);
    for (const price of entry.prices) {
      console.log(
        `    ${price.point.envVar.padEnd(34)} ${resolved.get(`${price.slug}:${price.interval}`)}`
      );
    }
  }

  console.log('\n─── vercel env ────────────────────────────────────────────────');
  console.log(envBlock());

  if (notes.length > 0) {
    console.log('\n─── needs a human ─────────────────────────────────────────────');
    for (const note of notes) console.log(`  ! ${note}`);
  }

  console.log(
    '\nNext: npx vite-node scripts/stripe-portal-config.ts' +
    `${mode.live ? ' --live' : ''}, then scripts/stripe-verify.ts.\n`
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
