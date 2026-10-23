/** Photos taken in the app are stored inline; serve those through a route so lists stay light. */
export function recipeImageSrc(r: { id: string; imageUrl: string | null }): string | null {
  if (!r.imageUrl) return null;
  if (r.imageUrl.startsWith("data:")) return `/api/recipe-image/${r.id}`;
  return r.imageUrl;
}
