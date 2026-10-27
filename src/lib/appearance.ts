// Applies a profile's look-and-feel to <html>; CSS in src/index.css does the rest:
//   data-theme="system|light|dark" drives the `dark:` variant, data-accent swaps the accent palette,
//   data-density="compact" is read by components through useDensity().
import { activeProfile, appearanceOf, loadProfiles, type Appearance } from "./profiles.ts";

export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = a.theme;
  root.dataset.accent = a.accent;
  root.dataset.density = a.density;
}

/** Runs before React renders (see main.tsx) so the first paint already uses the right theme. */
export function applyStoredAppearance(): void {
  try {
    applyAppearance(appearanceOf(activeProfile(loadProfiles())));
  } catch {
    // Never block the app on a cosmetic preference.
  }
}
