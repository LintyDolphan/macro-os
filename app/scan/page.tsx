"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import BarcodeScanner from "../components/BarcodeScanner";
import NutritionLabelScanner from "../components/NutritionLabelScanner";

type ScanContext = "general" | "household" | "inventory-add" | "inventory-use" | "snack" | "ingredient";
type ScanMode = "barcode" | "label";

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

function getLabelReturnHref(
  returnTo: string,
  result: {
    calories: string | null;
    protein: string | null;
    carbs: string | null;
    fat: string | null;
  }
) {
  const [basePath, rawQuery = ""] = returnTo.split("?");
  const nextParams = new URLSearchParams(rawQuery);

  const entries = [
    ["labelCalories", result.calories],
    ["labelProtein", result.protein],
    ["labelCarbs", result.carbs],
    ["labelFat", result.fat],
  ] as const;

  for (const [key, value] of entries) {
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
  }

  nextParams.set("labelScanned", "1");
  const nextQuery = nextParams.toString();
  return nextQuery ? `${basePath}?${nextQuery}` : basePath;
}

function ScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = (searchParams.get("context") as ScanContext | null) ?? "general";
  const mode = (searchParams.get("mode") as ScanMode | null) ?? "barcode";
  const returnTo = searchParams.get("returnTo") ?? "/more";
  const scannerKey = `${context}:${mode}:${returnTo}`;
  const labelContext = context === "household" ? "general" : context;

  return (
    <AppShell
      title="Scan"
      subtitle={
        mode === "label"
          ? "Scan a nutrition label and Macro OS will return the parsed macros."
          : "Scan a barcode and Macro OS will return you to the page that opened it."
      }
      backHref={returnTo}
      backLabel="Back"
    >
      <div className="space-y-4">
        {mode === "label" ? (
          <NutritionLabelScanner
            key={scannerKey}
            context={labelContext}
            onDetected={(result) => {
              const nextHref = getLabelReturnHref(returnTo, result);
              router.replace(nextHref);
            }}
          />
        ) : (
          <BarcodeScanner
            key={scannerKey}
            context={context}
            onDetected={(result) => {
              const nextHref = getReturnHref(returnTo, result.value, result.format ?? null);
              router.replace(nextHref);
            }}
          />
        )}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <div className="text-sm font-semibold text-white">Automatic Return</div>
          <div className="mt-1 text-sm text-gray-400">
            {mode === "label"
              ? "Once a label is parsed, the scanner closes and sends the extracted macros back to your intake page."
              : "Once a barcode is detected, the scanner closes and sends you back to keep working."}
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
          subtitle="Scan and return to the page that opened it."
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
