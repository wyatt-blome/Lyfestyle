import { Suspense } from "react";
import { ProgramScreen } from "@/ui/screens/ProgramScreen";

export const metadata = { title: "Program · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <ProgramScreen />
    </Suspense>
  );
}
