// What the app knows about common grocery items: which aisle they live in, how long they keep,
// how recipe measures convert to what you buy, and the package sizes Walmart and Sam's Club
// typically sell. Package sizes are typical US sizes, not live store data; they exist so the
// list can say "buy one 16 oz tub, about 1 cup will be left" and steer the plan toward using it.

export type Store = "walmart" | "sams";
export const STORES: { id: Store; name: string }[] = [
  { id: "walmart", name: "Walmart" },
  { id: "sams", name: "Sam's Club" },
];

export type Aisle =
  | "Produce"
  | "Meat & Seafood"
  | "Dairy & Eggs"
  | "Bakery & Bread"
  | "Canned & Jarred"
  | "Pasta, Rice & Grains"
  | "Baking"
  | "Spices & Seasonings"
  | "Oils, Sauces & Condiments"
  | "Frozen"
  | "Snacks"
  | "Beverages"
  | "Other";

export const AISLE_ORDER: Aisle[] = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery & Bread",
  "Canned & Jarred",
  "Pasta, Rice & Grains",
  "Baking",
  "Spices & Seasonings",
  "Oils, Sauces & Condiments",
  "Frozen",
  "Snacks",
  "Beverages",
  "Other",
];

/** How the list counts an item: single pieces, grams or millilitres. */
export type Base = "each" | "g" | "ml";

export interface Pkg {
  /** size in the item's base unit */
  size: number;
  label: string;
  /** sealed units inside, e.g. 8 for an 8-pack of cans; unopened ones keep */
  units?: number;
}

export interface CatalogItem {
  key: string;
  name: string;
  aliases: string[];
  aisle: Aisle;
  base: Base;
  /** grams per piece (base "each" or converting pieces → grams) */
  gEach?: number;
  /** millilitres per piece, chopped/juiced as recipes usually mean */
  mlEach?: number;
  /** grams per millilitre, for cups ↔ ounces */
  gPerMl?: number;
  /** count units in base units: garlic {head: 10}, butter {stick: 113} */
  units?: Record<string, number>;
  /** days it keeps once bought or opened; drives how much a leftover matters */
  keepsDays: number;
  /** leftovers can go in the freezer, so they matter less */
  freezes?: boolean;
  /** usually on hand (salt, oil, spices): starts as "have it" on the list */
  pantry?: boolean;
  /** shown as the unit when the base is "each": "bunch", "head" */
  eachLabel?: [string, string];
  walmart: Pkg[];
  /** omitted when Sam's Club sizes are the same as Walmart's */
  sams?: Pkg[];
}

type Opts = Omit<CatalogItem, "key" | "name" | "aisle" | "base" | "aliases" | "walmart" | "keepsDays"> & {
  aliases?: string[];
};
type P = [number, string, number?];
const pk = (list: P[]): Pkg[] => list.map(([size, label, units]) => ({ size, label, units }));

function item(
  key: string,
  name: string,
  aisle: Aisle,
  base: Base,
  keepsDays: number,
  walmart: P[],
  sams: P[] | null,
  opts: Opts = {},
): CatalogItem {
  const { aliases = [], ...rest } = opts;
  return {
    key,
    name,
    aisle,
    base,
    keepsDays,
    aliases: [name.toLowerCase(), ...aliases],
    walmart: pk(walmart),
    sams: sams ? pk(sams) : undefined,
    ...rest,
  };
}

const OZ = 28.3495;
const LB = 453.592;
const can = (oz: number) => Math.round(oz * OZ);
const spice = (key: string, name: string, aliases: string[] = []) =>
  item(key, name, "Spices & Seasonings", "g", 720, [[can(2), "1 jar"]], null, {
    aliases,
    pantry: true,
    gPerMl: 0.5,
  });

