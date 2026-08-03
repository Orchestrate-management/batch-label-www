/**
 * Asserts that Stripe actually looks like the contract says it does. Exit 1 on any failure.
 *
 *   npx vite-node scripts/stripe-verify.ts            # test mode
 *   npx vite-node scripts/stripe-verify.ts --live     # live mode
 *
 * Meant for CI, in both modes. `stripe-sync.ts` and `stripe-portal-config.ts` WRITE the
 * catalogue; this reads it back from the outside and checks it against the same contract,
 * which is the only way to catch the failures that happen after a successful run: a
 * dashboard edit, a price archived by hand, an env var pointed at another brand's price.
 *
 * WHY IT CHECKS THE PORTAL FIELD BY FIELD RATHER THAN JUST `enabled`
 *
 * The portal's expensive fields are the quiet ones. A configuration with
 * `subscription_update.enabled: true` and no `schedule_at_period_end` looks correct in the
 * dashboard and in a list call, and prorates every downgrade immediately — an annual
 * customer switching down two months in generates a four-figure credit balance that then
 * absorbs years of invoices at £0. `billing_cycle_anchor` is the same shape of failure. So
 * each is named here, one at a time, in addition to the whole-object comparison: a field
 * dropped from the create call would pass an equality check against that same call.
 */

import type Stripe from 'stripe';
import {
  ALL_PRICES,
  BRAND,
  CATALOGUE,
  CURRENCY,
  LOOKUP_KEYS,
  PORTAL_CONFIG_ENV,
  SELLABLE,
  STATEMENT_DESCRIPTOR,
  TAX_BEHAVIOUR,
  TAX_CODE,
  openStripe,
  resolveCatalogue,
  type ModeContext,
  type ResolvedCatalogue } from
'./stripe-catalogue';
// Set BEFORE the dynamic import below, and the import is dynamic for exactly that reason:
// stripe-portal-config.ts creates or updates the configuration when it is run, and a
// verifier must never write. See the note at the foot of that file for why an entry-point
// check cannot do this job under vite-node.
process.env.STRIPE_SCRIPTS_IMPORT_ONLY = '1';
const {
  CANCELLATION_REASONS,
  CUSTOMER_UPDATE_FIELDS,
  PORTAL_HEADLINE,
  PRIVACY_URL,
  TERMS_URL,
  portalConfigurationParams
} = await import('./stripe-portal-config');

const failures: string[] = [];
const warnings: string[] = [];
let checks = 0;

/**
 * Something wrong that no code here can put right.
 *
 * Kept separate from `check` on purpose: a gate that cannot go green stops being read. A
 * warning is for a true statement about the account that needs a human and a dashboard, not
 * a re-run of a script.
 */
function warn(label: string, condition: boolean, detail: string): void {
  if (!condition) warnings.push(`${label} — ${detail}`);
}

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1;
  if (condition) return;
  failures.push(detail ? `${label} — ${detail}` : label);
}

