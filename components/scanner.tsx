"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ScanOutcome =
  | {
      result: "OK";
      ticket: { typeName: string; attendeeName: string | null; eventTitle: string };
      checkedInCount: number;
    }
  | { result: "ALREADY_CHECKED_IN"; at: string; ticket: { typeName: string; eventTitle: string } }
  | { result: "VOID" }
  | { result: "INVALID" }
  | { result: "ERROR"; message: string };

const CODE_RE = /^[A-Z2-7]{26}$/;

/** Extract a ticket code from raw QR content (we encode the ticket URL). */
function extractCode(raw: string): string | null {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/\/tickets\/([A-Z2-7]{26})/i)?.[1];
  const candidate = (fromUrl ?? trimmed).toUpperCase();
  return CODE_RE.test(candidate) ? candidate : null;
}

export function Scanner() {
  const [outcome, setOutcome] = React.useState<ScanOutcome | null>(null);
  const [counter, setCounter] = React.useState<number | null>(null);
  const [cameraState, setCameraState] = React.useState<
    "idle" | "starting" | "running" | "unavailable"
  >("idle");
  const [manualCode, setManualCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scannerRef = React.useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const busyRef = React.useRef(false);
  const lastCodeRef = React.useRef<string | null>(null);

  const submitCode = React.useCallback(async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.status === 429) {
        setOutcome({ result: "ERROR", message: "Scanning too fast — pause a moment." });
        return;
      }
      if (!res.ok) {
        setOutcome({ result: "ERROR", message: "Scan failed — try again." });
        return;
      }
      const data = (await res.json()) as ScanOutcome;
      setOutcome(data);
      if (data.result === "OK") setCounter(data.checkedInCount);
    } catch {
      setOutcome({ result: "ERROR", message: "Network problem — try again." });
    } finally {
      // Brief hold so the result stays readable before the next scan.
      setTimeout(() => {
        busyRef.current = false;
        lastCodeRef.current = null;
        setBusy(false);
      }, 1500);
    }
  }, []);

  const startCamera = React.useCallback(async () => {
    setCameraState("starting");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          const code = extractCode(decoded);
          if (!code) return;
          if (lastCodeRef.current === code) return; // debounce repeat frames
          lastCodeRef.current = code;
          void submitCode(code);
        },
        () => {
          /* per-frame decode misses are expected — ignore */
        }
      );
      setCameraState("running");
    } catch {
      setCameraState("unavailable");
    }
  }, [submitCode]);

  React.useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  function manualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = extractCode(manualCode);
    if (!code) {
      setOutcome({ result: "ERROR", message: "That doesn't look like a ticket code." });
      return;
    }
    setManualCode("");
    void submitCode(code);
  }

  return (
    <div className="flex flex-col gap-4">
      {counter !== null && (
        <p
          className="text-sm font-semibold text-muted-foreground"
          aria-live="polite"
        >
          Checked in this event: {counter}
        </p>
      )}

      <div id="qr-reader" className="overflow-hidden rounded-lg border" />
      {cameraState !== "running" && (
        <Button
          type="button"
          onClick={startCamera}
          disabled={cameraState === "starting"}
        >
          {cameraState === "starting" ? "Starting camera…" : "Start camera"}
        </Button>
      )}
      {cameraState === "unavailable" && (
        <p className="text-sm text-destructive">
          Camera unavailable — check permissions, or use manual entry below.
        </p>
      )}

      {/* Big, unmissable result panel: green / yellow / red, no sound needed */}
      <div aria-live="assertive">
        {outcome && (
          <div
            className={cn(
              "rounded-lg border-2 p-6 text-center transition-colors duration-150",
              outcome.result === "OK" &&
                "border-success bg-success text-success-foreground",
              outcome.result === "ALREADY_CHECKED_IN" &&
                "border-warning bg-warning text-warning-foreground",
              (outcome.result === "INVALID" || outcome.result === "VOID") &&
                "border-destructive bg-destructive text-destructive-foreground",
              outcome.result === "ERROR" &&
                "border-destructive bg-background text-destructive"
            )}
          >
            {outcome.result === "OK" && (
              <>
                <p className="text-3xl font-semibold">✓ Admit</p>
                <p className="mt-2 text-lg">
                  {outcome.ticket.typeName}
                  {outcome.ticket.attendeeName
                    ? ` — ${outcome.ticket.attendeeName}`
                    : ""}
                </p>
                <p className="text-sm opacity-90">{outcome.ticket.eventTitle}</p>
              </>
            )}
            {outcome.result === "ALREADY_CHECKED_IN" && (
              <>
                <p className="text-3xl font-semibold">Already scanned</p>
                <p className="mt-2 text-lg">{outcome.ticket.typeName}</p>
                <p className="text-sm opacity-90">
                  First scanned at{" "}
                  {new Date(outcome.at).toLocaleTimeString("en-GB")}
                </p>
              </>
            )}
            {outcome.result === "VOID" && (
              <p className="text-3xl font-semibold">✕ Void ticket</p>
            )}
            {outcome.result === "INVALID" && (
              <p className="text-3xl font-semibold">✕ Invalid ticket</p>
            )}
            {outcome.result === "ERROR" && (
              <p className="text-lg font-semibold">{outcome.message}</p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={manualSubmit} className="flex flex-col gap-2">
        <Label htmlFor="manual-code">Manual code entry</Label>
        <div className="flex gap-2">
          <Input
            id="manual-code"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="e.g. ABCD2EFG…"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            Check in
          </Button>
        </div>
      </form>
    </div>
  );
}
