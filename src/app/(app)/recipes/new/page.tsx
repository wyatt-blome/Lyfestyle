import { PageHeader } from "@/components/PageHeader";
import { aiAvailable } from "@/lib/import/ai";
import { requireViewer } from "@/server/auth";
import { AddRecipe } from "./AddRecipe";

export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ welcome?: string; tab?: string }> }) {
  await requireViewer();
  const { welcome, tab } = await searchParams;
  return (
    <>
      <PageHeader
        title="Add recipes"
        subtitle={welcome ? "Welcome! Start by bringing in a few recipes you love." : "From Pinterest, a website, a photo, or by hand."}
      />
      <AddRecipe aiEnabled={aiAvailable()} initialTab={tab} />
    </>
  );
}
