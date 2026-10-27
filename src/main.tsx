import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyStoredAppearance } from "./lib/appearance.ts";
import App from "./App.tsx";
import "./index.css";

// Apply the active profile's theme/accent/density before the first render (no flash of the wrong theme).
// An inline <script> in index.html isn't allowed by the CSP (script-src 'self').
applyStoredAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
