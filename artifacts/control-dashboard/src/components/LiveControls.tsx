import { useState, useEffect, useRef } from "react";
import { useConnection } from "@/lib/ws-context";
import {
  useSetEnvironmentTheme,
  useSetIntensity,
  useSetPhaseParams,
  useAttributeOn,
  useAttributeOff,
  useAttributeVolume,
  useAttributeTempo,
  useAttributeDistance,
  useGetShow,
  getGetStateQueryKey,
  type EnvironmentTheme,
  type AttributeName
} from "@workspace/api-client-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Activity, Volume2, Waves } from "lucide-react";
import { StorytellerVoice } from "./StorytellerVoice";
import { PreShowChecklist } from "./PreShowChecklist";

const ATTRIBUTE_GROUPS: Record<string, string[]> = {
  "Nature": ["crickets", "birds", "wind", "ocean_waves", "rain", "frogs", "stream", "waterfall"],
  "Nature Extended": ["owls", "wolves", "ravens", "bats", "insects_night", "seagulls"],
  "City/Urban": ["traffic", "crowd", "subway", "sirens", "rain_city"],
  "Mystical/Arcane": ["singing_bowls", "chimes", "whispers", "choir_pad", "portal_hum", "dripping_cave"],
  "Dramatic/Tension": ["heartbeat", "war_drums", "tension_drone", "thunder", "thunder_distant", "blizzard", "sandstorm", "geothermal"],
  "Medieval/Historical": ["campfire", "horses", "blacksmith", "church_bells", "tavern_crowd"]
};

const TEMPO_ATTRIBUTES: string[] = ["heartbeat", "war_drums", "blacksmith"];

const TEMPO_DEFAULTS: Record<string, number> = {
  heartbeat: 60,
  war_drums: 80,
  blacksmith: 72,
};

// Attributes that support spatial distance positioning (0 = close, 1 = distant)
const DISTANCE_ATTRIBUTES: string[] = [
  "wolves", "ravens", "thunder", "thunder_distant", "traffic",
  "choir_pad", "wind", "ocean_waves", "waterfall", "blizzard",
  "sandstorm", "geothermal", "crowd", "sirens", "whispers",
  "portal_hum", "tension_drone",
];

interface ThemeDescriptor {
  name: EnvironmentTheme;
  label: string;
  descriptor: string;
}

const THEME_DESCRIPTORS: ThemeDescriptor[] = [
  { name: "forest",     label: "Forest",     descriptor: "Ancient canopy, rustling leaves" },
  { name: "ocean",      label: "Ocean",       descriptor: "Open sea, salt wind, waves" },
  { name: "mountain",   label: "Mountain",    descriptor: "Alpine stillness, thin air" },
  { name: "desert",     label: "Desert",      descriptor: "Scorched silence, dust storms" },
  { name: "city",       label: "City",        descriptor: "Urban pulse, neon rain" },
  { name: "mystical",   label: "Mystical",    descriptor: "Otherworldly resonance" },
  { name: "medieval",   label: "Medieval",    descriptor: "Stone walls, forge smoke" },
  { name: "underwater", label: "Underwater",  descriptor: "Pressure and deep silence" },
  { name: "cosmic",     label: "Cosmic",      descriptor: "Void drones, stellar drift" },
  { name: "cave",       label: "Cave",        descriptor: "Drip echo, limestone dark" },
  { name: "arctic",     label: "Arctic",      descriptor: "Blizzard howl, frozen waste" },
  { name: "jungle",     label: "Jungle",      descriptor: "Dense canopy, creature calls" },
  { name: "tavern",     label: "Tavern",      descriptor: "Firelight, crowd murmur" }
];

function ThemeGrid({ currentTheme, onSelect }: { currentTheme: EnvironmentTheme | undefined; onSelect: (t: EnvironmentTheme) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
      {THEME_DESCRIPTORS.map(({ name, label, descriptor }) => {
        const isActive = currentTheme === name;
        return (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className={[
              "rounded-md border p-3 text-left transition-all cursor-pointer hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary",
              isActive
                ? "bg-primary/10 border-primary shadow-sm shadow-primary/20 glow-border"
                : "bg-card border-border hover:bg-card/80"
            ].join(" ")}
          >
            <div className={`font-mono text-xs font-semibold uppercase tracking-widest mb-1 ${isActive ? "text-primary glow-text" : "text-foreground"}`}>
              {label}
            </div>
            <div className="text-xs text-muted-foreground leading-tight">{descriptor}</div>
          </button>
        );
      })}
    </div>
  );
}

