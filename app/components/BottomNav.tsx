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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-transparent px-3 pb-3 pt-2">
      <div className="mx-auto w-full max-w-md rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(30,41,59,0.94),rgba(15,23,42,0.98))] p-2 shadow-[0_24px_70px_rgba(2,6,23,0.62)] backdrop-blur-xl">
        <div className="grid grid-cols-5 gap-2">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[80px] min-w-0 flex-col items-center justify-center rounded-[24px] border px-2 py-3 text-center transition ${
                  active
                    ? "border-blue-300/35 bg-[linear-gradient(180deg,rgba(59,130,246,0.95),rgba(37,99,235,0.95))] text-white shadow-[0_14px_32px_rgba(37,99,235,0.34)]"
                    : "border-white/5 bg-white/[0.03] text-gray-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl text-[11px] font-bold tracking-[0.18em] ${
                    active ? "bg-white/18 text-white" : "bg-white/8 text-gray-200"
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
