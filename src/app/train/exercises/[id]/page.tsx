import { exercises, exerciseById } from "@/seed";
import { ExerciseDetailScreen } from "@/ui/screens/ExercisesScreen";

export const dynamicParams = false;

export function generateStaticParams() {
  return exercises.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${exerciseById.get(id)?.name ?? "Exercise"} · Fast & Move` };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExerciseDetailScreen id={id} />;
}
