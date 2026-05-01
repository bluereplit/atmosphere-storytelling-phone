import { useState, useEffect, useCallback, useRef } from "react";
import { useConnection } from "@/lib/ws-context";
import { 
  useSetEnvironmentTheme, 
  useSetIntensity,
  useAttributeToggle,
  useAttributeVolume,
  useAttributeTempo,
  getGetStateQueryKey
} from "@workspace/api-client-react";
import { EnvironmentTheme, AttributeName } from "@workspace/api-client-react/src/generated/api.schemas";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Activity, Volume2 } from "lucide-react";

const ATTRIBUTE_GROUPS = {
  "Nature": ["crickets", "birds", "wind", "owls", "campfire", "ocean_waves", "frogs", "stream", "waterfall"],
  "Weather": ["rain", "thunder", "thunder_distant", "blizzard", "sandstorm", "geothermal", "rain_city"],
  "Wildlife": ["wolves", "ravens", "bats", "insects_night", "horses", "seagulls"],
  "City/Urban": ["traffic", "crowd", "subway", "sirens"],
  "Mystical/Arcane": ["singing_bowls", "chimes", "whispers", "choir_pad", "portal_hum", "dripping_cave"],
  "Dramatic/Tension": ["heartbeat", "war_drums", "tension_drone", "blacksmith", "church_bells", "tavern_crowd"]
};

const TEMPO_ATTRIBUTES = ["heartbeat", "war_drums", "blacksmith"];

const ENVIRONMENT_THEMES = [
  "forest", "ocean", "mountain", "desert", "city", "mystical", 
  "medieval", "underwater", "cosmic", "cave", "arctic", "jungle", "tavern"
];

function AttributeControl({ name }: { name: AttributeName }) {
  const { state } = useConnection();
  const attrState = state?.attributes?.[name];
  const enabled = attrState?.enabled ?? false;
  const volume = attrState?.volume ?? 0.5;
  const tempo = (attrState as any)?.tempo ?? 60;
  
  const queryClient = useQueryClient();
  const toggleMutation = useAttributeToggle();
  const volumeMutation = useAttributeVolume();
  const tempoMutation = useAttributeTempo();

  const [localVol, setLocalVol] = useState(volume);
  const [localTempo, setLocalTempo] = useState(tempo);

  const volDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const tempoDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalVol(volume);
  }, [volume]);

  useEffect(() => {
    setLocalTempo(tempo);
  }, [tempo]);

  const handleToggle = () => {
    toggleMutation.mutate({ name }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStateQueryKey() })
    });
  };

  const handleVolumeChange = (val: number[]) => {
    const newVal = val[0];
    setLocalVol(newVal);
    
    if (volDebounceRef.current) clearTimeout(volDebounceRef.current);
    volDebounceRef.current = setTimeout(() => {
      volumeMutation.mutate({ name, data: { value: newVal } }, {
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

  return (
    <div className={`p-3 rounded-md border flex flex-col gap-3 transition-colors ${enabled ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-sm font-medium ${enabled ? 'text-primary glow-text' : 'text-muted-foreground'}`}>
          {name.replace('_', ' ')}
        </span>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
      
      {enabled && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <Slider 
              value={[localVol]} 
              min={0} max={1} step={0.01} 
              onValueChange={handleVolumeChange}
              className="flex-1"
            />
          </div>
          
          {TEMPO_ATTRIBUTES.includes(name) && (
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <Slider 
                value={[localTempo]} 
                min={20} max={200} step={1} 
                onValueChange={handleTempoChange}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8 text-right">{localTempo}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttributeGroup({ title, attributes }: { title: string, attributes: string[] }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-2 bg-secondary rounded-md hover:bg-secondary/80 transition-colors">
        <span className="font-semibold text-sm tracking-widest uppercase">{title}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-2">
        {attributes.map(attr => (
          <AttributeControl key={attr} name={attr as AttributeName} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function LiveControls() {
  const { state } = useConnection();
  const queryClient = useQueryClient();
  const themeMutation = useSetEnvironmentTheme();
  const intensityMutation = useSetIntensity();

  const [localIntensity, setLocalIntensity] = useState(state?.intensity ?? 0);
  const intensityDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state?.intensity !== undefined) {
      setLocalIntensity(state.intensity);
    }
  }, [state?.intensity]);

  const handleThemeChange = (theme: EnvironmentTheme) => {
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono tracking-widest text-muted-foreground uppercase">Environment Theme</CardTitle>
          </CardHeader>
          <CardContent>
            <Select 
              value={state?.environmentTheme} 
              onValueChange={(val) => handleThemeChange(val as EnvironmentTheme)}
            >
              <SelectTrigger className="h-12 bg-background border-border font-medium text-lg">
                <SelectValue placeholder="Select theme..." />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENT_THEMES.map(theme => (
                  <SelectItem key={theme} value={theme} className="font-medium">
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Slider 
              value={[localIntensity]} 
              min={0} max={1} step={0.01}
              onValueChange={handleIntensityChange}
              className="flex-1"
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {Object.entries(ATTRIBUTE_GROUPS).map(([title, attributes]) => (
          <AttributeGroup key={title} title={title} attributes={attributes} />
        ))}
      </div>
    </div>
  );
}
