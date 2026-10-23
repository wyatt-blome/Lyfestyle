import { requireViewer } from "@/server/auth";
import { TabBar } from "@/components/TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();
  return (
    <div className="mx-auto min-h-dvh max-w-3xl">
      <main className="pb-tabs px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">{children}</main>
      <TabBar />
    </div>
  );
}
