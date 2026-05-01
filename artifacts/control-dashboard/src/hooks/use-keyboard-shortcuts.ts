import { useEffect } from "react";

type KeyboardShortcutHandlers = {
  onPhase1: () => void;
  onPhase2: () => void;
  onPhase3: () => void;
  onPhase4: () => void;
  onNext: () => void;
  onMuteToggle: () => void;
  onOverlayToggle: () => void;
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

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "1":
          e.preventDefault();
          handlers.onPhase1();
          break;
        case "2":
          e.preventDefault();
          handlers.onPhase2();
          break;
        case "3":
          e.preventDefault();
          handlers.onPhase3();
          break;
        case "4":
          e.preventDefault();
          handlers.onPhase4();
          break;
        case " ":
        case "n":
        case "N":
          e.preventDefault();
          handlers.onNext();
          break;
        case "m":
        case "M":
          e.preventDefault();
          handlers.onMuteToggle();
          break;
        case "o":
        case "O":
          e.preventDefault();
          handlers.onOverlayToggle();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
