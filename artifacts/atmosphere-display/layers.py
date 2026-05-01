"""
Attribute layer system.

Each Layer has:
  enabled (bool)   — target state driven by backend attribute flags
  alpha  (float)   — current opacity 0.0–1.0, interpolates toward target
  update(dt, w, h) — advance particles / animation each frame
  draw(dst)        — draw self onto `dst` surface (already alpha-aware)

Layers blit to an intermediate surface whose set_alpha() is driven by self.alpha,
so you get a smooth fade even for opaque primitives inside the layer.
"""
from __future__ import annotations
import math
import random
import pygame

FADE_SPEED = 1.5   # opacity units per second (reaches full in ~0.67 s)
TWO_PI = math.pi * 2


def lerp_color(c1: tuple, c2: tuple, t: float) -> tuple:
    t = max(0.0, min(1.0, t))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


class BaseLayer:
    def __init__(self) -> None:
        self.enabled = False
        self.alpha = 0.0
        self._surface: pygame.Surface | None = None

    def _ensure_surface(self, w: int, h: int) -> pygame.Surface:
        if self._surface is None or self._surface.get_size() != (w, h):
            self._surface = pygame.Surface((w, h), pygame.SRCALPHA)
        return self._surface

    def update(self, dt: float, w: int, h: int) -> None:
        target = 1.0 if self.enabled else 0.0
        if self.alpha < target:
            self.alpha = min(1.0, self.alpha + FADE_SPEED * dt)
        elif self.alpha > target:
            self.alpha = max(0.0, self.alpha - FADE_SPEED * dt)

    def draw(self, dst: pygame.Surface) -> None:
        if self.alpha <= 0.001:
            return
        w, h = dst.get_size()
        surf = self._render(w, h)
        if surf is not None:
            surf.set_alpha(int(self.alpha * 255))
            dst.blit(surf, (0, 0))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        return None


# ─────────────────────────────────────────────────────────────
#  Daytime layers
# ─────────────────────────────────────────────────────────────

class SunbeamsLayer(BaseLayer):
    """Volumetric god-rays from the sun (top-left area)."""

    def __init__(self) -> None:
        super().__init__()
        self._time = 0.0
        self._beams = [
            {"angle": math.radians(-20 + i * 12), "width": 0.04 + random.random() * 0.03,
             "phase": random.random() * TWO_PI}
            for i in range(6)
        ]

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        self._time += dt

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        cx, cy = int(w * 0.22), int(h * 0.12)
        for b in self._beams:
            pulse = 0.55 + 0.25 * math.sin(self._time * 0.4 + b["phase"])
            ang = b["angle"]
            spread = b["width"]
            length = max(w, h) * 1.6
            left_ang = ang - spread
            right_ang = ang + spread
            pts = [
                (cx, cy),
                (cx + math.cos(left_ang) * length, cy + math.sin(left_ang) * length),
                (cx + math.cos(right_ang) * length, cy + math.sin(right_ang) * length),
            ]
            a = int(pulse * 38)
            pygame.draw.polygon(surf, (255, 240, 180, a), pts)
        return surf


class BirdsLayer(BaseLayer):
    """Flocks of tiny bird silhouettes drifting across the sky."""

    def __init__(self) -> None:
        super().__init__()
        self._birds: list[dict] = []
        self._spawn_timer = 0.0

    def _spawn(self, w: int, h: int) -> None:
        for _ in range(random.randint(3, 7)):
            self._birds.append({
                "x": -60.0 + random.randint(0, 20),
                "y": random.uniform(h * 0.05, h * 0.50),
                "vx": random.uniform(28, 55),
                "vy": random.uniform(-4, 4),
                "phase": random.random() * TWO_PI,
                "speed_mul": random.uniform(0.85, 1.15),
                "size": random.uniform(4, 8),
            })

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self.alpha < 0.05:
            return
        if not self._birds:
            self._spawn(w, h)
        self._spawn_timer += dt
        if self._spawn_timer > 12.0 and len(self._birds) < 25:
            self._spawn_timer = 0.0
            self._spawn(w, h)
        t = pygame.time.get_ticks() / 1000.0
        for b in self._birds:
            b["x"] += b["vx"] * dt
            b["y"] += b["vy"] * dt + math.sin(t * 2.2 * b["speed_mul"] + b["phase"]) * 0.5
        self._birds = [b for b in self._birds if b["x"] < w + 80]

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for b in self._birds:
            x, y, s = int(b["x"]), int(b["y"]), b["size"]
            t = pygame.time.get_ticks() / 1000.0
            wing = math.sin(t * 5.5 * b["speed_mul"] + b["phase"]) * s * 0.5
            # left wing
            pygame.draw.arc(surf, (30, 30, 30, 220),
                            (x - int(s * 1.4), y - int(wing + s * 0.2),
                             int(s * 1.4), int(abs(wing) + s * 0.2 + 1)),
                            0, math.pi, 1)
            # right wing
            pygame.draw.arc(surf, (30, 30, 30, 220),
                            (x, y - int(wing + s * 0.2),
                             int(s * 1.4), int(abs(wing) + s * 0.2 + 1)),
                            0, math.pi, 1)
        return surf


