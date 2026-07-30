# src/api is not deployed. Do not put API routes here.

This directory used to hold `create-checkout-session.ts`, `create-portal-session.ts` and
`stripe-webhook.ts`. **Vercel never served any of them.**

Vercel builds serverless functions from a **root `/api` directory only**. Anything under
`src/` is input to the Vite client build. So `POST /api/create-checkout-session` matched no
function, fell through to the SPA rewrite in `vercel.json`, and returned `index.html` with a
**200** — which is why billing looked wired up and silently did nothing, and why Stripe's
webhook deliveries were "successful" while writing nothing to Supabase.

The live routes are:

| Route | File |
| --- | --- |
| `POST /api/create-checkout-session` | [`/api/create-checkout-session.ts`](../../api/create-checkout-session.ts) |
| `POST /api/create-portal-session` | [`/api/create-portal-session.ts`](../../api/create-portal-session.ts) |
| `POST /api/stripe-webhook` | [`/api/stripe-webhook.ts`](../../api/stripe-webhook.ts) |

Those files are thin adapters. The logic they call lives in [`../server/`](../server/), which
is where the tests are, and which is *not* under `/api` precisely because Vercel would turn
each helper module into a publicly addressable endpoint.

This file is kept as a signpost. Deleting the directory would just let the same mistake be
made again by someone following the old comments.
