"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase/client";
import {
  createHousehold,
  getMyHousehold,
  getMyHouseholdMembers,
  joinHouseholdByCode,
  leaveMyHousehold,
  type HouseholdMemberRow,
  type HouseholdRow,
} from "../../lib/households-db";

export default function HouseholdPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function loadHouseholdData() {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const user = data.session?.user;
      if (!user) {
        router.push("/auth");
        return;
      }

      const currentHousehold = await getMyHousehold();
      setHousehold(currentHousehold);

      if (currentHousehold) {
        const currentMembers = await getMyHouseholdMembers();
        setMembers(currentMembers);
      } else {
        setMembers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load household");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHouseholdData();
  }, []);

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault();

    setCreating(true);
    setMessage(null);
    setError(null);

    try {
      if (!createName.trim()) {
        throw new Error("Please enter a household name");
      }

      await createHousehold(createName);
      setCreateName("");
      setMessage("Household created successfully.");
      await loadHouseholdData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create household");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinHousehold(e: React.FormEvent) {
    e.preventDefault();

    setJoining(true);
    setMessage(null);
    setError(null);

    try {
      if (!joinCode.trim()) {
        throw new Error("Please enter a join code");
      }

      await joinHouseholdByCode(joinCode);
      setJoinCode("");
      setMessage("Joined household successfully.");
      await loadHouseholdData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join household");
    } finally {
      setJoining(false);
    }
  }

  async function handleLeaveHousehold() {
    const confirmed = window.confirm(
      "Are you sure you want to leave this household?"
    );

    if (!confirmed) return;

    setLeaving(true);
    setMessage(null);
    setError(null);

    try {
      await leaveMyHousehold();
      setMessage("You left the household.");
      await loadHouseholdData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave household");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <AppShell
      title="Household"
      subtitle="Create or join a household to share grocery data"
    >
      <div className="mx-auto max-w-md space-y-4">
        {loading && (
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-sm text-gray-300 shadow-sm">
            Loading household...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 shadow-sm">
            {error}
          </div>
        )}

        {!loading && message && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200 shadow-sm">
            {message}
          </div>
        )}

        {!loading && !household && (
          <>
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">
                Create Household
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                Create a household to share grocery items and meal planning data.
              </p>

              <form onSubmit={handleCreateHousehold} className="mt-4 space-y-3">
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Household name"
                  className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500"
                />

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Household"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">
                Join Household
              </h2>
              <p className="mt-2 text-sm text-gray-400">
                Enter a household join code to join an existing household.
              </p>

              <form onSubmit={handleJoinHousehold} className="mt-4 space-y-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Join code"
                  className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-sm uppercase tracking-wider text-white outline-none placeholder:text-gray-500"
                />

                <button
                  type="submit"
                  disabled={joining}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joining ? "Joining..." : "Join Household"}
                </button>
              </form>
            </div>
          </>
        )}

        {!loading && household && (
          <>
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">
                Current Household
              </h2>

              <div className="mt-4 space-y-3 rounded-xl bg-gray-900 p-4">
                <div>
                  <p className="text-sm text-gray-400">Name</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {household.name}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-400">Join code</p>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white">
                    {household.join_code}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Members</h2>

              <div className="mt-4 space-y-2">
                {members.length === 0 ? (
                  <div className="rounded-xl bg-gray-900 p-4 text-sm text-gray-400">
                    No members found.
                  </div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="rounded-xl bg-gray-900 p-4 text-sm text-white"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{member.user_id}</span>
                        <span className="rounded-full bg-gray-700 px-2 py-1 text-xs uppercase text-gray-300">
                          {member.role}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Danger Zone</h2>
              <p className="mt-2 text-sm text-gray-400">
                Leaving the household removes your access to its shared grocery
                data.
              </p>

              <button
                type="button"
                onClick={handleLeaveHousehold}
                disabled={leaving}
                className="mt-4 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave Household"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}