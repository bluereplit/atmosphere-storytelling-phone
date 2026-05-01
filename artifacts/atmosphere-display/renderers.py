"""
Theme renderer classes — one per phase (Daytime, Evening, Night, Dawn).

Each renderer:
  update(dt, w, h)     — advance animation state each frame
  draw(surface)        — composite background + all active layers onto surface
  set_attribute(name, enabled)  — enable/disable a named attribute layer

Attribute → visual-layer mapping uses the backend's audio attribute names
as-is where they match (birds, campfire→fireflies, owls→moon, etc.).
"""
from __future__ import annotations
import math
import random
import numpy as np
import pygame
from layers import (
    SunbeamsLayer, BirdsLayer,
    FirefliesLayer, EveningCloudsLayer,
    MoonLayer, StarsLayer, AuroraLayer,
    MistLayer, DawnBirdsLayer,
)
from env_overlays import make_overlay, BaseOverlay

TWO_PI = math.pi * 2

OVERLAY_TRANSITION_DURATION = 1.5   # seconds for env-theme overlay crossfade

# ─────────────────────────────────────────────────────────────
#  Environment theme → colour tint
# Each theme adds a subtle RGBA tint overlay on top of the phase
# background so visual and audio environment stay in sync.
# Alpha values are intentionally small (15–45) to keep the scene
# readable across all phase backgrounds.
# ─────────────────────────────────────────────────────────────

THEME_TINTS: dict[str, tuple[int, int, int, int]] = {
    "forest":     (20,  80,  20,  22),   # muted green canopy
    "ocean":      (15,  55, 110,  28),   # deep blue-teal
    "mountain":   (90,  95, 115,  18),   # cool slate-grey
    "desert":     (130, 75,  15,  22),   # warm sand-orange
    "city":       (70,  70,  95,  18),   # urban grey-blue
    "mystical":   (80,  15, 130,  25),   # violet-purple
    "medieval":   (90,  55,  15,  20),   # amber torchlight
    "underwater": ( 8,  55, 130,  40),   # deep aqua
    "cosmic":     (15,   8,  65,  30),   # deep-space indigo
    "cave":       ( 5,   5,  15,  50),   # almost black
    "arctic":     (170, 210, 240, 22),   # cold blue-white
    "jungle":     ( 8,  80,  20,  35),   # dense emerald
    "tavern":     (90,  40,   8,  22),   # warm amber-brown
}


def _draw_gradient(surface: pygame.Surface,
                   colors: list[tuple[tuple, float]]) -> None:
    """
    Draw a vertical gradient from top to bottom using numpy vectorized ops.
    `colors` is a list of (rgb_tuple, stop) where stop is 0.0–1.0.
    Stops must be sorted ascending.

    Strategy: compute per-row RGB via numpy linspace/interpolation, write into
    a 1-pixel-wide surface via surfarray, then scale horizontally with
    pygame.transform.scale (pure C, no Python loop per row).

    Replaces the old line-by-line pygame.draw.line loop which cost 10–30ms at
    1080p on Pi 3. This version typically completes in <2ms.
    """
    w, h = surface.get_size()

    # Normalized position for each row: shape (h,)
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)

    # Per-row RGB: shape (h, 3), default to the last stop's color
    result = np.empty((h, 3), dtype=np.float32)
    result[:] = colors[-1][0]

    for i in range(len(colors) - 1):
        c0_rgb, t0 = colors[i]
        c1_rgb, t1 = colors[i + 1]
        mask = (t >= t0) & (t <= t1)
        if not np.any(mask):
            continue
        seg = (t[mask] - t0) / max(1e-9, t1 - t0)  # (n,)
        c0 = np.array(c0_rgb, dtype=np.float32)
        c1 = np.array(c1_rgb, dtype=np.float32)
        result[mask] = c0 + (c1 - c0) * seg[:, np.newaxis]

    result_u8 = np.clip(result, 0, 255).astype(np.uint8)  # (h, 3)

    # Write into a 1-pixel-wide surface; pixels3d shape is (1, h, 3)
    thin = pygame.Surface((1, h))
    pixel_array = pygame.surfarray.pixels3d(thin)
    pixel_array[:] = result_u8[np.newaxis]
    del pixel_array  # release the surface lock

    # Scale horizontally to full width (pure C, copies each row to all columns)
    surface.blit(pygame.transform.scale(thin, (w, h)), (0, 0))


