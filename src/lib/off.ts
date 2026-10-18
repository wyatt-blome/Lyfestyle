// Normalizers for the two food databases the server routes proxy: Open Food Facts (barcode
// lookup) and USDA FoodData Central (text search). Pure, so they are tested with small fixtures.
import type { IntakeTemplate } from "./types";

export const OFF_FIELDS = "product_name,brands,nutriments,serving_size,serving_quantity";
export const OFF_USER_AGENT = "FastAndMove/0.1 (personal use)";
export const OFF_CREDIT = "Data from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL).";
export const USDA_CREDIT = "Data from USDA FoodData Central (public domain).";
export const USDA_MISSING_KEY = "Add USDA_API_KEY in Vercel to enable search.";

/** Barcodes are 6–14 digits (UPC-E up to GTIN-14). */
export function isValidBarcode(s: string): boolean {
  return /^\d{6,14}$/.test(s);
}

/** Search text is 2–80 characters after trimming. */
export function cleanQuery(q: string | null | undefined): string | null {
  const t = (q ?? "").trim().replace(/\s+/g, " ");
  return t.length >= 2 && t.length <= 80 ? t : null;
}

export interface OffProduct {
  name: string;
  brand?: string;
  kcalPerServing?: number;
  proteinPerServing?: number;
  kcal100g?: number;
  protein100g?: number;
  servingSize?: string;
  /** Serving in grams (or ml), when OFF knows it. */
  servingQuantity?: number;
}

export interface UsdaFood {
  fdcId: number;
  name: string;
  brand?: string;
  kcal100g?: number;
  protein100g?: number;
  servingSize?: number;
  servingUnit?: string;
}

/** A finite, non-negative number from a number or numeric string; otherwise undefined. */
function num(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function round(n: number | undefined, places = 0): number | undefined {
  if (n === undefined) return undefined;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * OFF API v2 product response → product, or null when not found. Energy prefers the kcal fields
 * and falls back to kJ ÷ 4.184; per-serving values are derived from per-100 g and the serving
 * quantity when OFF only has the latter.
 */
export function normalizeOff(json: unknown): OffProduct | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { status?: unknown; product?: Record<string, unknown> };
  if (j.status === 0 || j.status === "0" || !j.product) return null;
  const p = j.product;
  const n = (p.nutriments && typeof p.nutriments === "object" ? p.nutriments : {}) as Record<string, unknown>;
  const kj100 = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  const kjServ = num(n["energy-kj_serving"]) ?? num(n["energy_serving"]);
  const kcal100g = num(n["energy-kcal_100g"]) ?? (kj100 !== undefined ? kj100 / 4.184 : undefined);
  const protein100g = num(n["proteins_100g"]);
  const servingQuantity = num(p.serving_quantity);
  const per = (v100: number | undefined) =>
    v100 !== undefined && servingQuantity ? (v100 * servingQuantity) / 100 : undefined;
  const kcalPerServing =
    num(n["energy-kcal_serving"]) ?? (kjServ !== undefined ? kjServ / 4.184 : undefined) ?? per(kcal100g);
  const proteinPerServing = num(n["proteins_serving"]) ?? per(protein100g);
  const brand = str(p.brands)?.split(",")[0]?.trim();
  return {
    name: str(p.product_name) ?? "Unnamed product",
    brand: brand || undefined,
    kcal100g: round(kcal100g),
    protein100g: round(protein100g, 1),
    kcalPerServing: round(kcalPerServing),
    proteinPerServing: round(proteinPerServing, 1),
    servingSize: str(p.serving_size),
    servingQuantity: round(servingQuantity, 1),
  };
}

// FDC nutrient ids (search results carry nutrientId and the older nutrientNumber).
const ENERGY_IDS = [1008, 2047, 2048]; // Energy kcal, then Atwater general/specific (Foundation foods)
const ENERGY_NUMBERS = ["208", "957", "958"];
const PROTEIN_ID = 1003;
const PROTEIN_NUMBER = "203";

interface FdcNutrient {
  nutrientId?: unknown;
  nutrientNumber?: unknown;
  unitName?: unknown;
  value?: unknown;
}

function nutrient(list: FdcNutrient[], ids: number[], numbers: string[], unit?: string): number | undefined {
  for (let i = 0; i < ids.length; i++) {
    const hit = list.find(
      (x) =>
        (Number(x.nutrientId) === ids[i] || String(x.nutrientNumber ?? "") === numbers[i]) &&
        (!unit || String(x.unitName ?? unit).toUpperCase() === unit),
    );
    const v = hit ? num(hit.value) : undefined;
    if (v !== undefined) return v;
  }
  return undefined;
}

/** FDC /foods/search response → foods. Nutrient values in search results are per 100 g. */
export function normalizeUsda(json: unknown): UsdaFood[] {
  if (!json || typeof json !== "object") return [];
  const foods = (json as { foods?: unknown }).foods;
  if (!Array.isArray(foods)) return [];
  const out: UsdaFood[] = [];
  for (const raw of foods) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const fdcId = num(f.fdcId);
    const name = str(f.description);
    if (fdcId === undefined || !name) continue;
    const list = (Array.isArray(f.foodNutrients) ? f.foodNutrients : []) as FdcNutrient[];
    out.push({
      fdcId,
      name,
      brand: str(f.brandName) ?? str(f.brandOwner),
      kcal100g: round(nutrient(list, ENERGY_IDS, ENERGY_NUMBERS, "KCAL")),
      protein100g: round(nutrient(list, [PROTEIN_ID], [PROTEIN_NUMBER]), 1),
      servingSize: round(num(f.servingSize), 1),
      servingUnit: str(f.servingSizeUnit)?.toLowerCase(),
    });
  }
  return out;
}

function withBrand(name: string, brand?: string): string {
  return brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name;
}

/** Add-entry preset from an OFF product: one serving when known, else 100 g. */
export function presetFromOff(p: OffProduct, barcode: string): Partial<IntakeTemplate> {
  const perServing = p.kcalPerServing !== undefined || p.proteinPerServing !== undefined;
  return {
    kind: "snack",
    name: withBrand(p.name, p.brand),
    qty: perServing ? 1 : 100,
    unit: perServing ? (p.servingSize ? `serving (${p.servingSize})` : "serving") : "g",
    kcal: perServing ? p.kcalPerServing : p.kcal100g,
    proteinG: perServing ? p.proteinPerServing : p.protein100g,
    source: "off",
    barcode,
    tags: [],
  };
}

/** Add-entry preset from a USDA food: its serving when given in g/ml, else 100 g. */
export function presetFromUsda(f: UsdaFood): Partial<IntakeTemplate> {
  const unit = f.servingUnit;
  const grams = f.servingSize && (unit === "g" || unit === "ml" || unit === "grm" || unit === "mlt");
  const scale = grams ? f.servingSize! / 100 : 1;
  const scaled = (v?: number, places = 0) => (v === undefined ? undefined : round(v * scale, places));
  return {
    kind: "meal",
    name: withBrand(f.name, f.brand),
    qty: grams ? f.servingSize : 100,
    unit: grams ? (unit === "ml" || unit === "mlt" ? "ml" : "g") : "g",
    kcal: scaled(f.kcal100g),
    proteinG: scaled(f.protein100g, 1),
    source: "usda",
    tags: [],
  };
}
