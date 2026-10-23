# Meal Planner

A household meal-planning and grocery app. Keep your recipes in one place, plan the week around what you're in the mood for, and get one grocery list that buys whole store packages without wasting food. Then order the rest for Walmart or Sam's Club pickup.

## What it does

**Recipes**
- Import from a **Pinterest pin** (`pin.it/…` or `pinterest.com/pin/…`): the app follows the pin to the recipe website and reads the recipe from it.
- Import a **whole Pinterest board**, or paste many links at once and let it work through them.
- Import from any **recipe website** that publishes standard recipe data (most do).
- Import from **photos** of recipe cards or cookbook pages, several at a time. Recipes that run over more than one page are grouped automatically (and a page holding two recipes is split); you can join or split groups before saving. Photos are read on the phone for free, which works well for printed recipes. With an Anthropic API key, Claude reads them instead, which also handles handwriting.
- Import a **recipe file** (`.json`, under *Many at once*), for example one prepared from a large stack of photos.
- **Paste** recipe text, or **type** a recipe in.
- Mark recipes as a **Favorite**, or as a **Staple** that comes back every 1–4 weeks.

**Planning a week**
1. *How many meals?* Breakfasts, lunches and dinners, how many people, and how many lunches will be dinner leftovers. Leftover dinners are cooked bigger automatically.
2. *What are you in the mood for?* Quick, comfort food, Mexican, Italian, Asian, healthy, slow cooker, grilling, soups, meatless, kid-friendly, something new… plus a free-text box ("something with salmon").
3. The app recommends a plan. **Swap** any meal: alternatives are ranked by how well they fit what you asked for, whether they use up ingredients the week would otherwise waste, favorites, staples that are due, and how recently you made them. Assign days, change servings, or add and remove meals.
4. **Approve** the plan to build the grocery list.

**Grocery list**
1. *What we have:* check off anything already in the kitchen. Pantry basics (salt, oil, spices, flour…) start checked. Mark anything else "We always have this" and it starts checked from then on.
2. *Order:* what's left, grouped by aisle, sized for the store you pick. Each item opens in the Walmart or Sam's Club app or site, where you add it to your cart and check out for pickup. Save the exact product you like and it opens directly next week. On Walmart, saved products can go into the cart with one tap.

The list is shared: everyone in the household sees changes within a few seconds.

## How it cuts waste

- **One line per ingredient.** Every recipe's ingredients are parsed (amounts, units, can sizes, "juice of 1 lime") and combined, so cilantro in two meals is one bunch, not two.
- **Rounded to real packages.** A built-in catalog of about 180 common items knows typical Walmart and Sam's Club package sizes (16 oz sour cream tub, 1 bunch cilantro, 8-pack of cans…). The list buys the combination that leaves the least extra, and says what will be left over.
- **Counts what spoils.** Leftovers are weighted by how fast they go bad. Herbs, dairy and opened cans count; rice, spices and sealed cans in a multi-pack don't; meat counts less because it freezes.
- **Plans around leftovers.** The week screen shows a *Leftover watch* ("⅝ cup sour cream, ½ bunch cilantro"). Swap suggestions and recommendations favor meals that use those up.
- **Leftover lunches.** Lunches can be planned as a dinner's leftovers instead of separate shopping.

Package sizes are typical US sizes, not live store data, so treat the leftover amounts as estimates.

## Running it

Requires Node 20.9+.

```bash
npm install
npm run dev        # http://localhost:3000
```

With no `DATABASE_URL`, data lives in an embedded Postgres under `.data/`, which is fine for trying it on one computer. For the household to use it from their phones, deploy it:

### Deploy (Vercel + Neon, both have free tiers)

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. Add a Postgres database: in the Vercel project, open **Storage → Create → Neon** (or create one at neon.tech) and connect it. That sets `DATABASE_URL`.
3. Optional: add `ANTHROPIC_API_KEY` under **Settings → Environment Variables** so Claude reads handwritten cards and image-only pins. Photo import works without it, reading printed recipes on the phone.
4. Deploy. Tables are created automatically on first request.
5. Open the site on your phone and use **Share → Add to Home Screen** so it opens like an app.

The first person signs up and starts a household. Everyone else signs up with the invite code from the **Household** tab.

### Environment variables

| Variable | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | for deployment | Postgres connection string |
| `ANTHROPIC_API_KEY` | optional | Claude reads photos (better with handwriting) and image-only Pinterest pins. Without it, photos are read on the phone. |

## Limits worth knowing

- **Pinterest boards:** Pinterest's public board feed only lists a board's most recent pins (about 25), and secret boards can't be read. For big boards, paste pin links in batches using **Many at once**. Pins whose site doesn't publish recipe data come in as drafts marked *Needs ingredients*.
- **Pinterest blocking:** Pinterest occasionally blocks automated requests. If a pin fails, open it, tap through to the recipe site, and import that link instead.
- **Walmart and Sam's Club** have no public API for building someone's pickup cart. The app opens each item in their app or site, where your account, pickup store and substitutions already live. The one-tap "add saved products to Walmart cart" uses Walmart's add-to-cart link; if Walmart changes it, the per-item links still work.

## Development

```bash
npm test           # unit tests (parser, catalog, list builder, planner, importers)
npm run typecheck
npm run lint
npm run build
npm run db:generate  # after changing src/db/schema.ts
```

### Layout

```
src/lib/ingredients/   parse.ts (ingredient lines), units.ts, normalize.ts (names → grocery items),
                       catalog.ts (aisles, shelf life, Walmart/Sam's package sizes), grocery.ts (list builder)
src/lib/planner.ts     swap ranking and auto-fill, scored by waste added/removed, mood, favorites, staples
src/lib/moods.ts       "what are you in the mood for" matching and meal-type inference
src/lib/import/        recipe-site (schema.org) reader, Pinterest pins/boards, pasted text, photo pages (Claude) and page grouping
src/lib/ocr/           free on-device photo reader (Tesseract, served from public/ocr)
src/lib/stores.ts      Walmart / Sam's Club links
src/db/                Drizzle schema; Postgres in production, PGlite locally
src/server/            auth (email + password, household invite codes) and data helpers
src/actions/           server actions
src/app/               screens: week, recipes, list, household, sign-in
```

### Recipe file format

```json
{
  "recipes": [
    {
      "title": "Grandma's Pot Roast",
      "servings": 6,
      "prepMinutes": 20,
      "cookMinutes": 180,
      "ingredients": ["3 lb chuck roast", "1 onion, quartered"],
      "steps": ["Brown the roast.", "Roast at 300 for 3 hours."],
      "tags": ["beef", "comfort"],
      "mealTypes": ["dinner"],
      "notes": "From the blue recipe box"
    }
  ]
}
```

Recipes whose name is already in the library are skipped, so a file can be imported again safely.
