"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";

export default function MorePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings");
  }, [router]);

  return (
    <AppShell title="Settings" subtitle="Redirecting to the simplified app structure">
      <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-sm text-gray-400 shadow-sm">
        Redirecting to Settings...
      </div>
    </AppShell>
  );
}
