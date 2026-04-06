"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import Link from "next/link";
import { supabase } from "../lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setStatus(error.message);
        return;
      }

      const user = data.session?.user ?? null;
      setEmail(user?.email ?? null);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setEmail(user?.email ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setSaving(true);
    setStatus(null);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus("Signed out.");
      router.push("/auth");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Settings" subtitle="Preferences and account options">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Account</h2>

          <div className="mt-3 rounded-xl bg-gray-900 p-4">
            <p className="text-sm text-gray-400">Signed in as</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {email ?? "Not signed in"}
            </p>
          </div>

          {status && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {status}
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            disabled={saving || !email}
            className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Signing out..." : "Sign Out"}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Household</h2>
          <p className="mt-2 text-sm text-gray-400">
            Create or join a household to share grocery data.
          </p>

          <Link
            href="/settings/household"
            className="mt-3 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            Manage Household
          </Link>
        </div>
      </div>
    </AppShell>
  );
}