import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Builder } from "./Builder";
// Dashboard styles first (so `.epaper-screen`, `.template-*`, widget classes
// render correctly in the preview pane), then builder.css, which explicitly
// overrides the dashboard stylesheet's global `html`/`body` rules for the
// builder's own viewport-sized chrome.
import "../styles.css";
import "./builder.css";

createRoot(document.getElementById("builder-root")!).render(
  <StrictMode>
    <Builder />
  </StrictMode>
);
