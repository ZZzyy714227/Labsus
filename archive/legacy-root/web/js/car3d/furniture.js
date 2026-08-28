// car3d — schematic non-kinematic parts: engine block, intake restrictor,
// exhaust, seat, headrest, firewall (CABIN config)
import * as THREE from 'three';
import { MAT } from './materials.js';
import { box3, coneTube, plate, tube } from './primitives.js';

export function buildFurniture(cabin) {
  const g = new THREE.Group();
  g.name = 'furniture';
  if (!cabin) return g;

  // Engine block + head (schematic box)
  const eng = cabin.engine;
  if (eng) {
    const [sx, sy, sz] = eng.size;
    const c = eng.center;
    g.add(box3(c, [sx, sy, sz], MAT.steelDark, 'engine_block'));
    g.add(box3([c[0], c[1], c[2] + sz / 2 + 45], [sx * 0.7, sy * 0.7, 90],
               MAT.aluminum, 'engine_head'));
  }

  // Intake: restrictor (20mm throat) + plenum cone above the engine
  const restr = cabin.restrictor;
  if (restr) {
    const c = restr.center;
    g.add(coneTube([c[0], c[1], c[2] - 70], c, 70, restr.diameter / 2,
                   MAT.carbon, 'restrictor'));
    g.add(coneTube(c, [c[0], c[1], c[2] + 90], restr.diameter / 2, 45,
                   MAT.carbon, 'restrictor'));
    const runnerEnd = [c[0], c[1], eng ? eng.center[2] + eng.size[2] / 2 : c[2] - 300];
    const runner = tube([c[0], c[1], c[2] - 70], runnerEnd, 50, MAT.carbon, 'intake_runner');
    if (runner) g.add(runner);
  }

  // Exhaust header (single schematic pipe exiting rearward)
  const exh = cabin.exhaust;
  if (exh) {
    const p = exh.port_center;
    const r = exh.pipe_diameter / 2;
    g.add(tube(p, [p[0] - 420, p[1], p[2] - 60], r, MAT.steelDark, 'exhaust'));
    g.add(tube([p[0] - 420, p[1], p[2] - 60], [-1560, p[1], p[2] - 120], r, MAT.steelDark, 'exhaust'));
  }

  // Seat: base + tilted backrest
  const seat = cabin.seat;
  if (seat) {
    const b = seat.base;
    const w = seat.width;
    g.add(box3([b[0], b[1], b[2] + 60], [300, w, 120], MAT.upholstery, 'seat'));
    const ang = (seat.back_angle_deg * Math.PI) / 180;
    const bh = seat.back_height;
    const bx = b[0] - Math.sin(ang) * bh * 0.5;
    const bz = b[2] + 120 + Math.cos(ang) * bh * 0.5;
    const back = box3([bx, b[1], bz], [50, w, bh], MAT.upholstery, 'seat_back');
    back.rotation.y = -ang;
    g.add(back);
  }

  // Headrest pad on the main hoop
  const hr = cabin.headrest;
  if (hr) {
    g.add(box3(hr.center, [50, hr.width, hr.height], MAT.upholstery, 'headrest'));
  }

  // Firewall plate (cockpit ↔ engine bay)
  const fw = cabin.firewall;
  if (fw) {
    g.add(plate([[-750, 200, 120], [-750, 200, 560], [-750, -200, 560], [-750, -200, 120]],
                MAT.aluminum, 'firewall'));
  }
  return g;
}
