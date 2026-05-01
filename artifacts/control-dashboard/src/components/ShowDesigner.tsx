import { useState, useEffect } from "react";
import { useGetShow, useUpdateShow, useResetShow, getGetShowQueryKey } from "@workspace/api-client-react";
import {
  type ShowConfig,
  type Phase,
  type EnvironmentTheme,
  EnvironmentTheme as EnvironmentThemeValues
} from "@workspace/api-client-react";
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

const THEME_OPTIONS = Object.values(EnvironmentThemeValues) as EnvironmentTheme[];

export function ShowDesigner() {
  const { data: show, isLoading } = useGetShow();
  const updateMutation = useUpdateShow();
  const resetMutation = useResetShow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localShow, setLocalShow] = useState<ShowConfig | null>(null);

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

  const handleAttrToggle = (phase: Phase, attribute: string, val: boolean | "indeterminate") => {
    const checked = val === true;
    setLocalShow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: {
          ...prev.phases,
          [phase]: {
            ...prev.phases[phase],
            attributes: { ...prev.phases[phase].attributes, [attribute]: checked }
          }
        }
      };
    });
  };

  const handleGlobalTheme = (theme: EnvironmentTheme) => {
    setLocalShow(prev => prev ? { ...prev, environmentTheme: theme } : prev);
  };

  const handleGlobalIntensity = (val: number[]) => {
    setLocalShow(prev => prev ? { ...prev, intensity: val[0] } : prev);
  };

  const handlePhaseTheme = (phase: Phase, theme: string) => {
    const value = theme === "__inherit__" ? undefined : (theme as EnvironmentTheme);
    setLocalShow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: { ...prev.phases, [phase]: { ...prev.phases[phase], environmentTheme: value } }
      };
    });
  };

  const handlePhaseIntensity = (phase: Phase, val: number[]) => {
    setLocalShow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: { ...prev.phases, [phase]: { ...prev.phases[phase], intensity: val[0] } }
      };
    });
  };

  const clearPhaseIntensity = (phase: Phase) => {
    setLocalShow(prev => {
      if (!prev) return prev;
      const { intensity: _removed, ...rest } = prev.phases[phase];
      return { ...prev, phases: { ...prev.phases, [phase]: rest } };
    });
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

      {/* Global defaults */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-border rounded-md bg-card/30">
        <div className="space-y-2">
          <Label className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Global Default Theme</Label>
          <Select
            value={localShow.environmentTheme}
            onValueChange={(val) => handleGlobalTheme(val as EnvironmentTheme)}
          >
            <SelectTrigger className="h-10 bg-background border-border font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map(theme => (
                <SelectItem key={theme} value={theme} className="font-medium capitalize">
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-mono tracking-widest uppercase text-muted-foreground flex justify-between">
            <span>Global Default Intensity</span>
            <span className="text-primary">{Math.round(localShow.intensity * 100)}%</span>
          </Label>
          <div className="flex items-center h-10 px-1">
            <Slider
              value={[localShow.intensity]}
              min={0} max={1} step={0.01}
              onValueChange={handleGlobalIntensity}
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
              <th className="px-4 py-3 font-semibold border-b border-r border-border bg-background sticky left-0 z-20 min-w-[140px]">
                Attribute / Scene
              </th>
              {PHASES.map(phase => (
                <th key={phase} className="px-4 py-3 font-semibold border-b border-border text-center min-w-[160px]">
                  {phase}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">

            {/* Per-scene environment theme row */}
            <tr className="bg-muted/30 hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-semibold border-r border-border bg-background/80 sticky left-0 z-10 text-muted-foreground uppercase tracking-wider">
                Theme Override
              </td>
              {PHASES.map(phase => {
                const val = localShow.phases[phase].environmentTheme ?? "__inherit__";
                return (
                  <td key={`theme-${phase}`} className="px-3 py-2 border-l border-border/50">
                    <Select
                      value={val}
                      onValueChange={(v) => handlePhaseTheme(phase, v)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background border-border w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__inherit__" className="text-xs text-muted-foreground">
                          — inherit global —
                        </SelectItem>
                        {THEME_OPTIONS.map(theme => (
                          <SelectItem key={theme} value={theme} className="text-xs capitalize">
                            {theme.charAt(0).toUpperCase() + theme.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                );
              })}
            </tr>

            {/* Per-scene intensity row */}
            <tr className="bg-muted/30 hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-semibold border-r border-border bg-background/80 sticky left-0 z-10 text-muted-foreground uppercase tracking-wider">
                Intensity Override
              </td>
              {PHASES.map(phase => {
                const phaseIntensity = localShow.phases[phase].intensity;
                const hasOverride = phaseIntensity !== undefined;
                return (
                  <td key={`intensity-${phase}`} className="px-3 py-2 border-l border-border/50">
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[phaseIntensity ?? localShow.intensity]}
                        min={0} max={1} step={0.01}
                        onValueChange={(val) => handlePhaseIntensity(phase, val)}
                        className="flex-1"
                      />
                      <span className={`text-xs w-8 text-right shrink-0 ${hasOverride ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {Math.round((phaseIntensity ?? localShow.intensity) * 100)}%
                      </span>
                      {hasOverride && (
                        <button
                          onClick={() => clearPhaseIntensity(phase)}
                          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                          title="Clear override"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Attribute rows */}
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
                        onCheckedChange={(val) => handleAttrToggle(phase, attr, val)}
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
