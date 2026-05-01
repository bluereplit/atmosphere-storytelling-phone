import { useState, useEffect, useRef } from "react";
import { useGetShow, useUpdateShow, useResetShow, getGetShowQueryKey } from "@workspace/api-client-react";
import { ShowConfig, Phase, EnvironmentTheme } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const ENVIRONMENT_THEMES: EnvironmentTheme[] = [
  "forest", "ocean", "mountain", "desert", "city", "mystical",
  "medieval", "underwater", "cosmic", "cave", "arctic", "jungle", "tavern"
];

export function ShowDesigner() {
  const { data: show, isLoading } = useGetShow();
  const updateMutation = useUpdateShow();
  const resetMutation = useResetShow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localShow, setLocalShow] = useState<ShowConfig | null>(null);
  const intensityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (show) {
      setLocalShow(JSON.parse(JSON.stringify(show)) as ShowConfig);
    }
  }, [show]);

  if (isLoading || !localShow) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse font-mono tracking-widest uppercase">
        Loading Show Configuration...
      </div>
    );
  }

  const handleAttrToggle = (phase: Phase, attribute: string, checked: boolean) => {
    setLocalShow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: {
          ...prev.phases,
          [phase]: {
            ...prev.phases[phase],
            attributes: {
              ...prev.phases[phase].attributes,
              [attribute]: checked
            }
          }
        }
      };
    });
  };

  const handleThemeChange = (theme: EnvironmentTheme) => {
    setLocalShow(prev => prev ? { ...prev, environmentTheme: theme } : prev);
  };

  const handleIntensityChange = (val: number[]) => {
    const newVal = val[0];
    setLocalShow(prev => prev ? { ...prev, intensity: newVal } : prev);
    if (intensityDebounceRef.current) clearTimeout(intensityDebounceRef.current);
    intensityDebounceRef.current = setTimeout(() => {}, 0);
  };

  const handleSave = () => {
    if (!localShow) return;
    updateMutation.mutate({ data: localShow }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey() });
        toast({ title: "Show Saved", description: "Configuration updated on the server." });
      },
      onError: (err) => {
        toast({ title: "Save Failed", description: err.message || "An error occurred", variant: "destructive" });
      }
    });
  };

  const handleReset = () => {
    if (!confirm("Reset show to defaults? This cannot be undone.")) return;
    resetMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey() });
        toast({ title: "Show Reset", description: "Configuration restored to defaults." });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Sticky toolbar */}
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b border-border">
        <h2 className="text-lg font-mono font-bold tracking-widest uppercase text-primary glow-text">Show Designer</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={resetMutation.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${resetMutation.isPending ? "animate-spin" : ""}`} />
            Reset Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Save className="w-4 h-4 mr-2" />
            Save Show
          </Button>
        </div>
      </div>

      {/* Global show settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-border rounded-md bg-card/30">
        <div className="space-y-2">
          <Label className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Default Environment Theme</Label>
          <Select
            value={localShow.environmentTheme}
            onValueChange={(val) => handleThemeChange(val as EnvironmentTheme)}
          >
            <SelectTrigger className="h-10 bg-background border-border font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENVIRONMENT_THEMES.map(theme => (
                <SelectItem key={theme} value={theme} className="font-medium capitalize">
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-mono tracking-widest uppercase text-muted-foreground flex justify-between">
            <span>Default Intensity</span>
            <span className="text-primary">{Math.round(localShow.intensity * 100)}%</span>
          </Label>
          <div className="flex items-center h-10 px-1">
            <Slider
              value={[localShow.intensity]}
              min={0} max={1} step={0.01}
              onValueChange={handleIntensityChange}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* Attribute × scene grid */}
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground uppercase font-mono tracking-wider text-xs">
            <tr>
              <th className="px-4 py-3 font-semibold border-b border-r border-border bg-background sticky left-0 z-20">
                Attribute
              </th>
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
                  {attr.replace(/_/g, " ")}
                </td>
                {PHASES.map(phase => {
                  const isChecked = !!localShow.phases[phase].attributes[attr];
                  return (
                    <td key={`${phase}-${attr}`} className="px-4 py-2 text-center border-l border-border/50">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(val) => handleAttrToggle(phase, attr, val === true)}
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
