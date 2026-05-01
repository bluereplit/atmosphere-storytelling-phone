import { useState } from "react";
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
import { VolumeX, Volume2, Monitor, SkipForward, ChevronDown, ChevronRight } from "lucide-react";
import { LiveControls } from "@/components/LiveControls";
import { ShowDesigner } from "@/components/ShowDesigner";
import { OSCReference } from "@/components/OSCReference";

const PHASES: Phase[] = ["daytime", "evening", "night", "dawn"];

export default function Dashboard() {
  const { state, connected } = useConnection();
  const queryClient = useQueryClient();
  const [oscOpen, setOscOpen] = useState(false);

  const muteMutation = useAudioMute();
  const unmuteMutation = useAudioUnmute();
  const transitionNextMutation = useTransitionNext();
  const transitionToMutation = useTransitionTo();
  const overlayMutation = useDisplayOverlayToggle();

  const handleMuteToggle = () => {
    if (state?.muted) {
      unmuteMutation.mutate(undefined, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    } else {
      muteMutation.mutate(undefined, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }
  };

  const handleTransitionNext = () => {
    transitionNextMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  };

  const handleTransitionTo = (phase: Phase) => {
    transitionToMutation.mutate({ phase }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  };

  const handleOverlayToggle = () => {
    overlayMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  };

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
            {PHASES.map((phase) => (
              <Button
                key={phase}
                variant={state?.currentPhase === phase ? "default" : "outline"}
                className={`flex-1 font-mono tracking-widest uppercase ${state?.currentPhase === phase ? "glow-border ring-1 ring-primary/50" : ""}`}
                onClick={() => handleTransitionTo(phase)}
                disabled={transitionToMutation.isPending}
              >
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
