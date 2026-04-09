"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import BarcodeScanner from "../components/BarcodeScanner";

type ScanContext = "general" | "inventory-add" | "inventory-use" | "snack" | "ingredient";

function getReturnHref(returnTo: string, detectedValue: string | null, detectedFormat: string | null) {
  const [basePath, rawQuery = ""] = returnTo.split("?");
  const nextParams = new URLSearchParams(rawQuery);

  if (detectedValue) {
    nextParams.set("scannedBarcode", detectedValue);
  }

  if (detectedFormat) {
    nextParams.set("scannedFormat", detectedFormat);
  } else {
    nextParams.delete("scannedFormat");
  }

  const nextQuery = nextParams.toString();
  return nextQuery ? `${basePath}?${nextQuery}` : basePath;
}

export default function ScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detectedValue, setDetectedValue] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const context = (searchParams.get("context") as ScanContext | null) ?? "general";
  const returnTo = searchParams.get("returnTo") ?? "/more";

  const useResultHref = useMemo(
    () => getReturnHref(returnTo, detectedValue, detectedFormat),
    [detectedFormat, detectedValue, returnTo]
  );
  const scannerKey = `${context}:${returnTo}`;

  function onUseDetectedBarcode() {
    if (!detectedValue) return;
    router.push(useResultHref);
  }

  return (
    <AppShell title="Scan" subtitle="Scan a barcode, then review it before using it." backHref={returnTo} backLabel="Back">
      <div className="space-y-4">
        <BarcodeScanner
          key={scannerKey}
          context={context}
          onDetected={(result) => {
            setDetectedValue(result.value);
            setDetectedFormat(result.format ?? null);
          }}
        />

        {detectedValue ? (
          <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
            <div className="text-sm font-semibold text-white">Use This Barcode</div>
            <div className="mt-1 text-xs text-emerald-100/80">
              {detectedValue}
              {detectedFormat ? ` • ${detectedFormat}` : ""}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onUseDetectedBarcode}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Use Result
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetectedValue(null);
                  setDetectedFormat(null);
                }}
                className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
              >
                Keep Testing
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
