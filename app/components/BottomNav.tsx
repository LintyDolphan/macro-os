"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type HubLink = {
  href: string;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
};

type HubSection = {
  title: string;
  accent: string;
  links: HubLink[];
};

const basePrimaryNavItems: HubLink[] = [
  {
    href: "/",
    label: "Dashboard",
    shortLabel: "HOME",
    badge: "DB",
    description: "Your daily Macro OS overview.",
  },
  {
    href: "/meals",
    label: "Meals",
    shortLabel: "MEALS",
    badge: "ML",
    description: "Plan and log meals.",
  },
  {
    href: "/recipes",
    label: "Recipes",
    shortLabel: "RECIPES",
    badge: "RC",
    description: "Build and save recipes.",
  },
  {
    href: "/grocery",
    label: "Grocery",
    shortLabel: "GROCERY",
    badge: "GR",
    description: "Generate and manage lists.",
  },
];

const moreSections: HubSection[] = [
  {
    title: "Fitness",
    accent: "from-blue-500/25 to-cyan-400/10",
    links: [
      {
        href: "/workouts",
        label: "Workout",
        shortLabel: "WORKOUT",
        badge: "WK",
        description: "Train, log, and review sessions.",
      },
      {
        href: "/progress",
        label: "Progress",
        shortLabel: "PROGRESS",
        badge: "PR",
        description: "View trends and progress snapshots.",
      },
    ],
  },
  {
    title: "Tools",
    accent: "from-emerald-500/20 to-teal-400/10",
    links: [
      {
        href: "/inventory",
        label: "Inventory",
        shortLabel: "INVENTORY",
        badge: "IV",
        description: "Track pantry, fridge, freezer, and suggestions.",
      },
      {
        href: "/calculator",
        label: "Macro Calculator",
        shortLabel: "CALC",
        badge: "MC",
        description: "Set or recalculate macro targets.",
      },
      {
        href: "/settings/household",
        label: "Household",
        shortLabel: "HOUSE",
        badge: "HH",
        description: "Manage shared planning and lists.",
      },
    ],
  },
  {
    title: "Account",
    accent: "from-fuchsia-500/18 to-violet-400/10",
    links: [
      {
        href: "/settings",
        label: "Settings",
        shortLabel: "SETTINGS",
        badge: "ST",
        description: "Control account and app preferences.",
      },
      {
        href: "/auth",
        label: "Account",
        shortLabel: "ACCOUNT",
        badge: "AC",
        description: "Sign in, create an account, or sign out.",
      },
    ],
  },
];

const moreRoutes = ["/more", "/inventory", "/workouts", "/calculator", "/progress", "/settings", "/auth"];
const favoriteStorageKey = "macro-os-hub-favorites";
const shortcutOrderStorageKey = "macro-os-hub-shortcut-order";

