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

    def set_intensity(self, intensity: float) -> None:
        self._current.set_intensity(intensity)
        if self._next is not None:
            self._next.set_intensity(intensity)

    def set_theme(self, theme: str) -> None:
        self._current.set_theme(theme)
        if self._next is not None:
            self._next.set_theme(theme)


# ─────────────────────────────────────────────────────────────
#  Status overlay
# ─────────────────────────────────────────────────────────────

OVERLAY_FADE_DURATION = 3.0   # seconds before it fades out
OVERLAY_FADE_TIME = 0.6       # seconds of fade animation


class StatusOverlay:
    def __init__(self) -> None:
        self._timer = 0.0        # counts down; overlay is visible while > 0
        self._alpha = 0.0
        self._font: "pygame.font.Font | None" = None
        # Rich state fields
        self._phase = ""
        self._theme = ""
        self._active_attrs: list[str] = []

    def update_state(self, phase: str, theme: str, active_attrs: list[str]) -> None:
        """Update the information the overlay will display (does not show it)."""
        self._phase = phase
        self._theme = theme
        self._active_attrs = list(active_attrs)

    def show(self, phase: str, theme: str, active_attrs: list[str]) -> None:
        """Show the overlay with updated state and restart the fade timer."""
        self.update_state(phase, theme, active_attrs)
        self._timer = OVERLAY_FADE_DURATION

    def toggle_visibility(self) -> None:
        """Trigger a timed transient show; the overlay auto-fades after OVERLAY_FADE_DURATION."""
        self._timer = OVERLAY_FADE_DURATION

    def update(self, dt: float) -> None:
        if self._timer > 0:
            self._timer = max(0.0, self._timer - dt)
        target_alpha = 1.0 if self._timer > 0 else 0.0
        fade = dt / OVERLAY_FADE_TIME
        if self._alpha < target_alpha:
            self._alpha = min(1.0, self._alpha + fade)
        else:
            self._alpha = max(0.0, self._alpha - fade)

    def _build_lines(self, max_sound_lines: int | None = None) -> list[str]:
        lines = []
        lines.append(f"PHASE   {self._phase.upper() if self._phase else '—'}")
        lines.append(f"THEME   {self._theme if self._theme else '—'}")
        if self._active_attrs:
            # Wrap long sounds lists at ~40 chars per line
            prefix = "SOUNDS  "
            indent = " " * len(prefix)
            char_limit = 40
            sound_lines: list[str] = []
            attrs_per_line: list[int] = []   # how many attrs ended up on each line
            current = ""
            current_count = 0
            for attr in self._active_attrs:
                # Hard-wrap a single token that is itself over the limit
                if len(attr) > char_limit:
                    if current:
                        sound_lines.append(current)
                        attrs_per_line.append(current_count)
                        current = ""
                        current_count = 0
                    sound_lines.append(attr[:char_limit])
                    attrs_per_line.append(1)
                    attr = attr[char_limit:]
                    while len(attr) > char_limit:
                        sound_lines.append(attr[:char_limit])
                        attrs_per_line.append(0)
                        attr = attr[char_limit:]
                    current = attr if attr else ""
                    current_count = 0  # remainder is a continuation; attr was already tallied
                    continue
                item = attr if not current else ", " + attr
                if current and len(current) + len(item) > char_limit:
                    sound_lines.append(current)
                    attrs_per_line.append(current_count)
                    current = attr
                    current_count = 1
                else:
                    current += item
                    current_count += 1
            if current:
                sound_lines.append(current)
                attrs_per_line.append(current_count)

            # Apply max_sound_lines cap: replace overflow with "+ N more" trailer
            if max_sound_lines is not None and len(sound_lines) > max_sound_lines:
                keep = max(1, max_sound_lines - 1)  # reserve one slot for the trailer
                hidden_attrs = sum(attrs_per_line[keep:])
                sound_lines = sound_lines[:keep]
                sound_lines.append(f"+ {hidden_attrs} more")

            lines.append(prefix + sound_lines[0])
            for cont in sound_lines[1:]:
                lines.append(indent + cont)
        else:
            lines.append("SOUNDS  —")
        return lines

    def draw(self, surface) -> None:
        import pygame
        if self._alpha < 0.01:
            return
        if self._font is None:
            self._font = pygame.font.SysFont("monospace", 22, bold=True)

        pad = 14
        line_gap = 6
        by = 18
        bottom_margin = 18

        # Measure a single line height before building lines
        probe = self._font.render("X", True, (240, 240, 240))
        line_h = probe.get_height()

        # How many total lines fit in the safe area?
        sh = surface.get_height()
        max_box_h = sh - by - bottom_margin
        max_total_lines = max(1, (max_box_h - pad * 2 + line_gap) // (line_h + line_gap))

        # PHASE + THEME always occupy 2 lines; the rest go to sounds (minimum 1)
        max_sound_lines = max(1, max_total_lines - 2)

        lines = self._build_lines(max_sound_lines=max_sound_lines)

        # Pre-render each line to find box dimensions
        rendered = [self._font.render(line, True, (240, 240, 240)) for line in lines]
        box_w = max(r.get_width() for r in rendered) + pad * 2
        box_h = len(rendered) * line_h + (len(rendered) - 1) * line_gap + pad * 2

        sw = surface.get_width()
        bx = sw - box_w - 20

        box = pygame.Surface((box_w, box_h), pygame.SRCALPHA)
        box.fill((0, 0, 0, int(self._alpha * 175)))
        pygame.draw.rect(box, (100, 100, 100, int(self._alpha * 120)),
                         (0, 0, box_w, box_h), 1, border_radius=8)

        y = pad
        for r in rendered:
            box.blit(r, (pad, y))
            y += line_h + line_gap

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
#  Startup performance log
# ─────────────────────────────────────────────────────────────

def _log_startup_perf(w: int, h: int) -> None:
    """
    Measure one cold and one warm _draw_gradient call at the actual screen
    resolution, then print the results to the terminal.  This makes it easy
    to verify that the numpy gradient optimisation is hitting its <2ms target
    on real Pi 3 hardware without attaching a profiler.
    """
    import pygame
    from renderers import _draw_gradient

    colors = [
        ((18,  90, 180), 0.0),
        ((82, 160, 220), 0.35),
        ((170, 210, 240), 0.70),
        ((245, 235, 195), 0.90),
        ((255, 248, 220), 1.0),
    ]

    surf = pygame.Surface((w, h))

    # Cold call (first numpy allocation)
    t0 = time.monotonic()
    _draw_gradient(surf, colors)
    cold_ms = (time.monotonic() - t0) * 1000.0

    # Warm call (arrays already in cache)
    t0 = time.monotonic()
    _draw_gradient(surf, colors)
    warm_ms = (time.monotonic() - t0) * 1000.0

    log.info(
        "PERF  gradient fill  %dx%d  cold=%.2f ms  warm=%.2f ms",
        w, h, cold_ms, warm_ms,
    )


def _log_phase_render_perf(w: int, h: int) -> None:
    """
    Instantiate every phase renderer, call draw() once on a temporary surface
    at the actual screen resolution, and log the elapsed time in ms.

    This runs once at startup (before the main loop) so that slow layers
    (e.g. aurora, treeline, mist) are caught early — particularly useful on
    Pi 3 where a single frame budget is ~16 ms at 60 fps.
    """
    import pygame
    from renderers import RENDERERS

    surf = pygame.Surface((w, h))

    for phase_name, renderer_cls in RENDERERS.items():
        renderer = renderer_cls()
        # Advance by zero seconds so layers initialise their internal state
        # without advancing any animation, then time a single full draw().
        renderer.update(0.0, w, h)
        t0 = time.monotonic()
        renderer.draw(surf)
        elapsed_ms = (time.monotonic() - t0) * 1000.0
        log.info(
            "PERF  phase render   %-8s  %dx%d  %.2f ms",
            phase_name, w, h, elapsed_ms,
        )


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
        self._environment_theme = "forest"
        self._intensity = 1.0
        self._enabled_attrs: set[str] = set()   # tracks which audio attributes are on
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

        if not pygame.display.get_init():
            raise RuntimeError(
                "pygame video system failed to initialise — check that "
                "SDL_VIDEODRIVER=kmsdrm is supported on this device and that "
                "/dev/dri is accessible"
            )

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

        _log_startup_perf(w, h)
        _log_phase_render_perf(w, h)

        # Initial renderer — apply default theme/intensity before first state event
        renderer = make_renderer(self._current_phase)
        renderer.set_theme(self._environment_theme)
        renderer.set_intensity(self._intensity)
        self._transition = TransitionManager(renderer)
        self._overlay.show(
            self._current_phase,
            self._environment_theme,
            sorted(self._enabled_attrs),
        )

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
            phase = msg.get("currentPhase", self._current_phase)
            theme = msg.get("environmentTheme", self._environment_theme)
            intensity = msg.get("intensity", self._intensity)

            # Phase change → cross-fade to new renderer
            phase_changed = phase != self._current_phase
            if phase_changed:
                self._current_phase = phase
                new_renderer = make_renderer(phase)
                # Carry over current theme/intensity so visuals don't flash
                new_renderer.set_theme(self._environment_theme)
                new_renderer.set_intensity(self._intensity)
                self._transition.transition_to(new_renderer)

            # Environment theme change → update colour tint on active renderer(s)
            if theme != self._environment_theme:
                self._environment_theme = theme
                self._transition.set_theme(theme)

            # Intensity change → update brightness overlay on active renderer(s)
            if intensity != self._intensity:
                self._intensity = intensity
                self._transition.set_intensity(intensity)

            # Apply attribute states and track which ones are enabled
            attrs = msg.get("attributes", {})
            for attr_name, attr_state in attrs.items():
                enabled = attr_state.get("enabled", False) if isinstance(attr_state, dict) else False
                self._transition.set_attribute(attr_name, enabled)
                if enabled:
                    self._enabled_attrs.add(attr_name)
                else:
                    self._enabled_attrs.discard(attr_name)

            # Always keep overlay state current; show it on phase transitions
            self._overlay.update_state(
                self._current_phase,
                self._environment_theme,
                sorted(self._enabled_attrs),
            )
            if phase_changed:
                self._overlay.show(
                    self._current_phase,
                    self._environment_theme,
                    sorted(self._enabled_attrs),
                )

        elif msg_type == "overlay_toggle":
            # State is already current from the last "state" message
            self._overlay.toggle_visibility()


# ─────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────

_SDL_HINT = (
    "Set SDL_VIDEODRIVER to one of:\n"
    "  SDL_VIDEODRIVER=x11       — standard X11 desktop session (DISPLAY=:0 must also be set)\n"
    "  SDL_VIDEODRIVER=kmsdrm    — Raspberry Pi without X, direct KMS/DRM (needs /dev/dri)\n"
    "  SDL_VIDEODRIVER=offscreen — headless / CI / test environment\n"
    "If running under systemd or supervisord, add the variable to the [Service] "
    "environment block so the process manager can restart after failures."
)


def main() -> None:
    args = parse_args()
    app = AtmosphereApp(args)
    try:
        app.run()
    except KeyboardInterrupt:
        log.info("Interrupted — exiting")
    except RuntimeError as exc:
        log.error("Display startup failed: %s", exc)
        log.error(_SDL_HINT)
        sys.exit(1)
    except Exception as exc:
        log.error("Unexpected error in display app: %s", exc)
        log.error(
            "If this is a video or display initialisation error, check that the "
            "DISPLAY environment variable is set correctly for X11, or that "
            "/dev/dri is accessible for KMS/DRM mode."
        )
        log.error(_SDL_HINT)
        sys.exit(1)


if __name__ == "__main__":
    main()
