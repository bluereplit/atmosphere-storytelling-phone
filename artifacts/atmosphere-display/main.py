"""
Atmosphere Storytelling Display — fullscreen pygame visual renderer.

Usage (Raspberry Pi with X11):
    DISPLAY=:0 python main.py

Usage (Raspberry Pi without X11, KMS/DRM):
    SDL_VIDEODRIVER=kmsdrm python main.py

Usage (development / headless, offscreen render):
    SDL_VIDEODRIVER=offscreen python main.py

Optional flags:
    --display :0          Override DISPLAY env var (X11 only)
    --ws-url ws://...     Override backend WebSocket URL
    --no-fullscreen       Run in a window instead of fullscreen (dev only)
    --fps 60              Target frame rate (default 60)
"""
from __future__ import annotations

import argparse
import logging
import math
import os
import queue
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
log = logging.getLogger("atm-display")


# ─────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Atmosphere visual display")
    p.add_argument("--display", default=None,
                   help="Override DISPLAY env var (e.g. :0)")
    p.add_argument("--ws-url", default=None,
                   help="WebSocket URL (default: ws://localhost:<PORT>/ws)")
    p.add_argument("--ws-port", type=int, default=8080,
                   help="Backend port when building default ws-url (default 8080)")
    p.add_argument("--no-fullscreen", action="store_true",
                   help="Run in a window (development)")
    p.add_argument("--fps", type=int, default=60,
                   help="Target frame rate (default 60)")
    return p.parse_args()


# ─────────────────────────────────────────────────────────────
#  Transition manager
# ─────────────────────────────────────────────────────────────

TRANSITION_DURATION = 2.0   # seconds


class TransitionManager:
    """
    Cross-fades between two renderers over TRANSITION_DURATION seconds.
    While transitioning, draws old renderer, then blits new renderer with
    increasing alpha.
    """

    def __init__(self, renderer) -> None:
        self._current = renderer
        self._next = None
        self._progress = 1.0   # 1.0 = fully settled on _current

    @property
    def active_renderer(self):
        return self._next if self._next is not None else self._current

    def transition_to(self, renderer) -> None:
        if renderer.__class__ is self._current.__class__:
            # same type — no visual change needed
            return
        if self._next is not None:
            # cut immediately to the in-progress "next" and start fresh
            self._current = self._next
        self._next = renderer
        self._progress = 0.0

    def update(self, dt: float, w: int, h: int) -> None:
        self._current.update(dt, w, h)
        if self._next is not None:
            self._next.update(dt, w, h)
            self._progress = min(1.0, self._progress + dt / TRANSITION_DURATION)
            if self._progress >= 1.0:
                self._current = self._next
                self._next = None

    def draw(self, surface) -> None:
        import pygame
        w, h = surface.get_size()
        self._current.draw(surface)
        if self._next is not None and self._progress > 0.001:
            next_surf = pygame.Surface((w, h))
            self._next.draw(next_surf)
            next_surf.set_alpha(int(self._progress * 255))
            surface.blit(next_surf, (0, 0))

    def set_attribute(self, audio_name: str, enabled: bool) -> None:
        self.active_renderer.set_attribute(audio_name, enabled)


# ─────────────────────────────────────────────────────────────
#  Status overlay
# ─────────────────────────────────────────────────────────────

OVERLAY_FADE_DURATION = 3.0   # seconds before it fades out
OVERLAY_FADE_TIME = 0.6       # seconds of fade animation