function equal(label: string, actual: unknown, expected: unknown): void {
  check(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function sameSet(label: string, actual: readonly string[] | null | undefined, expected: readonly string[]): void {
  const got = [...actual ?? []].sort().join(',');
  const want = [...expected].sort().join(',');
  check(label, got === want, `expected [${want}], got [${got}]`);
}

function idOf(value: string | {id: string;} | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function verifyProducts(mode: ModeContext, resolved: ResolvedCatalogue): void {
  const taxCodes = new Set<string>();

  for (const entry of CATALOGUE) {
    const product = resolved.products.get(entry.slug);
    if (!product) {
      failures.push(`product '${entry.slug}' — missing. Run scripts/stripe-sync.ts.`);
      continue;
    }
    const at = `product ${entry.slug}`;
    equal(`${at}.name`, product.name, entry.name);
    equal(`${at}.description`, product.description, entry.description);
    equal(`${at}.active`, product.active, true);
    equal(`${at}.livemode`, product.livemode, mode.live);
    equal(`${at}.metadata.brand`, product.metadata?.brand, BRAND);
    equal(`${at}.metadata.plan`, product.metadata?.plan, entry.slug);
    equal(`${at}.tax_code`, idOf(product.tax_code as string | null), TAX_CODE);
    equal(`${at}.statement_descriptor`, product.statement_descriptor, STATEMENT_DESCRIPTOR);
    taxCodes.add(String(idOf(product.tax_code as string | null)));

    // No allowance may live on a Stripe object: the account is shared and its dashboard is
    // editable with no diff, no commit and no author, so a number here is an unaudited
    // grant path. Identity metadata only.
    sameSet(`${at}.metadata keys`, Object.keys(product.metadata ?? {}), ['brand', 'plan']);

    const defaultPrice = idOf(product.default_price as string | Stripe.Price | null);
    if (entry.publiclyListed) {
      const monthly = resolved.prices.get(`${entry.slug}:monthly`)?.id ?? null;
      equal(`${at}.default_price`, defaultPrice, monthly);
    } else {
      // The dashboard's one-click sell affordances key off default_price. The rail test must
      // not be one click from being sold to a stranger.
      equal(`${at}.default_price (rail test must have none)`, defaultPrice, null);
    }
  }

  check(
    'tax_code is identical across all products',
    taxCodes.size <= 1,
    `found ${[...taxCodes].join(', ')} — a different SaaS code on one tier changes what VAT is owed on that tier alone`
  );
}

async function verifyPrices(mode: ModeContext, resolved: ResolvedCatalogue): Promise<void> {
  for (const entry of CATALOGUE) {
    for (const wanted of entry.prices) {
      const key = `${wanted.slug}:${wanted.interval}`;
      const found = resolved.prices.get(key);
      if (!found) {
        failures.push(`price '${wanted.point.lookupKey}' — missing. Run scripts/stripe-sync.ts.`);
        continue;
      }

      // currency_options is not returned unless expanded, and what has to be proven is that
      // it holds nothing but GBP: a presentment currency on any price would mean a maker in
      // Ireland is charged in euro, against the decision that every customer in every
      // country is charged in GBP. Stripe always lists the price's own currency here, so the
      // assertion is "no OTHER currency", not "empty".
      const price = await mode.stripe.prices.retrieve(found.id, { expand: ['currency_options'] });

      const at = `price ${wanted.point.lookupKey}`;
      equal(`${at}.livemode`, price.livemode, mode.live);
      equal(`${at}.active`, price.active, true);
      equal(`${at}.currency`, price.currency, CURRENCY);
      equal(`${at}.tax_behavior`, price.tax_behavior, TAX_BEHAVIOUR);
      equal(`${at}.unit_amount`, price.unit_amount, wanted.point.amountPence);
      equal(`${at}.recurring.interval`, price.recurring?.interval, wanted.stripeInterval);
      equal(`${at}.recurring.interval_count`, price.recurring?.interval_count, 1);
      equal(`${at}.recurring.usage_type`, price.recurring?.usage_type, 'licensed');
      equal(`${at}.billing_scheme`, price.billing_scheme, 'per_unit');
      equal(`${at}.lookup_key`, price.lookup_key, wanted.point.lookupKey);
      equal(`${at}.product`, idOf(price.product as string | Stripe.Product), resolved.products.get(entry.slug)?.id ?? null);
      equal(`${at}.metadata.brand`, price.metadata?.brand, BRAND);
      equal(`${at}.metadata.plan`, price.metadata?.plan, wanted.slug);
      equal(`${at}.metadata.billing_interval`, price.metadata?.billing_interval, wanted.interval);
      sameSet(`${at}.metadata keys`, Object.keys(price.metadata ?? {}), ['brand', 'plan', 'billing_interval']);
      sameSet(
        `${at}.currency_options`,
        Object.keys(price.currency_options ?? { [CURRENCY]: true }),
        [CURRENCY]
      );
    }
  }
}

/**
 * The environment against the account.
 *
 * This is the check for spec 02-stripe §4.4's inverse failure, which nothing else can see:
 * `belongsToThisBrand` falls back to membership of the price map built from env vars, so an
 * env var holding ANOTHER Orchestrate brand's price id would make Batchlabel claim their
 * subscriptions. And a MISSING env var is worse than a loud one — that price id is simply
 * absent from the map, so a subscription on it is silently ignored and the customer pays for
 * nothing with no error anywhere.
 */
function verifyEnvironment(resolved: ResolvedCatalogue): void {
  const set = ALL_PRICES.filter((price) => process.env[price.point.envVar]?.trim());

  if (set.length === 0) {
    console.log('  (no STRIPE_PRICE_* variables in this shell — env cross-check skipped)');
    return;
  }

  for (const price of ALL_PRICES) {
    const value = process.env[price.point.envVar]?.trim();
    const expected = resolved.prices.get(`${price.slug}:${price.interval}`)?.id;
    check(
      `env ${price.point.envVar} is set`,
      Boolean(value),
      'unset — a price id absent from the map is silently ignored by the webhook, so the customer pays and gets nothing'
    );
    if (value && expected) equal(`env ${price.point.envVar}`, value, expected);
  }
}

async function verifyPortal(mode: ModeContext, resolved: ResolvedCatalogue): Promise<Stripe.BillingPortal.Configuration | null> {
  const named = process.env[PORTAL_CONFIG_ENV]?.trim();
  // The product list is not returned unless expanded, and it is the field that decides which
  // tiers a customer can switch between — an unexpanded read would report an empty picker on
  // a configuration that has one, and vice versa.
  const all = await mode.stripe.billingPortal.configurations.
  list({ limit: 100, expand: ['data.features.subscription_update.products'] }).
  autoPagingToArray({ limit: 100 });
  const ours = all.filter((config) => config.metadata?.brand === BRAND);

  check(
    `${PORTAL_CONFIG_ENV} is set`,
    Boolean(named),
    'unset means every portal session silently falls back to the SHARED account default, which is the state this configuration exists to end'
  );
  check(
    'exactly one Batchlabel portal configuration exists',
    ours.length === 1,
    `found ${ours.length}`
  );

  const config = named ? all.find((candidate) => candidate.id === named) ?? null : ours[0] ?? null;
  if (!config) {
    failures.push('portal configuration — not found. Run scripts/stripe-portal-config.ts.');
    return null;
  }

  const at = 'portal';
  equal(`${at}.livemode`, config.livemode, mode.live);
  equal(`${at}.active`, config.active, true);
  equal(`${at}.metadata.brand`, config.metadata?.brand, BRAND);
  // A warning, not a failure: `is_default` is read-only, and Stripe makes the first
  // configuration on an account its default. When that has happened, every other Orchestrate
  // brand's portal session inherits Batchlabel's headline, terms link and plan picker until
  // somebody sets a different default in the Dashboard. Nothing in this repo can fix it, and
  // failing the build over it would only teach people to ignore the build.
  warn(
    `${at}.is_default`,
    config.is_default === false,
    'this configuration is the SHARED account default, so the other Orchestrate brands inherit it. Set a neutral default in the Stripe Dashboard (Billing → Customer portal).'
  );
  // A shareable hosted login page is a second, weaker door into billing.
  equal(`${at}.login_page.enabled`, config.login_page?.enabled, false);

  equal(`${at}.business_profile.headline`, config.business_profile?.headline, PORTAL_HEADLINE);
  equal(`${at}.business_profile.privacy_policy_url`, config.business_profile?.privacy_policy_url, PRIVACY_URL);
  equal(`${at}.business_profile.terms_of_service_url`, config.business_profile?.terms_of_service_url, TERMS_URL);

  equal(`${at}.features.invoice_history.enabled`, config.features.invoice_history?.enabled, true);
  equal(`${at}.features.payment_method_update.enabled`, config.features.payment_method_update?.enabled, true);

  equal(`${at}.features.customer_update.enabled`, config.features.customer_update?.enabled, true);
  sameSet(
    `${at}.features.customer_update.allowed_updates`,
    config.features.customer_update?.allowed_updates,
    CUSTOMER_UPDATE_FIELDS
  );
  check(
    `${at}.features.customer_update.allowed_updates includes 'name'`,
    (config.features.customer_update?.allowed_updates ?? []).includes('name'),
    'without it a B2B customer cannot put their legal entity name on their own invoices'
  );

  const cancel = config.features.subscription_cancel;
  equal(`${at}.features.subscription_cancel.enabled`, cancel?.enabled, true);
  equal(`${at}.features.subscription_cancel.mode`, cancel?.mode, 'at_period_end');
  equal(`${at}.features.subscription_cancel.proration_behavior`, cancel?.proration_behavior, 'none');
  equal(`${at}.features.subscription_cancel.cancellation_reason.enabled`, cancel?.cancellation_reason?.enabled, true);
  sameSet(
    `${at}.features.subscription_cancel.cancellation_reason.options`,
    cancel?.cancellation_reason?.options,
    CANCELLATION_REASONS
  );

  const update = config.features.subscription_update;
  equal(`${at}.features.subscription_update.enabled`, update?.enabled, true);
  sameSet(`${at}.features.subscription_update.default_allowed_updates`, update?.default_allowed_updates, ['price']);
  check(
    `${at}.features.subscription_update.default_allowed_updates excludes quantity and promotion_code`,
    !(update?.default_allowed_updates ?? []).some((allowed) => allowed === 'quantity' || allowed === 'promotion_code'),
    'there are no add-ons, and a self-applied promotion is an unbudgeted discount'
  );
  equal(`${at}.features.subscription_update.proration_behavior`, update?.proration_behavior, 'create_prorations');
  equal(`${at}.features.subscription_update.billing_cycle_anchor`, update?.billing_cycle_anchor, 'unchanged');
  sameSet(
    `${at}.features.subscription_update.schedule_at_period_end.conditions`,
    (update?.schedule_at_period_end?.conditions ?? []).map((condition) => condition.type),
    ['decreasing_item_amount', 'shortening_interval']
  );

  const offered = update?.products ?? [];
  sameSet(
    `${at}.features.subscription_update.products`,
    offered.map((product) => product.product),
    SELLABLE.map((product) => resolved.products.get(product.slug)?.id ?? `MISSING:${product.slug}`)
  );
  for (const product of SELLABLE) {
    const productId = resolved.products.get(product.slug)?.id;
    const row = offered.find((candidate) => candidate.product === productId);
    if (!row) continue;
    sameSet(
      `${at} ${product.slug} prices`,
      row.prices,
      product.prices.map((price) => resolved.prices.get(`${price.slug}:${price.interval}`)?.id ?? `MISSING:${price.interval}`)
    );
  }

  const railTest = CATALOGUE.find((product) => !product.publiclyListed);
  const railTestProductId = railTest ? resolved.products.get(railTest.slug)?.id : undefined;
  check(
    `${at} does not offer the rail test`,
    !offered.some((product) => product.product === railTestProductId),
    'a customer must be able to switch neither to it nor from it'
  );

  // The catch-all. Every field above is also named individually, because an equality check
  // against the create call cannot notice a field the create call itself stopped setting.
  const wanted = portalConfigurationParams(resolved);
  check(
    `${at} matches portalConfigurationParams() exactly`,
    JSON.stringify(normalise(config)) === JSON.stringify(normalise(wanted as unknown as Stripe.BillingPortal.Configuration)),
    'stripe-portal-config.ts and the live configuration have diverged; re-run it'
  );

  return config;
}

/** The comparable subset: what we set, in a stable order. */
function normalise(config: Stripe.BillingPortal.Configuration): unknown {
  const update = config.features?.subscription_update;
  return {
    headline: config.business_profile?.headline,
    privacy: config.business_profile?.privacy_policy_url,
    terms: config.business_profile?.terms_of_service_url,
    invoiceHistory: config.features?.invoice_history?.enabled,
    paymentMethodUpdate: config.features?.payment_method_update?.enabled,
    customerUpdate: config.features?.customer_update?.enabled,
    allowedUpdates: [...config.features?.customer_update?.allowed_updates ?? []].sort(),
    cancel: config.features?.subscription_cancel?.enabled,
    cancelMode: config.features?.subscription_cancel?.mode,
    cancelProration: config.features?.subscription_cancel?.proration_behavior,
    reasonEnabled: config.features?.subscription_cancel?.cancellation_reason?.enabled,
    reasons: [...config.features?.subscription_cancel?.cancellation_reason?.options ?? []].sort(),
    update: update?.enabled,
    updateAllowed: [...update?.default_allowed_updates ?? []].sort(),
    updateProration: update?.proration_behavior,
    anchor: update?.billing_cycle_anchor,
    conditions: (update?.schedule_at_period_end?.conditions ?? []).map((condition) => condition.type).sort(),
    products: (update?.products ?? []).
    map((product) => ({ product: product.product, prices: [...product.prices].sort() })).
    sort((a, b) => a.product.localeCompare(b.product)),
    brand: config.metadata?.brand
  };
}

/**
 * Everything Batchlabel-branded and still sellable that the contract does not name.
 *
 * The direction that matters most: a price left active after an amount change, or a product
 * created in the dashboard, is one a customer can still be charged on and one no environment
 * variable names — so the webhook cannot resolve it and the customer pays for nothing.
 */
async function verifyNothingExtra(mode: ModeContext): Promise<void> {
  const prices = await mode.stripe.prices.
  list({ active: true, limit: 100 }).
  autoPagingToArray({ limit: 1000 });
  const strays = prices.filter(
    (price) => price.metadata?.brand === BRAND && !LOOKUP_KEYS.includes(price.lookup_key ?? '')
  );
  check(
    'no active Batchlabel price outside the contract',
    strays.length === 0,
    strays.map((price) => `${price.id} (${price.lookup_key ?? 'no lookup_key'})`).join(', ')
  );

  const products = await mode.stripe.products.
  list({ active: true, limit: 100 }).
  autoPagingToArray({ limit: 1000 });
  const known = new Set(CATALOGUE.map((entry) => entry.name));
  const extra = products.filter(
    (product) => product.metadata?.brand === BRAND && !known.has(product.name)
  );
  check(
    'no active Batchlabel product outside the contract',
    extra.length === 0,
    extra.map((product) => `${product.id} (${product.name})`).join(', ')
  );

  // A Payment Link is a public URL that bypasses /api/create-checkout-session and every
  // guard in it — including the one that keeps the rail test unreachable.
  const links = await mode.stripe.paymentLinks.
  list({ active: true, limit: 100 }).
  autoPagingToArray({ limit: 200 });
  const ourPriceIds = new Set(
    prices.filter((price) => price.metadata?.brand === BRAND).map((price) => price.id)
  );
  for (const link of links) {
    const items = await mode.stripe.paymentLinks.listLineItems(link.id, { limit: 100 });
    const hit = items.data.find((item) => item.price && ourPriceIds.has(item.price.id));
    check(
      `payment link ${link.id} does not sell a Batchlabel price`,
      !hit,
      'a Payment Link bypasses every checkout guard'
    );
  }
}

async function main(): Promise<void> {
  const mode = openStripe(process.argv.slice(2));
  const resolved = await resolveCatalogue(mode);

  console.log('\nverifying products, prices, environment and the portal configuration…');
  verifyProducts(mode, resolved);
  await verifyPrices(mode, resolved);
  verifyEnvironment(resolved);
  await verifyPortal(mode, resolved);
  await verifyNothingExtra(mode);

  if (warnings.length > 0) {
    console.warn(`\n! ${warnings.length} thing(s) need a human, not a re-run:\n`);
    for (const warning of warnings) console.warn(`  · ${warning}`);
  }

  if (failures.length === 0) {
    console.log(`\n✓ ${checks} checks passed in ${mode.label} mode.\n`);
    return;
  }

  console.error(`\n✗ ${failures.length} of ${checks} checks failed in ${mode.label} mode:\n`);
  for (const failure of failures) console.error(`  · ${failure}`);
  console.error('');
  process.exit(1);
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
