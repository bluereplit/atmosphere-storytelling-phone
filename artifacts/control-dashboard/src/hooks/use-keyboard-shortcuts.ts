import { useEffect } from "react";
import type { KeyBindings } from "./use-key-bindings";

type KeyboardShortcutHandlers = {
  onPhase1: () => void;
  onPhase2: () => void;
  onPhase3: () => void;
  onPhase4: () => void;
  onNext: () => void;
  onMuteToggle: () => void;
  onOverlayToggle: () => void;
  onFlash?: (label: string) => void;
  keyBindings: KeyBindings;
};

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  const role = el.getAttribute("role");
  if (role === "slider" || role === "spinbutton") return true;
  return false;
}

function matchKey(pressed: string, binding: string): boolean {
  return pressed.toLowerCase() === binding.toLowerCase();
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const { keyBindings } = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;

      if (matchKey(key, keyBindings.phase1)) {
        e.preventDefault();
        handlers.onFlash?.("→ Daytime");
        handlers.onPhase1();
      } else if (matchKey(key, keyBindings.phase2)) {
        e.preventDefault();
        handlers.onFlash?.("→ Evening");
        handlers.onPhase2();
      } else if (matchKey(key, keyBindings.phase3)) {
        e.preventDefault();
        handlers.onFlash?.("→ Night");
        handlers.onPhase3();
      } else if (matchKey(key, keyBindings.phase4)) {
        e.preventDefault();
        handlers.onFlash?.("→ Dawn");
        handlers.onPhase4();
      } else if (key === " " || matchKey(key, keyBindings.next)) {
        e.preventDefault();
        handlers.onFlash?.("→ Next Scene");
        handlers.onNext();
      } else if (matchKey(key, keyBindings.mute)) {
        e.preventDefault();
        handlers.onFlash?.("Toggle Mute");
        handlers.onMuteToggle();
      } else if (matchKey(key, keyBindings.overlay)) {
        e.preventDefault();
        handlers.onFlash?.("Toggle Overlay");
        handlers.onOverlayToggle();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers, keyBindings]);
}
