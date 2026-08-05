# Routing and prerendering

`vercel.json` is four lines and cannot hold a comment. This is the comment.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/spa-shell" }]
}
```

## What it replaced, and why that mattered

It used to be one line:

```json
"rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
```

Every non-API path served `index.html`. That is the normal SPA arrangement and it worked,
but it also meant `https://www.batchlabel.xyz/` and `/pricing` were byte-identical: same
6,413 bytes, same `md5`, same title, same single `ld+json` block, all of it the static
default from `index.html`. Ten public pages, one document.

Google renders JavaScript, so it eventually saw the real pages — a handicap rather than a
death sentence, a deferred second pass against a crawl budget with ten identical documents
on the first. `GPTBot`, `ClaudeBot` and `PerplexityBot` do not render. They got 54
characters of readable text: the `<title>`.

## Why generating files was not enough on its own

`scripts/prerender.mjs` writes `dist/pricing.html`, `dist/faq.html` and the rest. On the
old config that changed nothing observable. A request for `/pricing` found no file called
`pricing` in the output, fell through to the catch-all, and got `index.html`. The build log
would say ten routes were prerendered, the deploy would go green, and a crawler would still
get the shell.

`cleanUrls` is the line that connects the two. From Vercel's documentation:

> When set to `true`, all HTML files and Vercel functions will have their extension
> removed. [...] For example, a static file named `about.html` will be served when visiting
> the `/about` path.

## Why the catch-all can stay

Because the filesystem is consulted first. Also documented, twice:

> The `source` property should **NOT** be a file because precedence is given to the
> filesystem prior to rewrites being applied.

and, in the note deprecating the `handle: filesystem` route type:

> Use `rewrites` instead, which checks the filesystem by default.

The live site already demonstrates it. `/robots.txt`, `/sitemap.xml` and `/assets/*.js` all
match `/((?!api/).*)` and are all served as themselves rather than as the shell, because
the filesystem answered before the rewrite did.

So the order for any request is:

1. `cleanUrls` redirects — `/pricing.html` 308s to `/pricing`.
2. Filesystem — `/pricing` finds `pricing.html`, `/` finds `index.html`, `/robots.txt`
   finds itself.
3. Rewrite — everything left over becomes `/spa-shell`.
4. `/api/*` is excluded from the rewrite and handled as a serverless function.

## Why the fallback is `/spa-shell` and not `/index.html`

`index.html` is now the prerendered home page. Falling back to it would serve home-page
copy, at a `200`, under every dead link and every auth route on the site — and now that
the copy is really there in the markup, a non-rendering crawler would believe it.

`spa-shell.html` is the untouched build shell with `robots` set to `noindex, nofollow` and
the canonical and `og:url` removed. It is what `/sign-up`, `/log-in`, `/dashboard`,
`/checkout/success` and any unknown URL receive. All of those already set `noindex` from
JavaScript through `usePageMeta`; this is the first time a crawler that does not run
JavaScript sees it.

The destination is written without the `.html`, because the documentation for `rewrites`
says that with `cleanUrls` set, source and destination paths must not carry the extension.

## Why `/api` stays excluded

`api/*.ts` are serverless functions bundled by `scripts/bundle-api.mjs`. One of them is
where Stripe posts its webhooks. A rewrite that swallowed them would take billing with it.

## How this is held in place

`vercel.json` is configuration, so nothing about it fails at compile time. Three things
watch it instead:

- `scripts/vercel-routing.mjs` — a model of the four steps above.
- `scripts/serve-dist.mjs` — serves the built `dist/` through that model, so
  `npm run audit:static` fetches each route exactly as the CDN would answer it, with no
  JavaScript anywhere in the loop.
- `src/lib/vercel-routing.test.ts` — drives the model with the real `vercel.json` and the
  real route table. Reverting to a plain catch-all, dropping `cleanUrls`, or pointing the
  fallback back at `/index.html` all turn it red.

## What could not be verified without deploying

The ordering above is documented behaviour plus the evidence of the current production
deployment, and it is modelled and tested locally. It is not the same as having watched
Vercel do it. The first preview deployment on this branch should be checked with:

```
curl -sS https://<preview>/pricing        | head -c 400   # the pricing document
curl -sS -o /dev/null -w '%{http_code}\n' https://<preview>/nonsense   # 200, shell, noindex
curl -sS https://<preview>/robots.txt     | head -3       # still robots.txt
curl -sS -X POST https://<preview>/api/plans                # still the function
```
