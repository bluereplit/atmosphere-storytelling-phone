import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useConnection } from "@/lib/ws-context";
import {
  useAudioMute,
  useAudioUnmute,
  useTransitionNext,
  useTransitionTo,
  useDisplayOverlayToggle,
  getGetStateQueryKey,
  type Phase
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VolumeX, Volume2, Monitor, SkipForward, ChevronDown, ChevronRight, Keyboard, X, RotateCcw, Pencil } from "lucide-react";
import { LiveControls } from "@/components/LiveControls";
import { ShowDesigner } from "@/components/ShowDesigner";
import { OSCReference } from "@/components/OSCReference";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useKeyBindings, DEFAULT_KEY_BINDINGS, type KeyBindings } from "@/hooks/use-key-bindings";

const PHASES: Phase[] = ["daytime", "evening", "night", "dawn"];

type ActionId = keyof KeyBindings;

const ACTION_ROWS: { id: ActionId; label: string; note?: string }[] = [
  { id: "phase1", label: "Daytime" },
  { id: "phase2", label: "Evening" },
  { id: "phase3", label: "Night" },
  { id: "phase4", label: "Dawn" },
  { id: "next", label: "Next scene", note: "Space also works" },
  { id: "mute", label: "Toggle mute" },
  { id: "overlay", label: "Toggle overlay" },
];

function displayKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function ShortcutPanel({
  open,
  onClose,
  bindings,
  onUpdateBinding,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  bindings: KeyBindings;
  onUpdateBinding: (action: ActionId, key: string) => void;
  onReset: () => void;
}) {
  const [listening, setListening] = useState<ActionId | null>(null);
  const isDefault = JSON.stringify(bindings) === JSON.stringify(DEFAULT_KEY_BINDINGS);

  useEffect(() => {
    if (!listening) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setListening(null);
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const action = listening;
      if (!action) return;
      onUpdateBinding(action, key);
      setListening(null);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [listening, onUpdateBinding]);

  if (!open) return null;

  return (
    <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-lg shadow-lg p-4 w-72 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono tracking-widest uppercase text-xs font-semibold text-muted-foreground">
          Shortcuts
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            disabled={isDefault}
            title="Restore defaults"
            className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            onClick={() => { setListening(null); onClose(); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close shortcuts"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {ACTION_ROWS.map(({ id, label, note }) => {
          const isListening = listening === id;
          return (
            <div key={id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md transition-colors ${isListening ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/40"}`}>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-foreground">{label}</span>
                {note && <span className="text-[10px] text-muted-foreground/60">{note}</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isListening ? (
                  <span className="text-[10px] font-mono text-primary animate-pulse">
                    Press a key…
                  </span>
                ) : (
                  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-secondary text-xs font-mono text-foreground leading-none min-w-[1.75rem] justify-center">
                    {displayKey(bindings[id])}
                  </kbd>
                )}
                <button
                  onClick={() => setListening(isListening ? null : id)}
                  title={isListening ? "Cancel" : "Remap key"}
                  className={`p-1 rounded transition-colors ${isListening ? "text-primary hover:text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  aria-label={isListening ? "Cancel remapping" : `Remap ${label}`}
                >
                  {isListening ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/60 font-mono">
        Click <Pencil className="w-2.5 h-2.5 inline" /> then press any key to remap. Bindings are saved automatically.
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground/60 font-mono">
        Disabled when typing in inputs.
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { state, connected } = useConnection();
  const queryClient = useQueryClient();
  const [oscOpen, setOscOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const { bindings, updateBinding, resetBindings } = useKeyBindings();

  const muteMutation = useAudioMute();
  const unmuteMutation = useAudioUnmute();
  const transitionNextMutation = useTransitionNext();
  const transitionToMutation = useTransitionTo();
  const overlayMutation = useDisplayOverlayToggle();

  const handleMuteToggle = useCallback(() => {
    if (state?.muted) {
      unmuteMutation.mutate(undefined, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    } else {
      muteMutation.mutate(undefined, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }
  }, [state?.muted, muteMutation, unmuteMutation, queryClient]);

  const handleTransitionNext = useCallback(() => {
    transitionNextMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  }, [transitionNextMutation, queryClient]);

  const handleTransitionTo = useCallback((phase: Phase) => {
    transitionToMutation.mutate({ phase }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  }, [transitionToMutation, queryClient]);

  const handleOverlayToggle = useCallback(() => {
    overlayMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  }, [overlayMutation, queryClient]);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const showFlash = useCallback((label: string) => {
    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
    }
    const { dismiss } = toast({
      title: label,
      className:
        "font-mono tracking-widest uppercase text-sm py-2 px-4 min-h-0 border-primary/30 bg-card/95 text-primary shadow-primary/10 shadow-md",
    });
    flashTimerRef.current = setTimeout(() => {
      dismiss();
      flashTimerRef.current = null;
    }, 1000);
  }, []);

  useKeyboardShortcuts({
    onPhase1: useCallback(() => handleTransitionTo("daytime"), [handleTransitionTo]),
    onPhase2: useCallback(() => handleTransitionTo("evening"), [handleTransitionTo]),
    onPhase3: useCallback(() => handleTransitionTo("night"), [handleTransitionTo]),
    onPhase4: useCallback(() => handleTransitionTo("dawn"), [handleTransitionTo]),
    onNext: handleTransitionNext,
    onMuteToggle: handleMuteToggle,
    onOverlayToggle: handleOverlayToggle,
    onFlash: showFlash,
    keyBindings: bindings,
  });

  const attrs = state?.attributes ?? {};
  const attrEntries = Object.values(attrs) as Array<{ enabled: boolean }>;
  const activeAttributeCount = attrEntries.filter(a => a.enabled).length;
  const totalAttributeCount = attrEntries.length || 38;

  const intensityPct = state?.intensity !== undefined ? Math.round(state.intensity * 100) : null;
  const currentThemeLabel = state?.environmentTheme
    ? state.environmentTheme.charAt(0).toUpperCase() + state.environmentTheme.slice(1)
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border/50 px-6 py-4 flex flex-col gap-3 shadow-sm shadow-primary/5">

        {/* Top row: branding + status + controls */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold tracking-wider uppercase font-mono text-primary glow-text">
              Atmosphere Control
            </h1>
            <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border text-xs font-mono tracking-wider uppercase text-muted-foreground">
              <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 shadow-green-500/50" : "bg-red-500 shadow-red-500/50"} shadow-sm`} />
              {connected ? "WS Connected" : "WS Disconnected"}
            </div>
            {state?.scReady !== undefined && (
              <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border text-xs font-mono tracking-wider uppercase text-muted-foreground">
                <div className={`w-2 h-2 rounded-full shadow-sm ${state.scReady ? "bg-primary shadow-primary/50" : "bg-red-500 shadow-red-500/50"}`} />
                {state.scReady ? "Engine Ready" : "Engine Wait"}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Keyboard shortcut legend / remap toggle */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50"
                onClick={() => setShortcutsOpen((v) => !v)}
                aria-label="Toggle keyboard shortcuts"
              >
                <Keyboard className="w-4 h-4 mr-2" />
                Keys
              </Button>
              <ShortcutPanel
                open={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
                bindings={bindings}
                onUpdateBinding={updateBinding}
                onReset={resetBindings}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="font-mono tracking-widest uppercase border-primary/20 hover:bg-primary/10"
              onClick={handleOverlayToggle}
              disabled={overlayMutation.isPending}
            >
              <Monitor className="w-4 h-4 mr-2 text-primary" />
              Overlay
            </Button>
            <Button
              variant={state?.muted ? "destructive" : "default"}
              size="lg"
              className="font-mono tracking-widest uppercase px-6"
              onClick={handleMuteToggle}
              disabled={muteMutation.isPending || unmuteMutation.isPending}
            >
              {state?.muted ? <VolumeX className="w-5 h-5 mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
              {state?.muted ? "Muted" : "Mute"}
            </Button>
          </div>
        </div>

        {/* Live state panel — always-visible stats bar */}
        <div className="flex items-center gap-4 px-3 py-2 bg-secondary/30 rounded-md border border-border/40 text-xs font-mono tracking-wider flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground uppercase">Scene</span>
            <span className={`font-semibold capitalize ${state?.currentPhase ? "text-primary" : "text-muted-foreground"}`}>
              {state?.currentPhase ?? "—"}
            </span>
          </div>
          <div className="w-px h-4 bg-border/60 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground uppercase">Theme</span>
            <span className={`font-semibold ${currentThemeLabel ? "text-foreground" : "text-muted-foreground"}`}>
              {currentThemeLabel ?? "—"}
            </span>
          </div>
          <div className="w-px h-4 bg-border/60 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground uppercase">Intensity</span>
            <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: intensityPct !== null ? `${intensityPct}%` : "0%" }}
              />
            </div>
            <span className="text-primary font-semibold w-8">
              {intensityPct !== null ? `${intensityPct}%` : "—"}
            </span>
          </div>
          <div className="w-px h-4 bg-border/60 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground uppercase">Active</span>
            <span className="font-semibold text-foreground">
              {activeAttributeCount}
              <span className="text-muted-foreground font-normal">/{totalAttributeCount}</span>
            </span>
          </div>
        </div>

        {/* Scene transition controls */}
        <div className="flex items-center gap-2 bg-card border border-border p-2 rounded-lg">
          <div className="px-4 py-2 border-r border-border font-mono tracking-widest uppercase text-sm text-muted-foreground flex items-center shrink-0">
            Scene
          </div>
          <div className="flex flex-1 items-center gap-2 px-2">
            {PHASES.map((phase, i) => (
              <Button
                key={phase}
                variant={state?.currentPhase === phase ? "default" : "outline"}
                className={`flex-1 font-mono tracking-widest uppercase ${state?.currentPhase === phase ? "glow-border ring-1 ring-primary/50" : ""}`}
                onClick={() => handleTransitionTo(phase)}
                disabled={transitionToMutation.isPending}
              >
                <span className="hidden sm:inline-block mr-1.5 opacity-40 text-xs">{i + 1}</span>
                {phase}
              </Button>
            ))}
          </div>
          <div className="px-2 pl-4 border-l border-border">
            <Button
              size="icon"
              variant="outline"
              onClick={handleTransitionNext}
              disabled={transitionNextMutation.isPending}
              className="w-12 h-10 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              title="Next scene (Space / N)"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full space-y-8">
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0 h-auto gap-6 mb-8">
            {[
              { value: "live", label: "Live Controls" },
              { value: "designer", label: "Show Designer" }
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="font-mono tracking-widest uppercase text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="live" className="mt-0 outline-none animate-in fade-in duration-500">
            <LiveControls />
          </TabsContent>
          <TabsContent value="designer" className="mt-0 outline-none animate-in fade-in duration-500">
            <ShowDesigner />
          </TabsContent>
        </Tabs>

        {/* OSC Reference — collapsible bottom panel */}
        <Collapsible open={oscOpen} onOpenChange={setOscOpen} className="border border-border rounded-lg overflow-hidden">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-6 py-4 bg-card hover:bg-muted/50 transition-colors">
            <span className="font-mono tracking-widest uppercase text-sm font-semibold text-muted-foreground">
              OSC Reference
            </span>
            {oscOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="p-6 border-t border-border bg-background animate-in fade-in duration-200">
            <OSCReference />
          </CollapsibleContent>
        </Collapsible>
      </main>
    </div>
  );
}
