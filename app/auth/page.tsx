"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import { supabase } from "../lib/supabase/client";

type AuthMode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setError(error.message);
        return;
      }

      const user = data.session?.user ?? null;
      setUserEmail(user?.email ?? null);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserEmail(user?.email ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!password.trim() || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        if (data.session) {
          setStatus("Account created and signed in ✅");
          router.push("/");
          router.refresh();
          return;
        }

        setStatus(
          "Account created. Check your email to confirm your account before signing in."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        setStatus("Signed in ✅");
        router.push("/");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setError(error.message);
        return;
      }

      setStatus("Signed out.");
      setUserEmail(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Account" subtitle="Sign in or create your account">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setStatus(null);
              }}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${
                mode === "signin"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setStatus(null);
              }}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${
                mode === "signup"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Create Account
            </button>
          </div>

          {userEmail ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-200">
                Signed in as <span className="font-semibold">{userEmail}</span>
              </p>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={saving}
                className="mt-3 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Working..." : "Sign Out"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {status && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                  {status}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm text-gray-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Working..."
                  : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
              </button>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}