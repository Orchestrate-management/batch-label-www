/**
 * What a crawler that does not execute JavaScript actually receives.
 *
 * GPTBot, ClaudeBot, PerplexityBot and most answer surfaces do not render. Neither does
 * this script: it starts scripts/serve-dist.mjs, which routes through the real
 * vercel.json, fetches each public route over plain HTTP, and reports the response as
 * delivered. jsdom parses the markup but never runs a script, which is the whole point.
 *
 *   npm run build && npm run audit:static
 *
 * The route list is read from public/sitemap.xml rather than restated here.
 * src/lib/routes.test.ts already asserts that file matches INDEXABLE_ROUTES exactly, so
 * the sitemap is the route table in another form and a second list cannot drift from it.
 */

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { startServer } from './serve-dist.mjs';

function routesFromSitemap() {
  const xml = readFileSync('public/sitemap.xml', 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
}

/** Title plus body copy, whitespace collapsed. Script and style content is not copy. */
function visibleText(dom) {
  const { document } = dom.window;
  for (const node of document.querySelectorAll('script, style, noscript, template')) {
    node.remove();
  }
  const body = document.body ? document.body.textContent : '';
  return [document.title, body].join(' ').replace(/\s+/g, ' ').trim();
}

function metaContent(document, selector) {
  return document.querySelector(selector)?.getAttribute('content') ?? '';
}

export async function auditDist() {
  const { server, port } = await startServer({ port: 0 });
  const rows = [];
  try {
    for (const route of routesFromSitemap()) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: 'manual' });
      const html = await response.text();
      const dom = new JSDOM(html);
      const { document } = dom.window;
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (node) => node.textContent ?? ''
      );
      rows.push({
        route,
        status: response.status,
        servedFile: response.headers.get('x-served-file') ?? '',
        bytes: Buffer.byteLength(html),
        text: visibleText(dom).length,
        title: document.title,
        description: metaContent(document, 'meta[name="description"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
        ogTitle: metaContent(document, 'meta[property="og:title"]'),
        ogUrl: metaContent(document, 'meta[property="og:url"]'),
        robots: metaContent(document, 'meta[name="robots"]'),
        jsonLdBlocks: jsonLd.length,
        jsonLdTypes: [...new Set(jsonLd.flatMap(schemaTypes))].sort().join(', '),
        h1: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      });
    }
  } finally {
    server.close();
  }
  return rows;
}

function schemaTypes(raw) {
  try {
    const parsed = JSON.parse(raw);
    const nodes = parsed['@graph'] ?? [parsed];
    return nodes.map((node) => node['@type']).filter(Boolean);
  } catch {
    return ['(unparseable)'];
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('audit-static-html.mjs');
if (invokedDirectly) {
  const rows = await auditDist();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const pad = (value, width) => String(value).padEnd(width);
    console.log(
      `${pad('route', 18)}${pad('status', 7)}${pad('bytes', 9)}${pad('text', 8)}${pad('ld+json', 9)}title`
    );
    for (const row of rows) {
      console.log(
        `${pad(row.route, 18)}${pad(row.status, 7)}${pad(row.bytes, 9)}${pad(row.text, 8)}${pad(row.jsonLdBlocks, 9)}${row.title}`
      );
    }
    const uniqueTitles = new Set(rows.map((row) => row.title)).size;
    console.log(`\n${uniqueTitles} distinct titles across ${rows.length} routes.`);
  }
}