function AttributeControl({ name, initialTempo }: { name: AttributeName; initialTempo: number }) {
  const { state } = useConnection();
  const attrState = state?.attributes?.[name];
  const enabled = attrState?.enabled ?? false;
  const volume = attrState?.volume ?? 0.5;
  // Volume is stored as 0–1 in the backend; display as 0–100 for operators
  const volumePct = Math.round(volume * 100);
  // Distance is stored as 0–1 in the backend; display as 0–100 for operators
  const distancePct = attrState?.distance !== undefined ? Math.round(attrState.distance * 100) : 50;

  const queryClient = useQueryClient();
  const onMutation = useAttributeOn();
  const offMutation = useAttributeOff();
  const volumeMutation = useAttributeVolume();
  const tempoMutation = useAttributeTempo();
  const distanceMutation = useAttributeDistance();

  const [localVol, setLocalVol] = useState(volumePct);
  const [localTempo, setLocalTempo] = useState(initialTempo);
  const [localDistance, setLocalDistance] = useState(distancePct);

  const volDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const distanceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalVol(volumePct); }, [volumePct]);
  // Re-sync if initialTempo changes (e.g. show reloads)
  useEffect(() => { setLocalTempo(initialTempo); }, [initialTempo]);
  // Re-sync distance when live state updates arrive over WS
  useEffect(() => { setLocalDistance(distancePct); }, [distancePct]);

  const handleCheckedChange = (checked: boolean) => {
    const mutation = checked ? onMutation : offMutation;
    mutation.mutate({ name }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  };

  const handleVolumeChange = (val: number[]) => {
    const newPct = val[0];
    setLocalVol(newPct);
    if (volDebounceRef.current) clearTimeout(volDebounceRef.current);
    volDebounceRef.current = setTimeout(() => {
      volumeMutation.mutate({ name, data: { value: newPct / 100 } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  const handleTempoChange = (val: number[]) => {
    const newVal = val[0];
    setLocalTempo(newVal);
    if (tempoDebounceRef.current) clearTimeout(tempoDebounceRef.current);
    tempoDebounceRef.current = setTimeout(() => {
      tempoMutation.mutate({ name, data: { value: newVal } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  const handleDistanceChange = (val: number[]) => {
    const newPct = val[0];
    setLocalDistance(newPct);
    if (distanceDebounceRef.current) clearTimeout(distanceDebounceRef.current);
    distanceDebounceRef.current = setTimeout(() => {
      distanceMutation.mutate({ name, data: { value: newPct / 100 } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  const isTempo = TEMPO_ATTRIBUTES.includes(name as string);
  const isDistance = DISTANCE_ATTRIBUTES.includes(name as string);

  return (
    <div className={`p-3 rounded-md border flex flex-col gap-2 transition-colors ${enabled ? "bg-primary/5 border-primary/20" : "bg-card border-border"}`}>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-sm font-medium truncate mr-2 ${enabled ? "text-primary glow-text" : "text-muted-foreground"}`}>
          {(name as string).replace(/_/g, " ")}
        </span>
        <Switch checked={enabled} onCheckedChange={handleCheckedChange} />
      </div>

      {/* Volume knob — always visible so operators can pre-set before enabling */}
      <div className={`flex items-center gap-2 ${enabled ? "" : "opacity-50"}`}>
        <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Slider
          value={[localVol]}
          min={0}
          max={100}
          step={1}
          onValueChange={handleVolumeChange}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-9 text-right shrink-0">{localVol}%</span>
      </div>

      {/* BPM — always visible for rhythm attributes */}
      {isTempo && (
        <div className={`flex flex-col gap-0.5 ${enabled ? "" : "opacity-50"}`}>
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Slider
              value={[localTempo]}
              min={20}
              max={200}
              step={1}
              onValueChange={handleTempoChange}
              className="flex-1"
            />
            <span className="text-xs font-mono text-primary w-12 text-right shrink-0">
              {localTempo < 80 ? "Slow" : localTempo <= 140 ? "Med" : "Fast"}
            </span>
          </div>
          <div className="flex justify-between pl-5 pr-0">
            <span className="text-[10px] text-muted-foreground/50 leading-none">Slow</span>
            <span className="text-[10px] text-muted-foreground/50 leading-none">Fast</span>
          </div>
        </div>
      )}

      {/* Distance — spatial positioning for ambient/distant sounds */}
      {isDistance && (
        <div className={`flex flex-col gap-0.5 ${enabled ? "" : "opacity-50"}`}>
          <div className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Slider
              value={[localDistance]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleDistanceChange}
              className="flex-1"
            />
            <span className="text-xs font-mono text-primary w-9 text-right shrink-0">
              {localDistance <= 33 ? "Near" : localDistance <= 66 ? "Mid" : "Far"}
            </span>
          </div>
          <div className="flex justify-between pl-5 pr-0">
            <span className="text-[10px] text-muted-foreground/50 leading-none">Near</span>
            <span className="text-[10px] text-muted-foreground/50 leading-none">Far</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AttributeGroup({ title, attributes, attributeTempos }: {
  title: string;
  attributes: string[];
  attributeTempos: Record<string, number>;
}) {
  const { state } = useConnection();
  const queryClient = useQueryClient();
  const onMutation = useAttributeOn();
  const offMutation = useAttributeOff();
  const [open, setOpen] = useState(true);

  const activeCount = attributes.filter(attr => state?.attributes?.[attr as AttributeName]?.enabled).length;

  const handleEnableAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const disabled = attributes.filter(attr => !state?.attributes?.[attr as AttributeName]?.enabled);
    await Promise.all(disabled.map(name => onMutation.mutateAsync({ name: name as AttributeName })));
    queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() });
  };

  const handleDisableAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const enabled = attributes.filter(attr => state?.attributes?.[attr as AttributeName]?.enabled);
    await Promise.all(enabled.map(name => offMutation.mutateAsync({ name: name as AttributeName })));
    queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      {/* Group header — trigger and bulk-action buttons are siblings, not nested */}
      <div className="flex items-center gap-1 bg-secondary rounded-md hover:bg-secondary/80 transition-colors group pr-1">
        <CollapsibleTrigger className="flex items-center gap-3 flex-1 p-2 text-left">
          <span className="font-semibold text-sm tracking-widest uppercase">{title}</span>
          {activeCount > 0 && (
            <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 leading-none">
              {activeCount}/{attributes.length}
            </span>
          )}
          <span className="ml-auto">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs font-mono text-primary hover:text-primary hover:bg-primary/10 shrink-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
          onClick={handleEnableAll}
          title="Enable all in group"
        >
          All On
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs font-mono text-muted-foreground hover:text-foreground shrink-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
          onClick={handleDisableAll}
          title="Disable all in group"
        >
          All Off
        </Button>
      </div>
      <CollapsibleContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-2">
        {attributes.map(attr => (
          <AttributeControl
            key={attr}
            name={attr as AttributeName}
            initialTempo={attributeTempos[attr] ?? TEMPO_DEFAULTS[attr] ?? 60}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function LiveControls() {
  const { state } = useConnection();
  const { data: show } = useGetShow();
  const queryClient = useQueryClient();
  const themeMutation = useSetEnvironmentTheme();
  const intensityMutation = useSetIntensity();
  const phaseParamsMutation = useSetPhaseParams();

  const [localIntensity, setLocalIntensity] = useState(state?.intensity ?? 0);
  const intensityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [localReverb, setLocalReverb] = useState(state?.phaseParams?.reverb ?? 0.3);
  const [localLpfFreq, setLocalLpfFreq] = useState(state?.phaseParams?.lpfFreq ?? 8000);
  const [localMasterPitch, setLocalMasterPitch] = useState(state?.phaseParams?.masterPitch ?? 0);
  const reverbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpfFreqDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterPitchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state?.intensity !== undefined) {
      setLocalIntensity(state.intensity);
    }
  }, [state?.intensity]);

  useEffect(() => {
    if (state?.phaseParams?.reverb !== undefined) setLocalReverb(state.phaseParams.reverb);
  }, [state?.phaseParams?.reverb]);

  useEffect(() => {
    if (state?.phaseParams?.lpfFreq !== undefined) setLocalLpfFreq(state.phaseParams.lpfFreq);
  }, [state?.phaseParams?.lpfFreq]);

  useEffect(() => {
    if (state?.phaseParams?.masterPitch !== undefined) setLocalMasterPitch(state.phaseParams.masterPitch);
  }, [state?.phaseParams?.masterPitch]);

  useEffect(() => {
    return () => {
      if (intensityDebounceRef.current) clearTimeout(intensityDebounceRef.current);
      if (reverbDebounceRef.current) clearTimeout(reverbDebounceRef.current);
      if (lpfFreqDebounceRef.current) clearTimeout(lpfFreqDebounceRef.current);
      if (masterPitchDebounceRef.current) clearTimeout(masterPitchDebounceRef.current);
    };
  }, []);

  const handleThemeSelect = (theme: EnvironmentTheme) => {
    themeMutation.mutate({ theme }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  };

  const handleIntensityChange = (val: number[]) => {
    const newVal = val[0];
    setLocalIntensity(newVal);
    if (intensityDebounceRef.current) clearTimeout(intensityDebounceRef.current);
    intensityDebounceRef.current = setTimeout(() => {
      intensityMutation.mutate({ data: { value: newVal } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  const handleReverbChange = (val: number[]) => {
    const newVal = val[0];
    setLocalReverb(newVal);
    if (reverbDebounceRef.current) clearTimeout(reverbDebounceRef.current);
    reverbDebounceRef.current = setTimeout(() => {
      phaseParamsMutation.mutate({ data: { reverb: newVal } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  const handleLpfFreqChange = (val: number[]) => {
    const newVal = val[0];
    setLocalLpfFreq(newVal);
    if (lpfFreqDebounceRef.current) clearTimeout(lpfFreqDebounceRef.current);
    lpfFreqDebounceRef.current = setTimeout(() => {
      phaseParamsMutation.mutate({ data: { lpfFreq: newVal } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  const handleMasterPitchChange = (val: number[]) => {
    const newVal = val[0];
    setLocalMasterPitch(newVal);
    if (masterPitchDebounceRef.current) clearTimeout(masterPitchDebounceRef.current);
    masterPitchDebounceRef.current = setTimeout(() => {
      phaseParamsMutation.mutate({ data: { masterPitch: newVal } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
      });
    }, 300);
  };

  // Build tempo lookup from show config; fall back to defaults
  const attributeTempos: Record<string, number> = {
    ...TEMPO_DEFAULTS,
    ...(show?.attributeTempo ?? {})
  };

  return (
    <div className="space-y-6">
      <PreShowChecklist />

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono tracking-widest text-muted-foreground uppercase">
            Environment Theme
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeGrid currentTheme={state?.environmentTheme} onSelect={handleThemeSelect} />
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono tracking-widest text-muted-foreground uppercase flex justify-between">
            <span>Intensity</span>
            <span className="text-primary">{Math.round(localIntensity * 100)}%</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center h-12">
          <Slider value={[localIntensity]} min={0} max={1} step={0.01} onValueChange={handleIntensityChange} className="flex-1" />
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono tracking-widest text-muted-foreground uppercase">
            Phase Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Reverb</span>
              <span className="text-xs font-mono text-primary">{Math.round(localReverb * 100)}%</span>
            </div>
            <Slider
              value={[localReverb]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={handleReverbChange}
              className="flex-1"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">LPF Cutoff</span>
              <span className="text-xs font-mono text-primary">{Math.round(localLpfFreq)} Hz</span>
            </div>
            <Slider
              value={[localLpfFreq]}
              min={500}
              max={20000}
              step={100}
              onValueChange={handleLpfFreqChange}
              className="flex-1"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Pitch Shift</span>
              <span className="text-xs font-mono text-primary">
                {localMasterPitch > 0 ? `+${localMasterPitch}` : localMasterPitch} st
              </span>
            </div>
            <Slider
              value={[localMasterPitch]}
              min={-12}
              max={12}
              step={0.5}
              onValueChange={handleMasterPitchChange}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {Object.entries(ATTRIBUTE_GROUPS).map(([title, attributes]) => (
          <AttributeGroup key={title} title={title} attributes={attributes} attributeTempos={attributeTempos} />
        ))}
      </div>

      <StorytellerVoice />
    </div>
  );
}
