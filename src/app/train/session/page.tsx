import { Suspense } from "react";
import { SessionScreen } from "@/ui/screens/SessionScreen";

export const metadata = { title: "Session · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <SessionScreen />
    </Suspense>
  );
}
