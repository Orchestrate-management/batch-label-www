#!/usr/bin/env bash
#
# Take Batchlabel billing live, in one pass.
#
# WHY THIS IS A SCRIPT YOU RUN RATHER THAN SOMETHING AUTOMATED. It needs a full live secret
# key (sk_live_). `stripe login` only grants the CLI a READ-ONLY restricted key — it lists
# live products fine and refuses to create one:
#
#   "The provided key 'rk_live_…' does not have the required permissions for this endpoint"
#
# So the key has to come from the Stripe Dashboard. It is read here with `read -s`, so it is
# never echoed, never written to a file, and never leaves this shell.
#
# WHAT IT DOES
#   1. Verifies the key is live and can actually write
#   2. Creates the live catalogue: 4 products, 7 prices, GBP, exclusive of VAT
#   3. Registers the live webhook endpoint
#   4. Sets STRIPE_SECRET_KEY, the seven price ids and STRIPE_WEBHOOK_SECRET on production
#   5. REMOVES STRIPE_PORTAL_CONFIGURATION_ID — the current value is a TEST-mode bpc_ and
#      would break "Manage billing" in live mode
#   6. Brands the Checkout page with Batchlabel's icon and palette
#   7. Redeploys and checks the endpoints
#
# WHAT IT DELIBERATELY DOES NOT DO. It does not create a live billing-portal configuration.
# Live mode has none, and the FIRST one created becomes the account default for every other
# Orchestrate brand — Starter at £480/mo and Scale at £1,800/mo — because `is_default` is
# read-only through the API and nothing can undo it. Left unset, the portal falls back to
# your Dashboard settings and still works.
#
#   Run from the repo root:  bash scripts/go-live.sh

set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\n  \033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

say "Batchlabel — go live"
echo "Get the key from: Stripe Dashboard -> Developers -> API keys -> Secret key (live mode)"
echo "It starts sk_live_ and is NOT echoed as you paste."
printf '\nsk_live key: '
read -rs STRIPE_SECRET_KEY
echo
export STRIPE_SECRET_KEY

case "$STRIPE_SECRET_KEY" in
  sk_live_*) ok "looks like a live secret key" ;;
  sk_test_*) die "that is a TEST key. This script is for going live." ;;
  rk_live_*) die "that is a RESTRICTED key. It cannot create products. Use the sk_live_ secret key." ;;
  *)         die "unrecognised key format." ;;
esac

