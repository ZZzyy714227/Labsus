"""Terrain height field — flat plane (Z=0) + obstacle overlay."""
import math


def _bump_h(x, y, cx, cy, length, width, height):
    """Half-cosine bump peaking at center."""
    dx, dy = x - cx, y - cy
    hl, hw = length / 2.0, width / 2.0
    if abs(dx) >= hl or abs(dy) >= hw:
        return 0.0
    return height * math.cos(math.pi * dx / length) * math.cos(math.pi * dy / width)


def _kerb_h(x, y, xs, ys, xe, ye, width, height):
    """Kerb: rectangular extrusion with 10mm chamfer at ends and sides."""
    dseg = (xe - xs, ye - ys)
    seg_len_sq = dseg[0]**2 + dseg[1]**2
    if seg_len_sq < 1e-12:
        return 0.0
    seg_len = math.sqrt(seg_len_sq)
    t = ((x - xs) * dseg[0] + (y - ys) * dseg[1]) / seg_len_sq
    if t < 0.0 or t > 1.0:
        return 0.0
    cx = xs + t * dseg[0]
    cy = ys + t * dseg[1]
    dist_lat = abs(-dseg[1] * (x - cx) + dseg[0] * (y - cy)) / seg_len
    hw = width / 2.0
    if dist_lat > hw:
        return 0.0
    chamfer = 10.0
    f_long = min(1.0, min(t * seg_len, (1.0 - t) * seg_len) / chamfer)
    f_lat = 1.0 if hw - dist_lat >= chamfer else max(0.0, (hw - dist_lat) / chamfer)
    return height * f_long * f_lat


def _ramp_h(x, y, xs, ys, xe, ye, width, h_start, h_end):
    """Ramp: linearly varying height along segment."""
    dseg = (xe - xs, ye - ys)
    seg_len_sq = dseg[0]**2 + dseg[1]**2
    if seg_len_sq < 1e-12:
        return 0.0
    seg_len = math.sqrt(seg_len_sq)
    t = ((x - xs) * dseg[0] + (y - ys) * dseg[1]) / seg_len_sq
    if t < 0.0 or t > 1.0:
        return 0.0
    cx = xs + t * dseg[0]
    cy = ys + t * dseg[1]
    dist_lat = abs(-dseg[1] * (x - cx) + dseg[0] * (y - cy)) / seg_len
    if dist_lat > width / 2.0:
        return 0.0
    return h_start + t * (h_end - h_start)


class Terrain:
    """Height field: flat ground (z=0) with optional obstacles."""

    def __init__(self, obstacles=None):
        self.obstacles = obstacles or []

    def height(self, x, y):
        """Terrain Z at world (x, y). Multiple obstacles take max."""
        h = 0.0
        for o in self.obstacles:
            t = o.get("type", "")
            if t == "bump":
                h = max(h, _bump_h(x, y, o["x"], o["y"],
                          o["length"], o["width"], o["height"]))
            elif t == "kerb":
                h = max(h, _kerb_h(x, y, o["x_start"], o["y_start"],
                          o["x_end"], o["y_end"], o["width"], o["height"]))
            elif t == "ramp":
                h = max(h, _ramp_h(x, y, o["x_start"], o["y_start"],
                          o["x_end"], o["y_end"], o["width"],
                          o.get("h_start", 0.0), o["height"]))
        return h
