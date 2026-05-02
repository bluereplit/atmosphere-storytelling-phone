import { useState, useRef, useCallback, useEffect } from "react";
import { useConnection } from "@/lib/ws-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mic, MicOff, Volume2, VolumeX, Waves, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle, Radio, Copy, Check } from "lucide-react";

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

  const sessionRef = useRef<MicSession | null>(null);
  const gainRef = useRef(gain);
  const reverbRef = useRef(reverb);
  const mutedRef = useRef(muted);
  const paramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  gainRef.current = gain;
  reverbRef.current = reverb;
  mutedRef.current = muted;

  useEffect(() => {
    setGain(serverVoice.gain);
    setReverb(serverVoice.reverb);
  }, [serverVoice.gain, serverVoice.reverb]);

  useEffect(() => {
    fetchLoopbackStatus().then(setLoopbackStatus);
  }, []);

  useEffect(() => {
    if (!micEnabled || !wsConnected) {
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
  }, [micEnabled, wsConnected]);

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
              {micEnabled && wsConnected && loopbackAvailable !== false && (
                <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-normal normal-case">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
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
                Enable the microphone to blend the storyteller's voice into the soundscape. The browser will request mic permission.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