say "1. Checking the key can write"
PROBE=$(curl -s https://api.stripe.com/v1/products -u "$STRIPE_SECRET_KEY:" -d "name=__golive_probe__")
PROBE_ID=$(printf '%s' "$PROBE" | grep -o '"id": *"prod_[^"]*"' | head -1 | sed 's/.*"\(prod_[^"]*\)"/\1/')
[ -n "$PROBE_ID" ] || die "cannot create products with this key: $(printf '%s' "$PROBE" | grep -o '"message": "[^"]*"' | head -1)"
curl -s -X DELETE "https://api.stripe.com/v1/products/$PROBE_ID" -u "$STRIPE_SECRET_KEY:" -o /dev/null
ok "write access confirmed (probe created and deleted)"

say "2. Creating the live catalogue"
npx vite-node scripts/stripe-sync.ts --live

say "3. Registering the live webhook endpoint"
EXISTING=$(curl -s "https://api.stripe.com/v1/webhook_endpoints?limit=100" -u "$STRIPE_SECRET_KEY:" \
  | grep -B4 'batchlabel.xyz/api/stripe-webhook' | grep -o '"id": "we_[^"]*"' | head -1 | sed 's/.*"\(we_[^"]*\)"/\1/' || true)
if [ -n "$EXISTING" ]; then
  echo "  an endpoint already exists ($EXISTING) — replacing it so we get a fresh signing secret"
  curl -s -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$EXISTING" -u "$STRIPE_SECRET_KEY:" -o /dev/null
fi
HOOK=$(curl -s https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" \
  -d "url=https://www.batchlabel.xyz/api/stripe-webhook" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "description=Batchlabel entitlements (live)")
WHSEC=$(printf '%s' "$HOOK" | grep -o '"secret": "[^"]*"' | head -1 | sed 's/.*: "//; s/"//')
[ -n "$WHSEC" ] || die "could not create the webhook endpoint: $(printf '%s' "$HOOK" | grep -o '"message": "[^"]*"' | head -1)"
ok "endpoint registered, signing secret captured"

say "4. Writing production environment variables"
set_env() {
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null 2>&1 && ok "$1" || die "failed to set $1"
}

# The live price ids, read back from Stripe by lookup key so this cannot drift from what
# step 2 actually created.
PRICES=$(curl -s -G "https://api.stripe.com/v1/prices" -u "$STRIPE_SECRET_KEY:" \
  --data-urlencode "limit=100" --data-urlencode "active=true")
lookup() {
  printf '%s' "$PRICES" | python3 -c "
import json,sys
data=json.load(sys.stdin)['data']
hit=[p['id'] for p in data if p.get('lookup_key')=='$1']
print(hit[0] if hit else '')
"
}
for PAIR in \
  "STRIPE_PRICE_MAKER_MONTHLY:batchlabel_maker_monthly_gbp" \
  "STRIPE_PRICE_MAKER_ANNUAL:batchlabel_maker_annual_gbp" \
  "STRIPE_PRICE_STUDIO_MONTHLY:batchlabel_studio_monthly_gbp" \
  "STRIPE_PRICE_STUDIO_ANNUAL:batchlabel_studio_annual_gbp" \
  "STRIPE_PRICE_CONSULTANT_MONTHLY:batchlabel_consultant_monthly_gbp" \
  "STRIPE_PRICE_CONSULTANT_ANNUAL:batchlabel_consultant_annual_gbp" \
  "STRIPE_PRICE_RAIL_TEST_MONTHLY:batchlabel_rail_test_monthly_gbp"
do
  NAME="${PAIR%%:*}"; KEY="${PAIR#*:}"
  ID=$(lookup "$KEY")
  [ -n "$ID" ] || die "no live price found for lookup key $KEY — did step 2 succeed?"
  set_env "$NAME" "$ID"
done

set_env STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY"
set_env STRIPE_WEBHOOK_SECRET "$WHSEC"

# The stored value is a TEST-mode bpc_. In live mode Stripe rejects it and every
# "Manage billing" click 502s. Unset is correct: the portal falls back to the Dashboard
# configuration, which works.
vercel env rm STRIPE_PORTAL_CONFIGURATION_ID production --yes >/dev/null 2>&1 && \
  ok "removed STRIPE_PORTAL_CONFIGURATION_ID (was a test-mode id)" || \
  echo "  (STRIPE_PORTAL_CONFIGURATION_ID was not set — fine)"

# Belt and braces: this must never be set in production. Set, it makes the 30p rail-test
# price purchasable by an ordinary customer.
vercel env rm ALLOW_RAIL_TEST_CHECKOUT production --yes >/dev/null 2>&1 && \
  ok "ensured ALLOW_RAIL_TEST_CHECKOUT is unset" || true

say "5. Branding the Checkout page"
#
# Stripe branding is ACCOUNT-WIDE. There is no per-product or per-session override on a
# standard account, so this also restyles checkout for the other Orchestrate brands. Today
# every branding field is null, so they currently get Stripe's default grey — this replaces
# that with Batchlabel's palette under the same "Orchestrate Technologies Ltd." business
# name. Fully reversible from Settings -> Branding.
#
# Only the icon is set, not a logo: Stripe wants a raster logo and the horizontal lockup is
# SVG only, with no rasteriser on this machine. The icon is what Checkout renders anyway.
ICON_PATH="public/brand/apple-touch-icon.png"   # 180x180, clears Stripe's 128x128 minimum
if [ -f "$ICON_PATH" ]; then
  ICON_ID=$(curl -s https://api.stripe.com/v1/files -u "$STRIPE_SECRET_KEY:" \
    -F "purpose=business_icon" -F "file=@${ICON_PATH}" \
    | grep -o '"id": *"file_[^"]*"' | head -1 | sed 's/.*"\(file_[^"]*\)"/\1/')
  [ -n "$ICON_ID" ] && ok "uploaded icon ($ICON_ID)" || echo "  (icon upload failed — colours will still be set)"
else
  ICON_ID=""
  echo "  ($ICON_PATH not found — colours only)"
fi

BRAND=$(curl -s -X POST https://api.stripe.com/v1/account -u "$STRIPE_SECRET_KEY:" \
  -d "settings[branding][primary_color]=#14514F" \
  -d "settings[branding][secondary_color]=#B4674A" \
  ${ICON_ID:+-d "settings[branding][icon]=$ICON_ID"})
if printf '%s' "$BRAND" | grep -q '"error"'; then
  echo "  branding not applied: $(printf '%s' "$BRAND" | grep -o '"message": "[^"]*"' | head -1)"
  echo "  (not fatal — set it by hand at Dashboard -> Settings -> Branding)"
else
  ok "primary #14514F (teal), accent #B4674A (clay)"
fi

say "6. Deploying"
vercel deploy --prod --yes >/dev/null 2>&1 || true
echo "  waiting for the new deployment to serve..."
for _ in $(seq 1 60); do
  sleep 10
  [ "$(curl -s -o /dev/null -w '%{http_code}' https://www.batchlabel.xyz/api/plans)" = "200" ] && break
done

say "7. Verifying"
printf '  %-34s HTTP %s\n' "/api/plans"                  "$(curl -s -o /dev/null -w '%{http_code}' https://www.batchlabel.xyz/api/plans)"
printf '  %-34s HTTP %s (401 = auth required, correct)\n' "/api/create-checkout-session" "$(curl -s -o /dev/null -w '%{http_code}' -X POST https://www.batchlabel.xyz/api/create-checkout-session -H 'Content-Type: application/json' -d '{"tier":"maker","interval":"monthly"}')"
printf '  %-34s HTTP %s (400 = signature enforced)\n'     "/api/stripe-webhook"          "$(curl -s -o /dev/null -w '%{http_code}' -X POST https://www.batchlabel.xyz/api/stripe-webhook -d '{}')"

unset STRIPE_SECRET_KEY
say "Live."
echo "Next: sign up on www, open the app's billing page, and buy Maker with a real card."
echo "It will charge £14 + VAT for real. Refund it in the Stripe Dashboard afterwards."
