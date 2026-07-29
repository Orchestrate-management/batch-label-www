import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initTagging } from "./lib/consent";

// Consent Mode v2 defaults are set to denied and Google Tag Manager is loaded before
// React renders, so no measurement tag can fire ahead of the maker's cookie choice.
initTagging();

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}