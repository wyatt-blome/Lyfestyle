import { Suspense } from "react";
import { FollowScreen } from "@/ui/screens/RunScreens";

export const metadata = { title: "Follow along · Fast & Move" };

export default function Page() {
  return (
    <Suspense>
      <FollowScreen />
    </Suspense>
  );
}
