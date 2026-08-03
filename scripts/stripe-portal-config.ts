/**
 * THE Batchlabel Customer Portal configuration. One artefact, complete, in one place.
 *
 *   npx vite-node scripts/stripe-portal-config.ts --dry-run
 *   npx vite-node scripts/stripe-portal-config.ts            # test mode
 *   npx vite-node scripts/stripe-portal-config.ts --live     # live mode, deliberately
 *
 * Creates the configuration and prints its `bpc_…` id, or updates the one named by
 * STRIPE_PORTAL_CONFIGURATION_ID. Run it once per mode; re-running is safe.
 *
 * WHY THE CONFIGURATION IS EXPLICIT AT ALL
 *
 * `/api/create-portal-session` passes no `configuration`, so today every Batchlabel portal
 * session uses the Stripe ACCOUNT's default. The account is shared with the other
 * Orchestrate brands, which makes that a cross-brand data path: another brand enabling
 * subscription_update on the default would offer their products inside a Batchlabel
 * customer's portal, and the terms and privacy links in the header would point at their
 * site. Naming a configuration severs both.
 *
 * WHY EVERY FIELD BELOW IS SET RATHER THAN DEFAULTED
 *
 * Three of these fields decide how much money moves when a customer changes tier, and two
 * of them have the same value as the API default. They are still written, because a default
 * is a fact about Stripe's API version, not a decision anyone here made — and the failure
 * they prevent is silent. See the comment on each.
 */

import type Stripe from 'stripe';
import { canonicalUrl } from '../src/lib/routes';
import {
  BRAND,
  PORTAL_CONFIG_ENV,
  SELLABLE,
  fail,
  openStripe,
  resolveCatalogue,
  type ResolvedCatalogue } from
'./stripe-catalogue';

/** Shown at the top of the portal. Names the brand, because the account has several. */
export const PORTAL_HEADLINE = 'Batchlabel billing';

/**
 * Both links, from the same route table the site's canonicals and sitemap come from, so a
 * moved page cannot leave the portal pointing at a 404 — or, on a shared account default,
 * at another brand's terms.
 */
export const PRIVACY_URL = canonicalUrl('/privacy');
export const TERMS_URL = canonicalUrl('/terms');

/**
 * `name` is on this list, and it is the one people forget.
 *
 * A B2B invoice has to carry the customer's legal entity name. Without `name` the only way
 * to correct "Sarah" to "Sarah Miller Candles Ltd" on every future invoice is a support
 * request. `address` and `tax_id` are what Stripe Tax needs to charge the right VAT and to
 * reverse-charge a valid EU VAT number — with prices exclusive of VAT, a customer who
 * cannot enter their VAT number is a customer who is overcharged.
 *
 * `email` and `phone` are absent deliberately: the account identity is the Supabase user,
 * and letting the billing email drift from it is how a customer ends up unable to explain
 * why their receipts go somewhere their login does not.
 */
export const CUSTOMER_UPDATE_FIELDS: readonly Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[] =
['address', 'tax_id', 'name'];

/** Stripe's full set. Free churn data; there is no reason to offer fewer. */
export const CANCELLATION_REASONS: readonly Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionCancel.CancellationReason.Option[] =
['too_expensive', 'missing_features', 'switched_service', 'unused', 'too_complex', 'other'];

/**
 * The complete parameter object, exported so `stripe-verify.ts` asserts against the same
 * source that created it. Verify additionally names every field below one at a time, so a
 * field silently dropped from here is still caught by name rather than by an equality check
 * on an object that also lost it.
 */
