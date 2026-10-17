import { Suspense } from "react";
import { QuickScreen } from "@/ui/screens/RunScreens";

export const metadata = { title: "Quick 20 · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <QuickScreen />
    </Suspense>
  );
}