class StatusOverlay:
    def __init__(self) -> None:
        self._visible = False    # toggled by overlay_toggle event
        self._text = ""
        self._timer = 0.0        # counts down after show()
        self._alpha = 0.0
        self._font: "pygame.font.Font | None" = None

    def show(self, text: str) -> None:
        self._text = text
        self._timer = OVERLAY_FADE_DURATION

    def toggle_visibility(self) -> None:
        self._visible = not self._visible

    def update(self, dt: float) -> None:
        if self._timer > 0:
            self._timer = max(0.0, self._timer - dt)
        # alpha target: visible if either manually shown or timer running
        target_alpha = 1.0 if (self._visible or self._timer > 0) else 0.0
        fade = dt / OVERLAY_FADE_TIME
        if self._alpha < target_alpha:
            self._alpha = min(1.0, self._alpha + fade)
        else:
            self._alpha = max(0.0, self._alpha - fade)

    def draw(self, surface) -> None:
        import pygame
        if self._alpha < 0.01:
            return
        if self._font is None:
            self._font = pygame.font.SysFont("monospace", 22, bold=True)
        label = self._font.render(self._text, True, (240, 240, 240))
        pad = 12
        box_w = label.get_width() + pad * 2
        box_h = label.get_height() + pad
        sw = surface.get_width()
        bx = sw - box_w - 20
        by = 18
        box = pygame.Surface((box_w, box_h), pygame.SRCALPHA)
        box.fill((0, 0, 0, int(self._alpha * 160)))
        pygame.draw.rect(box, (80, 80, 80, int(self._alpha * 100)),
                         (0, 0, box_w, box_h), 1, border_radius=6)
        box.blit(label, (pad, pad // 2))
        surface.blit(box, (bx, by))


# ─────────────────────────────────────────────────────────────
#  Standby screen
# ─────────────────────────────────────────────────────────────

class StandbyScreen:
    def __init__(self) -> None:
        self._time = 0.0
        self._font = None

    def update(self, dt: float) -> None:
        self._time += dt

    def draw(self, surface) -> None:
        import pygame
        w, h = surface.get_size()
        t = self._time
        # Animated dark gradient that slowly pulses
        for y in range(h):
            ratio = y / max(1, h - 1)
            wave = math.sin(ratio * math.pi + t * 0.4) * 0.5 + 0.5
            r = int(8 + wave * 12)
            g = int(8 + wave * 15)
            b = int(20 + wave * 25)
            pygame.draw.line(surface, (r, g, b), (0, y), (w, y))

        if self._font is None:
            self._font = pygame.font.SysFont("monospace", 28)
        pulse = int(140 + 80 * (math.sin(t * 1.2) * 0.5 + 0.5))
        msg = self._font.render("Awaiting signal\u2026", True, (pulse, pulse, pulse))
        surface.blit(msg, (w // 2 - msg.get_width() // 2,
                           h // 2 - msg.get_height() // 2))


# ─────────────────────────────────────────────────────────────
#  App
# ─────────────────────────────────────────────────────────────

STANDBY_DELAY = 2.0        # seconds of disconnect before entering standby
STANDBY_FADE_SPEED = 1.5   # standby overlay reaches full opacity in ~0.67 s


class AtmosphereApp:
    def __init__(self, args: argparse.Namespace) -> None:
        self._args = args
        self._event_queue: queue.Queue = queue.Queue(maxsize=64)
        self._ws_client = None
        self._transition: TransitionManager | None = None
        self._standby = StandbyScreen()
        self._overlay = StatusOverlay()
        self._current_phase = "daytime"
        self._running = False
        # Smooth standby transition: 0.0 = fully in scene, 1.0 = fully in standby
        self._standby_alpha = 0.0

    # ----------------------------------------------------------------- lifecycle

    def run(self) -> None:
        import pygame
        from ws_client import WSClient
        from renderers import make_renderer

        # ── WebSocket client ──────────────────────────────────────
        ws_url = (
            self._args.ws_url
            or f"ws://localhost:{self._args.ws_port}/ws"
        )
        log.info("Connecting to %s", ws_url)
        self._ws_client = WSClient(ws_url, self._event_queue)
        self._ws_client.start()

        # ── pygame ────────────────────────────────────────────────
        if self._args.display:
            os.environ["DISPLAY"] = self._args.display

        pygame.init()
        pygame.mouse.set_visible(False)

        flags = pygame.HWSURFACE | pygame.DOUBLEBUF
        if not self._args.no_fullscreen:
            flags |= pygame.FULLSCREEN

        try:
            info = pygame.display.Info()
            w, h = info.current_w, info.current_h
            if w <= 0 or h <= 0:
                w, h = 1920, 1080
        except Exception:
            w, h = 1920, 1080

        # Fallback for headless/offscreen
        if os.environ.get("SDL_VIDEODRIVER") == "offscreen":
            flags = 0
            w, h = 1920, 1080

        screen = pygame.display.set_mode((w, h), flags)
        pygame.display.set_caption("Atmosphere Display")
        clock = pygame.time.Clock()

        # Initial renderer
        renderer = make_renderer(self._current_phase)
        self._transition = TransitionManager(renderer)
        self._overlay.show(self._current_phase)

        log.info("Display %dx%d @ %dfps", w, h, self._args.fps)

        self._running = True
        prev_time = time.monotonic()

        while self._running:
            now = time.monotonic()
            dt = min(now - prev_time, 0.05)   # cap at 50 ms
            prev_time = now

            self._handle_pygame_events()
            self._drain_ws_queue(w, h)

            disc = self._ws_client.seconds_since_disconnect
            want_standby = disc is not None and disc >= STANDBY_DELAY

            # Smoothly ramp standby blend in/out
            if want_standby:
                self._standby_alpha = min(1.0, self._standby_alpha + STANDBY_FADE_SPEED * dt)
            else:
                self._standby_alpha = max(0.0, self._standby_alpha - STANDBY_FADE_SPEED * dt)

            self._standby.update(dt)
            self._transition.update(dt, w, h)
            self._overlay.update(dt)

            # Draw scene, then blend standby overlay on top when transitioning
            self._transition.draw(screen)
            if self._standby_alpha > 0.001:
                standby_surf = pygame.Surface((w, h))
                self._standby.draw(standby_surf)
                standby_surf.set_alpha(int(self._standby_alpha * 255))
                screen.blit(standby_surf, (0, 0))

            self._overlay.draw(screen)
            pygame.display.flip()
            clock.tick(self._args.fps)

        pygame.quit()

    # ----------------------------------------------------------------- events

    def _handle_pygame_events(self) -> None:
        import pygame
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self._running = False
            elif event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_ESCAPE, pygame.K_q):
                    self._running = False

    def _drain_ws_queue(self, w: int, h: int) -> None:
        from renderers import make_renderer
        try:
            while True:
                msg = self._event_queue.get_nowait()
                self._apply_message(msg, w, h)
        except queue.Empty:
            pass

    def _apply_message(self, msg: dict, w: int, h: int) -> None:
        from renderers import make_renderer
        msg_type = msg.get("type")

        if msg_type == "state":
            # NOTE: The visual renderer tracks `currentPhase` (the time-of-day scene:
            # daytime / evening / night / dawn), NOT `environmentTheme` (the 13 audio
            # themes: forest, ocean, cave, …).  The visual scene corresponds to phase;
            # environment theme is an audio-only concept in this version. The field is
            # named `currentPhase` in both the backend WsStateEvent and this renderer.
            phase = msg.get("currentPhase", self._current_phase)
            if phase != self._current_phase:
                self._current_phase = phase
                new_renderer = make_renderer(phase)
                self._transition.transition_to(new_renderer)
                self._overlay.show(phase.upper())

            # Apply attribute states
            attrs = msg.get("attributes", {})
            for attr_name, attr_state in attrs.items():
                enabled = attr_state.get("enabled", False) if isinstance(attr_state, dict) else False
                self._transition.set_attribute(attr_name, enabled)

        elif msg_type == "overlay_toggle":
            self._overlay.toggle_visibility()


# ─────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()
    app = AtmosphereApp(args)
    try:
        app.run()
    except KeyboardInterrupt:
        log.info("Interrupted — exiting")
    except Exception:
        log.exception("Fatal error in display app")
        sys.exit(1)


if __name__ == "__main__":
    main()
