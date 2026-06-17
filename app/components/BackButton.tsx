"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref: string;
  className?: string;
  children: React.ReactNode;
};

export default function BackButton({
  fallbackHref,
  className,
  children,
}: BackButtonProps) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button type="button" onClick={goBack} className={className}>
      {children}
    </button>
  );
}
