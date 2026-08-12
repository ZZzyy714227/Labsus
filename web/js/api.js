// API client — FastAPI backend
async function req(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  defaults: () => req('/api/defaults'),
  solve: (body) => req('/api/solve', { method: 'POST', body: JSON.stringify(body) }),
  analyze: (body) => req('/api/analyze', { method: 'POST', body: JSON.stringify(body) }),
  getVehicle: () => req('/api/vehicle'),
  saveVehicle: (params) => req('/api/vehicle', { method: 'POST', body: JSON.stringify({ params }) }),
  getTargets: () => req('/api/targets'),
  saveTargets: (bands) => req('/api/targets', { method: 'POST', body: JSON.stringify({ bands }) }),
};
