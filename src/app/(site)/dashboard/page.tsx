import type { Metadata } from "next";
import { DashboardView } from "@/components/progress/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <DashboardView />
    </main>
  );
}
