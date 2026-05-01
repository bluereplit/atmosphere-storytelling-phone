"""
Environment-theme visual overlay system.

Each of the 13 environment themes maps to a decorator class that renders
a semi-transparent particle/silhouette overlay on top of the phase background.
Overlays cross-fade when the theme changes (same mechanism as phase transitions).

Public API
----------
make_overlay(theme: str) -> BaseOverlay
    Factory — returns the overlay for the given theme name.
    Returns NullOverlay (draws nothing) for unknown themes.

BaseOverlay.update(dt, w, h)
BaseOverlay.draw(surface)    — blits a SRCALPHA surface onto `surface`
"""
from __future__ import annotations
import math
import random
import pygame

TWO_PI = math.pi * 2


# ─────────────────────────────────────────────────────────────
#  Base
# ─────────────────────────────────────────────────────────────

class BaseOverlay:
    """
    Base class.  Subclasses implement _render(w, h) -> pygame.Surface | None
    (same pattern as layers.BaseLayer).  `draw` composites the returned surface
    onto the destination at the overlay's master alpha.
    """

    def __init__(self) -> None:
        self._time = 0.0
        self._alpha = 1.0   # master opacity set by OverlayTransitionManager

    def update(self, dt: float, w: int, h: int) -> None:
        self._time += dt

    def draw(self, dst: pygame.Surface) -> None:
        if self._alpha <= 0.001:
            return
        w, h = dst.get_size()
        surf = self._render(w, h)
        if surf is not None:
            surf.set_alpha(int(self._alpha * 255))
            dst.blit(surf, (0, 0))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        return None


class NullOverlay(BaseOverlay):
    """No decoration — used for unrecognised themes and as a base for clearing."""
    pass


# ─────────────────────────────────────────────────────────────
#  Forest — drifting autumn leaf particles
# ─────────────────────────────────────────────────────────────

class ForestOverlay(BaseOverlay):
    _COLORS = [
        (120, 180,  60, 190),   # fresh green
        (160, 210,  80, 180),   # lime green
        ( 80, 140,  40, 200),   # dark green
        (200, 150,  40, 180),   # amber leaf
        (210,  80,  20, 170),   # autumn orange
    ]

    def __init__(self) -> None:
        super().__init__()
        self._leaves: list[dict] = []

    def _make_leaf(self, w: int, h: int, from_top: bool = False) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": -20.0 if from_top else random.uniform(-20, h),
            "vx": random.uniform(-30, 30),
            "vy": random.uniform(18, 55),
            "rot": random.uniform(0, TWO_PI),
            "rot_speed": random.uniform(-2.5, 2.5),
            "swing": random.random() * TWO_PI,
            "swing_amp": random.uniform(8, 28),
            "swing_freq": random.uniform(0.6, 1.8),
            "size": random.randint(5, 12),
            "color": random.choice(self._COLORS),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        while len(self._leaves) < 50:
            self._leaves.append(self._make_leaf(w, h))
        for lf in self._leaves:
            lf["y"] += lf["vy"] * dt
            lf["x"] += (lf["vx"] + lf["swing_amp"] *
                         math.sin(self._time * lf["swing_freq"] + lf["swing"])) * dt
            lf["rot"] += lf["rot_speed"] * dt
        self._leaves = [lf for lf in self._leaves if lf["y"] < h + 20]
        while len(self._leaves) < 50:
            self._leaves.append(self._make_leaf(w, h, from_top=True))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for lf in self._leaves:
            cx, cy = int(lf["x"]), int(lf["y"])
            s = lf["size"]
            r, g, b_, a = lf["color"]
            pts = []
            for i in range(6):
                ang = lf["rot"] + i * TWO_PI / 6
                pts.append((cx + int(math.cos(ang) * s),
                             cy + int(math.sin(ang) * s * 0.55)))
            if len(pts) >= 3:
                pygame.draw.polygon(surf, (r, g, b_, a), pts)
        return surf


# ─────────────────────────────────────────────────────────────
#  Ocean — animated wave silhouettes at the bottom
# ─────────────────────────────────────────────────────────────

class OceanOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._foam: list[dict] = []

    def _spawn_foam(self, w: int, h: int) -> dict:
        return {
            "x": random.uniform(-40, w + 40),
            "y": random.uniform(h * 0.82, h * 0.92),
            "vx": random.uniform(12, 30),
            "life": random.uniform(1.5, 4.0),
            "max_life": 0.0,
            "size": random.randint(6, 18),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        for f in self._foam:
            if f["max_life"] == 0.0:
                f["max_life"] = f["life"]
            f["x"] += f["vx"] * dt
            f["life"] -= dt
        self._foam = [f for f in self._foam if f["life"] > 0]
        while len(self._foam) < 30:
            f = self._spawn_foam(w, h)
            f["max_life"] = f["life"]
            self._foam.append(f)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        steps = 120

        # Draw two wave bands
        for band_i, (y_frac, amp_frac, speed, phase_off, color) in enumerate([
            (0.80, 0.030, 0.55, 0.0,      ( 30,  80, 160, 90)),
            (0.86, 0.022, 0.80, 1.3,      ( 20,  55, 130, 120)),
            (0.91, 0.015, 1.10, 2.6,      ( 10,  35, 100, 150)),
        ]):
            pts_top = []
            pts_bot = []
            for i in range(steps + 1):
                x = int(i * w / steps)
                wave = math.sin(i / steps * TWO_PI * 2.5 + t * speed + phase_off)
                cy = int((y_frac + wave * amp_frac) * h)
                pts_top.append((x, cy))
                pts_bot.append((x, h))
            poly = pts_top + list(reversed(pts_bot))
            if len(poly) >= 3:
                pygame.draw.polygon(surf, color, poly)

        # Foam particles
        for f in self._foam:
            ratio = f["life"] / max(0.001, f["max_life"])
            a = max(0, int(ratio * 160))
            pygame.draw.circle(surf, (220, 235, 255, a),
                               (int(f["x"]), int(f["y"])), f["size"])
        return surf


# ─────────────────────────────────────────────────────────────
#  Mountain — layered silhouette peaks at horizon
# ─────────────────────────────────────────────────────────────

class MountainOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._peaks: list[list[tuple]] | None = None

    def _build_peaks(self, w: int, h: int) -> list[list[tuple]]:
        rng = random.Random(99)
        layers_cfg = [
            (0.45, 0.68, (60,  65,  80, 140)),
            (0.55, 0.72, (45,  50,  65, 170)),
            (0.62, 0.78, (35,  38,  52, 200)),
        ]
        all_layers = []
        for y_base_frac, y_peak_frac, color in layers_cfg:
            pts = [(0, h)]
            x = 0
            while x < w:
                peak_x = x + rng.randint(60, 160)
                peak_y = int(rng.uniform(y_peak_frac, y_base_frac) * h)
                pts.append((peak_x, peak_y))
                valley_x = peak_x + rng.randint(50, 130)
                valley_y = int(y_base_frac * h)
                pts.append((valley_x, valley_y))
                x = valley_x
            pts.append((w, h))
            all_layers.append((pts, color))
        return all_layers

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self._peaks is None:
            self._peaks = self._build_peaks(w, h)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        if self._peaks is None:
            return None
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for pts, color in self._peaks:
            if len(pts) >= 3:
                pygame.draw.polygon(surf, color, pts)
        # Subtle snow caps on highest peaks (top 15% of height)
        snow_y = int(h * 0.18)
        for pts, _ in self._peaks[:1]:
            for x, y in pts:
                if y < snow_y:
                    pygame.draw.circle(surf, (240, 245, 255, 110), (x, y), 12)
        return surf


# ─────────────────────────────────────────────────────────────
#  Desert — drifting sandstorm particles + heat shimmer band
# ─────────────────────────────────────────────────────────────

class DesertOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._grains: list[dict] = []

    def _make_grain(self, w: int, h: int, from_left: bool = False) -> dict:
        return {
            "x": -10.0 if from_left else random.uniform(0, w),
            "y": random.uniform(h * 0.55, h * 0.95),
            "vx": random.uniform(35, 95),
            "vy": random.uniform(-4, 8),
            "size": random.randint(1, 3),
            "alpha": random.randint(60, 160),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        while len(self._grains) < 180:
            self._grains.append(self._make_grain(w, h))
        for g in self._grains:
            g["x"] += g["vx"] * dt
            g["y"] += g["vy"] * dt
        self._grains = [g for g in self._grains if g["x"] < w + 10]
        while len(self._grains) < 180:
            self._grains.append(self._make_grain(w, h, from_left=True))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        # Heat shimmer band near the horizon
        shimmer_y = int(h * 0.68)
        shimmer_h = int(h * 0.06)
        t = self._time
        for y in range(shimmer_h):
            wave = math.sin(y / max(1, shimmer_h - 1) * math.pi)
            a = max(0, int(wave * 28 * (0.6 + 0.4 * math.sin(t * 2.2 + y * 0.4))))
            pygame.draw.line(surf, (230, 200, 130, a),
                             (0, shimmer_y + y), (w, shimmer_y + y))
        # Sand grains
        for g in self._grains:
            pygame.draw.circle(surf, (210, 170, 80, g["alpha"]),
                               (int(g["x"]), int(g["y"])), g["size"])
        return surf


# ─────────────────────────────────────────────────────────────
#  City — window light grid + street-level glow
# ─────────────────────────────────────────────────────────────

class CityOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._windows: list[dict] | None = None
        self._flicker: list[float] = []

    def _build_windows(self, w: int, h: int) -> list[dict]:
        rng = random.Random(77)
        wins = []
        cols = rng.randint(8, 14)
        rows = rng.randint(6, 10)
        bldg_x0 = int(w * 0.05)
        bldg_w = w - bldg_x0 * 2
        bldg_y0 = int(h * 0.40)
        bldg_h = int(h * 0.50)
        for r in range(rows):
            for c in range(cols):
                if rng.random() < 0.35:   # 35 % of windows are dark
                    continue
                x = bldg_x0 + int(c / cols * bldg_w) + rng.randint(-5, 5)
                y = bldg_y0 + int(r / rows * bldg_h) + rng.randint(-3, 3)
                ww = rng.randint(8, 18)
                wh = rng.randint(12, 22)
                color = rng.choice([
                    (255, 240, 160),   # warm yellow
                    (200, 220, 255),   # cool white
                    (255, 200,  80),   # orange tint
                ])
                flicker = rng.random() < 0.08   # 8 % occasionally flicker
                wins.append({"x": x, "y": y, "w": ww, "h": wh,
                              "color": color, "flicker": flicker,
                              "flicker_phase": rng.random() * TWO_PI})
        return wins

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self._windows is None:
            self._windows = self._build_windows(w, h)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        if self._windows is None:
            return None
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        # Dim building silhouette area
        pygame.draw.rect(surf, (15, 15, 30, 90),
                         (0, int(h * 0.38), w, int(h * 0.62)))
        # Street glow at the bottom
        for y in range(int(h * 0.90), h):
            ratio = (y - h * 0.90) / max(1, h * 0.10)
            a = max(0, int(ratio * 40))
            pygame.draw.line(surf, (255, 150, 50, a), (0, y), (w, y))
        # Windows
        for win in self._windows:
            r, g, b_ = win["color"]
            a = 200
            if win["flicker"]:
                pulse = math.sin(t * 8.0 + win["flicker_phase"])
                a = int(130 + 70 * (pulse * 0.5 + 0.5))
            # Outer glow
            pygame.draw.rect(surf, (r, g, b_, 40),
                             (win["x"] - 4, win["y"] - 4,
                              win["w"] + 8, win["h"] + 8))
            # Window pane
            pygame.draw.rect(surf, (r, g, b_, a),
                             (win["x"], win["y"], win["w"], win["h"]))
        return surf


# ─────────────────────────────────────────────────────────────
#  Mystical — floating glowing orbs and sparkles
# ─────────────────────────────────────────────────────────────

class MysticalOverlay(BaseOverlay):
    _ORB_COLORS = [
        (160,  60, 255),
        (255,  60, 200),
        ( 80, 140, 255),
        (200, 100, 255),
        (255, 180,  80),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._orbs: list[dict] = []
        self._sparks: list[dict] = []

    def _make_orb(self, w: int, h: int) -> dict:
        return {
            "x": random.uniform(w * 0.05, w * 0.95),
            "y": random.uniform(h * 0.10, h * 0.80),
            "vx": random.uniform(-12, 12),
            "vy": random.uniform(-18, 18),
            "phase": random.random() * TWO_PI,
            "freq": random.uniform(0.3, 0.8),
            "size": random.randint(8, 25),
            "color": random.choice(self._ORB_COLORS),
            "pulse_phase": random.random() * TWO_PI,
        }

    def _make_spark(self, w: int, h: int) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": random.uniform(h * 0.05, h * 0.90),
            "life": random.uniform(0.3, 1.5),
            "max_life": 0.0,
            "size": random.randint(2, 5),
            "color": random.choice(self._ORB_COLORS),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        while len(self._orbs) < 12:
            self._orbs.append(self._make_orb(w, h))
        t = self._time
        for orb in self._orbs:
            orb["x"] += (orb["vx"] + 15 * math.sin(t * orb["freq"] + orb["phase"])) * dt
            orb["y"] += (orb["vy"] + 10 * math.cos(t * orb["freq"] * 0.7 + orb["phase"])) * dt
            orb["x"] = orb["x"] % w
            orb["y"] = max(h * 0.05, min(h * 0.90, orb["y"]))
        # Sparks
        for s in self._sparks:
            if s["max_life"] == 0.0:
                s["max_life"] = s["life"]
            s["life"] -= dt
        self._sparks = [s for s in self._sparks if s["life"] > 0]
        while len(self._sparks) < 35:
            s = self._make_spark(w, h)
            s["max_life"] = s["life"]
            self._sparks.append(s)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        for orb in self._orbs:
            r, g, b_ = orb["color"]
            pulse = 0.7 + 0.3 * math.sin(t * 1.5 + orb["pulse_phase"])
            cx, cy, s = int(orb["x"]), int(orb["y"]), orb["size"]
            for radius, a_mul in [(s * 3, 0.10), (s * 2, 0.22), (s, 0.60)]:
                a = int(pulse * a_mul * 255)
                pygame.draw.circle(surf, (r, g, b_, a), (cx, cy), max(1, int(radius)))
        for s in self._sparks:
            ratio = s["life"] / max(0.001, s["max_life"])
            r, g, b_ = s["color"]
            a = max(0, int(ratio * 220))
            pygame.draw.circle(surf, (r, g, b_, a),
                               (int(s["x"]), int(s["y"])), s["size"])
        return surf


# ─────────────────────────────────────────────────────────────
#  Medieval — torch flames at the screen edges
# ─────────────────────────────────────────────────────────────

class MedievalOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()

    def _draw_torch(self, surf: pygame.Surface, cx: int, cy: int,
                    t: float, mirror: bool) -> None:
        # Torch pole
        pygame.draw.rect(surf, (80, 45, 15, 200),
                         (cx - 4, cy, 8, 55))
        # Flame lick — several overlapping teardrop shapes
        for i in range(3):
            phase = t * 3.5 + i * 0.7
            wobble = int(math.sin(phase) * 6) * (-1 if mirror else 1)
            fx = cx + wobble
            fh = int(40 + 15 * math.sin(t * 2.8 + i))
            a = int(200 - i * 40)
            # outer flame (orange)
            pts = [
                (fx, cy - fh),
                (fx - 12, cy - fh // 3),
                (fx, cy),
                (fx + 12, cy - fh // 3),
            ]
            pygame.draw.polygon(surf, (255, 130, 20, a), pts)
        # Core (bright yellow)
        pygame.draw.circle(surf, (255, 230, 80, 220), (cx, cy - 18), 6)

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        # Left torch
        self._draw_torch(surf, int(w * 0.04), int(h * 0.60), t, mirror=False)
        # Right torch
        self._draw_torch(surf, int(w * 0.96), int(h * 0.60), t, mirror=True)
        # Additional pair at 30 % / 70 %
        self._draw_torch(surf, int(w * 0.22), int(h * 0.58), t * 0.9, mirror=False)
        self._draw_torch(surf, int(w * 0.78), int(h * 0.58), t * 0.9, mirror=True)
        # Warm ground-level glow
        for y in range(int(h * 0.88), h):
            ratio = (y - h * 0.88) / max(1, h * 0.12)
            a = max(0, int(ratio * 35))
            pygame.draw.line(surf, (150, 80, 10, a), (0, y), (w, y))
        return surf


# ─────────────────────────────────────────────────────────────
#  Underwater — rising bubbles + caustic light patches
# ─────────────────────────────────────────────────────────────

class UnderwaterOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._bubbles: list[dict] = []

    def _make_bubble(self, w: int, h: int, from_bottom: bool = False) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": h + 10 if from_bottom else random.uniform(0, h),
            "vx": random.uniform(-8, 8),
            "vy": random.uniform(-25, -10),
            "phase": random.random() * TWO_PI,
            "size": random.randint(3, 14),
            "alpha": random.randint(50, 130),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        while len(self._bubbles) < 55:
            self._bubbles.append(self._make_bubble(w, h))
        t = self._time
        for b in self._bubbles:
            b["x"] += (b["vx"] + 10 * math.sin(t * 0.6 + b["phase"])) * dt
            b["y"] += b["vy"] * dt
            b["x"] = b["x"] % w
        self._bubbles = [b for b in self._bubbles if b["y"] > -20]
        while len(self._bubbles) < 55:
            self._bubbles.append(self._make_bubble(w, h, from_bottom=True))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        # Caustic light ripples near the top
        for i in range(5):
            cx = int(w * (0.1 + i * 0.2))
            cy = int(h * (0.06 + 0.04 * math.sin(t * 0.4 + i)))
            pulse = 0.5 + 0.5 * math.sin(t * 0.9 + i * 1.3)
            a = int(pulse * 35)
            pygame.draw.ellipse(surf, (120, 210, 255, a),
                                (cx - 80, cy - 18, 160, 36))
        # Bubbles
        for b in self._bubbles:
            cx, cy, s = int(b["x"]), int(b["y"]), b["size"]
            pygame.draw.circle(surf, (180, 220, 255, b["alpha"]), (cx, cy), s)
            pygame.draw.circle(surf, (230, 245, 255, 80), (cx - s // 3, cy - s // 3), max(1, s // 3))
        # Deep blue overlay at bottom
        for y in range(int(h * 0.80), h):
            ratio = (y - h * 0.80) / max(1, h * 0.20)
            a = max(0, int(ratio * 80))
            pygame.draw.line(surf, (5, 30, 90, a), (0, y), (w, y))
        return surf


# ─────────────────────────────────────────────────────────────
#  Cosmic — shooting stars + nebula wisps
# ─────────────────────────────────────────────────────────────

class CosmicOverlay(BaseOverlay):
    _NEBULA_COLORS = [
        (100,  40, 200),
        (200,  40, 100),
        ( 40,  80, 200),
        ( 80, 200, 180),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._meteors: list[dict] = []
        self._next_meteor = random.uniform(0.5, 2.5)
        self._nebula: list[dict] | None = None

    def _build_nebula(self, w: int, h: int) -> list[dict]:
        rng = random.Random(55)
        blobs = []
        for _ in range(20):
            blobs.append({
                "x": rng.uniform(0, w),
                "y": rng.uniform(0, h * 0.75),
                "rx": rng.randint(60, 220),
                "ry": rng.randint(30, 100),
                "color": rng.choice(self._NEBULA_COLORS),
                "alpha": rng.randint(12, 30),
                "phase": rng.random() * TWO_PI,
            })
        return blobs

    def _make_meteor(self, w: int, h: int) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": random.uniform(0, h * 0.40),
            "vx": random.uniform(200, 450),
            "vy": random.uniform(80, 200),
            "life": random.uniform(0.4, 1.0),
            "max_life": 0.0,
            "len": random.randint(60, 180),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self._nebula is None:
            self._nebula = self._build_nebula(w, h)
        self._next_meteor -= dt
        if self._next_meteor <= 0:
            m = self._make_meteor(w, h)
            m["max_life"] = m["life"]
            self._meteors.append(m)
            self._next_meteor = random.uniform(0.8, 3.5)
        for m in self._meteors:
            m["x"] += m["vx"] * dt
            m["y"] += m["vy"] * dt
            m["life"] -= dt
        self._meteors = [m for m in self._meteors if m["life"] > 0]

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        # Nebula blobs
        if self._nebula:
            for blob in self._nebula:
                pulse = 0.7 + 0.3 * math.sin(t * 0.2 + blob["phase"])
                a = int(blob["alpha"] * pulse)
                r, g, b_ = blob["color"]
                pygame.draw.ellipse(surf, (r, g, b_, a),
                                    (int(blob["x"] - blob["rx"]),
                                     int(blob["y"] - blob["ry"]),
                                     blob["rx"] * 2, blob["ry"] * 2))
        # Shooting stars
        for m in self._meteors:
            ratio = m["life"] / max(0.001, m["max_life"])
            angle = math.atan2(m["vy"], m["vx"])
            tail_len = int(m["len"] * ratio)
            x2 = int(m["x"] - math.cos(angle) * tail_len)
            y2 = int(m["y"] - math.sin(angle) * tail_len)
            a = max(0, int(ratio * 230))
            if tail_len > 1:
                pygame.draw.line(surf, (255, 255, 220, a),
                                 (int(m["x"]), int(m["y"])), (x2, y2), 2)
            pygame.draw.circle(surf, (255, 255, 255, a),
                               (int(m["x"]), int(m["y"])), 2)
        return surf


# ─────────────────────────────────────────────────────────────
#  Cave — stalactite silhouettes at top + dripping droplets
# ─────────────────────────────────────────────────────────────

class CaveOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._stalactites: list[dict] | None = None
        self._drops: list[dict] = []

    def _build_stalactites(self, w: int, h: int) -> list[dict]:
        rng = random.Random(13)
        stalks = []
        x = 0
        while x < w:
            sw = rng.randint(18, 55)
            sl = rng.randint(int(h * 0.06), int(h * 0.25))
            stalks.append({"x": x, "w": sw, "len": sl})
            drip_x = x + sw // 2
            drip_y = float(sl)
            stalks[-1]["drip_x"] = drip_x
            stalks[-1]["drip_y_start"] = drip_y
            x += sw + rng.randint(2, 18)
        return stalks

    def _make_drop(self, stalk: dict, h: int) -> dict:
        return {
            "x": float(stalk["drip_x"]),
            "y": float(stalk["drip_y_start"]),
            "vy": random.uniform(40, 100),
            "life": 3.5,
            "max_life": 3.5,
            "size": random.randint(3, 6),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self._stalactites is None:
            self._stalactites = self._build_stalactites(w, h)
        for d in self._drops:
            d["y"] += d["vy"] * dt
            d["life"] -= dt
        self._drops = [d for d in self._drops if d["life"] > 0 and d["y"] < h]
        # Spawn drops from random stalactites
        if self._stalactites and random.random() < dt * 4:
            stalk = random.choice(self._stalactites)
            self._drops.append(self._make_drop(stalk, h))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        # Dark top band with cave ceiling
        pygame.draw.rect(surf, (5, 5, 12, 220), (0, 0, w, int(h * 0.08)))
        # Stalactites
        if self._stalactites:
            for stalk in self._stalactites:
                pts = [
                    (stalk["x"], 0),
                    (stalk["x"] + stalk["w"], 0),
                    (stalk["x"] + stalk["w"] // 2, stalk["len"]),
                ]
                pygame.draw.polygon(surf, (8, 8, 18, 230), pts)
        # Dripping drops
        for d in self._drops:
            ratio = d["life"] / d["max_life"]
            a = max(0, int(ratio * 180))
            pygame.draw.circle(surf, (80, 120, 180, a),
                               (int(d["x"]), int(d["y"])), d["size"])
        # Bottom darkness
        for y in range(int(h * 0.82), h):
            ratio = (y - h * 0.82) / max(1, h * 0.18)
            a = max(0, int(ratio * 120))
            pygame.draw.line(surf, (2, 2, 8, a), (0, y), (w, y))
        return surf


# ─────────────────────────────────────────────────────────────
#  Arctic — falling snowflakes
# ─────────────────────────────────────────────────────────────

class ArcticOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._flakes: list[dict] = []

    def _make_flake(self, w: int, h: int, from_top: bool = False) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": -10.0 if from_top else random.uniform(-10, h),
            "vx": random.uniform(-18, 18),
            "vy": random.uniform(18, 55),
            "phase": random.random() * TWO_PI,
            "swing": random.uniform(0.5, 1.5),
            "size": random.choices([2, 2, 3, 3, 4, 5], k=1)[0],
            "alpha": random.randint(140, 230),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        while len(self._flakes) < 160:
            self._flakes.append(self._make_flake(w, h))
        t = self._time
        for f in self._flakes:
            f["x"] += (f["vx"] + 20 * math.sin(t * f["swing"] + f["phase"])) * dt
            f["y"] += f["vy"] * dt
            f["x"] = f["x"] % w
        self._flakes = [f for f in self._flakes if f["y"] < h + 10]
        while len(self._flakes) < 160:
            self._flakes.append(self._make_flake(w, h, from_top=True))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for f in self._flakes:
            pygame.draw.circle(surf, (230, 240, 255, f["alpha"]),
                               (int(f["x"]), int(f["y"])), f["size"])
        # Cold ground drift
        for y in range(int(h * 0.88), h):
            ratio = (y - h * 0.88) / max(1, h * 0.12)
            a = max(0, int(ratio * 55))
            pygame.draw.line(surf, (200, 220, 255, a), (0, y), (w, y))
        return surf


# ─────────────────────────────────────────────────────────────
#  Jungle — dense leaf particles + vine silhouettes
# ─────────────────────────────────────────────────────────────

class JungleOverlay(BaseOverlay):
    _COLORS = [
        ( 10, 110,  20, 200),
        ( 20, 150,  40, 190),
        (  5,  90,  15, 210),
        ( 40, 180,  50, 180),
        ( 15, 130,  30, 200),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._leaves: list[dict] = []
        self._vines: list[dict] | None = None

    def _build_vines(self, w: int, h: int) -> list[dict]:
        rng = random.Random(31)
        vines = []
        for _ in range(8):
            x_start = rng.uniform(0, w)
            segments = []
            x, y = x_start, 0
            seg_count = rng.randint(6, 14)
            for _ in range(seg_count):
                dx = rng.uniform(-30, 30)
                dy = rng.uniform(40, 100)
                segments.append((int(x), int(y), int(x + dx), int(y + dy)))
                x += dx
                y += dy
                if y > h:
                    break
            vines.append({"segments": segments})
        return vines

    def _make_leaf(self, w: int, h: int, from_top: bool = False) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": -15.0 if from_top else random.uniform(-15, h),
            "vx": random.uniform(-20, 20),
            "vy": random.uniform(10, 35),
            "rot": random.uniform(0, TWO_PI),
            "rot_speed": random.uniform(-3, 3),
            "swing": random.random() * TWO_PI,
            "swing_freq": random.uniform(0.4, 1.2),
            "swing_amp": random.uniform(6, 20),
            "size": random.randint(7, 16),
            "color": random.choice(self._COLORS),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self._vines is None:
            self._vines = self._build_vines(w, h)
        while len(self._leaves) < 80:
            self._leaves.append(self._make_leaf(w, h))
        for lf in self._leaves:
            lf["y"] += lf["vy"] * dt
            lf["x"] += (lf["vx"] + lf["swing_amp"] *
                         math.sin(self._time * lf["swing_freq"] + lf["swing"])) * dt
            lf["rot"] += lf["rot_speed"] * dt
        self._leaves = [lf for lf in self._leaves if lf["y"] < h + 20]
        while len(self._leaves) < 80:
            self._leaves.append(self._make_leaf(w, h, from_top=True))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        # Vines
        if self._vines:
            for vine in self._vines:
                for x1, y1, x2, y2 in vine["segments"]:
                    pygame.draw.line(surf, (20, 70, 10, 160), (x1, y1), (x2, y2), 3)
        # Leaves
        for lf in self._leaves:
            cx, cy = int(lf["x"]), int(lf["y"])
            s = lf["size"]
            r, g, b_, a = lf["color"]
            pts = [
                (cx + int(math.cos(lf["rot"]) * s),
                 cy + int(math.sin(lf["rot"]) * s * 0.5)),
                (cx + int(math.cos(lf["rot"] + TWO_PI / 3) * s * 0.6),
                 cy + int(math.sin(lf["rot"] + TWO_PI / 3) * s * 0.6)),
                (cx + int(math.cos(lf["rot"] + 2 * TWO_PI / 3) * s * 0.6),
                 cy + int(math.sin(lf["rot"] + 2 * TWO_PI / 3) * s * 0.6)),
            ]
            pygame.draw.polygon(surf, (r, g, b_, a), pts)
        return surf


# ─────────────────────────────────────────────────────────────
#  Tavern — rising smoke wisps + candle flicker corners
# ─────────────────────────────────────────────────────────────

class TavernOverlay(BaseOverlay):
    def __init__(self) -> None:
        super().__init__()
        self._wisps: list[dict] = []
        self._candles = [
            {"x_frac": 0.03, "y_frac": 0.72, "phase": 0.0},
            {"x_frac": 0.97, "y_frac": 0.72, "phase": 1.1},
            {"x_frac": 0.15, "y_frac": 0.70, "phase": 0.5},
            {"x_frac": 0.85, "y_frac": 0.70, "phase": 1.7},
        ]

    def _make_wisp(self, w: int, h: int, from_bottom: bool = False) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": h * 0.75 if from_bottom else random.uniform(0, h * 0.75),
            "vx": random.uniform(-6, 6),
            "vy": random.uniform(-18, -8),
            "phase": random.random() * TWO_PI,
            "freq": random.uniform(0.5, 1.5),
            "life": random.uniform(2.0, 4.5),
            "max_life": 0.0,
            "size": random.randint(8, 22),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        for ws in self._wisps:
            if ws["max_life"] == 0.0:
                ws["max_life"] = ws["life"]
            ws["x"] += (ws["vx"] + 12 * math.sin(
                self._time * ws["freq"] + ws["phase"])) * dt
            ws["y"] += ws["vy"] * dt
            ws["life"] -= dt
        self._wisps = [ws for ws in self._wisps if ws["life"] > 0]
        while len(self._wisps) < 30:
            ws = self._make_wisp(w, h, from_bottom=True)
            ws["max_life"] = ws["life"]
            self._wisps.append(ws)

    def _draw_candle(self, surf: pygame.Surface, cx: int, cy: int,
                     t: float, phase: float) -> None:
        # Wax
        pygame.draw.rect(surf, (240, 230, 200, 200), (cx - 5, cy, 10, 25))
        # Flame body
        wobble = int(math.sin(t * 4.5 + phase) * 4)
        fh = int(20 + 6 * math.sin(t * 3.2 + phase))
        flame_pts = [
            (cx + wobble, cy - fh),
            (cx - 8, cy - fh // 3),
            (cx, cy),
            (cx + 8, cy - fh // 3),
        ]
        pygame.draw.polygon(surf, (255, 140, 20, 210), flame_pts)
        # Core
        pygame.draw.circle(surf, (255, 240, 80, 240), (cx + wobble // 2, cy - 8), 4)
        # Glow
        glow = pygame.Surface((80, 80), pygame.SRCALPHA)
        pulse = 0.65 + 0.35 * math.sin(t * 2.8 + phase)
        pygame.draw.circle(glow, (255, 160, 40, int(35 * pulse)), (40, 40), 40)
        surf.blit(glow, (cx - 40, cy - 40))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        # Warm floor glow
        for y in range(int(h * 0.85), h):
            ratio = (y - h * 0.85) / max(1, h * 0.15)
            a = max(0, int(ratio * 45))
            pygame.draw.line(surf, (140, 60, 10, a), (0, y), (w, y))
        # Candles
        for c in self._candles:
            self._draw_candle(surf, int(c["x_frac"] * w), int(c["y_frac"] * h),
                              t, c["phase"])
        # Smoke wisps
        for ws in self._wisps:
            ratio = ws["life"] / max(0.001, ws["max_life"])
            a = max(0, int(ratio * 55))
            pygame.draw.circle(surf, (160, 140, 120, a),
                               (int(ws["x"]), int(ws["y"])), ws["size"])
        return surf


# ─────────────────────────────────────────────────────────────
#  Factory
# ─────────────────────────────────────────────────────────────

_OVERLAY_CLASSES: dict[str, type] = {
    "forest":     ForestOverlay,
    "ocean":      OceanOverlay,
    "mountain":   MountainOverlay,
    "desert":     DesertOverlay,
    "city":       CityOverlay,
    "mystical":   MysticalOverlay,
    "medieval":   MedievalOverlay,
    "underwater": UnderwaterOverlay,
    "cosmic":     CosmicOverlay,
    "cave":       CaveOverlay,
    "arctic":     ArcticOverlay,
    "jungle":     JungleOverlay,
    "tavern":     TavernOverlay,
}


def make_overlay(theme: str) -> BaseOverlay:
    cls = _OVERLAY_CLASSES.get(theme, NullOverlay)
    return cls()
