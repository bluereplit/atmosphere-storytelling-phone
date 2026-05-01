import { useConnection } from "@/lib/ws-context";
import { 
  useAudioMute, 
  useAudioUnmute, 
  useTransitionNext, 
  useTransitionTo, 
  useDisplayOverlayToggle,
  getGetStateQueryKey
} from "@workspace/api-client-react";
import { Phase } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VolumeX, Volume2, Monitor, SkipForward, Power } from "lucide-react";
import { LiveControls } from "@/components/LiveControls";
import { ShowDesigner } from "@/components/ShowDesigner";
import { OSCReference } from "@/components/OSCReference";

const PHASES: Phase[] = ["daytime", "evening", "night", "dawn"];

export default function Dashboard() {
  const { state, connected } = useConnection();
  const queryClient = useQueryClient();

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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border/50 px-6 py-4 flex flex-col gap-4 shadow-sm shadow-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-wider uppercase font-mono text-primary glow-text">Atmosphere Control</h1>
            <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border">
              <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${connected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`} />
              <span className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
                {connected ? "WS Connected" : "WS Disconnected"}
              </span>
            </div>
            {state?.scReady !== undefined && (
              <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border">
                <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${state.scReady ? 'bg-primary shadow-primary/50' : 'bg-red-500 shadow-red-500/50'}`} />
                <span className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
                  {state.scReady ? "Engine Ready" : "Engine Wait"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
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

        {/* Scene Controls */}
        <div className="flex items-center gap-2 bg-card border border-border p-2 rounded-lg">
          <div className="px-4 py-2 border-r border-border font-mono tracking-widest uppercase text-sm text-muted-foreground flex items-center">
            Scene State
          </div>
          <div className="flex flex-1 items-center gap-2 px-2">
            {PHASES.map((phase) => (
              <Button
                key={phase}
                variant={state?.currentPhase === phase ? "default" : "outline"}
                className={`flex-1 font-mono tracking-widest uppercase ${state?.currentPhase === phase ? 'glow-border ring-1 ring-primary/50' : ''}`}
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

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0 h-auto gap-6 mb-8">
            <TabsTrigger 
              value="live" 
              className="font-mono tracking-widest uppercase text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2"
            >
              Live Controls
            </TabsTrigger>
            <TabsTrigger 
              value="designer" 
              className="font-mono tracking-widest uppercase text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2"
            >
              Show Designer
            </TabsTrigger>
            <TabsTrigger 
              value="osc" 
              className="font-mono tracking-widest uppercase text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary px-0 pb-3 pt-2"
            >
              OSC Reference
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="live" className="mt-0 outline-none animate-in fade-in duration-500">
            <LiveControls />
          </TabsContent>
          <TabsContent value="designer" className="mt-0 outline-none animate-in fade-in duration-500">
            <ShowDesigner />
          </TabsContent>
          <TabsContent value="osc" className="mt-0 outline-none animate-in fade-in duration-500">
            <OSCReference />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
