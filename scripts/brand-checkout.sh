#!/usr/bin/env bash
#
# Brand the Stripe Checkout page for Batchlabel.
#
# Separate from go-live.sh on purpose. That script rotates the webhook signing secret every
# time it runs (it deletes and recreates the endpoint to capture a fresh one), so re-running
# it just to set a colour would open a window where Stripe signs with a secret production
# does not have yet. This touches branding and nothing else, so it is safe to run repeatedly.
#
# NEEDS A LIVE KEY. The test key is refused outright — "Only live keys can access this
# method" — so branding cannot be staged in test mode first.
#
# BRANDING IS ACCOUNT-WIDE. There is no per-product or per-session override on a standard
# Stripe account, so this also restyles checkout for the other Orchestrate brands (Starter,
# Scale). Every field is null today, meaning they currently get Stripe's default grey. Fully
# reversible from Dashboard -> Settings -> Branding.
#
#   Run from the repo root:  bash scripts/brand-checkout.sh

set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; }
die() { printf '\n  \033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

PRIMARY="#14514F"   # teal-700  — buttons and links
ACCENT="#B4674A"    # clay-500  — secondary accents
ICON_PATH="public/brand/apple-touch-icon.png"   # 180x180, clears Stripe's 128x128 minimum

say "Batchlabel — Checkout branding"
echo "Primary $PRIMARY (teal) · accent $ACCENT (clay) · icon $ICON_PATH"
echo
echo "Key: Stripe Dashboard -> Developers -> API keys -> Secret key, in LIVE mode."
echo "Starts sk_live_ and is not echoed as you paste."
printf '\nsk_live key: '
read -rs KEY
echo

case "$KEY" in
  sk_live_*) ok "live secret key" ;;
  sk_test_*) die "that is a TEST key. Stripe refuses branding writes from test keys." ;;
  rk_live_*) die "that is a RESTRICTED key — it can read but not write branding. Use the sk_live_ secret key." ;;
  *)         die "unrecognised key format." ;;
esac

say "1. Uploading the icon"
[ -f "$ICON_PATH" ] || die "$ICON_PATH not found"
UPLOAD=$(curl -s https://api.stripe.com/v1/files -u "$KEY:" \
  -F "purpose=business_icon" -F "file=@${ICON_PATH}")
ICON_ID=$(printf '%s' "$UPLOAD" | grep -o '"id": *"file_[^"]*"' | head -1 | sed 's/.*"\(file_[^"]*\)"/\1/')
if [ -z "$ICON_ID" ]; then
  bad "icon upload failed: $(printf '%s' "$UPLOAD" | grep -o '"message": "[^"]*"' | head -1)"
  echo "  continuing with colours only"
else
  ok "$ICON_ID"
fi

say "2. Applying branding"
#
# --data-urlencode, not -d. A hex colour starts with '#', and plain -d sends the body
# unencoded — an unencoded '#' in an application/x-www-form-urlencoded body is not safe and
# is the most likely reason the earlier attempt set nothing while reporting no error.
RESP=$(curl -s -X POST https://api.stripe.com/v1/account -u "$KEY:" \
  --data-urlencode "settings[branding][primary_color]=${PRIMARY}" \
  --data-urlencode "settings[branding][secondary_color]=${ACCENT}" \
  ${ICON_ID:+--data-urlencode "settings[branding][icon]=${ICON_ID}"})

if printf '%s' "$RESP" | grep -q '"error"'; then
  bad "Stripe rejected the update:"
  printf '%s' "$RESP" | python3 -c "
import sys,json
e=json.load(sys.stdin).get('error',{})
for k in ('type','code','param','message'):
    if e.get(k): print(f'    {k}: {e[k]}')
" 2>/dev/null || printf '%s\n' "$RESP" | head -c 400
fi

say "3. Reading it back"
#
# The point of this step. The previous attempt reported success and set nothing, because it
# only checked whether the response mentioned an error. Asking Stripe what the branding
# actually IS now is the only claim worth making.
CURRENT=$(curl -s https://api.stripe.com/v1/account -u "$KEY:")
printf '%s' "$CURRENT" | python3 -c "
import sys, json
b = (json.load(sys.stdin).get('settings') or {}).get('branding') or {}
want = {'primary_color': '${PRIMARY}', 'secondary_color': '${ACCENT}'}
fail = False
for k, v in want.items():
    got = b.get(k)
    if (got or '').upper() == v.upper():
        print(f'  \033[32m✓\033[0m {k}: {got}')
    else:
        print(f'  \033[31m✗\033[0m {k}: {got!r} (wanted {v})'); fail = True
icon = b.get('icon')
print(f'  {\"\033[32m✓\033[0m\" if icon else \"\033[31m✗\033[0m\"} icon: {icon!r}')
if not icon: fail = True
raise SystemExit(1 if fail else 0)
" && {
  say "Branded."
  echo "Checkout now renders the Batchlabel mark, teal buttons and clay accents."
  echo "Account-wide, so the other Orchestrate brands' checkout changes too."
  echo "Reverse any time: Dashboard -> Settings -> Branding."
} || {
  say "Not applied — do it in the Dashboard instead"
  echo "Stripe does not always accept settings[branding] over the API for a standard"
  echo "(non-Connect) account. It takes about thirty seconds by hand:"
  echo
  echo "  Dashboard -> Settings -> Branding, with the LIVE toggle on"
  echo "    Icon            $ICON_PATH"
  echo "    Brand colour    $PRIMARY"
  echo "    Accent colour   $ACCENT"
  exit 1
}

unset KEY
