import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <>
      <h1 className="mb-2 font-display text-3xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Everyone in the household shares the same recipes, weekly plan and grocery list.</p>
      <SignUpForm initialCode={code ?? ""} />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-brand underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
