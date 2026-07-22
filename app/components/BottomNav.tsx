"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  badge: string;
  matches: string[];
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    shortLabel: "HOME",
    badge: "DB",
    matches: ["/"],
  },
  {
    href: "/macros",
    label: "Macros",
    shortLabel: "MACROS",
    badge: "MC",
    matches: ["/macros", "/meals", "/recipes", "/calculator"],
  },
  {
    href: "/workouts",
    label: "Workout",
    shortLabel: "WORKOUT",
    badge: "WK",
    matches: ["/workouts", "/progress"],
  },
  {
    href: "/grocery",
    label: "Grocery",
    shortLabel: "GROCERY",
    badge: "GR",
    matches: ["/grocery", "/inventory"],
  },
  {
    href: "/settings",
    label: "Settings",
    shortLabel: "SETTINGS",
    badge: "ST",
    matches: ["/settings", "/auth", "/more", "/scan"],
  },
];

function isActivePath(pathname: string, item: NavItem) {
  return item.matches.some((match) => {
    if (match === "/") return pathname === "/";
    return pathname === match || pathname.startsWith(`${match}/`);
  });
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#030506] px-0 pb-0 pt-0 shadow-[0_-18px_48px_rgba(0,0,0,0.72)]">
      <div className="relative mx-auto w-full max-w-md overflow-hidden border-x border-white/10 bg-[#050707] p-2">
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--mono-blue),transparent)]"
          aria-hidden="true"
        />
        <div className="grid grid-cols-5 gap-2">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-h-[82px] min-w-0 flex-col items-center justify-center overflow-hidden border px-2 py-3 text-center transition ${
                  active
                    ? "border-[var(--mono-edge-strong)] bg-[#101719] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                    : "border-white/5 bg-[#090c0d] text-[#b9c4c9] hover:border-white/14 hover:bg-[#0d1112] hover:text-white"
                }`}
              >
                {active ? (
                  <span
                    className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[var(--mono-blue)] shadow-[0_0_18px_var(--mono-blue-glow)]"
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl text-[11px] font-bold tracking-[0.18em] ${
                    active
                      ? "bg-[#1d2a2e] text-white ring-1 ring-[rgba(189,238,255,0.3)]"
                      : "bg-[#15191b] text-gray-200"
                  }`}
                >
                  {item.badge}
                </span>
                <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                  {item.shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
