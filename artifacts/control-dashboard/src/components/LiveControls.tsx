import { useState, useEffect, useRef } from "react";
import { useConnection } from "@/lib/ws-context";
import {
  useSetEnvironmentTheme,
  useSetIntensity,
  useAttributeOn,
  useAttributeOff,
  useAttributeVolume,
  useAttributeTempo,
  useGetShow,
  getGetStateQueryKey,
  type EnvironmentTheme,
  type AttributeName
} from "@workspace/api-client-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Activity, Volume2 } from "lucide-react";

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

  const queryClient = useQueryClient();
  const onMutation = useAttributeOn();
  const offMutation = useAttributeOff();
  const volumeMutation = useAttributeVolume();
  const tempoMutation = useAttributeTempo();

  const [localVol, setLocalVol] = useState(volumePct);
  const [localTempo, setLocalTempo] = useState(initialTempo);

  const volDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocalVol(volumePct); }, [volumePct]);
  // Re-sync if initialTempo changes (e.g. show reloads)
  useEffect(() => { setLocalTempo(initialTempo); }, [initialTempo]);

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

  const isTempo = TEMPO_ATTRIBUTES.includes(name as string);

  return (
    <div className={`p-3 rounded-md border flex flex-col gap-3 transition-colors ${enabled ? "bg-primary/5 border-primary/20" : "bg-card border-border"}`}>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-sm font-medium ${enabled ? "text-primary glow-text" : "text-muted-foreground"}`}>
          {(name as string).replace(/_/g, " ")}
        </span>
        <Switch checked={enabled} onCheckedChange={handleCheckedChange} />
      </div>

      {enabled && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider value={[localVol]} min={0} max={100} step={1} onValueChange={handleVolumeChange} className="flex-1" />
            <span className="text-xs text-muted-foreground w-9 text-right shrink-0">{localVol}%</span>
          </div>
          {isTempo && (
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
              <Slider value={[localTempo]} min={20} max={200} step={1} onValueChange={handleTempoChange} className="flex-1" />
              <span className="text-xs text-muted-foreground w-12 text-right shrink-0">{localTempo} bpm</span>
            </div>
          )}
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
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 bg-secondary rounded-md hover:bg-secondary/80 transition-colors">
        <span className="font-semibold text-sm tracking-widest uppercase">{title}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-2">
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

  const [localIntensity, setLocalIntensity] = useState(state?.intensity ?? 0);
  const intensityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state?.intensity !== undefined) {
      setLocalIntensity(state.intensity);
    }
  }, [state?.intensity]);

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

  // Build tempo lookup from show config; fall back to defaults
  const attributeTempos: Record<string, number> = {
    ...TEMPO_DEFAULTS,
    ...(show?.attributeTempo ?? {})
  };

  return (
    <div className="space-y-6">
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

      <div className="space-y-4">
        {Object.entries(ATTRIBUTE_GROUPS).map(([title, attributes]) => (
          <AttributeGroup key={title} title={title} attributes={attributes} attributeTempos={attributeTempos} />
        ))}
      </div>
    </div>
  );
}
