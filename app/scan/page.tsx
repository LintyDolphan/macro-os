"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import BarcodeScanner from "../components/BarcodeScanner";

type ScanContext = "general" | "inventory-add" | "inventory-use" | "snack" | "ingredient";

function getReturnHref(returnTo: string, detectedValue: string, detectedFormat?: string | null) {
  const [basePath, rawQuery = ""] = returnTo.split("?");
  const nextParams = new URLSearchParams(rawQuery);
  nextParams.set("scannedBarcode", detectedValue);

  if (detectedFormat) {
    nextParams.set("scannedFormat", detectedFormat);
  } else {
    nextParams.delete("scannedFormat");
  }

  const nextQuery = nextParams.toString();
  return nextQuery ? `${basePath}?${nextQuery}` : basePath;
}

function ScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = (searchParams.get("context") as ScanContext | null) ?? "general";
  const returnTo = searchParams.get("returnTo") ?? "/more";
  const scannerKey = `${context}:${returnTo}`;

  return (
    <AppShell
      title="Scan"
      subtitle="Scan a barcode and Macro OS will return you to the page that opened it."
      backHref={returnTo}
      backLabel="Back"
    >
      <div className="space-y-4">
        <BarcodeScanner
          key={scannerKey}
          context={context}
          onDetected={(result) => {
            const nextHref = getReturnHref(returnTo, result.value, result.format ?? null);
            router.replace(nextHref);
          }}
        />

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <div className="text-sm font-semibold text-white">Automatic Return</div>
          <div className="mt-1 text-sm text-gray-400">
            Once a barcode is detected, the scanner closes and sends you back to keep working.
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <AppShell
          title="Scan"
          subtitle="Scan a barcode and Macro OS will return you to the page that opened it."
          backHref="/more"
          backLabel="Back"
        >
          <div className="text-sm text-gray-400">Loading...</div>
        </AppShell>
      }
    >
      <ScanPageContent />
    </Suspense>
  );
}
