"""RK4 integrator."""
import numpy as np


def rk4_step(deriv_fn, state, dt, *args):
    """Single RK4 integration step.

    Args:
        deriv_fn: callable(state, *args) → dstate (numpy array)
        state: current state vector
        dt: timestep
        *args: passed through to deriv_fn

    Returns:
        new state vector
    """
    s = np.asarray(state, dtype=float)
    k1 = np.asarray(deriv_fn(s, *args))
    k2 = np.asarray(deriv_fn(s + 0.5 * dt * k1, *args))
    k3 = np.asarray(deriv_fn(s + 0.5 * dt * k2, *args))
    k4 = np.asarray(deriv_fn(s + dt * k3, *args))
    return s + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
