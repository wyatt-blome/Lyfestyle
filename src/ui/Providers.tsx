"use client";
import type { ReactNode } from "react";
import { ReminderWatcher } from "@/client/reminders";
import { FastFlowsProvider } from "./FastFlows";
import { Onboarding } from "./Onboarding";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <FastFlowsProvider>
        {children}
        <ReminderWatcher />
        <Onboarding />
      </FastFlowsProvider>
    </ToastProvider>
  );
}
