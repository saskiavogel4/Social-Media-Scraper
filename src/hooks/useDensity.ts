import { createContext, useContext } from "react";
import type { Density } from "../lib/profiles.ts";

/** Card density of the active profile (or of the profile form's live preview). */
export const DensityContext = createContext<Density>("comfortable");

export const useDensity = (): Density => useContext(DensityContext);
