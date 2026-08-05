import "./index.css";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initTagging } from "./lib/consent";

// Consent Mode v2 defaults are set to denied and Google Tag Manager is loaded before
// React renders, so no measurement tag can fire ahead of the maker's cookie choice.
initTagging();

const rootEl = document.getElementById("root");
if (rootEl) {
  /*
   * createRoot, NOT hydrateRoot, and deliberately so now that #root arrives with markup
   * in it. See scripts/prerender.mjs and docs/ROUTING.md.
   *
   * hydrateRoot is the textbook answer for prerendered HTML and it is the wrong one here,
   * because of HOW that HTML is produced. Everything this site prerenders for — the
   * per-page title, description, canonical and JSON-LD — is written by effects, so the
   * document is captured AFTER effects have run. Hydration compares server markup against
   * the client's FIRST render, which is the state before effects. Those are different
   * documents by construction, and the cookie banner is the plainest example: it is
   * `visible === false` on first render and turns itself on in an effect, so it is in
   * every prerendered file and in none of the first client renders. hydrateRoot would
   * report a mismatch on all ten pages, throw the markup away, and re-render — the same
   * outcome as createRoot, reached noisily.
   *
   * createRoot discards the prerendered DOM and renders fresh. What that costs is one
   * wasted render of a page that is already painted; the stylesheet is the same file, so
   * there is no flash of unstyled content, only a repaint. What it buys is that the thing
   * the prerender exists for — a crawler that never executes this file receiving a real
   * document — is completely decoupled from what React does when it boots. No mismatch
   * class of bug can exist between them.
   *
   * Revisit this if the app ever moves its metadata out of effects and into render.
   * Until then, hydrating would be pretending to an equivalence that is not there.
   */
  ReactDOM.createRoot(rootEl).render(<App />);
}