def _draw_clouds(surface: pygame.Surface, clouds: list[dict],
                 color: tuple, outline: tuple | None = None) -> None:
    for c in clouds:
        for dx, dy, r in c["blobs"]:
            cx = int(c["x"] + dx)
            cy = int(c["y"] + dy)
            pygame.draw.ellipse(surface, color,
                                (cx - r, cy - r // 2, r * 2, r))
            if outline:
                pygame.draw.ellipse(surface, outline,
                                    (cx - r, cy - r // 2, r * 2, r), 1)


# ─────────────────────────────────────────────────────────────
#  Base renderer
# ─────────────────────────────────────────────────────────────

class BaseRenderer:
    ATTRIBUTE_MAP: dict[str, str] = {}   # audio_attr_name → layer_attr_name

    def __init__(self) -> None:
        self._layers: dict[str, object] = {}
        self._bg: pygame.Surface | None = None
        self._time = 0.0
        self._intensity: float = 1.0    # 0.0–1.0 from backend
        self._theme: str = "forest"     # current environment theme
        # Overlay crossfade state
        # _theme_initialised is False until the first set_theme() call so the
        # renderer can snap directly to the correct overlay without a crossfade
        # from the default "forest" overlay.
        self._theme_initialised: bool = False
        self._current_overlay: BaseOverlay = make_overlay("forest")
        self._next_overlay: BaseOverlay | None = None
        self._overlay_progress: float = 1.0   # 1.0 = settled on _current_overlay

    def _ensure_bg(self, w: int, h: int) -> pygame.Surface:
        if self._bg is None or self._bg.get_size() != (w, h):
            self._bg = pygame.Surface((w, h))
            self._paint_bg(self._bg)
        return self._bg

    def _paint_bg(self, surface: pygame.Surface) -> None:
        pass  # subclasses override

    def update(self, dt: float, w: int, h: int) -> None:
        self._time += dt
        for layer in self._layers.values():
            layer.update(dt, w, h)
        # Advance overlay crossfade
        self._current_overlay.update(dt, w, h)
        if self._next_overlay is not None:
            self._next_overlay.update(dt, w, h)
            self._overlay_progress = min(1.0,
                self._overlay_progress + dt / OVERLAY_TRANSITION_DURATION)
            if self._overlay_progress >= 1.0:
                self._current_overlay = self._next_overlay
                self._next_overlay = None

    def draw(self, surface: pygame.Surface) -> None:
        w, h = surface.get_size()
        bg = self._ensure_bg(w, h)
        surface.blit(bg, (0, 0))
        self._draw_animated(surface, w, h)
        for layer in self._layers.values():
            layer.draw(surface)
        # Apply environment-theme colour tint
        tint = THEME_TINTS.get(self._theme)
        if tint is not None:
            tint_surf = pygame.Surface((w, h), pygame.SRCALPHA)
            tint_surf.fill(tint)
            surface.blit(tint_surf, (0, 0))
        # Draw environment overlays with crossfade
        self._current_overlay._alpha = 1.0 - self._overlay_progress \
            if self._next_overlay is not None else 1.0
        self._current_overlay.draw(surface)
        if self._next_overlay is not None:
            self._next_overlay._alpha = self._overlay_progress
            self._next_overlay.draw(surface)
        # Apply intensity darkening: at intensity=0 → max ~70% darkness overlay
        dim_alpha = int((1.0 - max(0.0, min(1.0, self._intensity))) * 180)
        if dim_alpha > 2:
            dim_surf = pygame.Surface((w, h), pygame.SRCALPHA)
            dim_surf.fill((0, 0, 0, dim_alpha))
            surface.blit(dim_surf, (0, 0))

    def _draw_animated(self, surface: pygame.Surface, w: int, h: int) -> None:
        pass  # subclasses add animated elements on top of bg

    def set_attribute(self, audio_name: str, enabled: bool) -> None:
        layer_name = self.ATTRIBUTE_MAP.get(audio_name)
        if layer_name and layer_name in self._layers:
            self._layers[layer_name].enabled = enabled

    def set_intensity(self, intensity: float) -> None:
        self._intensity = max(0.0, min(1.0, intensity))

    def set_theme(self, theme: str) -> None:
        if theme == self._theme and self._theme_initialised:
            return
        old_theme = self._theme
        self._theme = theme
        new_overlay = make_overlay(theme)
        if not self._theme_initialised:
            # First call — snap immediately, no crossfade needed
            self._current_overlay = new_overlay
            self._next_overlay = None
            self._overlay_progress = 1.0
            self._theme_initialised = True
            return
        self._theme_initialised = True
        if theme == old_theme:
            return
        if self._next_overlay is not None:
            # Already mid-transition: cut to current in-progress target, restart
            self._current_overlay = self._next_overlay
        self._next_overlay = new_overlay
        self._overlay_progress = 0.0


# ─────────────────────────────────────────────────────────────
#  Daytime
# ─────────────────────────────────────────────────────────────

class DaytimeRenderer(BaseRenderer):
    """
    Clear sky from deep azure at top to pale gold at horizon.
    Animated: drifting cumulus clouds, sun disc with bloom.
    Layers: sunbeams (driven by "wind" attribute), birds ("birds" attribute).
    """
    ATTRIBUTE_MAP = {"wind": "sunbeams", "birds": "birds"}

    def __init__(self) -> None:
        super().__init__()
        self._layers = {
            "sunbeams": SunbeamsLayer(),
            "birds": BirdsLayer(),
        }
        self._clouds: list[dict] = []
        self._spawn_clouds()

    def _paint_bg(self, surface: pygame.Surface) -> None:
        _draw_gradient(surface, [
            ((18,  90, 180), 0.0),   # deep azure top
            ((82, 160, 220), 0.35),  # mid sky blue
            ((170, 210, 240), 0.70), # light sky
            ((245, 235, 195), 0.90), # warm horizon gold
            ((255, 248, 220), 1.0),  # pale cream at ground
        ])

    def _spawn_clouds(self) -> None:
        for _ in range(6):
            self._clouds.append(self._make_cloud())

    def _make_cloud(self, start_x: int = -1) -> dict:
        if start_x < 0:
            start_x = random.randint(0, 2000)
        return {
            "x": float(start_x),
            "y": random.uniform(80, 320),
            "vx": random.uniform(10, 26),
            "blobs": [
                (random.randint(30, 100), random.randint(0, 50),
                 random.randint(28, 70))
                for _ in range(random.randint(4, 8))
            ],
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        for c in self._clouds:
            c["x"] += c["vx"] * dt
        self._clouds = [c for c in self._clouds if c["x"] < w + 250]
        while len(self._clouds) < 6:
            self._clouds.append(self._make_cloud(start_x=-220))

    def _draw_animated(self, surface: pygame.Surface, w: int, h: int) -> None:
        sx, sy = int(w * 0.22), int(h * 0.12)
        pulse = 0.9 + 0.1 * math.sin(self._time * 0.3)
        for r, a in [(90, 14), (65, 28), (48, 48), (35, 75)]:
            glow = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
            pygame.draw.circle(glow, (255, 248, 180, int(a * pulse)), (r, r), r)
            surface.blit(glow, (sx - r, sy - r))
        pygame.draw.circle(surface, (255, 252, 220), (sx, sy), 28)
        _draw_clouds(surface, self._clouds, (255, 255, 255), (235, 235, 250))


# ─────────────────────────────────────────────────────────────
#  Evening
# ─────────────────────────────────────────────────────────────

class EveningRenderer(BaseRenderer):
    """
    Amber-to-crimson sunset with dark cloud silhouettes near the horizon.
    Layers: fireflies ("campfire" attribute), extra clouds ("wind" attribute).
    """
    ATTRIBUTE_MAP = {"campfire": "fireflies", "wind": "clouds"}

    def __init__(self) -> None:
        super().__init__()
        self._layers = {
            "fireflies": FirefliesLayer(),
            "clouds": EveningCloudsLayer(),
        }
        self._clouds_base: list[dict] = []
        self._spawn_clouds()

    def _paint_bg(self, surface: pygame.Surface) -> None:
        _draw_gradient(surface, [
            ((30,  15,  55), 0.0),   # deep violet top
            ((100,  40,  80), 0.30), # purple-crimson
            ((200,  85,  30), 0.60), # amber-orange
            ((235, 145,  40), 0.80), # warm gold
            ((250, 200, 100), 0.92), # bright horizon
            ((255, 220, 150), 1.0),  # pale gold ground
        ])

    def _spawn_clouds(self) -> None:
        for _ in range(5):
            self._clouds_base.append(self._make_cloud())

    def _make_cloud(self, start_x: int = -1) -> dict:
        if start_x < 0:
            start_x = random.randint(0, 2000)
        return {
            "x": float(start_x),
            "y": random.uniform(300, 480),
            "vx": random.uniform(6, 16),
            "blobs": [
                (random.randint(30, 90), random.randint(0, 40), random.randint(22, 55))
                for _ in range(random.randint(4, 7))
            ],
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        for c in self._clouds_base:
            c["x"] += c["vx"] * dt
        self._clouds_base = [c for c in self._clouds_base if c["x"] < w + 250]
        while len(self._clouds_base) < 5:
            self._clouds_base.append(self._make_cloud(start_x=-220))

    def _draw_animated(self, surface: pygame.Surface, w: int, h: int) -> None:
        _draw_clouds(surface, self._clouds_base, (22, 12, 35))


# ─────────────────────────────────────────────────────────────
#  Night
# ─────────────────────────────────────────────────────────────

class NightRenderer(BaseRenderer):
    """
    Deep navy-to-black sky with always-on star field.
    Layers: moon ("owls" attribute), aurora ("choir_pad" attribute),
    extra star density ("crickets" attribute).
    """
    ATTRIBUTE_MAP = {"owls": "moon", "choir_pad": "aurora", "crickets": "stars"}

    def __init__(self) -> None:
        super().__init__()
        # Stars are always faintly visible at night (enabled by default)
        stars = StarsLayer()
        stars.enabled = True
        stars.alpha = 1.0
        self._layers = {
            "stars": stars,
            "moon": MoonLayer(),
            "aurora": AuroraLayer(),
        }
        self._treeline: pygame.Surface | None = None

    def _paint_bg(self, surface: pygame.Surface) -> None:
        _draw_gradient(surface, [
            ((4,   4,  14), 0.0),   # near-black zenith
            ((8,  16,  40), 0.45),  # dark navy
            ((14,  28,  55), 0.70), # slightly lighter navy
            ((18,  35,  60), 0.88), # dark horizon
            ((10,  15,  25), 1.0),  # dark ground
        ])

    def _ensure_treeline(self, w: int, h: int) -> pygame.Surface:
        if self._treeline is None or self._treeline.get_size() != (w, h):
            self._treeline = pygame.Surface((w, h), pygame.SRCALPHA)
            rng = random.Random(42)  # fixed seed for consistent silhouette
            x = 0
            while x < w:
                tree_h = rng.randint(int(h * 0.08), int(h * 0.22))
                tree_w = rng.randint(25, 55)
                tip_y = h - tree_h
                # Pine triangle
                pts = [
                    (x + tree_w // 2, tip_y),
                    (x, h),
                    (x + tree_w, h),
                ]
                pygame.draw.polygon(self._treeline, (8, 12, 20, 255), pts)
                x += tree_w - rng.randint(5, 18)
        return self._treeline

    def _draw_animated(self, surface: pygame.Surface, w: int, h: int) -> None:
        tl = self._ensure_treeline(w, h)
        surface.blit(tl, (0, 0))


# ─────────────────────────────────────────────────────────────
#  Dawn
# ─────────────────────────────────────────────────────────────

class DawnRenderer(BaseRenderer):
    """
    Soft pink-lavender sky brightening toward gold at the horizon.
    Layers: mist ("stream" attribute), birds ("birds" attribute).
    """
    ATTRIBUTE_MAP = {"stream": "mist", "birds": "birds"}

    def __init__(self) -> None:
        super().__init__()
        # Mist is always faintly present at dawn
        mist = MistLayer()
        mist.enabled = True
        mist.alpha = 0.6
        self._layers = {
            "mist": mist,
            "birds": DawnBirdsLayer(),
        }

    def _paint_bg(self, surface: pygame.Surface) -> None:
        _draw_gradient(surface, [
            ((38,  22,  60), 0.0),   # deep violet-blue top
            ((100,  60, 130), 0.25), # lavender
            ((185, 130, 185), 0.50), # soft pink-purple
            ((235, 170, 150), 0.70), # warm pink
            ((250, 215, 170), 0.85), # golden pink horizon
            ((255, 240, 210), 1.0),  # pale cream ground
        ])

    def _draw_animated(self, surface: pygame.Surface, w: int, h: int) -> None:
        # Subtle horizon glow — vectorised via numpy + surfarray.
        # Replaces the old per-row pygame.draw.line loop (~glow_h calls/frame).
        glow_h = int(h * 0.10)
        glow_y = int(h * 0.72)
        pulse = 0.7 + 0.3 * math.sin(self._time * 0.25)

        # Alpha ramp: top row = full intensity, bottom row = transparent
        t = np.linspace(1.0, 0.0, glow_h, dtype=np.float32)
        alphas = np.clip(t * 55.0 * pulse, 0, 255).astype(np.uint8)  # (glow_h,)

        # 1-px-wide SRCALPHA surface; set RGB channels and alpha via surfarray
        thin = pygame.Surface((1, glow_h), pygame.SRCALPHA)
        rgb_arr = pygame.surfarray.pixels3d(thin)   # shape (1, glow_h, 3)
        rgb_arr[0, :, 0] = 255
        rgb_arr[0, :, 1] = 200
        rgb_arr[0, :, 2] = 120
        del rgb_arr                                  # release surface lock
        alpha_arr = pygame.surfarray.pixels_alpha(thin)  # shape (1, glow_h)
        alpha_arr[0, :] = alphas
        del alpha_arr                                # release surface lock

        # Scale to full width (pure-C blit, no Python loop) then composite
        surface.blit(pygame.transform.scale(thin, (w, glow_h)), (0, glow_y))


# ─────────────────────────────────────────────────────────────
#  Factory
# ─────────────────────────────────────────────────────────────

RENDERERS: dict[str, type] = {
    "daytime": DaytimeRenderer,
    "evening": EveningRenderer,
    "night":   NightRenderer,
    "dawn":    DawnRenderer,
}


def make_renderer(phase: str) -> BaseRenderer:
    cls = RENDERERS.get(phase, DaytimeRenderer)
    return cls()
