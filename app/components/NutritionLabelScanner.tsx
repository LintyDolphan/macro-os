"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ScannerContext =
  | "general"
  | "inventory-add"
  | "inventory-use"
  | "snack"
  | "ingredient";

type LabelScanResult = {
  calories: string | null;
  protein: string | null;
  carbs: string | null;
  fat: string | null;
  rawText: string;
  source: "text-detector";
  scannedAt: string;
};

type NutritionLabelScannerProps = {
  context?: ScannerContext;
  onDetected?: (result: LabelScanResult) => void;
};

type TextDetectorLine = {
  rawValue?: string;
};

type TextDetectorStatic = {
  new (): {
    detect: (source: ImageBitmapSource) => Promise<TextDetectorLine[]>;
  };
};

function getContextLabel(context: ScannerContext) {
  switch (context) {
    case "inventory-add":
      return "Capture a nutrition label to prefill calories, protein, carbs, and fat.";
    case "ingredient":
      return "Capture a nutrition label to turn a packaged food into a reusable ingredient.";
    default:
      return "Capture a nutrition label and Macro OS will try to parse the main macros.";
  }
}

function normalizeCapturedText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/[•]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function extractMacroValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1].replace(",", ".");
    }
  }

  return null;
}

function parseNutritionLabel(text: string) {
  const normalized = normalizeCapturedText(text);

  return {
    calories: extractMacroValue(normalized, [
      /calories[^0-9]{0,12}(\d{1,4}(?:[.,]\d+)?)/i,
    ]),
    fat: extractMacroValue(normalized, [
      /total\s*fat[^0-9]{0,12}(\d{1,4}(?:[.,]\d+)?)/i,
      /\bfat[^0-9]{0,12}(\d{1,4}(?:[.,]\d+)?)/i,
    ]),
    carbs: extractMacroValue(normalized, [
      /total\s*carbohydrate[s]?[^0-9]{0,12}(\d{1,4}(?:[.,]\d+)?)/i,
      /\bcarb(?:ohydrate)?s?[^0-9]{0,12}(\d{1,4}(?:[.,]\d+)?)/i,
    ]),
    protein: extractMacroValue(normalized, [
      /\bprotein[^0-9]{0,12}(\d{1,4}(?:[.,]\d+)?)/i,
    ]),
    rawText: normalized,
  };
}

export default function NutritionLabelScanner({
  context = "general",
  onDetected,
}: NutritionLabelScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [scannerReady, setScannerReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LabelScanResult | null>(null);
  const [supportsTextDetector, setSupportsTextDetector] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setRunning(false);
    setStarting(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setStarting(true);
      setError(null);
      setResult(null);
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
        },
      });

      if (!videoRef.current) {
        throw new Error("Camera preview is not ready.");
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setRunning(true);
    } catch (cameraError) {
      console.error("Failed to start nutrition label scanner:", cameraError);
      setError(
        cameraError instanceof Error
          ? cameraError.message
          : "Nutrition label scanner could not be started."
      );
      stopCamera();
    } finally {
      setStarting(false);
    }
  }, [facingMode, stopCamera]);

  const captureAndParse = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      setCapturing(true);
      setError(null);

      const TextDetectorCtor = (globalThis as typeof globalThis & {
        TextDetector?: TextDetectorStatic;
      }).TextDetector;

      if (!TextDetectorCtor) {
        throw new Error(
          "This browser does not support on-device label text detection yet. You can still enter the label manually."
        );
      }

      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1080;
      canvas.height = video.videoHeight || 1440;

      const context2d = canvas.getContext("2d");
      if (!context2d) {
        throw new Error("Camera frame could not be captured.");
      }

      context2d.drawImage(video, 0, 0, canvas.width, canvas.height);

      const detector = new TextDetectorCtor();
      const blocks = await detector.detect(canvas);
      const combinedText = blocks
        .map((block) => block.rawValue?.trim() || "")
        .filter(Boolean)
        .join("\n");

      if (!combinedText.trim()) {
        throw new Error("No readable nutrition text was found. Move closer and try again.");
      }

      const parsed = parseNutritionLabel(combinedText);

      if (!parsed.calories && !parsed.protein && !parsed.carbs && !parsed.fat) {
        throw new Error("Macro OS found text, but could not confidently parse calories, protein, carbs, or fat.");
      }

      const nextResult: LabelScanResult = {
        calories: parsed.calories,
        protein: parsed.protein,
        carbs: parsed.carbs,
        fat: parsed.fat,
        rawText: parsed.rawText,
        source: "text-detector",
        scannedAt: new Date().toISOString(),
      };

      setResult(nextResult);
      onDetected?.(nextResult);
      stopCamera();
    } catch (captureError) {
      console.error("Failed to capture nutrition label:", captureError);
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Nutrition label could not be captured."
      );
    } finally {
      setCapturing(false);
    }
  }, [onDetected, stopCamera]);

  useEffect(() => {
    setScannerReady(
      typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );
    setSupportsTextDetector(
      typeof window !== "undefined" &&
        "TextDetector" in window
    );

    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!scannerReady) return;
    void startCamera();

    return () => {
      stopCamera();
    };
  }, [scannerReady, facingMode, startCamera, stopCamera]);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">Label Scan</div>
        <h2 className="mt-2 text-xl font-bold text-white">Nutrition Label Scanner</h2>
        <p className="mt-2 text-sm text-gray-400">{getContextLabel(context)}</p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="text-sm font-semibold text-white">Label Parsed</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-emerald-100">
            <div>Calories: {result.calories ?? "--"}</div>
            <div>Protein: {result.protein ?? "--"}g</div>
            <div>Carbs: {result.carbs ?? "--"}g</div>
            <div>Fat: {result.fat ?? "--"}g</div>
          </div>
          <button
            type="button"
            onClick={() => void startCamera()}
            className="mt-4 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Scan Another
          </button>
        </div>
      ) : null}

      <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
        <div className="relative overflow-hidden rounded-[28px] border border-emerald-500/20 bg-gray-950">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-[3/4] w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="h-[60%] w-[84%] rounded-[24px] border-2 border-emerald-400/70 shadow-[0_0_0_9999px_rgba(3,7,18,0.42)]" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950 via-gray-950/85 to-transparent px-4 pb-4 pt-12">
            <p className="text-center text-sm text-gray-200">
              Fill the frame with the nutrition facts panel
            </p>
            <p className="mt-1 text-center text-xs text-gray-500">
              {starting
                ? "Starting camera..."
                : capturing
                  ? "Reading nutrition label..."
                  : running
                    ? supportsTextDetector
                      ? "Camera ready for label capture"
                      : "Camera ready, but OCR is not supported on this browser"
                    : "Camera paused"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))
            }
            className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Switch Camera
          </button>
          <button
            type="button"
            onClick={() => void startCamera()}
            className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={() => void captureAndParse()}
            disabled={!running || capturing}
            className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {capturing ? "Parsing..." : "Capture Label"}
          </button>
        </div>

        <div className="mt-3 rounded-2xl bg-gray-900 p-4 text-xs leading-6 text-gray-400">
          Label scanning currently uses browser-native text detection when available, so it works best on newer mobile Chrome builds over HTTPS.
        </div>
      </section>
    </div>
  );
}
