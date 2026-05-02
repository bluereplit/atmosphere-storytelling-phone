import { useState, useEffect } from "react";
import { useConnection } from "@/lib/ws-context";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LoopbackStatus {
  available: boolean;
  moduleLoaded: boolean;
  deviceAccessible: boolean;
  error: string | null;
}

async function fetchLoopbackStatus(): Promise<LoopbackStatus | null> {
  try {
    const res = await fetch(`${BASE}/api/voice/loopback-status`);
    if (!res.ok) return null;
    return (await res.json()) as LoopbackStatus;
  } catch {
    return null;
  }
}

type CheckStatus = "loading" | "ok" | "error" | "warn";

interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
}

function StatusDot({ status }: { status: CheckStatus }) {
  if (status === "loading") {
    return <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />;
  }
  if (status === "ok") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />;
  }
  if (status === "warn") {
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
}

export function PreShowChecklist() {
  const { state, connected } = useConnection();
  const [loopback, setLoopback] = useState<LoopbackStatus | null>(null);
  const [loopbackLoading, setLoopbackLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoopbackLoading(true);
    fetchLoopbackStatus().then((s) => {
      if (!cancelled) {
        setLoopback(s);
        setLoopbackLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const wsStatus: CheckStatus = connected ? "ok" : "error";
  const wsDetail = connected ? "Connected" : "Disconnected";
  const wsHint = connected ? undefined : "Check that the API server is running and reachable.";

  const scStatus: CheckStatus = !connected
    ? "warn"
    : state?.scReady
    ? "ok"
    : "error";
  const scDetail = !connected
    ? "Unknown (no WS)"
    : state?.scReady
    ? "Ready"
    : "Not ready";
  const scHint = !connected
    ? "Connect WebSocket first to verify SuperCollider status."
    : state?.scReady
    ? undefined
    : "SuperCollider engine is offline. Audio will not play until it connects.";

  const alsaStatus: CheckStatus = loopbackLoading
    ? "loading"
    : loopback === null
    ? "warn"
    : loopback.available
    ? "ok"
    : "error";
  const alsaDetail = loopbackLoading
    ? "Checking…"
    : loopback === null
    ? "Check failed"
    : loopback.available
    ? "Ready"
    : !loopback.moduleLoaded
    ? "Module not loaded"
    : !loopback.deviceAccessible
    ? "Device not found"
    : "Unavailable";
  const alsaHint = loopbackLoading
    ? undefined
    : loopback === null
    ? "Could not reach the loopback status endpoint."
    : loopback.available
    ? undefined
    : !loopback.moduleLoaded
    ? "Run: sudo modprobe snd_aloop"
    : "Module loaded but ALSA Loopback device not found in /proc/asound/cards.";

  const checks: CheckItem[] = [
    {
      id: "ws",
      label: "WebSocket",
      status: wsStatus,
      detail: wsDetail,
      hint: wsHint,
    },
    {
      id: "sc",
      label: "SuperCollider",
      status: scStatus,
      detail: scDetail,
      hint: scHint,
    },
    {
      id: "alsa",
      label: "ALSA Loopback",
      status: alsaStatus,
      detail: alsaDetail,
      hint: alsaHint,
    },
  ];

  const allOk = checks.every((c) => c.status === "ok");
  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");

  const overallColor = allOk
    ? "border-green-500/30 bg-green-500/5"
    : hasError
    ? "border-red-500/30 bg-red-500/5"
    : "border-amber-500/30 bg-amber-500/5";

  const headerColor = allOk
    ? "text-green-400"
    : hasError
    ? "text-red-400"
    : "text-amber-400";

  const headerLabel = allOk
    ? "All systems ready"
    : hasError
    ? "Issues detected"
    : hasWarn
    ? "Some checks incomplete"
    : "Checking…";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${overallColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-mono uppercase tracking-widest font-semibold ${headerColor}`}>
          Pre-Show Checks
        </span>
        <span className={`text-[10px] font-mono ${headerColor} opacity-70`}>
          — {headerLabel}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-5 w-5 p-0 opacity-50 hover:opacity-100 transition-opacity"
          onClick={handleRefresh}
          title="Re-run checks"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {checks.map((check) => (
          <div key={check.id} className="flex flex-col gap-0.5 min-w-[120px]">
            <div className="flex items-center gap-1.5">
              <StatusDot status={check.status} />
              <span className="text-xs font-mono text-foreground/80">{check.label}</span>
              <span className={`text-[11px] font-mono ml-0.5 ${
                check.status === "ok"
                  ? "text-green-400"
                  : check.status === "error"
                  ? "text-red-400"
                  : check.status === "warn"
                  ? "text-amber-400"
                  : "text-muted-foreground"
              }`}>
                {check.detail}
              </span>
            </div>
            {check.hint && (
              <p className="text-[10px] text-muted-foreground/70 leading-tight pl-5 max-w-[280px]">
                {check.hint}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
