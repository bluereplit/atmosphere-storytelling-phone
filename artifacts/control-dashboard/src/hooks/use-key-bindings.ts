import { useState, useCallback } from "react";

export type KeyBindings = {
  phase1: string;
  phase2: string;
  phase3: string;
  phase4: string;
  next: string;
  mute: string;
  overlay: string;
};

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  phase1: "1",
  phase2: "2",
  phase3: "3",
  phase4: "4",
  next: "n",
  mute: "m",
  overlay: "o",
};

const STORAGE_KEY = "atmosphere-key-bindings";

function sanitizeBindings(parsed: unknown): KeyBindings {
  const result = { ...DEFAULT_KEY_BINDINGS };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return result;
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_KEY_BINDINGS) as Array<keyof KeyBindings>) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

function loadBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEY_BINDINGS };
    return sanitizeBindings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

function saveBindings(bindings: KeyBindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // ignore storage errors
  }
}

export function useKeyBindings() {
  const [bindings, setBindings] = useState<KeyBindings>(loadBindings);

  const updateBinding = useCallback((action: keyof KeyBindings, key: string) => {
    setBindings((prev) => {
      const next = { ...prev, [action]: key };
      saveBindings(next);
      return next;
    });
  }, []);

  const resetBindings = useCallback(() => {
    setBindings({ ...DEFAULT_KEY_BINDINGS });
    saveBindings({ ...DEFAULT_KEY_BINDINGS });
  }, []);

  return { bindings, updateBinding, resetBindings };
}
