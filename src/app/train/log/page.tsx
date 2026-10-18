import { Suspense } from "react";
import { LoggerScreen } from "@/ui/screens/LoggerScreen";

export const metadata = { title: "Log session · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <LoggerScreen />
    </Suspense>
  );
}
