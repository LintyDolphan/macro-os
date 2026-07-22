"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase/client";
import {
  getUserProfile,
  updateUserIdentity,
  type ProfileRoleLabel,
  type ProfileVisibility,
  type UserProfileRow,
} from "../lib/user-profile-db";

function profileInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "M";
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return initials.toUpperCase();
}

function LockedToolCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 opacity-70">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-300">{title}</div>
          <div className="mt-1 text-xs text-gray-500">{description}</div>
        </div>
        <span className="shrink-0 rounded-full border border-gray-700 bg-gray-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Locked
        </span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("household");
  const [roleLabel, setRoleLabel] = useState<ProfileRoleLabel>("member");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setError(error.message);
        return;
      }

      const user = data.session?.user ?? null;
      setEmail(user?.email ?? null);

      if (user) {
        try {
          const loadedProfile = await getUserProfile(user.id);
          const metadataName =
            typeof user.user_metadata?.display_name === "string"
              ? user.user_metadata.display_name
              : typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : "";

          setProfile(loadedProfile);
          setDisplayName(loadedProfile?.display_name ?? metadataName);
          setUsername(loadedProfile?.username ?? "");
          setAvatarUrl(loadedProfile?.avatar_url ?? "");
          setBio(loadedProfile?.bio ?? "");
          setProfileVisibility(loadedProfile?.profile_visibility ?? "household");
          setRoleLabel(loadedProfile?.role_label ?? "member");
        } catch (profileError) {
          setError(profileError instanceof Error ? profileError.message : "Profile could not be loaded.");
        }
      }
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

  async function handleSaveProfile() {
    if (!email) return;

    if (displayName.trim().length < 2) {
      setError("Display name must be at least 2 characters.");
      return;
    }

    setProfileSaving(true);
    setStatus(null);
    setError(null);

    try {
      const updated = await updateUserIdentity({
        display_name: displayName,
        username: username || null,
        avatar_url: avatarUrl || null,
        bio: bio || null,
        profile_visibility: profileVisibility,
        role_label: roleLabel,
      });

      await supabase.auth.updateUser({
        data: {
          display_name: displayName.trim(),
          full_name: displayName.trim(),
        },
      });

      setProfile(updated);
      setStatus("Profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profile could not be saved.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSignOut() {
    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setError(error.message);
        return;
      }

      setStatus("Signed out.");
      router.push("/auth");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      setError('Type "DELETE" to confirm account deletion.');
      return;
    }

    setDeletingAccount(true);
    setStatus(null);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sign in again before deleting your account.");

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Account could not be deleted.");
      }

      await supabase.auth.signOut();
      router.push("/auth");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Account could not be deleted.");
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <AppShell title="Settings" subtitle="Preferences and account options">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">App Structure</h2>
          <p className="mt-2 text-sm text-gray-400">
            Macro OS is now organized around Dashboard, Macros, Workout, Grocery, and Settings.
            Advanced tools live here so the main app stays focused.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Account</h2>

          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gray-900 p-4">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="h-14 w-14 rounded-2xl border border-gray-700 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white">
                {profileInitials(profile?.display_name ?? displayName, email)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-white">
                {profile?.display_name || displayName || "Unnamed profile"}
              </p>
              <p className="mt-1 truncate text-sm text-gray-400">{email ?? "Not signed in"}</p>
              <p className="mt-1 text-xs capitalize text-blue-200">
                {roleLabel === "member" ? "Member" : roleLabel}
              </p>
            </div>
          </div>

          {status && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {status}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
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
          <h2 className="text-lg font-semibold text-white">Profile Identity</h2>
          <p className="mt-2 text-sm text-gray-400">
            This is how household members and future community features can recognize you.
          </p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-gray-300">Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="John Smith"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-300">Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))}
                placeholder="Optional, e.g. johnsmith"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-300">Avatar URL</span>
              <input
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="Optional image URL"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-gray-300">Bio</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Optional short note for future social/community features"
                className="min-h-20 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-sm text-gray-300">Visibility</span>
                <select
                  value={profileVisibility}
                  onChange={(event) => setProfileVisibility(event.target.value as ProfileVisibility)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                >
                  <option value="private">Private</option>
                  <option value="household">Household</option>
                  <option value="public">Public later</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-gray-300">Role</span>
                <select
                  value={roleLabel}
                  onChange={(event) => setRoleLabel(event.target.value as ProfileRoleLabel)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                >
                  <option value="member">Member</option>
                  <option value="coach">Coach</option>
                  <option value="trainer">Trainer</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={profileSaving || !email}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {profileSaving ? "Saving Profile..." : "Save Profile"}
            </button>
          </div>
        </div>

        {!profile?.onboarding_completed ? (
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-white">Personal Setup</h2>
            <p className="mt-2 text-sm text-gray-400">
              Complete the starter profile Macro OS uses for macro targets, meal planning context,
              workout preferences, and future grocery recommendations.
            </p>

            <Link
              href="/onboarding"
              className="mt-3 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
            >
              Open Personal Setup
            </Link>
          </div>
        ) : null}

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

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Feedback</h2>
          <p className="mt-2 text-sm text-gray-400">
            Send comments, issues, recommendations, or anything that feels off during the beta.
          </p>

          <Link
            href="/feedback"
            className="mt-3 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            Send Feedback
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Advanced Tools</h2>
          <p className="mt-2 text-sm text-gray-400">
            These pages still exist, but they are no longer part of the main user flow.
          </p>

          <div className="mt-3 grid gap-2">
            <LockedToolCard
              title="Inventory Tools"
              description="Coming back after the closed beta core flow is stable."
            />
            <LockedToolCard
              title="Ingredient Admin"
              description="Internal nutrition tooling; hidden from tester workflows for now."
            />
            <Link
              href="/scan"
              className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Barcode & Label Scanner
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Legal & Beta Notes</h2>
          <p className="mt-2 text-sm text-gray-400">
            Review the current closed beta policies for privacy, account data, and responsible use.
          </p>

          <div className="mt-3 grid gap-2">
            <Link
              href="/privacy"
              className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Terms of Use
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Danger Zone</h2>
          <p className="mt-2 text-sm text-red-100/80">
            Delete your account and remove access to your saved Macro OS data. This requires
            server-side account deletion to be configured.
          </p>
          <input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="mt-4 w-full rounded-xl border border-red-500/30 bg-gray-950 p-3 text-sm text-white"
          />
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            disabled={deletingAccount || deleteConfirm.trim().toUpperCase() !== "DELETE"}
            className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingAccount ? "Deleting Account..." : "Delete Account"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
