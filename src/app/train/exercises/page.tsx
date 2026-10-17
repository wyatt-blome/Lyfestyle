import { Suspense } from "react";
import { ExercisesScreen } from "@/ui/screens/ExercisesScreen";

export const metadata = { title: "Exercises · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <ExercisesScreen />
    </Suspense>
  );
}
