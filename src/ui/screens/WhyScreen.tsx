"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SOURCE_LABEL, whyCards } from "@/seed";
import { Page } from "../kit";
import { WhyCardView } from "../WhyCard";

export function WhyScreen() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash.slice(1));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <Page title="Why we do this" back="/more">
      <p className="text-muted">
        Our plan, the Diary of a CEO episodes behind it (with chapter links), and where the plan is our own inference.{" "}
        {SOURCE_LABEL}.
      </p>
      <Link href="/why/episodes" className="btn flex min-h-12 items-center justify-center rounded-2xl bg-surface text-lg">
        All episodes
      </Link>
      {whyCards.map((c) => (
        <div id={c.id} key={c.id} className="scroll-mt-4">
          {/* Re-mount when the link targets this card, so it opens. */}
          <WhyCardView key={c.id === hash ? "open" : "closed"} card={c} defaultOpen={c.id === hash} />
        </div>
      ))}
    </Page>
  );
}
