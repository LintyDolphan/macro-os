"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabase/client";
import {
  createHousehold,
  getMyHousehold,
  getMyHouseholdMembers,
  getMyHouseholdMembersWithProfiles,
  joinHouseholdByCode,
  leaveMyHousehold,
  type HouseholdMemberWithProfile,
  type HouseholdRow,
} from "../../lib/households-db";

function profileInitials(name?: string | null, fallback?: string | null) {
  const source = name?.trim() || fallback?.trim() || "M";
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return initials.toUpperCase();
}

function userMetadataName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const displayName = typeof metadata.display_name === "string" ? metadata.display_name.trim() : "";
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const name = typeof metadata.name === "string" ? metadata.name.trim() : "";

  return displayName || fullName || name || user.email || null;
}

function memberDisplayName(
  member: HouseholdMemberWithProfile,
  currentUserId?: string | null,
  currentUserName?: string | null
) {
  return (
    member.profile?.display_name ||
    member.profile?.username ||
    (member.user_id === currentUserId ? currentUserName : null) ||
    `Member ${member.user_id.slice(0, 6)}`
  );
}

function extractHouseholdJoinCode(value: string | null) {
  const rawValue = value?.trim();
  if (!rawValue) return "";

  try {
    const parsedUrl = new URL(rawValue);
    return (
      parsedUrl.searchParams.get("joinCode") ||
      parsedUrl.searchParams.get("householdCode") ||
      parsedUrl.searchParams.get("code") ||
      ""
    ).trim().toUpperCase();
  } catch {
    return rawValue.trim().toUpperCase();
  }
}

function qrImageUrl(value: string) {
  const params = new URLSearchParams({
    size: "360x360",
    margin: "18",
    data: value,
  });

  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

export default function HouseholdPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [members, setMembers] = useState<HouseholdMemberWithProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [showQrCode, setShowQrCode] = useState(false);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const scannerHref = `/scan?context=household&returnTo=${encodeURIComponent(
    "/settings/household?scanJoin=1"
  )}`;

  const loadHouseholdData = useCallback(async () => {
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

      setCurrentUserId(user.id);
      setCurrentUserName(userMetadataName(user));

      const currentHousehold = await getMyHousehold();
      setHousehold(currentHousehold);

      if (currentHousehold) {
        try {
          const currentMembers = await getMyHouseholdMembersWithProfiles();
          setMembers(currentMembers);
        } catch {
          const currentMembers = await getMyHouseholdMembers();
          setMembers(currentMembers.map((member) => ({ ...member, profile: null })));
        }
      } else {
        setMembers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load household");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadHouseholdData();
  }, [loadHouseholdData]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const scannedValue = params.get("scannedBarcode");
    const nextJoinCode = extractHouseholdJoinCode(scannedValue || params.get("joinCode"));

    if (nextJoinCode) {
      setJoinCode(nextJoinCode);
      if (scannedValue) {
        setMessage("Household invite scanned. Review the code, then join when you are ready.");
      }

      params.delete("scannedBarcode");
      params.delete("scannedFormat");
      params.delete("scanJoin");
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
      window.history.replaceState(null, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !household) {
      setInviteUrl("");
      setShowQrCode(false);
      return;
    }

    const nextUrl = new URL("/settings/household", window.location.origin);
    nextUrl.searchParams.set("joinCode", household.join_code);
    setInviteUrl(nextUrl.toString());
  }, [household]);

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

  async function handleShareInvite() {
    if (!household || !inviteUrl) return;

    const shareText = `Join my Macro OS household "${household.name}" with code ${household.join_code}: ${inviteUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join my Macro OS household",
          text: shareText,
          url: inviteUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(inviteUrl);
      setError(null);
      setMessage("Household invite link copied.");
      window.setTimeout(() => setMessage(null), 1800);
    } catch {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setError(null);
        setMessage("Household invite link copied.");
        window.setTimeout(() => setMessage(null), 1800);
      } catch {
        setMessage(null);
        setError("Household invite link could not be copied.");
      }
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
                Enter a household join code, open a shared invite link, or scan another member&apos;s QR code.
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

              <a
                href={scannerHref}
                className="mt-3 block rounded-xl border border-cyan-200/25 bg-gray-950 px-4 py-3 text-center text-sm font-semibold text-cyan-100 shadow-[0_0_18px_rgba(186,240,255,0.08)] hover:border-cyan-200/45"
              >
                Scan QR Invite
              </a>
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

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-400">Join code</p>
                    <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white">
                      {household.join_code}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={handleShareInvite}
                      disabled={!inviteUrl}
                      className="rounded-xl bg-cyan-100 px-3 py-2 text-xs font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQrCode((current) => !current)}
                      disabled={!inviteUrl}
                      className="rounded-xl border border-cyan-200/25 bg-gray-950 px-3 py-2 text-xs font-bold text-cyan-100 hover:border-cyan-200/45 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      QR
                    </button>
                  </div>
                </div>

                {showQrCode && inviteUrl ? (
                  <div className="rounded-2xl border border-cyan-200/20 bg-gray-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Household QR Invite</div>
                        <div className="mt-1 text-xs text-gray-400">
                          Another user can scan this from Manage Household.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQrCode(false)}
                        className="rounded-xl bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700"
                      >
                        Hide
                      </button>
                    </div>
                    <div className="mt-4 rounded-2xl bg-white p-3">
                      <Image
                        src={qrImageUrl(inviteUrl)}
                        alt={`QR invite for household code ${household.join_code}`}
                        width={360}
                        height={360}
                        className="h-auto w-full rounded-xl"
                      />
                    </div>
                    <div className="mt-3 break-all rounded-2xl bg-black/40 p-3 text-xs text-gray-400">
                      {inviteUrl}
                    </div>
                  </div>
                ) : null}
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
                        <div className="flex min-w-0 items-center gap-3">
                          {member.profile?.avatar_url ? (
                            <Image
                              src={member.profile.avatar_url}
                              alt=""
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 rounded-2xl border border-gray-700 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white">
                              {profileInitials(
                                memberDisplayName(member, currentUserId, currentUserName),
                                member.user_id
                              )}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {memberDisplayName(member, currentUserId, currentUserName)}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {member.profile?.username ? `@${member.profile.username}` : "Profile name"}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="rounded-full bg-gray-700 px-2 py-1 text-xs uppercase text-gray-300">
                            {member.role}
                          </span>
                          {member.profile?.role_label && member.profile.role_label !== "member" ? (
                            <span className="rounded-full bg-blue-500/15 px-2 py-1 text-xs capitalize text-blue-200">
                              {member.profile.role_label}
                            </span>
                          ) : null}
                        </div>
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
