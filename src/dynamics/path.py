"""Catmull-Rom spline path with arc-length parameterisation."""
import math
import numpy as np


def _cr_point(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )


def _cr_tangent(p0, p1, p2, p3, t):
    t2 = t * t
    return 0.5 * (
        (-p0 + p2)
        + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t
        + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
    )


class Path:
    """Catmull-Rom spline through control points, arc-length parameterised."""

    def __init__(self, control_points):
        pts = np.array(control_points, dtype=float)
        if len(pts) < 2:
            raise ValueError("Need at least 2 control points")
        self._pts = pts
        # Pad with reflected phantom points for end segments
        self._padded = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
        self._n_seg = len(pts) - 1
        self._build_table()

    def _build_table(self):
        n = 10000
        dt = 1.0 / (self._n_seg * n)
        self._table = []
        s = 0.0
        prev = None
        for seg in range(self._n_seg):
            p0, p1, p2, p3 = [self._padded[seg + i] for i in range(4)]
            for j in range(n):
                t_val = j / n
                pt = _cr_point(p0, p1, p2, p3, t_val)
                tan = _cr_tangent(p0, p1, p2, p3, t_val)
                yaw = math.atan2(tan[1], tan[0])
                if prev is not None:
                    s += math.hypot(pt[0] - prev[0], pt[1] - prev[1])
                self._table.append((s, float(pt[0]), float(pt[1]), yaw))
                prev = pt
        self._total = s

    @property
    def total_length(self):
        return self._total

    def sample(self, s):
        """Return (x, y, yaw) at arc-length s."""
        if s <= 0:
            return (self._table[0][1], self._table[0][2], self._table[0][3])
        if s >= self._total:
            e = self._table[-1]
            return (e[1], e[2], e[3])
        lo, hi = 0, len(self._table) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if self._table[mid][0] < s:
                lo = mid + 1
            else:
                hi = mid
        if lo == 0:
            return (self._table[0][1], self._table[0][2], self._table[0][3])
        pr, cu = self._table[lo - 1], self._table[lo]
        frac = (s - pr[0]) / (cu[0] - pr[0]) if cu[0] > pr[0] else 0.0
        return (
            pr[1] + frac * (cu[1] - pr[1]),
            pr[2] + frac * (cu[2] - pr[2]),
            pr[3] + frac * (cu[3] - pr[3]),
        )