export function portalConfigurationParams(
resolved: ResolvedCatalogue)
: Stripe.BillingPortal.ConfigurationCreateParams {
  return {
    business_profile: {
      headline: PORTAL_HEADLINE,
      privacy_policy_url: PRIVACY_URL,
      terms_of_service_url: TERMS_URL
    },

    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },

      customer_update: {
        enabled: true,
        allowed_updates: [...CUSTOMER_UPDATE_FIELDS]
      },

      subscription_cancel: {
        enabled: true,
        // At period end, never immediately: the customer has paid for the rest of the term
        // and keeps it. Immediate cancellation would also make a mid-term cancel look like a
        // refund request when no refund is coming.
        mode: 'at_period_end',
        // `none`, and the pricing copy says nothing about refunds because of it. No money is
        // ever returned on a cancellation; the mechanism is the truth and the copy conforms
        // to it, never the other way round.
        proration_behavior: 'none',
        cancellation_reason: {
          enabled: true,
          options: [...CANCELLATION_REASONS]
        }
      },

      subscription_update: {
        enabled: true,
        // Tier switching, and only tier switching. `quantity` is absent because there are no
        // add-ons — every price is licensed at quantity 1, and a customer who set it to 3
        // would be charged triple and still resolve to the same allowance, since the
        // allowance is keyed by plan. `promotion_code` is absent because promotions are
        // priced deliberately at checkout, and self-applying one from the portal is an
        // unbudgeted discount with no approval step.
        default_allowed_updates: ['price'],

        // Upgrades take effect immediately with the difference on the next invoice. That is
        // the point of an upgrade: the maker is standing at their SKU ceiling and needs the
        // next one to work now. `none` would give the remainder of the period away free;
        // `always_invoice` charges on the spot, so a declined card turns an upgrade into a
        // past_due subscription mid-flow and the customer ends up worse off than they
        // started.
        proration_behavior: 'create_prorations',

        // Same value as the API default, written anyway. With `now`, an annual customer
        // upgrading in month two would have the year restarted and be invoiced a full annual
        // price, silently converting the ten months already paid for into a credit balance.
        // A default is not a decision; this is.
        billing_cycle_anchor: 'unchanged',

        // The field that stops a downgrade generating a credit balance the size of the
        // remaining term. Without it, an annual customer two months in who switches to a
        // cheaper monthly plan produces a four-figure credit that then absorbs years of
        // invoices at £0 — no cash leaves, but the revenue reporting is wrong for years and
        // the customer's invoices read as a billing bug. `decreasing_item_amount` catches
        // the cheaper tier, `shortening_interval` catches annual-to-monthly. Neither matches
        // an increase, so upgrades still apply immediately.
        //
        // Stripe carries the deferral with a subscription schedule. Do NOT add
        // subscription_schedule.* to the webhook's event list: the effective change still
        // arrives as customer.subscription.updated at the boundary, and subscribing to the
        // schedule would write a future-dated intent as a current entitlement — a downgrade
        // applied months early.
        schedule_at_period_end: {
          conditions: [{ type: 'decreasing_item_amount' }, { type: 'shortening_interval' }]
        },

        // The three sellable tiers, monthly and annual each. The rail test is absent: no
        // customer may switch to it or from it, and its absence here is half of what makes
        // "£0.01 grants nothing" true in practice rather than only in the resolver.
        products: SELLABLE.map((product) => ({
          product: requireProduct(resolved, product.slug),
          prices: product.prices.map((price) =>
          requirePrice(resolved, `${price.slug}:${price.interval}`)
          )
        }))
      }
    },

    // The same brand key `belongsToThisBrand` compares against. The portal configuration is
    // never a routing input, but on a shared account an unlabelled bpc_ object is one nobody
    // can attribute later.
    metadata: { brand: BRAND }

    // DELIBERATELY ABSENT, each one a bug if added:
    //   login_page   — a shareable hosted login is a second, weaker door into billing; the
    //                  portal is reached only through an authenticated session
    //   default_return_url — the session sets it per call, so the app owns where it returns
    //
    // `is_default` is NOT a create parameter — it is read-only, and the only `is_default` in
    // the API is a filter on the list call. Stripe makes the FIRST configuration on an
    // account its default, so on an account with no configuration yet this one becomes the
    // default whether or not that is wanted, and every other Orchestrate brand's portal
    // session then inherits Batchlabel's headline, terms link and plan picker. There is no
    // API to undo it: the account's default is changed by configuring one in the Dashboard.
    // stripe-verify.ts reports the resulting state rather than asserting a value nothing can
    // set.
  };
}

function requireProduct(resolved: ResolvedCatalogue, slug: string): string {
  const product = resolved.products.get(slug);
  if (!product) fail(`No Stripe product for '${slug}'. Run scripts/stripe-sync.ts first.`);
  return product.id;
}

function requirePrice(resolved: ResolvedCatalogue, key: string): string {
  const price = resolved.prices.get(key);
  if (!price) fail(`No Stripe price for '${key}'. Run scripts/stripe-sync.ts first.`);
  return price.id;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const mode = openStripe(argv);

  const resolved = await resolveCatalogue(mode);
  const params = portalConfigurationParams(resolved);

  if (dryRun) {
    console.log('\n[stripe] DRY RUN — this is the configuration that would be written:\n');
    console.log(JSON.stringify(params, null, 2));
    return;
  }

  // The brand metadata is what makes this re-runnable. Matching on it alone — and NOT on
  // `!is_default` — because Stripe may have made this very configuration the account default
  // when it was the first one created, and excluding defaults would then miss it and create a
  // second Batchlabel configuration on every run.
  const named = process.env[PORTAL_CONFIG_ENV]?.trim();
  const existing =
  named ??
  (await mode.stripe.billingPortal.configurations.
  list({ limit: 100 }).
  autoPagingToArray({ limit: 100 })).
  find((config) => config.metadata?.brand === BRAND && config.active)?.
  id;

  const configuration = existing ?
  await mode.stripe.billingPortal.configurations.update(existing, params) :
  await mode.stripe.billingPortal.configurations.create(params);

  console.log(`\n${existing ? 'updated' : 'created'} portal configuration ${configuration.id}`);
  if (configuration.is_default) {
    console.log(
      '\n!  This is the SHARED account default, because it was the first configuration on the\n' +
      '   account. Every other Orchestrate brand\'s portal session inherits it until a neutral\n' +
      '   default is set in the Dashboard (Billing → Customer portal). `is_default` is\n' +
      '   read-only, so nothing here can undo it.\n'
    );
  }
  console.log(`  ${PORTAL_CONFIG_ENV}=${configuration.id}\n`);
  console.log('Then: npx vite-node scripts/stripe-verify.ts' + (mode.live ? ' --live' : '') + '\n');
}

/**
 * stripe-verify.ts imports the params builder above — that is what stops the two from
 * disagreeing — and a verifier must never write, so it sets this before importing.
 *
 * The usual entry-point check (`import.meta.url` against `process.argv[1]`) is not available
 * here: vite-node filters the script path out of `process.argv` before the module runs
 * (node_modules/vite-node/dist/cli.mjs:41-44), so there is nothing to compare against.
 */
if (process.env.STRIPE_SCRIPTS_IMPORT_ONLY !== '1') {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