function reorderItems(items: string[], fromHref: string, toHref: string) {
  const next = [...items];
  const fromIndex = next.indexOf(fromHref);
  const toIndex = next.indexOf(toHref);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function uniqueLinks(links: HubLink[]) {
  return Array.from(new Map(links.map((link) => [link.href, link])).values());
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.8l2.17 4.4 4.85.7-3.51 3.42.83 4.83L10 13.86 5.66 16.15l.83-4.83L2.98 7.9l4.85-.7L10 2.8z" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="currentColor"
    >
      <circle cx="5" cy="4" r="1.1" />
      <circle cx="11" cy="4" r="1.1" />
      <circle cx="5" cy="8" r="1.1" />
      <circle cx="11" cy="8" r="1.1" />
      <circle cx="5" cy="12" r="1.1" />
      <circle cx="11" cy="12" r="1.1" />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>([]);
  const [shortcutOrder, setShortcutOrder] = useState<string[]>(
    basePrimaryNavItems.map((item) => item.href)
  );
  const [draggedShortcut, setDraggedShortcut] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedFavorites = window.localStorage.getItem(favoriteStorageKey);
        const storedOrder = window.localStorage.getItem(shortcutOrderStorageKey);

        if (storedFavorites) {
          const parsedFavorites = JSON.parse(storedFavorites);
          if (Array.isArray(parsedFavorites)) {
            setFavoriteRoutes(
              parsedFavorites.filter((item): item is string => typeof item === "string")
            );
          }
        }

        if (storedOrder) {
          const parsedOrder = JSON.parse(storedOrder);
          if (Array.isArray(parsedOrder)) {
            setShortcutOrder(parsedOrder.filter((item): item is string => typeof item === "string"));
          }
        }
      } catch (error) {
        console.warn("Could not load hub preferences:", error);
      } finally {
        setClientReady(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const allHubLinks = useMemo(
    () => uniqueLinks([...basePrimaryNavItems, ...moreSections.flatMap((section) => section.links)]),
    []
  );

  const linkMap = useMemo(
    () => new Map(allHubLinks.map((link) => [link.href, link])),
    [allHubLinks]
  );

  const favoriteLookup = useMemo(() => new Set(favoriteRoutes), [favoriteRoutes]);

  const favoriteLinks = useMemo(
    () => allHubLinks.filter((link) => favoriteLookup.has(link.href)),
    [allHubLinks, favoriteLookup]
  );

  const customizableShortcuts = useMemo(() => {
    const combined = uniqueLinks([...basePrimaryNavItems, ...favoriteLinks]);
    const defaultOrder = combined.map((item) => item.href);
    const resolvedOrder = [
      ...shortcutOrder.filter((href) => combined.some((item) => item.href === href)),
      ...defaultOrder.filter((href) => !shortcutOrder.includes(href)),
    ];

    return resolvedOrder
      .map((href) => linkMap.get(href))
      .filter((link): link is HubLink => Boolean(link));
  }, [favoriteLinks, linkMap, shortcutOrder]);

  const bottomNavItems = useMemo(
    () => customizableShortcuts.slice(0, 4),
    [customizableShortcuts]
  );

  const isMoreActive = useMemo(() => {
    const dockRoutes = new Set(bottomNavItems.map((item) => item.href));
    return moreRoutes.some((route) => {
      if (dockRoutes.has(route)) return false;
      return pathname === route || pathname.startsWith(`${route}/`);
    });
  }, [bottomNavItems, pathname]);

  function persistFavorites(next: string[]) {
    setFavoriteRoutes(next);
    try {
      window.localStorage.setItem(favoriteStorageKey, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save hub favorites:", error);
    }
  }

  function persistShortcutOrder(next: string[]) {
    setShortcutOrder(next);
    try {
      window.localStorage.setItem(shortcutOrderStorageKey, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save hub shortcut order:", error);
    }
  }

  function toggleFavorite(href: string) {
    const next = favoriteRoutes.includes(href)
      ? favoriteRoutes.filter((route) => route !== href)
      : [...favoriteRoutes, href];

    persistFavorites(next);

    if (!favoriteRoutes.includes(href)) {
      const updatedOrder = shortcutOrder.includes(href) ? shortcutOrder : [...shortcutOrder, href];
      persistShortcutOrder(updatedOrder);
    }
  }

  function handleShortcutDragStart(href: string) {
    setDraggedShortcut(href);
  }

  function handleShortcutDrop(targetHref: string) {
    if (!draggedShortcut || draggedShortcut === targetHref) return;
    const currentOrder = customizableShortcuts.map((item) => item.href);
    persistShortcutOrder(reorderItems(currentOrder, draggedShortcut, targetHref));
    setDraggedShortcut(null);
  }

  function renderHubCard(
    item: HubLink,
    isActive: boolean,
    className?: string,
    delayMs?: number,
    key?: string
  ) {
    const isFavorited = favoriteLookup.has(item.href);

    return (
      <div
        key={key ?? item.href}
        className={`group rounded-2xl border transition duration-300 ease-out ${
          moreOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        } ${className ?? "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.06]"}`}
        style={{ transitionDelay: moreOpen ? `${delayMs ?? 0}ms` : "0ms" }}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <Link
            href={item.href}
            onClick={() => setMoreOpen(false)}
            className="flex min-w-0 flex-1 items-start gap-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-[11px] font-bold tracking-[0.18em] text-white transition group-hover:bg-white/12">
              {item.badge}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">{item.label}</div>
              <div className="mt-1 text-xs leading-5 text-gray-400">{item.description}</div>
            </div>
          </Link>

          <button
            type="button"
            aria-label={isFavorited ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
            onClick={() => toggleFavorite(item.href)}
            className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border text-sm transition ${
              isFavorited
                ? "border-amber-300/30 bg-amber-400/12 text-amber-200"
                : "border-white/10 bg-white/[0.04] text-gray-400 hover:border-white/20 hover:text-white"
            }`}
          >
            <StarIcon filled={isFavorited} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setMoreOpen(false)}
        className={`fixed inset-0 z-30 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_28%),rgba(2,6,23,0.78)] backdrop-blur-[6px] transition duration-300 ${
          moreOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        className={`fixed inset-x-0 bottom-28 z-40 px-4 transition duration-300 ease-out ${
          moreOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        <div className="mx-auto w-full max-w-md overflow-hidden rounded-[32px] border border-blue-300/15 bg-[linear-gradient(180deg,rgba(30,41,59,0.97),rgba(15,23,42,0.98))] shadow-[0_30px_90px_rgba(2,6,23,0.72)] backdrop-blur">
          <div className="px-4 pt-3">
            <div
              className={`mx-auto h-1.5 w-14 rounded-full bg-gray-600/70 transition duration-300 ${
                moreOpen ? "scale-100 opacity-100" : "scale-90 opacity-0"
              }`}
            />
          </div>

          <div className="max-h-[72vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="border-b border-white/5 px-5 pb-4 pt-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-200/75">
                    App Hub
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">Navigate Macro OS</div>
                  <div className="mt-1 text-sm text-gray-400">
                    Hold and drag top shortcuts to customize your dock.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {customizableShortcuts.map((item, index) => {
                  const isActive =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const isPinnedFavorite = favoriteLookup.has(item.href);

                  return (
                    <Link
                      key={`shortcut-${item.href}`}
                      href={item.href}
                      draggable={clientReady}
                      onClick={() => setMoreOpen(false)}
                      onDragStart={() => handleShortcutDragStart(item.href)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleShortcutDrop(item.href)}
                      onDragEnd={() => setDraggedShortcut(null)}
                      style={{ transitionDelay: moreOpen ? `${60 + index * 35}ms` : "0ms" }}
                      className={`relative rounded-2xl border px-3 py-3 transition duration-300 ease-out ${
                        moreOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                      } ${
                        isActive
                          ? "border-blue-400/40 bg-blue-500/14"
                          : isPinnedFavorite
                            ? "border-amber-300/20 bg-amber-400/[0.05] hover:border-amber-300/30 hover:bg-amber-400/[0.08]"
                            : "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.06]"
                      } ${draggedShortcut === item.href ? "scale-[0.98] opacity-70 ring-1 ring-blue-300/30" : ""}`}
                    >
                      {clientReady ? (
                        <span
                          className={`absolute right-2 top-2 rounded-lg px-1.5 py-1 text-gray-500 ${
                            draggedShortcut === item.href ? "bg-white/8 text-gray-300" : ""
                          }`}
                          aria-hidden="true"
                        >
                          <DragHandleIcon />
                        </span>
                      ) : null}
                      <div className="pr-6">
                        <div
                          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            isPinnedFavorite ? "text-amber-200/75" : "text-gray-500"
                          }`}
                        >
                          {item.shortLabel}
                        </div>
                        <div className="mt-1 truncate text-[15px] font-semibold text-white">
                          {item.label}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                <span className="rounded-md bg-white/[0.04] p-1 text-gray-500" aria-hidden="true">
                  <DragHandleIcon />
                </span>
                Hold To Rearrange
              </div>
            </div>

            <div className="space-y-4 px-5 pb-5 pt-4">
              {moreSections.map((section, sectionIndex) => (
                <section
                  key={section.title}
                  style={{ transitionDelay: moreOpen ? `${160 + sectionIndex * 70}ms` : "0ms" }}
                  className={`rounded-[26px] border border-white/6 bg-gradient-to-br ${section.accent} p-[1px]`}
                >
                  <div
                    className={`rounded-[25px] bg-slate-950/92 p-4 transition duration-300 ease-out ${
                      moreOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                          {section.title}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {section.links.length} destinations
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {[...section.links]
                        .sort((a, b) => {
                          const aFav = favoriteLookup.has(a.href) ? 1 : 0;
                          const bFav = favoriteLookup.has(b.href) ? 1 : 0;
                          return bFav - aFav;
                        })
                        .map((item, itemIndex) => {
                          const isActive =
                            pathname === item.href || pathname.startsWith(`${item.href}/`);

                          return renderHubCard(
                            item,
                            isActive,
                            isActive
                              ? "border-blue-400/40 bg-blue-500/12"
                              : "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.06]",
                            210 + sectionIndex * 70 + itemIndex * 35,
                            `section-${section.title}-${item.href}`
                          );
                        })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-transparent px-3 pb-3 pt-2">
        <div className="mx-auto w-full max-w-md rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(30,41,59,0.94),rgba(15,23,42,0.98))] p-2 shadow-[0_24px_70px_rgba(2,6,23,0.62)] backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-2">
            {bottomNavItems.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex min-h-[80px] min-w-0 flex-col items-center justify-center rounded-[24px] border px-2 py-3 text-center transition ${
                    isActive
                      ? "border-blue-300/35 bg-[linear-gradient(180deg,rgba(59,130,246,0.95),rgba(37,99,235,0.95))] text-white shadow-[0_14px_32px_rgba(37,99,235,0.34)]"
                      : "border-white/5 bg-white/[0.03] text-gray-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl text-[11px] font-bold tracking-[0.18em] ${
                      isActive ? "bg-white/18 text-white" : "bg-white/8 text-gray-200"
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

            <button
              type="button"
              onClick={() => setMoreOpen((current) => !current)}
              aria-expanded={moreOpen}
              className={`flex min-h-[80px] min-w-0 flex-col items-center justify-center rounded-[24px] border px-2 py-3 text-center transition ${
                isMoreActive || moreOpen
                  ? "border-blue-300/35 bg-[linear-gradient(180deg,rgba(59,130,246,0.95),rgba(37,99,235,0.95))] text-white shadow-[0_14px_32px_rgba(37,99,235,0.34)]"
                  : "border-white/5 bg-white/[0.03] text-gray-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-2xl text-[11px] font-bold tracking-[0.18em] ${
                  isMoreActive || moreOpen ? "bg-white/18 text-white" : "bg-white/8 text-gray-200"
                }`}
              >
                HUB
              </span>
              <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                MENU
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
