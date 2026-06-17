"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ScrollPreservingLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

const scrollStoragePrefix = "macro-os:return-scroll:";

export function scrollStorageKey(pathname: string) {
  return `${scrollStoragePrefix}${pathname}`;
}

export default function ScrollPreservingLink({
  href,
  className,
  children,
}: ScrollPreservingLinkProps) {
  const pathname = usePathname();

  function saveScrollPosition() {
    try {
      window.sessionStorage.setItem(scrollStorageKey(pathname), String(window.scrollY));
    } catch {
      // Navigation should still work when storage is unavailable.
    }
  }

  return (
    <Link href={href} onClick={saveScrollPosition} className={className}>
      {children}
    </Link>
  );
}
