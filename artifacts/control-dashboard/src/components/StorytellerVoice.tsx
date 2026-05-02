import { useState, useRef, useCallback, useEffect } from "react";
import { useConnection } from "@/lib/ws-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Mic, MicOff, Volume2, VolumeX, Waves, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Radio, Copy, Check,
  Bluetooth, MonitorSpeaker, RefreshCw, FlaskConical,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function postVoiceStart(): Promise<void> {
  await fetch(`${BASE}/api/voice/start`, { method: "POST" });
}

async function postVoiceStop(): Promise<void> {
  await fetch(`${BASE}/api/voice/stop`, { method: "POST" });
}

async function postVoiceParams(gain: number, reverb: number): Promise<void> {
  await fetch(`${BASE}/api/voice/params`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gain, reverb }),
  });
}

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

interface RelayStats {
  receivedFrames: number;
  droppedFrames: number;
  bufferedChunks: number;
}

async function fetchRelayStats(): Promise<RelayStats | null> {
  try {
    const res = await fetch(`${BASE}/api/voice/relay-stats`);
    if (!res.ok) return null;
    return (await res.json()) as RelayStats;
  } catch {
    return null;
  }
}

async function resetRelayStats(): Promise<void> {
  try {
    await fetch(`${BASE}/api/voice/relay-stats/reset`, { method: "POST" });
  } catch {
    // non-critical
  }
}

interface AlsaDevice {
  id: string;
  name: string;
}

async function fetchInputDevices(): Promise<AlsaDevice[]> {
  try {
    const res = await fetch(`${BASE}/api/voice/input-devices`);
    if (!res.ok) return [];
    const data = await res.json() as { devices: AlsaDevice[] };
    return data.devices;
  } catch {
    return [];
  }
}

type VoiceSourceMode = "browser" | "local";

interface VoiceSource {
  mode: VoiceSourceMode;
  device: string | null;
}

interface LocalCaptureStatus {
  running: boolean;
  device: string | null;
  error: string | null;
  reconnecting?: boolean;
  reconnectAttempt?: number;
  reconnectMaxAttempts?: number;
  autoReconnect?: boolean;
}

async function fetchVoiceSource(): Promise<{ source: VoiceSource; captureStatus: LocalCaptureStatus } | null> {
  try {
    const res = await fetch(`${BASE}/api/voice/source`);
    if (!res.ok) return null;
    return (await res.json()) as { source: VoiceSource; captureStatus: LocalCaptureStatus };
  } catch {
    return null;
  }
}

interface VoiceSourceResult {
  source: VoiceSource;
  captureStatus: LocalCaptureStatus;
}

interface VoiceSourceError {
  error: string;
}

async function postVoiceSource(
  mode: VoiceSourceMode,
  device?: string
): Promise<VoiceSourceResult | VoiceSourceError | null> {
  try {
    const res = await fetch(`${BASE}/api/voice/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, device: device ?? null }),
    });
    if (!res.ok) {
      let msg = `Server error (${res.status})`;
      try {
        const body = await res.json() as { error?: string };
        if (typeof body.error === "string" && body.error) msg = body.error;
      } catch { /* ignore */ }
      return { error: msg };
    }
    return (await res.json()) as VoiceSourceResult;
  } catch {
    return null;
  }
}

async function fetchCaptureStatus(): Promise<LocalCaptureStatus | null> {
  try {
    const res = await fetch(`${BASE}/api/voice/capture-status`);
    if (!res.ok) return null;
    return (await res.json()) as LocalCaptureStatus;
  } catch {
    return null;
  }
}

async function postAutoReconnect(enabled: boolean): Promise<LocalCaptureStatus | null> {
  try {
    const res = await fetch(`${BASE}/api/voice/auto-reconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; captureStatus: LocalCaptureStatus };
    return data.captureStatus;
  } catch {
    return null;
  }
}

