"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { scrollStorageKey } from "./ScrollPreservingLink";

export default function ScrollPositionRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    let target = 0;

    try {
      const saved = window.sessionStorage.getItem(scrollStorageKey(pathname));
      if (saved == null) return;
      target = Number(saved);
      window.sessionStorage.removeItem(scrollStorageKey(pathname));
    } catch {
      return;
    }

    if (!Number.isFinite(target) || target <= 0) return;

    let attempts = 0;
    const restore = () => {
      window.scrollTo({ top: target, behavior: "instant" });
      attempts += 1;

      if (Math.abs(window.scrollY - target) > 2 && attempts < 30) {
        window.setTimeout(restore, 75);
      }
    };

    window.requestAnimationFrame(restore);
  }, [pathname]);

  return null;
}