export const CATALOG: CatalogItem[] = [
  // Produce
  item("onion", "Yellow onion", "Produce", "each", 30, [[1, "1 onion"], [6, "3 lb bag (about 6)"]], [[10, "5 lb bag (about 10)"]], {
    aliases: ["onion", "white onion", "sweet onion", "vidalia onion", "brown onion", "spanish onion"],
    gEach: 170,
    mlEach: 236,
  }),
  item("red-onion", "Red onion", "Produce", "each", 30, [[1, "1 red onion"], [6, "3 lb bag (about 6)"]], [[6, "3 lb bag (about 6)"]], { gEach: 170, mlEach: 236, aliases: ["purple onion"] }),
  item("green-onion", "Green onions", "Produce", "each", 7, [[7, "1 bunch"]], null, {
    aliases: ["green onion", "scallion", "spring onion", "scallions", "green onions"],
    units: { bunch: 7, stalk: 1 },
    gEach: 15,
    mlEach: 30,
    eachLabel: ["green onion", "green onions"],
  }),
  item("shallot", "Shallot", "Produce", "each", 30, [[1, "1 shallot"], [4, "bag of 4"]], null, { gEach: 40, mlEach: 45 }),
  item("garlic", "Garlic", "Produce", "each", 60, [[10, "1 head"], [30, "3-pack of heads"]], [[90, "2 lb bag"]], {
    aliases: ["garlic clove", "minced garlic", "clove garlic", "cloves garlic"],
    units: { head: 10, clove: 1, bulb: 10 },
    gEach: 5,
    mlEach: 5,
    eachLabel: ["clove", "cloves"],
  }),
  item("ginger", "Fresh ginger", "Produce", "g", 21, [[60, "1 knob (about 2 oz)"]], null, { aliases: ["ginger", "ginger root", "gingerroot"], gPerMl: 0.6, units: { piece: 15, inch: 15 } }),
  item("cilantro", "Cilantro", "Produce", "each", 7, [[1, "1 bunch"]], null, { aliases: ["coriander leaves", "fresh coriander"], units: { bunch: 1, sprig: 1 / 40, handful: 1 / 4 }, mlEach: 360, gEach: 70, eachLabel: ["bunch", "bunches"] }),
  item("parsley", "Parsley", "Produce", "each", 10, [[1, "1 bunch"]], null, { aliases: ["flat-leaf parsley", "italian parsley", "flat leaf parsley", "curly parsley"], units: { bunch: 1, sprig: 1 / 40, handful: 1 / 4 }, mlEach: 360, gEach: 60, eachLabel: ["bunch", "bunches"] }),
  item("basil", "Fresh basil", "Produce", "each", 6, [[1, "0.75 oz pack"]], null, { aliases: ["basil", "basil leaf", "fresh basil leaf"], units: { sprig: 1 / 8, leaf: 1 / 30, bunch: 2, handful: 1 / 2 }, mlEach: 180, gEach: 21, eachLabel: ["pack", "packs"] }),
  item("mint", "Fresh mint", "Produce", "each", 7, [[1, "0.75 oz pack"]], null, { aliases: ["mint", "mint leaf"], units: { sprig: 1 / 8, leaf: 1 / 40, bunch: 2 }, mlEach: 180, gEach: 21, eachLabel: ["pack", "packs"] }),
  item("dill", "Fresh dill", "Produce", "each", 7, [[1, "0.75 oz pack"]], null, { aliases: ["dill"], units: { sprig: 1 / 10, bunch: 2 }, mlEach: 180, gEach: 21, eachLabel: ["pack", "packs"] }),
  item("rosemary", "Fresh rosemary", "Produce", "each", 14, [[1, "0.75 oz pack"]], null, { aliases: ["rosemary sprig"], units: { sprig: 1 / 8 }, mlEach: 60, eachLabel: ["pack", "packs"] }),
  item("thyme", "Fresh thyme", "Produce", "each", 14, [[1, "0.75 oz pack"]], null, { aliases: ["thyme sprig", "fresh thyme leaf"], units: { sprig: 1 / 15 }, mlEach: 45, eachLabel: ["pack", "packs"] }),
  item("lemon", "Lemon", "Produce", "each", 21, [[1, "1 lemon"], [8, "2 lb bag (about 8)"]], [[12, "4 lb bag (about 12)"]], { aliases: ["lemon zest", "juice of lemon", "lemon wedge"], mlEach: 45, gEach: 100 }),
  item("lime", "Lime", "Produce", "each", 21, [[1, "1 lime"], [10, "2 lb bag (about 10)"]], [[15, "3 lb bag (about 15)"]], { aliases: ["lime zest", "juice of lime", "lime wedge"], mlEach: 30, gEach: 65 }),
  item("tomato", "Tomato", "Produce", "each", 7, [[1, "1 tomato"], [4, "4-pack on the vine"]], [[8, "2.5 lb pack"]], { aliases: ["roma tomato", "plum tomato", "vine tomato", "beefsteak tomato", "ripe tomato"], gEach: 150, mlEach: 180 }),
  item("cherry-tomato", "Cherry tomatoes", "Produce", "g", 7, [[can(10), "10 oz pint"]], [[2 * LB, "2 lb clamshell"]], { aliases: ["cherry tomato", "grape tomato", "grape tomatoes"], gPerMl: 0.63, gEach: 17 }),
  item("potato", "Russet potatoes", "Produce", "g", 30, [[213, "1 loose potato"], [5 * LB, "5 lb bag"]], [[10 * LB, "10 lb bag"]], { aliases: ["potato", "russet potato", "baking potato", "idaho potato"], gEach: 213, gPerMl: 0.63 }),
  item("yukon-potato", "Yukon Gold potatoes", "Produce", "g", 30, [[3 * LB, "3 lb bag"]], [[5 * LB, "5 lb bag"]], { aliases: ["yukon gold potato", "gold potato", "yellow potato", "baby potato", "red potato", "new potato"], gEach: 170, gPerMl: 0.63 }),
  item("sweet-potato", "Sweet potatoes", "Produce", "g", 21, [[200, "1 loose sweet potato"], [3 * LB, "3 lb bag"]], [[6 * LB, "6 lb box"]], { aliases: ["sweet potato", "yam"], gEach: 200, gPerMl: 0.56 }),
  item("carrot", "Carrots", "Produce", "g", 21, [[LB, "1 lb bag"], [2 * LB, "2 lb bag"]], [[5 * LB, "5 lb bag"]], { aliases: ["carrot", "baby carrot", "shredded carrot"], gEach: 61, gPerMl: 0.54 }),
  item("celery", "Celery", "Produce", "each", 14, [[9, "1 bunch (about 9 stalks)"]], [[18, "2-pack hearts"]], { aliases: ["celery stalk", "celery rib"], units: { stalk: 1, bunch: 9, head: 9 }, gEach: 40, mlEach: 100, eachLabel: ["stalk", "stalks"] }),
  item("bell-pepper-green", "Green bell pepper", "Produce", "each", 10, [[1, "1 pepper"], [3, "3-pack"]], [[6, "6-pack"]], { aliases: ["bell pepper", "green pepper", "green bell pepper"], gEach: 150, mlEach: 236 }),
  item("bell-pepper-red", "Red bell pepper", "Produce", "each", 10, [[1, "1 pepper"], [3, "3-pack"]], [[6, "6-pack"]], { aliases: ["red pepper", "red bell pepper", "yellow bell pepper", "orange bell pepper", "yellow pepper", "orange pepper"], gEach: 150, mlEach: 236 }),
  item("jalapeno", "Jalapeño", "Produce", "each", 10, [[1, "1 pepper"]], null, { aliases: ["jalapeno", "jalapeno pepper", "serrano", "serrano pepper"], gEach: 20, mlEach: 30 }),
  item("zucchini", "Zucchini", "Produce", "each", 7, [[1, "1 zucchini"]], [[7, "3 lb bag"]], { aliases: ["courgette"], gEach: 200, mlEach: 300 }),
  item("yellow-squash", "Yellow squash", "Produce", "each", 7, [[1, "1 squash"]], null, { aliases: ["summer squash"], gEach: 200, mlEach: 300 }),
  item("broccoli", "Broccoli", "Produce", "g", 7, [[can(12), "12 oz bag of florets"], [450, "1 crown"]], [[3 * LB, "3 lb bag of florets"]], { aliases: ["broccoli floret", "broccoli crown", "broccoli head"], gPerMl: 0.38, units: { head: 450, crown: 450 } }),
  item("cauliflower", "Cauliflower", "Produce", "each", 10, [[1, "1 head"]], [[2, "2-pack"]], { aliases: ["cauliflower floret", "cauliflower head"], units: { head: 1 }, gEach: 600, mlEach: 1400, eachLabel: ["head", "heads"] }),
  item("spinach", "Fresh spinach", "Produce", "g", 5, [[can(5), "5 oz box"], [can(10), "10 oz bag"]], [[LB, "1 lb tub"]], { aliases: ["spinach", "baby spinach", "spinach leaf"], gPerMl: 0.127 }),
  item("kale", "Kale", "Produce", "g", 7, [[200, "1 bunch"], [can(10), "10 oz bag"]], [[LB, "1 lb bag"]], { aliases: ["lacinato kale", "tuscan kale"], gPerMl: 0.07, units: { bunch: 200 } }),
  item("romaine", "Romaine lettuce", "Produce", "each", 7, [[1, "1 head"], [3, "3-pack hearts"]], [[6, "6-pack hearts"]], { aliases: ["romaine", "lettuce", "romaine heart", "iceberg lettuce", "head lettuce"], units: { head: 1, heart: 1 }, mlEach: 1400, eachLabel: ["head", "heads"] }),
  item("salad-greens", "Salad greens", "Produce", "g", 5, [[can(5), "5 oz box"], [LB, "1 lb box"]], [[LB, "1 lb box"]], { aliases: ["mixed greens", "spring mix", "arugula", "salad mix", "baby greens"], gPerMl: 0.1 }),
  item("cabbage", "Cabbage", "Produce", "each", 21, [[1, "1 head"]], null, { aliases: ["green cabbage", "red cabbage", "purple cabbage"], units: { head: 1 }, mlEach: 2000, gEach: 900, eachLabel: ["head", "heads"] }),
  item("coleslaw-mix", "Coleslaw mix", "Produce", "g", 7, [[can(14), "14 oz bag"]], [[2 * LB, "2 lb bag"]], { aliases: ["coleslaw", "shredded cabbage", "slaw mix"], gPerMl: 0.3 }),
  item("mushroom", "Mushrooms", "Produce", "g", 7, [[can(8), "8 oz pack"], [can(16), "16 oz pack"]], [[can(24), "24 oz pack"]], { aliases: ["white mushroom", "button mushroom", "cremini mushroom", "baby bella mushroom", "baby bella", "portobello mushroom", "sliced mushroom"], gPerMl: 0.3, gEach: 18 }),
  item("avocado", "Avocado", "Produce", "each", 4, [[1, "1 avocado"], [4, "bag of 4"]], [[6, "bag of 6"]], { gEach: 150, mlEach: 236 }),
  item("cucumber", "Cucumber", "Produce", "each", 7, [[1, "1 cucumber"]], [[3, "3-pack English cucumbers"]], { aliases: ["english cucumber"], gEach: 300, mlEach: 360 }),
  item("corn-fresh", "Corn on the cob", "Produce", "each", 4, [[1, "1 ear"], [4, "4-pack"]], null, { aliases: ["corn on the cob", "ear corn", "sweet corn"], units: { ear: 1 }, mlEach: 160, eachLabel: ["ear", "ears"] }),
  item("green-bean", "Green beans", "Produce", "g", 7, [[can(12), "12 oz bag"]], [[2 * LB, "2 lb bag"]], { aliases: ["fresh green bean", "string bean", "haricot vert"], gPerMl: 0.46 }),
  item("asparagus", "Asparagus", "Produce", "g", 4, [[LB, "1 lb bunch"]], [[2 * LB, "2 lb pack"]], { units: { bunch: LB }, gPerMl: 0.57 }),
  item("apple", "Apples", "Produce", "each", 30, [[1, "1 apple"], [6, "3 lb bag (about 6)"]], [[12, "5 lb bag (about 12)"]], { aliases: ["apple", "granny smith apple", "honeycrisp apple", "gala apple"], gEach: 180, mlEach: 236 }),
  item("banana", "Bananas", "Produce", "each", 5, [[1, "1 banana"], [6, "1 bunch (about 6)"]], [[18, "3 lb bunch"]], { aliases: ["banana", "ripe banana"], gEach: 118, mlEach: 150 }),
  item("strawberry", "Strawberries", "Produce", "g", 4, [[LB, "1 lb clamshell"]], [[2 * LB, "2 lb clamshell"]], { aliases: ["strawberry"], gPerMl: 0.64 }),
  item("blueberry", "Blueberries", "Produce", "g", 7, [[can(6), "6 oz pack"], [can(18), "18 oz pack"]], [[can(18), "18 oz pack"]], { aliases: ["blueberry"], gPerMl: 0.63 }),
  item("orange", "Oranges", "Produce", "each", 21, [[1, "1 orange"], [8, "4 lb bag"]], null, { aliases: ["orange zest", "navel orange"], mlEach: 80 }),

  // Meat & seafood
  item("chicken-breast", "Chicken breasts", "Meat & Seafood", "g", 2, [[1.5 * LB, "pack (about 1.5 lb)"], [2.5 * LB, "family pack (about 2.5 lb)"]], [[6 * LB, "bulk pack (about 6 lb)"]], { aliases: ["chicken breast", "boneless skinless chicken breast", "chicken breast half", "chicken tender", "chicken tenderloin"], gEach: 225, freezes: true }),
  item("chicken-thigh", "Chicken thighs", "Meat & Seafood", "g", 2, [[1.5 * LB, "pack (about 1.5 lb)"], [3 * LB, "family pack (about 3 lb)"]], [[5 * LB, "bulk pack (about 5 lb)"]], { aliases: ["chicken thigh", "boneless skinless chicken thigh", "bone-in chicken thigh"], gEach: 115, freezes: true }),
  item("chicken-drumstick", "Chicken drumsticks", "Meat & Seafood", "g", 2, [[2.5 * LB, "pack (about 2.5 lb)"]], [[6 * LB, "bulk pack (about 6 lb)"]], { aliases: ["chicken drumstick", "chicken leg"], gEach: 110, freezes: true }),
  item("chicken-wing", "Chicken wings", "Meat & Seafood", "g", 2, [[2.5 * LB, "pack (about 2.5 lb)"]], [[6 * LB, "bulk pack"]], { aliases: ["chicken wing", "wing"], gEach: 45, freezes: true }),
  item("whole-chicken", "Whole chicken", "Meat & Seafood", "each", 2, [[1, "1 chicken"]], [[2, "2-pack"]], { aliases: ["whole chicken", "roasting chicken", "fryer chicken"], gEach: 1800, freezes: true }),
  item("rotisserie-chicken", "Rotisserie chicken", "Meat & Seafood", "each", 4, [[1, "1 chicken"]], null, { aliases: ["rotisserie chicken", "cooked chicken", "shredded chicken", "shredded cooked chicken", "cooked shredded chicken"], gEach: 900, mlEach: 946 }),
  item("ground-beef", "Ground beef", "Meat & Seafood", "g", 2, [[LB, "1 lb pack"], [3 * LB, "3 lb pack"]], [[3 * LB, "3 lb pack"], [5 * LB, "5 lb roll"]], { aliases: ["lean ground beef", "ground chuck", "hamburger meat", "ground sirloin", "hamburger"], freezes: true, gPerMl: 0.95 }),
  item("ground-turkey", "Ground turkey", "Meat & Seafood", "g", 2, [[LB, "1 lb pack"]], [[3 * LB, "3 lb pack"]], { freezes: true, gPerMl: 0.95 }),
  item("ground-pork", "Ground pork", "Meat & Seafood", "g", 2, [[LB, "1 lb pack"]], null, { freezes: true, gPerMl: 0.95 }),
  item("italian-sausage", "Italian sausage", "Meat & Seafood", "g", 3, [[can(19), "19 oz pack"], [LB, "1 lb roll"]], [[5 * LB, "5 lb pack"]], { aliases: ["sausage", "ground italian sausage", "sweet italian sausage", "hot italian sausage", "pork sausage", "breakfast sausage"], units: { link: 100 }, freezes: true }),
  item("smoked-sausage", "Smoked sausage", "Meat & Seafood", "g", 7, [[can(14), "14 oz rope"]], [[3 * can(14), "3-pack"]], { aliases: ["kielbasa", "andouille sausage", "andouille"], freezes: true }),
  item("bacon", "Bacon", "Meat & Seafood", "g", 7, [[can(12), "12 oz pack"], [LB, "1 lb pack"]], [[3 * LB, "3 lb pack"]], { aliases: ["bacon slice", "bacon strip", "thick-cut bacon", "thick cut bacon"], units: { slice: 25, strip: 25 }, freezes: true }),
  item("pork-chop", "Pork chops", "Meat & Seafood", "g", 2, [[1.5 * LB, "pack (about 1.5 lb)"]], [[5 * LB, "bulk pack"]], { aliases: ["pork chop", "boneless pork chop", "bone-in pork chop"], gEach: 200, freezes: true }),
  item("pork-tenderloin", "Pork tenderloin", "Meat & Seafood", "g", 2, [[1.25 * LB, "1 tenderloin"]], [[2.5 * LB, "2-pack"]], { freezes: true, gEach: 1.25 * LB }),
  item("pork-shoulder", "Pork shoulder", "Meat & Seafood", "g", 3, [[4 * LB, "roast (about 4 lb)"]], [[8 * LB, "roast (about 8 lb)"]], { aliases: ["pork butt", "boston butt", "pork roast"], freezes: true }),
  item("deli-turkey", "Deli turkey", "Meat & Seafood", "g", 5, [[can(9), "9 oz pack"], [LB, "1 lb pack"]], [[2 * LB, "2 lb pack"]], { aliases: ["deli turkey", "sliced turkey", "turkey breast deli meat", "sliced deli turkey", "turkey lunch meat"], units: { slice: 28 }, freezes: true }),
  item("ham", "Ham", "Meat & Seafood", "g", 5, [[LB, "1 lb ham steak / diced"]], null, { aliases: ["diced ham", "cooked ham", "ham steak"], freezes: true }),
  item("beef-steak", "Steak", "Meat & Seafood", "g", 3, [[LB, "1 lb pack"]], [[3 * LB, "3 lb pack"]], { aliases: ["steak", "sirloin steak", "ribeye", "ribeye steak", "flank steak", "skirt steak", "strip steak", "new york strip"], gEach: 280, freezes: true }),
  item("beef-roast", "Chuck roast", "Meat & Seafood", "g", 3, [[3 * LB, "roast (about 3 lb)"]], [[5 * LB, "roast (about 5 lb)"]], { aliases: ["chuck roast", "beef chuck roast", "pot roast", "beef roast"], freezes: true }),
  item("stew-meat", "Beef stew meat", "Meat & Seafood", "g", 2, [[LB, "1 lb pack"]], [[3 * LB, "3 lb pack"]], { aliases: ["beef stew meat", "stew beef", "beef chuck"], freezes: true }),
  item("salmon", "Salmon", "Meat & Seafood", "g", 2, [[LB, "1 lb fillet"]], [[3 * LB, "3 lb bag frozen fillets"]], { aliases: ["salmon fillet"], units: { fillet: 170 }, gEach: 170, freezes: true }),
  item("white-fish", "White fish", "Meat & Seafood", "g", 2, [[LB, "1 lb pack"]], [[2 * LB, "2 lb bag frozen"]], { aliases: ["cod", "tilapia", "cod fillet", "tilapia fillet", "white fish fillet", "halibut", "mahi mahi"], units: { fillet: 170 }, gEach: 170, freezes: true }),
  item("shrimp", "Shrimp", "Meat & Seafood", "g", 90, [[LB, "1 lb bag frozen"], [2 * LB, "2 lb bag frozen"]], [[2 * LB, "2 lb bag frozen"]], { aliases: ["large shrimp", "raw shrimp", "peeled shrimp", "jumbo shrimp"] }),

  // Dairy & eggs
  item("egg", "Eggs", "Dairy & Eggs", "each", 35, [[12, "1 dozen"], [18, "18-count"]], [[24, "2 dozen"], [60, "5 dozen"]], { aliases: ["egg", "large egg", "egg yolk", "egg white", "whole egg"], gEach: 50 }),
  item("milk", "Milk", "Dairy & Eggs", "ml", 7, [[946, "1 quart"], [1893, "half gallon"], [3785, "1 gallon"]], [[2 * 3785, "2 × 1 gallon", 2]], { aliases: ["whole milk", "2% milk", "skim milk", "low-fat milk"], gPerMl: 1.03 }),
  item("butter", "Butter", "Dairy & Eggs", "g", 60, [[LB, "1 lb (4 sticks)", 4]], [[4 * LB, "4 lb (16 sticks)", 16]], { aliases: ["unsalted butter", "salted butter", "melted butter", "softened butter"], units: { stick: 113 }, gPerMl: 0.96 }),
  item("heavy-cream", "Heavy cream", "Dairy & Eggs", "ml", 10, [[237, "half pint"], [473, "1 pint"], [946, "1 quart"]], [[1893, "half gallon"]], { aliases: ["heavy whipping cream", "whipping cream", "double cream", "cream"], gPerMl: 1.0 }),
  item("half-and-half", "Half and half", "Dairy & Eggs", "ml", 10, [[473, "1 pint"], [946, "1 quart"]], [[1893, "half gallon"]], { aliases: ["half & half", "half-and-half"] }),
  item("sour-cream", "Sour cream", "Dairy & Eggs", "g", 14, [[can(8), "8 oz tub"], [can(16), "16 oz tub"]], [[3 * LB, "3 lb tub"]], { aliases: ["sour cream", "light sour cream"], gPerMl: 0.97 }),
  item("cream-cheese", "Cream cheese", "Dairy & Eggs", "g", 21, [[can(8), "8 oz block"]], [[6 * can(8), "6 × 8 oz blocks", 6]], { aliases: ["cream cheese", "neufchatel"], units: { package: can(8), block: can(8) }, gPerMl: 0.97 }),
  item("yogurt", "Plain yogurt", "Dairy & Eggs", "g", 14, [[can(32), "32 oz tub"]], [[can(48), "48 oz tub"]], { aliases: ["plain yogurt", "greek yogurt", "plain greek yogurt", "yogurt"], gPerMl: 1.03 }),
  item("buttermilk", "Buttermilk", "Dairy & Eggs", "ml", 14, [[946, "1 quart"]], null),
  item("cheddar", "Cheddar cheese", "Dairy & Eggs", "g", 30, [[can(8), "8 oz bag"], [can(16), "16 oz bag"]], [[2 * LB, "2 lb bag"], [5 * LB, "5 lb bag"]], { aliases: ["cheddar", "shredded cheddar", "sharp cheddar", "sharp cheddar cheese", "mild cheddar", "shredded cheddar cheese", "cheese"], gPerMl: 0.48, freezes: true }),
  item("mozzarella", "Mozzarella cheese", "Dairy & Eggs", "g", 30, [[can(8), "8 oz bag"], [can(16), "16 oz bag"]], [[2 * LB, "2 lb bag"], [5 * LB, "5 lb bag"]], { aliases: ["mozzarella", "shredded mozzarella", "part-skim mozzarella", "fresh mozzarella", "shredded mozzarella cheese"], gPerMl: 0.48, freezes: true }),
  item("mexican-cheese", "Mexican blend cheese", "Dairy & Eggs", "g", 30, [[can(8), "8 oz bag"], [can(16), "16 oz bag"]], [[2.5 * LB, "2.5 lb bag"]], { aliases: ["mexican cheese", "mexican blend", "taco cheese", "colby jack", "monterey jack", "monterey jack cheese", "pepper jack", "pepper jack cheese", "mexican cheese blend"], gPerMl: 0.48, freezes: true }),
  item("parmesan", "Parmesan cheese", "Dairy & Eggs", "g", 60, [[can(5), "5 oz wedge / tub"], [can(8), "8 oz tub"]], [[can(24), "24 oz tub"]], { aliases: ["parmesan", "parmigiano reggiano", "parmigiano-reggiano", "grated parmesan", "shredded parmesan", "parmesan cheese", "pecorino romano", "pecorino"], gPerMl: 0.42 }),
  item("feta", "Feta cheese", "Dairy & Eggs", "g", 14, [[can(4), "4 oz tub"], [can(6), "6 oz tub"]], [[can(24), "24 oz tub"]], { aliases: ["feta", "crumbled feta"], gPerMl: 0.6 }),
  item("ricotta", "Ricotta cheese", "Dairy & Eggs", "g", 7, [[can(15), "15 oz tub"], [can(32), "32 oz tub"]], [[3 * LB, "3 lb tub"]], { aliases: ["ricotta", "whole milk ricotta", "part-skim ricotta"], gPerMl: 1.04 }),
  item("cheese-slice", "Sliced cheese", "Dairy & Eggs", "each", 21, [[12, "12 slices"]], [[48, "48 slices"]], { aliases: ["american cheese", "cheese slice", "sliced cheese", "provolone", "swiss cheese", "sliced provolone"], units: { slice: 1 }, eachLabel: ["slice", "slices"] }),

  // Bakery & bread
  item("flour-tortilla", "Flour tortillas", "Bakery & Bread", "each", 14, [[10, "10-count"], [20, "20-count"]], [[30, "30-count"]], { aliases: ["flour tortilla", "tortilla", "burrito tortilla", "large flour tortilla"], eachLabel: ["tortilla", "tortillas"], freezes: true }),
  item("corn-tortilla", "Corn tortillas", "Bakery & Bread", "each", 14, [[30, "30-count"]], [[80, "80-count"]], { aliases: ["corn tortilla", "street taco tortilla"], eachLabel: ["tortilla", "tortillas"], freezes: true }),
  item("bread", "Sandwich bread", "Bakery & Bread", "each", 7, [[20, "1 loaf (about 20 slices)"]], [[40, "2-pack loaves", 2]], { aliases: ["bread", "white bread", "wheat bread", "bread slice", "sandwich bread"], units: { slice: 1, loaf: 20 }, eachLabel: ["slice", "slices"], freezes: true }),
  item("burger-bun", "Hamburger buns", "Bakery & Bread", "each", 7, [[8, "8-pack"]], [[16, "16-pack"]], { aliases: ["hamburger bun", "burger bun", "bun", "brioche bun", "slider bun"], eachLabel: ["bun", "buns"], freezes: true }),
  item("hotdog-bun", "Hot dog buns", "Bakery & Bread", "each", 7, [[8, "8-pack"]], [[16, "16-pack"]], { aliases: ["hot dog bun", "hoagie roll", "sub roll"], eachLabel: ["bun", "buns"], freezes: true }),
  item("french-bread", "French bread", "Bakery & Bread", "each", 3, [[1, "1 loaf"]], [[2, "2-pack"]], { aliases: ["baguette", "french bread loaf", "crusty bread", "italian bread"], units: { loaf: 1 }, eachLabel: ["loaf", "loaves"], freezes: true }),

  // Canned & jarred
  item("diced-tomato", "Diced tomatoes", "Canned & Jarred", "g", 5, [[can(14.5), "14.5 oz can"], [can(28), "28 oz can"]], [[8 * can(14.5), "8-pack 14.5 oz cans", 8]], { aliases: ["diced tomato", "canned diced tomato", "fire-roasted diced tomato", "fire roasted tomato", "petite diced tomato", "canned tomato", "rotel", "diced tomatoes and green chiles"], units: { can: can(14.5) }, gPerMl: 1.0 }),
  item("crushed-tomato", "Crushed tomatoes", "Canned & Jarred", "g", 5, [[can(28), "28 oz can"]], [[6 * can(28), "6-pack 28 oz cans", 6]], { aliases: ["crushed tomato", "whole peeled tomato", "san marzano tomato", "whole tomato"], units: { can: can(28) }, gPerMl: 1.0 }),
  item("tomato-sauce", "Tomato sauce", "Canned & Jarred", "g", 5, [[can(8), "8 oz can"], [can(15), "15 oz can"]], [[8 * can(15), "8-pack 15 oz cans", 8]], { units: { can: can(8) }, gPerMl: 1.03 }),
  item("tomato-paste", "Tomato paste", "Canned & Jarred", "g", 7, [[can(6), "6 oz can"]], [[6 * can(6), "6-pack 6 oz cans", 6]], { units: { can: can(6) }, gPerMl: 1.1 }),
  item("marinara", "Pasta sauce", "Canned & Jarred", "ml", 7, [[680, "24 oz jar"]], [[3 * 1270, "3-pack 45 oz jars", 3]], { aliases: ["marinara", "marinara sauce", "spaghetti sauce", "pasta sauce", "pizza sauce"], units: { jar: 680 }, gPerMl: 1.05 }),
  item("chicken-broth", "Chicken broth", "Canned & Jarred", "ml", 7, [[411, "14.5 oz can"], [946, "32 oz carton"]], [[6 * 946, "6 × 32 oz cartons", 6]], { aliases: ["chicken stock", "low-sodium chicken broth", "low sodium chicken broth", "chicken bone broth", "broth"], units: { can: 411, carton: 946, container: 946 } }),
  item("beef-broth", "Beef broth", "Canned & Jarred", "ml", 7, [[411, "14.5 oz can"], [946, "32 oz carton"]], [[6 * 946, "6 × 32 oz cartons", 6]], { aliases: ["beef stock", "low-sodium beef broth"], units: { can: 411, carton: 946, container: 946 } }),
  item("vegetable-broth", "Vegetable broth", "Canned & Jarred", "ml", 7, [[946, "32 oz carton"]], [[6 * 946, "6 × 32 oz cartons", 6]], { aliases: ["vegetable stock", "veggie broth"], units: { carton: 946, container: 946 } }),
  item("black-bean", "Black beans", "Canned & Jarred", "g", 4, [[can(15), "15 oz can"]], [[8 * can(15), "8-pack 15 oz cans", 8]], { aliases: ["black bean", "canned black bean"], units: { can: can(15) }, gPerMl: 0.75 }),
  item("kidney-bean", "Kidney beans", "Canned & Jarred", "g", 4, [[can(15), "15 oz can"]], [[8 * can(15), "8-pack 15 oz cans", 8]], { aliases: ["kidney bean", "red kidney bean", "dark red kidney bean"], units: { can: can(15) }, gPerMl: 0.75 }),
  item("pinto-bean", "Pinto beans", "Canned & Jarred", "g", 4, [[can(15), "15 oz can"]], [[8 * can(15), "8-pack 15 oz cans", 8]], { aliases: ["pinto bean"], units: { can: can(15) }, gPerMl: 0.75 }),
  item("chickpea", "Chickpeas", "Canned & Jarred", "g", 4, [[can(15), "15 oz can"]], [[8 * can(15), "8-pack 15 oz cans", 8]], { aliases: ["garbanzo bean", "chickpea"], units: { can: can(15) }, gPerMl: 0.75 }),
  item("white-bean", "White beans", "Canned & Jarred", "g", 4, [[can(15), "15 oz can"]], null, { aliases: ["cannellini bean", "great northern bean", "navy bean", "white bean"], units: { can: can(15) }, gPerMl: 0.75 }),
  item("refried-bean", "Refried beans", "Canned & Jarred", "g", 5, [[can(16), "16 oz can"]], [[8 * can(16), "8-pack", 8]], { aliases: ["refried bean"], units: { can: can(16) }, gPerMl: 1.0 }),
  item("green-chile", "Diced green chiles", "Canned & Jarred", "g", 7, [[can(4), "4 oz can"]], null, { aliases: ["green chile", "green chili", "diced green chile", "diced green chili", "chopped green chile"], units: { can: can(4) }, gPerMl: 0.95 }),
  item("corn-canned", "Canned corn", "Canned & Jarred", "g", 4, [[can(15.25), "15.25 oz can"]], [[8 * can(15.25), "8-pack", 8]], { aliases: ["canned corn", "whole kernel corn"], units: { can: can(15.25) }, gPerMl: 0.7 }),
  item("coconut-milk", "Coconut milk", "Canned & Jarred", "ml", 4, [[400, "13.5 oz can"]], [[6 * 400, "6-pack", 6]], { aliases: ["coconut milk", "full-fat coconut milk", "light coconut milk", "coconut cream"], units: { can: 400 } }),
  item("cream-soup", "Cream of chicken soup", "Canned & Jarred", "g", 4, [[can(10.5), "10.5 oz can"]], [[8 * can(10.5), "8-pack", 8]], { aliases: ["cream of chicken soup", "cream of mushroom soup", "condensed cream of chicken soup", "condensed cream of mushroom soup", "cream of celery soup"], units: { can: can(10.5) }, gPerMl: 1.05 }),
  item("salsa", "Salsa", "Canned & Jarred", "ml", 14, [[454, "16 oz jar"]], [[1420, "48 oz jar"]], { aliases: ["salsa", "salsa verde", "picante sauce"], units: { jar: 454 } }),
  item("enchilada-sauce", "Enchilada sauce", "Canned & Jarred", "ml", 7, [[283, "10 oz can"], [538, "19 oz can"]], null, { aliases: ["red enchilada sauce", "green enchilada sauce"], units: { can: 283 } }),
  item("sun-dried-tomato", "Sun-dried tomatoes", "Canned & Jarred", "g", 30, [[can(8.5), "8.5 oz jar"]], null, { aliases: ["sun-dried tomato", "sundried tomato", "sun dried tomato", "oil-packed sun-dried tomato"], gPerMl: 0.5 }),
  item("olives", "Olives", "Canned & Jarred", "g", 21, [[can(6), "6 oz can"]], null, { aliases: ["olive", "black olive", "kalamata olive", "sliced black olive", "green olive"], units: { can: can(6) }, gPerMl: 0.6 }),
  item("tuna", "Canned tuna", "Canned & Jarred", "g", 3, [[can(5), "5 oz can"]], [[8 * can(5), "8-pack", 8]], { aliases: ["tuna", "canned tuna", "tuna in water"], units: { can: can(5) } }),
  item("peanut-butter", "Peanut butter", "Canned & Jarred", "g", 90, [[can(16), "16 oz jar"]], [[2 * can(48), "2 × 48 oz jars", 2]], { gPerMl: 1.08 }),

  // Pasta, rice & grains
  item("spaghetti", "Spaghetti", "Pasta, Rice & Grains", "g", 365, [[LB, "1 lb box"]], [[6 * LB, "6 × 1 lb", 6]], { aliases: ["spaghetti noodle", "linguine", "angel hair", "angel hair pasta", "fettuccine", "thin spaghetti", "capellini"] }),
  item("short-pasta", "Short pasta", "Pasta, Rice & Grains", "g", 365, [[LB, "1 lb box"]], [[6 * LB, "6 × 1 lb", 6]], { aliases: ["pasta", "penne", "penne pasta", "rotini", "rigatoni", "ziti", "farfalle", "bow tie pasta", "fusilli", "shell pasta", "medium shell", "orecchiette", "cavatappi"] }),
  item("elbow-macaroni", "Elbow macaroni", "Pasta, Rice & Grains", "g", 365, [[LB, "1 lb box"]], [[6 * LB, "6 × 1 lb", 6]], { aliases: ["macaroni", "elbow pasta", "elbow noodle"], gPerMl: 0.45 }),
  item("egg-noodle", "Egg noodles", "Pasta, Rice & Grains", "g", 365, [[can(12), "12 oz bag"]], null, { aliases: ["egg noodle", "wide egg noodle"], gPerMl: 0.2 }),
  item("lasagna-noodle", "Lasagna noodles", "Pasta, Rice & Grains", "each", 365, [[18, "1 lb box (about 18)"]], null, { aliases: ["lasagna noodle", "lasagna sheet", "oven-ready lasagna noodle", "no-boil lasagna noodle"], eachLabel: ["noodle", "noodles"] }),
  item("rice", "White rice", "Pasta, Rice & Grains", "g", 720, [[2 * LB, "2 lb bag"], [5 * LB, "5 lb bag"]], [[25 * LB, "25 lb bag"]], { aliases: ["rice", "long-grain white rice", "long grain rice", "jasmine rice", "basmati rice", "white rice", "uncooked rice"], gPerMl: 0.78 }),
  item("brown-rice", "Brown rice", "Pasta, Rice & Grains", "g", 365, [[2 * LB, "2 lb bag"]], [[12 * LB, "12 lb bag"]], { gPerMl: 0.8 }),
  item("quinoa", "Quinoa", "Pasta, Rice & Grains", "g", 365, [[can(12), "12 oz bag"]], [[4 * LB, "4 lb bag"]], { gPerMl: 0.72 }),
  item("oats", "Rolled oats", "Pasta, Rice & Grains", "g", 365, [[can(18), "18 oz canister"], [can(42), "42 oz canister"]], [[10 * LB, "10 lb bag"]], { aliases: ["oat", "rolled oat", "old-fashioned oat", "old fashioned oat", "quick oat", "oatmeal"], gPerMl: 0.34 }),
  item("breadcrumbs", "Breadcrumbs", "Pasta, Rice & Grains", "g", 180, [[can(15), "15 oz canister"]], null, { aliases: ["bread crumb", "breadcrumb", "panko", "panko bread crumb", "italian bread crumb", "seasoned bread crumb"], gPerMl: 0.45 }),
  item("tortilla-chips", "Tortilla chips", "Snacks", "g", 30, [[can(13), "13 oz bag"]], [[can(40), "40 oz bag"]], { aliases: ["tortilla chip", "corn chip"] }),

  // Baking
  item("flour", "All-purpose flour", "Baking", "g", 365, [[5 * LB, "5 lb bag"]], [[25 * LB, "25 lb bag"]], { aliases: ["flour", "all purpose flour", "ap flour", "plain flour", "unbleached all-purpose flour"], gPerMl: 0.53, pantry: true }),
  item("sugar", "Granulated sugar", "Baking", "g", 720, [[4 * LB, "4 lb bag"]], [[25 * LB, "25 lb bag"]], { aliases: ["sugar", "white sugar", "granulated white sugar", "cane sugar"], gPerMl: 0.85, pantry: true }),
  item("brown-sugar", "Brown sugar", "Baking", "g", 365, [[2 * LB, "2 lb bag"]], [[7 * LB, "7 lb bag"]], { aliases: ["light brown sugar", "dark brown sugar", "packed brown sugar"], gPerMl: 0.93, pantry: true }),
  item("powdered-sugar", "Powdered sugar", "Baking", "g", 720, [[2 * LB, "2 lb bag"]], null, { aliases: ["confectioners sugar", "confectioners' sugar", "icing sugar"], gPerMl: 0.5 }),
  item("baking-soda", "Baking soda", "Baking", "g", 720, [[LB, "1 lb box"]], null, { gPerMl: 0.97, pantry: true }),
  item("baking-powder", "Baking powder", "Baking", "g", 365, [[can(8.1), "8.1 oz can"]], null, { gPerMl: 0.9, pantry: true }),
  item("cornstarch", "Cornstarch", "Baking", "g", 720, [[LB, "1 lb box"]], null, { aliases: ["corn starch", "cornflour"], gPerMl: 0.54, pantry: true }),
  item("vanilla", "Vanilla extract", "Baking", "ml", 720, [[59, "2 oz bottle"]], null, { aliases: ["vanilla", "pure vanilla extract"], pantry: true }),
  item("chocolate-chips", "Chocolate chips", "Baking", "g", 365, [[can(12), "12 oz bag"]], [[can(72), "72 oz bag"]], { aliases: ["chocolate chip", "semi-sweet chocolate chip", "semisweet chocolate chip", "milk chocolate chip"], gPerMl: 0.72 }),
  item("honey", "Honey", "Baking", "ml", 720, [[355, "12 oz bottle"]], [[1420, "5 lb jar"]], { gPerMl: 1.42 }),
  item("maple-syrup", "Maple syrup", "Baking", "ml", 365, [[355, "12 oz bottle"]], null, { aliases: ["pure maple syrup"] }),

  // Spices
  spice("salt", "Salt", ["kosher salt", "sea salt", "table salt", "salt and pepper", "salt and black pepper", "fine sea salt", "flaky salt"]),
  spice("black-pepper", "Black pepper", ["pepper", "ground black pepper", "freshly ground black pepper", "black peppercorn", "ground pepper"]),
  spice("garlic-powder", "Garlic powder", ["granulated garlic", "garlic salt"]),
  spice("onion-powder", "Onion powder", ["dried minced onion"]),
  spice("paprika", "Paprika", ["sweet paprika"]),
  spice("smoked-paprika", "Smoked paprika"),
  spice("cumin", "Ground cumin", ["cumin", "cumin seed"]),
  spice("chili-powder", "Chili powder"),
  spice("oregano", "Dried oregano", ["oregano"]),
  spice("dried-basil", "Dried basil"),
  spice("dried-thyme", "Dried thyme"),
  spice("italian-seasoning", "Italian seasoning"),
  spice("red-pepper-flakes", "Red pepper flakes", ["crushed red pepper", "crushed red pepper flake", "red chili flake", "chili flake"]),
  spice("cayenne", "Cayenne pepper", ["cayenne", "ground cayenne"]),
  spice("cinnamon", "Ground cinnamon", ["cinnamon"]),
  spice("nutmeg", "Ground nutmeg", ["nutmeg"]),
  spice("bay-leaf", "Bay leaves", ["bay leaf", "dried bay leaf"]),
  spice("ground-ginger", "Ground ginger"),
  spice("curry-powder", "Curry powder"),
  spice("cajun-seasoning", "Cajun seasoning", ["creole seasoning"]),
  item("taco-seasoning", "Taco seasoning", "Spices & Seasonings", "g", 365, [[28, "1 oz packet"]], [[can(24), "24 oz jar"]], { aliases: ["taco seasoning mix", "fajita seasoning"], units: { package: 28, packet: 28 }, gPerMl: 0.5 }),
  item("ranch-mix", "Ranch seasoning mix", "Spices & Seasonings", "g", 365, [[28, "1 oz packet"]], null, { aliases: ["ranch seasoning", "ranch dressing mix", "dry ranch mix"], units: { package: 28, packet: 28 }, gPerMl: 0.5 }),

  // Oils, sauces & condiments
  item("olive-oil", "Olive oil", "Oils, Sauces & Condiments", "ml", 365, [[500, "17 oz bottle"]], [[2000, "2 L bottle"]], { aliases: ["extra virgin olive oil", "extra-virgin olive oil", "evoo", "light olive oil"], pantry: true }),
  item("vegetable-oil", "Vegetable oil", "Oils, Sauces & Condiments", "ml", 365, [[1420, "48 oz bottle"]], [[4730, "1.25 gal jug"]], { aliases: ["canola oil", "neutral oil", "cooking oil", "oil", "avocado oil", "frying oil"], pantry: true }),
  item("cooking-spray", "Cooking spray", "Oils, Sauces & Condiments", "ml", 365, [[170, "6 oz can"]], null, { aliases: ["nonstick cooking spray", "nonstick spray"], pantry: true }),
  item("soy-sauce", "Soy sauce", "Oils, Sauces & Condiments", "ml", 365, [[296, "10 oz bottle"]], null, { aliases: ["low-sodium soy sauce", "low sodium soy sauce", "tamari"] }),
  item("worcestershire", "Worcestershire sauce", "Oils, Sauces & Condiments", "ml", 365, [[296, "10 oz bottle"]], null, { aliases: ["worcestershire"] }),
  item("hot-sauce", "Hot sauce", "Oils, Sauces & Condiments", "ml", 365, [[177, "6 oz bottle"]], null, { aliases: ["sriracha", "frank's red hot", "buffalo sauce", "tabasco"] }),
  item("ketchup", "Ketchup", "Oils, Sauces & Condiments", "ml", 180, [[567, "20 oz bottle"]], null, { aliases: ["catsup"] }),
  item("mustard", "Mustard", "Oils, Sauces & Condiments", "ml", 365, [[236, "8 oz bottle"]], null, { aliases: ["dijon mustard", "yellow mustard", "dijon", "whole grain mustard", "spicy brown mustard"] }),
  item("mayonnaise", "Mayonnaise", "Oils, Sauces & Condiments", "ml", 60, [[887, "30 oz jar"]], null, { aliases: ["mayo"] }),
  item("bbq-sauce", "BBQ sauce", "Oils, Sauces & Condiments", "ml", 120, [[510, "18 oz bottle"]], null, { aliases: ["barbecue sauce", "bbq sauce"] }),
  item("ranch-dressing", "Ranch dressing", "Oils, Sauces & Condiments", "ml", 60, [[473, "16 oz bottle"]], null, { aliases: ["ranch"] }),
  item("vinegar", "White vinegar", "Oils, Sauces & Condiments", "ml", 720, [[946, "32 oz bottle"]], null, { aliases: ["white vinegar", "distilled white vinegar"], pantry: true }),
  item("cider-vinegar", "Apple cider vinegar", "Oils, Sauces & Condiments", "ml", 720, [[473, "16 oz bottle"]], null, { aliases: ["apple cider vinegar", "cider vinegar"] }),
  item("balsamic", "Balsamic vinegar", "Oils, Sauces & Condiments", "ml", 720, [[250, "8.5 oz bottle"]], null, { aliases: ["balsamic vinegar", "balsamic glaze"] }),
  item("red-wine-vinegar", "Red wine vinegar", "Oils, Sauces & Condiments", "ml", 720, [[355, "12 oz bottle"]], null, { aliases: ["white wine vinegar", "rice vinegar", "rice wine vinegar"] }),
  item("sesame-oil", "Sesame oil", "Oils, Sauces & Condiments", "ml", 365, [[148, "5 oz bottle"]], null, { aliases: ["toasted sesame oil"] }),
  item("lemon-juice", "Lemon juice (bottled)", "Oils, Sauces & Condiments", "ml", 180, [[444, "15 oz bottle"]], null, { aliases: ["lemon juice", "fresh lemon juice", "freshly squeezed lemon juice"] }),
  item("lime-juice", "Lime juice (bottled)", "Oils, Sauces & Condiments", "ml", 180, [[444, "15 oz bottle"]], null, { aliases: ["lime juice", "fresh lime juice"] }),

  // Frozen
  item("frozen-peas", "Frozen peas", "Frozen", "g", 180, [[can(12), "12 oz bag"]], [[5 * LB, "5 lb bag"]], { aliases: ["pea", "green pea", "frozen pea", "sweet pea"], gPerMl: 0.6 }),
  item("frozen-corn", "Frozen corn", "Frozen", "g", 180, [[can(12), "12 oz bag"]], [[5 * LB, "5 lb bag"]], { aliases: ["corn", "corn kernel", "frozen corn kernel", "sweet corn kernel"], gPerMl: 0.6 }),
  item("frozen-mixed-veg", "Frozen mixed vegetables", "Frozen", "g", 180, [[can(12), "12 oz bag"]], [[5 * LB, "5 lb bag"]], { aliases: ["mixed vegetable", "frozen mixed vegetable", "frozen vegetable"], gPerMl: 0.6 }),
  item("frozen-spinach", "Frozen spinach", "Frozen", "g", 180, [[can(10), "10 oz box"]], null, { aliases: ["frozen chopped spinach", "chopped frozen spinach"], gPerMl: 0.6 }),
  item("frozen-broccoli", "Frozen broccoli", "Frozen", "g", 180, [[can(12), "12 oz bag"]], [[4 * LB, "4 lb bag"]], { aliases: ["frozen broccoli floret"], gPerMl: 0.38 }),
  item("hash-browns", "Frozen hash browns", "Frozen", "g", 180, [[2 * LB, "2 lb bag"]], [[6 * LB, "6 lb bag"]], { aliases: ["hash brown", "shredded hash brown", "frozen hash brown", "tater tot", "tater tots"], gPerMl: 0.4 }),
];

export const CATALOG_BY_KEY = new Map(CATALOG.map((c) => [c.key, c]));

export function packagesFor(item: CatalogItem, store: Store): Pkg[] {
  return (store === "sams" ? item.sams : undefined) ?? item.walmart;
}

/** Leftovers of an item matter if it spoils within two weeks; freezer-friendly ones matter less. */
export function wasteWeight(item: CatalogItem | undefined): number {
  if (!item) return 0;
  if (item.keepsDays > 14) return 0;
  return item.freezes ? 0.25 : 1;
}