interface TestCaptureResult {
  pass: boolean;
  peakLevel: number;
  durationMs: number;
  error: string | null;
}

async function postTestCapture(device: string): Promise<TestCaptureResult> {
  try {
    const res = await fetch(`${BASE}/api/voice/test-capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device }),
    });
    if (!res.ok) {
      let msg = `Server error (${res.status})`;
      try {
        const body = await res.json() as { error?: string };
        if (typeof body.error === "string" && body.error) msg = body.error;
      } catch { /* ignore parse failure */ }
      return { pass: false, peakLevel: 0, durationMs: 0, error: msg };
    }
    return (await res.json()) as TestCaptureResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return { pass: false, peakLevel: 0, durationMs: 0, error: msg };
  }
}

interface MicSession {
  audioCtx: AudioContext;
  workletNode: AudioWorkletNode;
  sourceNode: MediaStreamAudioSourceNode;
  stream: MediaStream;
  ws: WebSocket;
}

function CopyCommand({ command, copiedCmd, onCopy }: {
  command: string;
  copiedCmd: string | null;
  onCopy: (cmd: string | null) => void;
}) {
  const isCopied = copiedCmd === command;
  const handleCopy = () => {
    navigator.clipboard.writeText(command).catch(() => {});
    onCopy(command);
    setTimeout(() => onCopy(null), 2000);
  };
  return (
    <div className="flex items-center gap-1.5 bg-red-900/50 rounded px-2 py-1.5 font-mono text-red-200 text-[11px]">
      <code className="flex-1 select-all">{command}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 text-red-300/60 hover:text-red-200 transition-colors"
        title="Copy to clipboard"
      >
        {isCopied
          ? <Check className="w-3 h-3 text-green-400" />
          : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

export function StorytellerVoice() {
  const { state } = useConnection();

  const serverVoice = state?.voice ?? { active: false, gain: 0.8, reverb: 0.2 };

  const [open, setOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gain, setGain] = useState(serverVoice.gain);
  const [reverb, setReverb] = useState(serverVoice.reverb);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [loopbackStatus, setLoopbackStatus] = useState<LoopbackStatus | null>(null);
  const [relayStats, setRelayStats] = useState<RelayStats | null>(null);

  // Voice source state
  const [sourceMode, setSourceMode] = useState<VoiceSourceMode>("browser");
  const [inputDevices, setInputDevices] = useState<AlsaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<LocalCaptureStatus | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestCaptureResult | null>(null);

  const sessionRef = useRef<MicSession | null>(null);
  const gainRef = useRef(gain);
  const reverbRef = useRef(reverb);
  const mutedRef = useRef(muted);
  const micEnabledRef = useRef(micEnabled);
  const paramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  gainRef.current = gain;
  reverbRef.current = reverb;
  mutedRef.current = muted;
  micEnabledRef.current = micEnabled;

  useEffect(() => {
    setGain(serverVoice.gain);
    setReverb(serverVoice.reverb);
  }, [serverVoice.gain, serverVoice.reverb]);

  useEffect(() => {
    fetchLoopbackStatus().then(setLoopbackStatus);
  }, []);

  // Load persisted voice source on mount
  useEffect(() => {
    fetchVoiceSource().then((data) => {
      if (!data) return;
      setSourceMode(data.source.mode);
      if (data.source.device) setSelectedDevice(data.source.device);
      setCaptureStatus(data.captureStatus);
    });
  }, []);

  // Load devices when switching to local mode
  const loadInputDevices = useCallback(async () => {
    setDevicesLoading(true);
    const devices = await fetchInputDevices();
    setInputDevices(devices);
    setDevicesLoading(false);
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0]!.id);
    }
  }, [selectedDevice]);

  useEffect(() => {
    if (sourceMode === "local" && open) {
      loadInputDevices();
    }
  }, [sourceMode, open, loadInputDevices]);

  // Poll capture status when in local mode and panel is open.
  // If the server reports capture stopped unexpectedly and is NOT reconnecting,
  // sync micEnabled to false so the button label and state are consistent.
  // While the server is in the "reconnecting" state we keep micEnabled=true so
  // the UI reflects that capture is expected to resume automatically.
  useEffect(() => {
    if (!open || sourceMode !== "local") {
      setCaptureStatus(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      fetchCaptureStatus().then((s) => {
        if (cancelled) return;
        setCaptureStatus(s);
        if (s && !s.running && !s.reconnecting && micEnabledRef.current) {
          // Server-side capture stopped and is not auto-reconnecting — sync UI
          setMicEnabled(false);
          postVoiceStop().catch(() => {});
        }
      });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, sourceMode]);

  useEffect(() => {
    if (!open) {
      setRelayStats(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      fetchRelayStats().then((s) => {
        if (!cancelled) setRelayStats(s);
      });
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  const sendParams = useCallback((g: number, r: number) => {
    if (paramDebounceRef.current) clearTimeout(paramDebounceRef.current);
    paramDebounceRef.current = setTimeout(() => {
      postVoiceParams(g, r).catch(() => {});
    }, 80);
  }, []);

  const stopSession = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;

    try { s.workletNode.disconnect(); } catch { /* ignore */ }
    try { s.sourceNode.disconnect(); } catch { /* ignore */ }
    try { s.stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    try { await s.audioCtx.close(); } catch { /* ignore */ }
    try { s.ws.close(); } catch { /* ignore */ }

    setWsConnected(false);
    setLevel(0);
    await postVoiceStop().catch(() => {});
  }, []);

  const startSession = useCallback(async () => {
    setError(null);
    setRelayStats(null);
    await resetRelayStats();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      const audioCtx = new AudioContext({ sampleRate: 44100 });
      await audioCtx.audioWorklet.addModule(`${BASE}/pcm-worklet.js`);

      const workletNode = new AudioWorkletNode(audioCtx, "pcm-capture-processor");
      const sourceNode = audioCtx.createMediaStreamSource(stream);
      sourceNode.connect(workletNode);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}${BASE}/ws/voice`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => setWsConnected(true);
      ws.onclose = (event) => {
        setWsConnected(false);
        if (event.code === 4001) {
          const reason = event.reason || "ALSA loopback not available — run: sudo systemctl start alsa-loopback";
          setError(reason);
          stopSession();
          setMicEnabled(false);
        } else if (sessionRef.current) {
          setError("WebSocket disconnected unexpectedly");
          stopSession();
          setMicEnabled(false);
        }
      };
      ws.onerror = () => {
        setError("Voice WebSocket error");
      };

      workletNode.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
        const { pcm, rms } = event.data;
        setLevel(Math.min(1, rms * 8));

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pcm);
        }
      };

      sessionRef.current = { audioCtx, workletNode, sourceNode, stream, ws };

      await postVoiceStart();
      await postVoiceParams(gainRef.current, reverbRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("Permission denied") || msg.includes("NotAllowed")
        ? "Microphone access denied. Allow mic access and try again."
        : `Mic error: ${msg}`);
      await stopSession();
      setMicEnabled(false);
    }
  }, [stopSession]);

  const handleMicToggle = useCallback(async (checked: boolean) => {
    setMicEnabled(checked);
    if (checked) {
      await startSession();
    } else {
      await stopSession();
    }
  }, [startSession, stopSession]);

  const handleMuteToggle = useCallback(async (checked: boolean) => {
    setMuted(checked);
    sendParams(checked ? 0 : gainRef.current, reverbRef.current);
  }, [sendParams]);

  const handleGainChange = useCallback((vals: number[]) => {
    const v = vals[0] ?? gainRef.current;
    setGain(v);
    gainRef.current = v;
    if (!mutedRef.current) sendParams(v, reverbRef.current);
  }, [sendParams]);

  const handleReverbChange = useCallback((vals: number[]) => {
    const v = vals[0] ?? reverbRef.current;
    setReverb(v);
    reverbRef.current = v;
    sendParams(mutedRef.current ? 0 : gainRef.current, v);
  }, [sendParams]);

  const handleSourceModeChange = useCallback(async (mode: VoiceSourceMode) => {
    if (mode === sourceMode) return;

    // Always disable the active input first — require explicit re-enable
    // after switching so UI and transport are never out of sync.
    if (micEnabled) {
      if (sourceMode === "browser") {
        await stopSession();
      } else {
        // local mode was active: stop server-side capture and voice synth
        await postVoiceSource("browser");
        await postVoiceStop().catch(() => {});
      }
      setMicEnabled(false);
    }

    setSourceMode(mode);
    setError(null);
    setCaptureStatus(null);
    setTestResult(null);

    if (mode === "local") {
      await loadInputDevices();
      // Don't auto-start; let user pick device and explicitly enable
    } else {
      // Switching back to browser: ensure local capture is stopped
      const result = await postVoiceSource("browser");
      if (result && !("error" in result)) setCaptureStatus(result.captureStatus);
    }
  }, [sourceMode, micEnabled, stopSession, loadInputDevices]);

  const handleLocalMicToggle = useCallback(async (checked: boolean) => {
    if (!selectedDevice) return;
    setError(null);

    const result = await postVoiceSource(checked ? "local" : "browser", checked ? selectedDevice : undefined);
    if (!result) {
      setError("Failed to update voice source");
      return;
    }
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setCaptureStatus(result.captureStatus);
    if (result.captureStatus.error) {
      setError(`Capture error: ${result.captureStatus.error}`);
    }

    if (checked) {
      await postVoiceStart();
    } else {
      await postVoiceStop();
    }
    setMicEnabled(checked);
  }, [selectedDevice]);

  const handleDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedDevice(deviceId);
    setError(null);
    setTestResult(null);
    // If currently capturing, restart with the new device
    if (micEnabled && sourceMode === "local") {
      const result = await postVoiceSource("local", deviceId);
      if (result && !("error" in result)) {
        setCaptureStatus(result.captureStatus);
        if (result.captureStatus.error) {
          setError(`Capture error: ${result.captureStatus.error}`);
        }
      } else if (result && "error" in result) {
        setError(result.error);
      }
    }
  }, [micEnabled, sourceMode]);

  useEffect(() => {
    return () => {
      stopSession();
      if (paramDebounceRef.current) clearTimeout(paramDebounceRef.current);
    };
  }, [stopSession]);

  const levelBars = 12;
  const activeBars = Math.round(level * levelBars);

  const loopbackAvailable = loopbackStatus?.available ?? null;
  const loopbackChecked = loopbackStatus !== null;

  const loopbackLabel = (() => {
    if (!loopbackChecked) return "Checking…";
    if (loopbackStatus?.error) return "Check failed";
    if (loopbackStatus?.available) return "Ready";
    if (!loopbackStatus?.moduleLoaded) return "Module not loaded";
    if (!loopbackStatus?.deviceAccessible) return "Device not found";
    return "Unavailable";
  })();

  const localCapturing = captureStatus?.running === true;
  const localReconnecting = captureStatus?.reconnecting === true;
  const localReconnectAttempt = captureStatus?.reconnectAttempt ?? 0;
  const localReconnectMax = captureStatus?.reconnectMaxAttempts ?? 3;
  const localAutoReconnect = captureStatus?.autoReconnect ?? true;
  const localCaptureError = (!localReconnecting && captureStatus?.error) ? captureStatus.error : null;
  const localDeviceName = captureStatus?.device ?? selectedDevice ?? null;

  const handleAutoReconnectToggle = useCallback(async (checked: boolean) => {
    const updated = await postAutoReconnect(checked);
    if (updated) setCaptureStatus(updated);
  }, []);

  const handleTestCapture = useCallback(async () => {
    if (!selectedDevice) return;
    setTestRunning(true);
    setTestResult(null);
    const result = await postTestCapture(selectedDevice);
    setTestResult(result);
    setTestRunning(false);
  }, [selectedDevice]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border/50 bg-card/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer select-none hover:bg-muted/10 transition-colors rounded-t-lg">
            <CardTitle className="text-sm font-mono tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Waves className="w-3.5 h-3.5" />
              Storyteller Voice
              {loopbackChecked && loopbackAvailable === false && (
                <span className="ml-auto flex items-center gap-1 text-xs text-red-400 font-normal normal-case">
                  <AlertTriangle className="w-3 h-3" />
                  No loopback
                </span>
              )}
              {sourceMode === "local" && localCapturing && !localReconnecting && (
                <span className="ml-auto flex items-center gap-1 text-xs text-blue-400 font-normal normal-case">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Capturing locally
                </span>
              )}
              {sourceMode === "local" && localReconnecting && (
                <span className="ml-auto flex items-center gap-1 text-xs text-amber-400 font-normal normal-case">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Reconnecting… ({localReconnectAttempt}/{localReconnectMax})
                </span>
              )}
              {sourceMode === "browser" && micEnabled && wsConnected && loopbackAvailable !== false && (
                <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-normal normal-case">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
              {sourceMode === "local" && localCaptureError && !localReconnecting && (
                <span className="ml-auto flex items-center gap-1 text-xs text-red-400 font-normal normal-case">
                  <AlertTriangle className="w-3 h-3" />
                  Capture lost
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">

            {/* Source selector */}
            <div className="flex items-center gap-1 p-0.5 bg-muted/20 rounded-md border border-border/30">
              <button
                type="button"
                onClick={() => handleSourceModeChange("browser")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-mono transition-all ${
                  sourceMode === "browser"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <MonitorSpeaker className="w-3 h-3" />
                Browser Mic
              </button>
              <button
                type="button"
                onClick={() => handleSourceModeChange("local")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-mono transition-all ${
                  sourceMode === "local"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <Bluetooth className="w-3 h-3" />
                Pi Bluetooth Mic
              </button>
            </div>

            {/* Browser mic mode */}
            {sourceMode === "browser" && (
              <>
                <div className="flex items-center gap-2 text-xs font-mono">
                  {!loopbackChecked ? (
                    <span className="w-3.5 h-3.5 rounded-full bg-muted/40 animate-pulse shrink-0" />
                  ) : loopbackAvailable ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className={loopbackAvailable ? "text-green-300" : loopbackChecked ? "text-red-300" : "text-muted-foreground"}>
                    ALSA loopback
                  </span>
                  <span className="text-muted-foreground/60">&mdash;</span>
                  <span className={loopbackAvailable ? "text-muted-foreground" : loopbackChecked ? "text-red-300/80" : "text-muted-foreground/60"}>
                    {loopbackLabel}
                  </span>
                </div>

                {loopbackChecked && loopbackAvailable === false && (
                  <div className="text-xs bg-red-500/10 border border-red-500/40 rounded p-2.5 space-y-2">
                    <div className="flex gap-2 items-start">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                      {loopbackStatus?.error ? (
                        <span className="text-red-200/90 leading-relaxed">
                          Could not check ALSA loopback status ({loopbackStatus.error.split("\n")[0]}). Run the check manually:{" "}
                          <code className="font-mono bg-red-900/40 px-1 py-0.5 rounded text-red-200">
                            lsmod | grep snd_aloop
                          </code>
                        </span>
                      ) : !loopbackStatus?.moduleLoaded ? (
                        <span className="text-red-200/90 leading-relaxed">
                          The <code className="font-mono bg-red-900/40 px-1 py-0.5 rounded text-red-200">snd_aloop</code> kernel module is not loaded. Voice audio will be silently discarded.
                        </span>
                      ) : (
                        <span className="text-red-200/90 leading-relaxed">
                          Module loaded but ALSA Loopback device not found in{" "}
                          <code className="font-mono bg-red-900/40 px-1 py-0.5 rounded text-red-200">/proc/asound/cards</code>. Voice audio will be silently discarded.
                        </span>
                      )}
                    </div>

                    <Collapsible open={fixOpen} onOpenChange={setFixOpen}>
                      <CollapsibleTrigger className="flex items-center gap-1 text-red-300/80 hover:text-red-200 transition-colors cursor-pointer select-none font-mono tracking-wide">
                        {fixOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        How to fix
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2.5">
                        <div className="space-y-1">
                          <p className="text-red-300/70">Quick fix (current boot only):</p>
                          <CopyCommand
                            command="sudo modprobe snd_aloop"
                            copiedCmd={copiedCmd}
                            onCopy={setCopiedCmd}
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-red-300/70">Persistent (survives reboot):</p>
                          <CopyCommand
                            command="sudo systemctl enable --now alsa-loopback"
                            copiedCmd={copiedCmd}
                            onCopy={setCopiedCmd}
                          />
                        </div>
                        <p className="text-red-300/60 leading-relaxed pt-0.5">
                          Full setup instructions:{" "}
                          <a
                            href="AUDIO_SETUP.md#6-storyteller-voice--alsa-loopback-setup"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-red-200 transition-colors"
                          >
                            AUDIO_SETUP.md §6
                          </a>
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}

                {error && (
                  <div className="text-xs text-destructive bg-destructive/10 rounded p-2 border border-destructive/30">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    variant={micEnabled ? "default" : "outline"}
                    size="sm"
                    className={`gap-2 ${micEnabled ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={() => handleMicToggle(!micEnabled)}
                    disabled={loopbackChecked && loopbackAvailable === false}
                    title={loopbackChecked && loopbackAvailable === false ? "ALSA loopback not available" : undefined}
                  >
                    {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    {micEnabled ? "Mic On" : "Enable Mic"}
                  </Button>

                  <div className="flex-1 flex items-center gap-0.5 h-5">
                    {Array.from({ length: levelBars }).map((_, i) => {
                      const isActive = i < activeBars;
                      const isHigh = i >= levelBars * 0.75;
                      const isMid = i >= levelBars * 0.5;
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm transition-all duration-75 ${
                            !micEnabled
                              ? "bg-muted/20"
                              : isActive
                                ? isHigh
                                  ? "bg-red-500"
                                  : isMid
                                    ? "bg-yellow-400"
                                    : "bg-green-500"
                                : "bg-muted/30"
                          }`}
                          style={{ height: `${40 + i * 5}%` }}
                        />
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    {muted ? <VolumeX className="w-3.5 h-3.5 text-muted-foreground" /> : <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Switch
                      checked={muted}
                      onCheckedChange={handleMuteToggle}
                      disabled={!micEnabled}
                      aria-label="Mute voice"
                    />
                    <span className="text-xs font-mono text-muted-foreground">Mute</span>
                  </div>
                </div>

                {relayStats !== null && (
                  <div className={`flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded border ${
                    relayStats.droppedFrames > 0
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-green-500/10 border-green-500/20 text-green-400"
                  }`}>
                    <Radio className="w-3 h-3 shrink-0" />
                    <span className="text-muted-foreground/80 uppercase tracking-widest text-[10px]">Relay</span>
                    <span className="flex-1" />
                    <span title="Frames delivered to aplay">
                      {(relayStats.receivedFrames - relayStats.droppedFrames).toLocaleString()} delivered
                    </span>
                    {relayStats.droppedFrames > 0 && (
                      <>
                        <span className="text-muted-foreground/50">/</span>
                        <span className="text-amber-400" title="Frames dropped due to back-pressure">
                          {relayStats.droppedFrames.toLocaleString()} dropped
                        </span>
                      </>
                    )}
                    {relayStats.bufferedChunks > 0 && (
                      <span className="text-muted-foreground/70" title="Chunks currently buffered">
                        ({relayStats.bufferedChunks} buffered)
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Pi Bluetooth Mic mode */}
            {sourceMode === "local" && (
              <div className="space-y-3">
                {/* Device picker */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">ALSA Capture Device</span>
                    <button
                      type="button"
                      onClick={loadInputDevices}
                      disabled={devicesLoading || testRunning}
                      className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      title={testRunning ? "Wait for test to finish" : "Refresh device list"}
                    >
                      <RefreshCw className={`w-3 h-3 ${devicesLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  {devicesLoading ? (
                    <div className="text-xs text-muted-foreground/60 font-mono py-1">Scanning devices…</div>
                  ) : inputDevices.length === 0 ? (
                    <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded p-2 text-amber-300 leading-relaxed">
                      No ALSA capture devices found. Pair your Bluetooth mic first, then{" "}
                      <code className="font-mono bg-amber-900/40 px-1 rounded">arecord -l</code> should list it.{" "}
                      <a
                        href="AUDIO_SETUP.md#7-bluetooth-microphone-setup"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-amber-200 transition-colors"
                      >
                        Setup guide
                      </a>
                    </div>
                  ) : (
                    <select
                      value={selectedDevice ?? ""}
                      onChange={(e) => handleDeviceChange(e.target.value)}
                      className="w-full bg-background border border-border/50 rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {inputDevices.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Test capture button + result */}
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full"
                    onClick={handleTestCapture}
                    disabled={inputDevices.length === 0 || !selectedDevice || testRunning || localCapturing || localReconnecting}
                    title={
                      inputDevices.length === 0 ? "No capture device available"
                      : localCapturing || localReconnecting ? "Stop capture before running a test"
                      : "Record 3 seconds and check for audio signal"
                    }
                  >
                    {testRunning
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <FlaskConical className="w-3.5 h-3.5" />}
                    {testRunning ? "Recording 3 s…" : "Test Capture"}
                  </Button>

                  {testResult !== null && !testRunning && (
                    <div className={`flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded border ${
                      testResult.error
                        ? "bg-red-500/10 border-red-500/30 text-red-300"
                        : testResult.pass
                          ? "bg-green-500/10 border-green-500/20 text-green-300"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}>
                      {testResult.error ? (
                        <>
                          <XCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                          <span className="flex-1 truncate" title={testResult.error}>{testResult.error}</span>
                        </>
                      ) : testResult.pass ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-400" />
                          <span className="uppercase tracking-widest text-[10px] text-green-400/80">Pass</span>
                          <span className="flex-1" />
                          <span className="text-green-300/70 text-[10px]">
                            peak {Math.round(testResult.peakLevel * 100)}%
                          </span>
                          <div className="flex items-center gap-0.5 ml-1">
                            {Array.from({ length: 8 }).map((_, i) => {
                              const threshold = (i + 1) / 8;
                              const active = testResult.peakLevel >= threshold;
                              const isHigh = i >= 6;
                              const isMid = i >= 4;
                              return (
                                <div
                                  key={i}
                                  className={`w-1.5 rounded-sm ${
                                    active
                                      ? isHigh ? "bg-red-500" : isMid ? "bg-yellow-400" : "bg-green-500"
                                      : "bg-muted/30"
                                  }`}
                                  style={{ height: `${8 + i * 1.5}px` }}
                                />
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span className="uppercase tracking-widest text-[10px] text-amber-400/80">Silent</span>
                          <span className="flex-1" />
                          <span className="text-amber-300/70 text-[10px]">peak {Math.round(testResult.peakLevel * 100)}%</span>
                          <div className="flex items-center gap-0.5 ml-1">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-1.5 rounded-sm bg-muted/30"
                                style={{ height: `${8 + i * 1.5}px` }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Enable/disable local capture */}
                <div className="flex items-center gap-3">
                  <Button
                    variant={micEnabled ? "default" : "outline"}
                    size="sm"
                    className={`gap-2 ${micEnabled ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-500" : ""}`}
                    onClick={() => handleLocalMicToggle(!micEnabled)}
                    disabled={inputDevices.length === 0 || !selectedDevice || testRunning}
                    title={
                      inputDevices.length === 0 ? "No capture device available"
                      : testRunning ? "Wait for the test to finish"
                      : undefined
                    }
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    {micEnabled ? "Capturing" : "Start Capture"}
                  </Button>

                  <div className="flex items-center gap-2">
                    {muted ? <VolumeX className="w-3.5 h-3.5 text-muted-foreground" /> : <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Switch
                      checked={muted}
                      onCheckedChange={handleMuteToggle}
                      disabled={!micEnabled}
                      aria-label="Mute voice"
                    />
                    <span className="text-xs font-mono text-muted-foreground">Mute</span>
                  </div>
                </div>

                {/* Status indicator */}
                {localCapturing && localDeviceName && (
                  <div className="flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded border bg-blue-500/10 border-blue-500/30 text-blue-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                    <span className="uppercase tracking-widest text-[10px] text-blue-400/80">Capturing locally</span>
                    <span className="flex-1" />
                    <span className="text-blue-200/80 truncate max-w-[140px]" title={localDeviceName}>{localDeviceName}</span>
                  </div>
                )}

                {/* Reconnecting indicator */}
                {localReconnecting && localDeviceName && (
                  <div className="flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-300">
                    <RefreshCw className="w-3 h-3 animate-spin shrink-0 text-amber-400" />
                    <span className="uppercase tracking-widest text-[10px] text-amber-400/80">Reconnecting…</span>
                    <span className="text-amber-300/70">attempt {localReconnectAttempt} of {localReconnectMax}</span>
                    <span className="flex-1" />
                    <span className="text-amber-200/60 truncate max-w-[120px]" title={localDeviceName}>{localDeviceName}</span>
                  </div>
                )}

                {/* Capture error */}
                {localCaptureError && (
                  <div className="text-xs bg-red-500/10 border border-red-500/40 rounded p-2.5 space-y-1.5">
                    <div className="flex gap-2 items-start">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-red-200/90 leading-relaxed">{localCaptureError}</p>
                        <p className="text-red-300/60">
                          Check that the Bluetooth mic is still paired and visible in{" "}
                          <code className="font-mono bg-red-900/40 px-1 rounded">arecord -l</code>.
                          {localAutoReconnect
                            ? " Auto-reconnect has been attempted — reconnect the mic and press Start Capture again."
                            : " Reconnect the mic and press Start Capture again."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto-reconnect toggle */}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Auto-reconnect</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground/60">
                      {localAutoReconnect ? "On" : "Off"}
                    </span>
                    <Switch
                      checked={localAutoReconnect}
                      onCheckedChange={handleAutoReconnectToggle}
                      disabled={testRunning}
                      aria-label="Auto-reconnect Bluetooth mic"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-destructive bg-destructive/10 rounded p-2 border border-destructive/30">
                    {error}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Gain</span>
                  <span className="text-xs font-mono text-primary">{Math.round(gain * 100)}%</span>
                </div>
                <Slider
                  value={[gain]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleGainChange}
                  disabled={!micEnabled || muted}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Reverb</span>
                  <span className="text-xs font-mono text-primary">{Math.round(reverb * 100)}%</span>
                </div>
                <Slider
                  value={[reverb]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleReverbChange}
                  disabled={!micEnabled}
                />
              </div>
            </div>

            {!micEnabled && (
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                {sourceMode === "browser"
                  ? "Enable the microphone to blend the storyteller's voice into the soundscape. The browser will request mic permission."
                  : "Select a Bluetooth capture device and press Start Capture to blend the storyteller's voice into the soundscape without a browser mic."}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
