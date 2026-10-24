"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToWeek, deleteRecipe, setFavorite, setRating, setStaple } from "@/actions/recipes";
import { StarRating } from "@/components/Stars";
import { Icon } from "@/components/icons";
import { Button, Chip, ErrorText } from "@/components/ui";

export function RecipeActions(props: { id: string; rating: number | null; isFavorite: boolean; isStaple: boolean; stapleEveryWeeks: number | null; mealTypes: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [fav, setFav] = useState(props.isFavorite);
  const [rating, setRatingState] = useState(props.rating);
  const [staple, setStapleState] = useState(props.isStaple ? (props.stapleEveryWeeks ?? 1) : null);
  const type = (props.mealTypes.find((t) => t === "dinner") ?? props.mealTypes[0] ?? "dinner") as "breakfast" | "lunch" | "dinner";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <StarRating
          value={rating}
          onChange={(r) => {
            setRatingState(r);
            start(() => setRating(props.id, r));
          }}
        />
        <span className="text-sm text-muted">{rating ? `${rating} of 5` : "Tap to rate"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip
          selected={fav}
          onClick={() => {
            setFav(!fav);
            start(() => setFavorite(props.id, !fav));
          }}
        >
          <Icon name="heart" filled={fav} className="size-4" /> Favorite
        </Chip>
        <Chip
          selected={staple !== null}
          onClick={() => {
            const next = staple === null ? 1 : null;
            setStapleState(next);
            start(() => setStaple(props.id, next));
          }}
        >
          <Icon name="repeat" className="size-4" /> Staple
        </Chip>
        {staple !== null ? (
          <select
            aria-label="How often"
            value={staple}
            onChange={(e) => {
              const n = Number(e.target.value);
              setStapleState(n);
              start(() => setStaple(props.id, n));
            }}
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm"
          >
            <option value={1}>every week</option>
            <option value={2}>every 2 weeks</option>
            <option value={3}>every 3 weeks</option>
            <option value={4}>once a month</option>
          </select>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          busy={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const res = await addToWeek(props.id, type);
              if (res.ok) setMessage(`Added to this week's ${type}s.`);
              else setError(res.error);
            })
          }
        >
          <Icon name="calendar" className="size-4" /> Add to this week
        </Button>
        <Link href={`/recipes/${props.id}/edit`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 text-[15px] font-medium">
          <Icon name="edit" className="size-4" /> Edit
        </Link>
        <Button
          variant="danger"
          onClick={() => {
            if (!confirm("Delete this recipe? It will also come off any week it's planned for.")) return;
            start(async () => {
              const res = await deleteRecipe(props.id);
              if (res.ok) router.push("/recipes");
              else setError(res.error);
            });
          }}
        >
          <Icon name="trash" className="size-4" /> Delete
        </Button>
      </div>
      {message ? (
        <p className="text-sm text-brand">
          {message}{" "}
          <Link href="/week" className="underline underline-offset-4">
            See the week
          </Link>
        </p>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
