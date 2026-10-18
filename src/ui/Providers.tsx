"use client";
import type { ReactNode } from "react";
import { PushSync } from "@/client/push";
import { ReminderWatcher } from "@/client/reminders";
import { SyncRunner } from "@/client/sync";
import { ThemeSync } from "@/client/theme";
import { FastFlowsProvider } from "./FastFlows";
import { Onboarding } from "./Onboarding";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <FastFlowsProvider>
        {children}
        <ReminderWatcher />
        <SyncRunner />
        <PushSync />
        <ThemeSync />
        <Onboarding />
      </FastFlowsProvider>
    </ToastProvider>
  );
}
