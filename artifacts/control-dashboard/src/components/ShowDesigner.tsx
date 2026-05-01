import { useState, useEffect } from "react";
import { useGetShow, useUpdateShow, useResetShow, getGetShowQueryKey } from "@workspace/api-client-react";
import { ShowConfig, Phase } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PHASES: Phase[] = ["daytime", "evening", "night", "dawn"];

const ATTRIBUTES = [
  "crickets", "birds", "wind", "owls", "campfire", "ocean_waves", "rain", "thunder",
  "frogs", "stream", "wolves", "ravens", "bats", "insects_night", "horses", "waterfall",
  "blizzard", "sandstorm", "geothermal", "traffic", "crowd", "subway", "sirens", "rain_city",
  "singing_bowls", "chimes", "whispers", "choir_pad", "portal_hum", "heartbeat", "war_drums",
  "tension_drone", "thunder_distant", "blacksmith", "church_bells", "tavern_crowd", "seagulls", "dripping_cave"
];

export function ShowDesigner() {
  const { data: show, isLoading } = useGetShow();
  const updateMutation = useUpdateShow();
  const resetMutation = useResetShow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localShow, setLocalShow] = useState<ShowConfig | null>(null);

  useEffect(() => {
    if (show) {
      setLocalShow(JSON.parse(JSON.stringify(show)));
    }
  }, [show]);

  if (isLoading || !localShow) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse font-mono tracking-widest uppercase">Loading Show Configuration...</div>;
  }

  const handleToggle = (phase: Phase, attribute: string, checked: boolean) => {
    setLocalShow(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      next.phases[phase].attributes[attribute] = checked;
      return next;
    });
  };

  const handleSave = () => {
    updateMutation.mutate({ data: localShow }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey() });
        toast({
          title: "Show Saved",
          description: "Configuration has been updated on the server.",
        });
      },
      onError: (err) => {
        toast({
          title: "Save Failed",
          description: err.message || "An error occurred",
          variant: "destructive",
        });
      }
    });
  };

  const handleReset = () => {
    if (!confirm("Are you sure you want to reset to defaults? This cannot be undone.")) return;
    resetMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey() });
        toast({
          title: "Show Reset",
          description: "Configuration restored to defaults.",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b border-border">
        <h2 className="text-lg font-mono font-bold tracking-widest uppercase text-primary glow-text">Show Designer</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={resetMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
            Reset Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Save className="w-4 h-4 mr-2" />
            Save Show
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground uppercase font-mono tracking-wider text-xs">
            <tr>
              <th className="px-4 py-3 font-semibold border-b border-r border-border bg-background sticky left-0 z-20">Attribute</th>
              {PHASES.map(phase => (
                <th key={phase} className="px-4 py-3 font-semibold border-b border-border text-center">
                  {phase}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {ATTRIBUTES.map(attr => (
              <tr key={attr} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2 font-mono text-xs font-medium border-r border-border bg-background sticky left-0 z-10">
                  {attr.replace('_', ' ')}
                </td>
                {PHASES.map(phase => {
                  const isChecked = !!localShow.phases[phase].attributes[attr];
                  return (
                    <td key={`${phase}-${attr}`} className="px-4 py-2 text-center border-l border-border/50">
                      <Checkbox 
                        checked={isChecked} 
                        onCheckedChange={(checked) => handleToggle(phase, attr, checked as boolean)}
                        className="mx-auto"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
