import { Suspense } from "react";
import { FourByFourScreen } from "@/ui/screens/RunScreens";

export const metadata = { title: "4×4 · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <FourByFourScreen />
    </Suspense>
  );
}
