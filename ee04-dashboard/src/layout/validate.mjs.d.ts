/**
 * Type declarations for the plain-JS layout validator (`validate.mjs`).
 *
 * Kept separate so `validate.mjs` stays dependency-free and importable by
 * plain Node scripts, while the Vite/TypeScript app gets full typing.
 */
import type { LayoutDocument } from "./types";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  layout: LayoutDocument | undefined;
};

export declare function validateLayout(json: unknown): ValidationResult;

export declare const TONES: ReadonlyArray<string>;
export declare const WIDGET_TYPES: ReadonlyArray<string>;
export declare const LAYOUT_TEMPLATES: ReadonlyArray<string>;
export declare const TEMPLATE_SLOTS: Record<string, string[]>;
