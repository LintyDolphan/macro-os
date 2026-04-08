"use client";

import Link from "next/link";
import AppShell from "../components/AppShell";

const moreLinks = [
  {
    href: "/calculator",
    title: "Macro Calculator",
    description: "Set or recalculate your daily macro targets.",
  },
  {
    href: "/progress",
    title: "Progress",
    description: "Review trends and progress views.",
  },
  {
    href: "/settings",
    title: "Settings",
    description: "Manage account and app preferences.",
  },
  {
    href: "/settings/household",
    title: "Household",
    description: "Create or manage your shared household.",
  },
  {
    href: "/auth",
    title: "Account",
    description: "Sign in, create an account, or sign out.",
  },
];

export default function MorePage() {
  return (
    <AppShell title="More" subtitle="All pages and tools">
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-white">All Pages</h2>
          <p className="mt-1 text-sm text-gray-400">
            Extra pages that do not need a permanent bottom-nav slot.
          </p>
        </div>

        <div className="space-y-3">
          {moreLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm transition hover:border-gray-600 hover:bg-gray-700"
            >
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-1 text-sm text-gray-400">{item.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
