import { useState, useRef, useCallback, useEffect } from "react";
import { useConnection } from "@/lib/ws-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mic, MicOff, Volume2, VolumeX, Waves, ChevronDown, ChevronRight } from "lucide-react";

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

interface MicSession {
  audioCtx: AudioContext;
  workletNode: AudioWorkletNode;
  sourceNode: MediaStreamAudioSourceNode;
  stream: MediaStream;
  ws: WebSocket;
}

export function StorytellerVoice() {
  const { state } = useConnection();

  const serverVoice = state?.voice ?? { active: false, gain: 0.8, reverb: 0.2 };

  const [open, setOpen] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gain, setGain] = useState(serverVoice.gain);
  const [reverb, setReverb] = useState(serverVoice.reverb);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

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
      ws.onclose = () => {
        setWsConnected(false);
        if (sessionRef.current) {
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

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border/50 bg-card/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer select-none hover:bg-muted/10 transition-colors rounded-t-lg">
            <CardTitle className="text-sm font-mono tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Waves className="w-3.5 h-3.5" />
              Storyteller Voice
              {micEnabled && wsConnected && (
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