# ─────────────────────────────────────────────────────────────
#  Evening layers
# ─────────────────────────────────────────────────────────────

class FirefliesLayer(BaseLayer):
    """Drifting bioluminescent particles — warm amber-green glows."""

    def __init__(self) -> None:
        super().__init__()
        self._flies: list[dict] = []

    def _make_fly(self, w: int, h: int) -> dict:
        return {
            "x": random.uniform(0, w),
            "y": random.uniform(h * 0.40, h * 0.95),
            "vx": random.uniform(-18, 18),
            "vy": random.uniform(-12, 12),
            "phase": random.random() * TWO_PI,
            "blink": random.random() * TWO_PI,
            "blink_speed": random.uniform(1.2, 3.0),
            "size": random.randint(3, 6),
            "color": random.choice([
                (255, 230, 80),
                (180, 255, 100),
                (255, 200, 50),
            ]),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self.alpha < 0.05:
            return
        while len(self._flies) < 55:
            self._flies.append(self._make_fly(w, h))
        t = pygame.time.get_ticks() / 1000.0
        for f in self._flies:
            f["x"] += f["vx"] * dt + math.sin(t * 0.7 + f["phase"]) * 8 * dt
            f["y"] += f["vy"] * dt + math.cos(t * 0.5 + f["phase"]) * 6 * dt
            f["x"] = f["x"] % w
            f["y"] = max(h * 0.3, min(h, f["y"]))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = pygame.time.get_ticks() / 1000.0
        for f in self._flies:
            blink = (math.sin(t * f["blink_speed"] + f["blink"]) + 1) * 0.5
            if blink < 0.2:
                continue
            cx, cy, s = int(f["x"]), int(f["y"]), f["size"]
            r, g, b_ = f["color"]
            for radius, alpha_mul in [(s * 3, 0.12), (s * 1.5, 0.35), (s, 1.0)]:
                a = int(blink * alpha_mul * 255)
                pygame.draw.circle(surf, (r, g, b_, a), (cx, cy), max(1, int(radius)))
        return surf


class EveningCloudsLayer(BaseLayer):
    """Extra cloud density for evening — dark, heavy silhouettes."""

    def __init__(self) -> None:
        super().__init__()
        self._clouds: list[dict] = []

    def _make_cloud(self, w: int, h: int, x_start: int | None = None) -> dict:
        x = x_start if x_start is not None else random.randint(-200, w)
        return {
            "x": float(x),
            "y": random.uniform(h * 0.55, h * 0.80),
            "vx": random.uniform(6, 16),
            "blobs": [(random.randint(40, 100), random.randint(0, 60), random.randint(20, 50))
                      for _ in range(random.randint(4, 8))],
            "alpha": random.randint(120, 200),
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self.alpha < 0.05:
            return
        while len(self._clouds) < 6:
            self._clouds.append(self._make_cloud(w, h))
        for c in self._clouds:
            c["x"] += c["vx"] * dt
        self._clouds = [c for c in self._clouds if c["x"] < w + 250]
        while len(self._clouds) < 6:
            self._clouds.append(self._make_cloud(w, h, x_start=-250))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for c in self._clouds:
            for dx, dy, r in c["blobs"]:
                pygame.draw.ellipse(surf, (30, 20, 40, c["alpha"]),
                                    (int(c["x"] + dx - r), int(c["y"] + dy - r // 2),
                                     r * 2, r))
        return surf


# ─────────────────────────────────────────────────────────────
#  Night layers
# ─────────────────────────────────────────────────────────────

class MoonLayer(BaseLayer):
    """Full moon disc with soft glow halo."""

    def __init__(self) -> None:
        super().__init__()
        self._time = 0.0

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        self._time += dt

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        cx, cy = int(w * 0.72), int(h * 0.18)
        pulse = 0.88 + 0.12 * math.sin(self._time * 0.3)
        # halos
        for radius, a in [(120, 12), (90, 22), (70, 35), (55, 55)]:
            pygame.draw.circle(surf, (220, 220, 200, int(a * pulse)), (cx, cy), radius)
        # moon disc
        pygame.draw.circle(surf, (245, 242, 220), (cx, cy), 45)
        # subtle crater texture
        for ox, oy, r, da in [(-12, -10, 8, 18), (14, 6, 5, 14), (-4, 16, 6, 12)]:
            pygame.draw.circle(surf, (225, 222, 200, 60), (cx + ox, cy + oy), r)
        return surf


class StarsLayer(BaseLayer):
    """Dense procedural star field with gentle twinkling."""

    def __init__(self) -> None:
        super().__init__()
        self._stars: list[dict] = []

    def _populate(self, w: int, h: int) -> None:
        self._stars = []
        for _ in range(280):
            self._stars.append({
                "x": random.randint(0, w),
                "y": random.randint(0, int(h * 0.75)),
                "size": random.choices([1, 1, 1, 2, 2, 3], k=1)[0],
                "phase": random.random() * TWO_PI,
                "speed": random.uniform(0.5, 2.2),
                "base_a": random.randint(160, 255),
            })

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if not self._stars:
            self._populate(w, h)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = pygame.time.get_ticks() / 1000.0
        for s in self._stars:
            twinkle = (math.sin(t * s["speed"] + s["phase"]) + 1) * 0.5
            a = int(s["base_a"] * (0.4 + 0.6 * twinkle))
            pygame.draw.circle(surf, (255, 255, 235, a), (s["x"], s["y"]), s["size"])
        return surf


class AuroraLayer(BaseLayer):
    """Slow undulating northern lights — bands of green and violet."""

    def __init__(self) -> None:
        super().__init__()
        self._time = 0.0

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        self._time += dt

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = self._time
        bands = [
            {"color": (60, 220, 120), "y_base": 0.22, "amp": 0.07, "freq": 0.6, "phase": 0.0},
            {"color": (100, 80, 220), "y_base": 0.30, "amp": 0.06, "freq": 0.5, "phase": 1.2},
            {"color": (50, 200, 160), "y_base": 0.38, "amp": 0.05, "freq": 0.8, "phase": 2.4},
        ]
        for band in bands:
            r, g, b_ = band["color"]
            points_top = []
            points_bot = []
            steps = 40
            for i in range(steps + 1):
                x = int(i * w / steps)
                wave = math.sin(i / steps * TWO_PI * 1.5 + t * band["freq"] + band["phase"])
                cy = (band["y_base"] + wave * band["amp"]) * h
                thickness = h * 0.06
                points_top.append((x, int(cy - thickness * 0.5)))
                points_bot.append((x, int(cy + thickness * 0.5)))
            poly = points_top + list(reversed(points_bot))
            if len(poly) >= 3:
                pygame.draw.polygon(surf, (r, g, b_, 55), poly)
        return surf


# ─────────────────────────────────────────────────────────────
#  Dawn layers
# ─────────────────────────────────────────────────────────────

class MistLayer(BaseLayer):
    """Ground-level fog particles drifting across the horizon."""

    def __init__(self) -> None:
        super().__init__()
        self._blobs: list[dict] = []

    def _make_blob(self, w: int, h: int) -> dict:
        return {
            "x": random.uniform(-200, w + 200),
            "y": random.uniform(h * 0.62, h * 0.90),
            "vx": random.uniform(-8, 18),
            "vy": random.uniform(-3, 3),
            "rx": random.randint(80, 200),
            "ry": random.randint(18, 45),
            "alpha": random.randint(18, 55),
            "phase": random.random() * TWO_PI,
        }

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self.alpha < 0.05:
            return
        while len(self._blobs) < 22:
            self._blobs.append(self._make_blob(w, h))
        t = pygame.time.get_ticks() / 1000.0
        for b in self._blobs:
            b["x"] += b["vx"] * dt
            b["y"] += math.sin(t * 0.3 + b["phase"]) * 2 * dt
        self._blobs = [b for b in self._blobs if -250 < b["x"] < w + 250]
        while len(self._blobs) < 22:
            self._blobs.append(self._make_blob(w, h))

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        for b in self._blobs:
            rect = (int(b["x"] - b["rx"]), int(b["y"] - b["ry"]),
                    b["rx"] * 2, b["ry"] * 2)
            pygame.draw.ellipse(surf, (230, 230, 240, b["alpha"]), rect)
        return surf


class DawnBirdsLayer(BaseLayer):
    """Birds rising from the treeline at dawn."""

    def __init__(self) -> None:
        super().__init__()
        self._birds: list[dict] = []

    def _spawn(self, w: int, h: int) -> None:
        for _ in range(random.randint(2, 5)):
            self._birds.append({
                "x": random.uniform(0, w),
                "y": random.uniform(h * 0.65, h * 0.80),
                "vx": random.uniform(-20, 20),
                "vy": random.uniform(-35, -12),
                "phase": random.random() * TWO_PI,
                "size": random.uniform(3, 6),
            })

    def update(self, dt: float, w: int, h: int) -> None:
        super().update(dt, w, h)
        if self.alpha < 0.05:
            return
        if not self._birds:
            self._spawn(w, h)
        t = pygame.time.get_ticks() / 1000.0
        for b in self._birds:
            b["x"] += b["vx"] * dt
            b["y"] += b["vy"] * dt
        self._birds = [b for b in self._birds if b["y"] > -30]
        if len(self._birds) < 8:
            self._spawn(w, h)

    def _render(self, w: int, h: int) -> pygame.Surface | None:
        surf = pygame.Surface((w, h), pygame.SRCALPHA)
        t = pygame.time.get_ticks() / 1000.0
        for b in self._birds:
            x, y, s = int(b["x"]), int(b["y"]), b["size"]
            wing = math.sin(t * 6 + b["phase"]) * s * 0.6
            for side in [-1, 1]:
                pygame.draw.arc(
                    surf, (40, 30, 50, 200),
                    (x + side * int(s * 0.1), y - int(abs(wing) + s * 0.2),
                     int(s * 1.3), int(abs(wing) + s * 0.2 + 1)),
                    0, math.pi, 1,
                )
        return surf
