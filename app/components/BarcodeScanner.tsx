"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ScannerContext =
  | "general"
  | "inventory-add"
  | "inventory-use"
  | "snack"
  | "ingredient";

type ScanResult = {
  value: string;
  format?: string;
  source: "native" | "zxing";
  scannedAt: string;
};

type BarcodeScannerProps = {
  context?: ScannerContext;
  onDetected?: (result: ScanResult) => void;
};

type NativeBarcodeDetectorResult = {
  rawValue?: string;
  format?: string;
};

type NativeBarcodeDetectorStatic = {
  getSupportedFormats?: () => Promise<string[]>;
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<NativeBarcodeDetectorResult[]>;
  };
};

type ZXingControls = {
  stop: () => void;
};

function getContextLabel(context: ScannerContext) {
  switch (context) {
    case "inventory-add":
      return "Scan a barcode to add a product into inventory.";
    case "inventory-use":
      return "Scan a barcode to mark a packaged item as used.";
    case "snack":
      return "Scan a packaged snack barcode to log it faster.";
    case "ingredient":
      return "Scan a packaged ingredient barcode to attach product nutrition.";
    default:
      return "Scan a barcode to test the shared Macro OS scanner.";
  }
}

export default function BarcodeScanner({
  context = "general",
  onDetected,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeLoopRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<ZXingControls | null>(null);
  const codeReaderRef = useRef<{ reset?: () => void } | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [scannerReady, setScannerReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [engine, setEngine] = useState<"native" | "zxing" | null>(null);

  const stopScanner = useCallback(() => {
    if (nativeLoopRef.current != null) {
      window.cancelAnimationFrame(nativeLoopRef.current);
      nativeLoopRef.current = null;
    }

    if (zxingControlsRef.current) {
      zxingControlsRef.current.stop();
      zxingControlsRef.current = null;
    }

    if (codeReaderRef.current?.reset) {
      codeReaderRef.current.reset();
    }

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

  const handleDetected = useCallback((nextResult: ScanResult) => {
    setResult(nextResult);
    onDetected?.(nextResult);
    stopScanner();
  }, [onDetected, stopScanner]);

  const startNativeScanner = useCallback(async () => {
    const BarcodeDetectorCtor = (globalThis as typeof globalThis & {
      BarcodeDetector?: NativeBarcodeDetectorStatic;
    }).BarcodeDetector;

    if (!BarcodeDetectorCtor || !videoRef.current) {
      throw new Error("Native barcode detection is not available.");
    }

    const supportedFormats = BarcodeDetectorCtor.getSupportedFormats
      ? await BarcodeDetectorCtor.getSupportedFormats()
      : [];

    const preferredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_128"];
    const formats =
      supportedFormats.length > 0
        ? preferredFormats.filter((format) => supportedFormats.includes(format))
        : preferredFormats;

    const detector = new BarcodeDetectorCtor(
      formats.length > 0 ? { formats } : undefined
    );

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode,
      },
    });

    streamRef.current = stream;
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    const scan = async () => {
      if (!videoRef.current) return;

      try {
        const detections = await detector.detect(videoRef.current);
        const first = detections.find((item) => item.rawValue?.trim());

        if (first?.rawValue) {
          handleDetected({
            value: first.rawValue,
            format: first.format,
            source: "native",
            scannedAt: new Date().toISOString(),
          });
          return;
        }
      } catch (nativeError) {
        setError(
          nativeError instanceof Error
            ? nativeError.message
            : "Native barcode detection failed."
        );
      }

      nativeLoopRef.current = window.requestAnimationFrame(scan);
    };

    nativeLoopRef.current = window.requestAnimationFrame(scan);
    setEngine("native");
    setRunning(true);
  }, [facingMode, handleDetected]);

  const startZXingScanner = useCallback(async () => {
    if (!videoRef.current) {
      throw new Error("Camera preview is not ready.");
    }

    const ZXingBrowser = await import("@zxing/browser");
    const reader = new ZXingBrowser.BrowserMultiFormatReader();
    codeReaderRef.current = reader;

    const controls = await reader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode,
        },
      },
      videoRef.current,
      (decoded, decodeError, activeControls) => {
        if (decoded?.getText()) {
          handleDetected({
            value: decoded.getText(),
            format: decoded.getBarcodeFormat?.().toString?.(),
            source: "zxing",
            scannedAt: new Date().toISOString(),
          });
          return;
        }

        if (decodeError && decodeError.name !== "NotFoundException") {
          setError(decodeError.message);
          activeControls?.stop();
        }
      }
    );

    zxingControlsRef.current = controls as ZXingControls;
    setEngine("zxing");
    setRunning(true);
  }, [facingMode, handleDetected]);

  const startScanner = useCallback(async () => {
    try {
      setStarting(true);
      setError(null);
      setResult(null);
      stopScanner();

      const hasNativeDetector = Boolean(
        (globalThis as typeof globalThis & {
          BarcodeDetector?: NativeBarcodeDetectorStatic;
        }).BarcodeDetector
      );

      if (hasNativeDetector) {
        await startNativeScanner();
      } else {
        await startZXingScanner();
      }
    } catch (startError) {
      console.error("Failed to start barcode scanner:", startError);
      setError(
        startError instanceof Error
          ? startError.message
          : "Barcode scanner could not be started."
      );
      stopScanner();
    } finally {
      setStarting(false);
    }
  }, [startNativeScanner, startZXingScanner, stopScanner]);

  useEffect(() => {
    setScannerReady(
      typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );

    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  useEffect(() => {
    if (!scannerReady) return;
    void startScanner();

    return () => {
      stopScanner();
    };
  }, [scannerReady, facingMode, startScanner, stopScanner]);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
        <div className="text-xs uppercase tracking-[0.18em] text-blue-200/80">Camera Scan</div>
        <h2 className="mt-2 text-xl font-bold text-white">Shared Barcode Scanner</h2>
        <p className="mt-2 text-sm text-gray-400">{getContextLabel(context)}</p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="text-sm font-semibold text-white">Barcode Detected</div>
          <div className="mt-2 text-lg font-bold text-emerald-100">{result.value}</div>
          <div className="mt-2 text-xs text-emerald-200/80">
            {result.format ? `${result.format} • ` : ""}
            {result.source === "native" ? "Native detector" : "ZXing fallback"}
          </div>
          <button
            type="button"
            onClick={() => void startScanner()}
            className="mt-4 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Scan Another
          </button>
        </div>
      ) : null}

      <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
        <div className="relative overflow-hidden rounded-[28px] border border-blue-500/20 bg-gray-950">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="aspect-[3/4] w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="h-40 w-full rounded-[32px] border-2 border-blue-400/70 shadow-[0_0_0_9999px_rgba(3,7,18,0.42)]" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950 via-gray-950/85 to-transparent px-4 pb-4 pt-12">
            <p className="text-center text-sm text-gray-200">
              Line up the barcode inside the frame
            </p>
            <p className="mt-1 text-center text-xs text-gray-500">
              {starting
                ? "Starting camera..."
                : running
                  ? `Using ${engine === "native" ? "native detection" : "ZXing fallback"}`
                  : "Camera paused"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
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
            onClick={() => {
              stopScanner();
              void startScanner();
            }}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Restart Scan
          </button>
        </div>

        <div className="mt-3 rounded-2xl bg-gray-900 p-4 text-xs leading-6 text-gray-400">
          Camera scanning works best on HTTPS or localhost, and packaged items usually scan more
          reliably than nutrition labels.
        </div>
      </section>
    </div>
  );
}
