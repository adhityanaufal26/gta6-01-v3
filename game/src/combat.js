// Palmera Bay — combat: 4 weapons (pistol, SMG, shotgun, rifle) plus fists,
// mouse-aim hitscan shooting, ammo, and weapon pickups around the city.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { clamp, mulberry32, pick, dist2 } from './util.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.owned = new Set(['fists']);
    this.ammo = { pistol: 24, smg: 64, shotgun: 12, rifle: 20 };
    this.current = 'fists';
    this.cooldown = 0;
    this.tracer = null;
    this.pickups = [];
    const rng = mulberry32(99);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0x6a5a00 });
    for (let i = 0; i < 8; i++) {
      const x = pick(rng, [-154, -110, -66, -22, 22, 66, 110, 154]) + (rng() < 0.5 ? -9 : 9);
      const z = -200 + rng() * 400;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), mat);
      m.position.set(x, 0.6, z); scene.add(m);
      this.pickups.push({ x, z, mesh: m, kind: pick(rng, ['pistol', 'smg', 'shotgun', 'rifle']), taken: false });
    }
  }
  weapon() { return WEAPONS.find((w) => w.id === this.current); }
  buy(id) { this.owned.add(id); }
  select(id) { if (this.owned.has(id)) { this.current = id; return true; } return false; }
  refillAmmo() {
    for (const w of WEAPONS) if (w.mag !== Infinity) this.ammo[w.id] = w.mag * 3;
  }
  // Fire a hitscan shot from the camera. targets: {police, peds, traffic} for hits.
  // Returns 'hit' | 'miss' | 'empty' | 'cooldown'.
  shoot(camera, targets, onShot) {
    const w = this.weapon();
    if (this.cooldown > 0) return 'cooldown';
    if (w.mag !== Infinity && this.ammo[w.id] <= 0) return 'empty';
    this.cooldown = 1 / w.rate;
    if (w.mag !== Infinity) this.ammo[w.id]--;
    const pellets = w.pellets || 1;
    let hitAny = false;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    for (let p = 0; p < pellets; p++) {
      const spread = w.pellets ? 0.03 : 0.006;
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2;
      d.normalize();
      const hit = this._raycast(origin, d, w.range, targets);
      if (hit) { hitAny = true; hit.damage(w.damage); }
    }
    this._showTracer(origin, dir, w.range);
    if (onShot) onShot(hitAny);
    return hitAny ? 'hit' : 'miss';
  }
  _raycast(origin, dir, range, targets) {
    // Cheap sphere tests against police cars, officers, peds and traffic cars.
    const test = (x, z, y, r, obj) => {
      const ox = x - origin.x, oy = y - origin.y, oz = z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > range) return null;
      const cx = origin.x + dir.x * t - x, cy = origin.y + dir.y * t - y, cz = origin.z + dir.z * t - z;
      return (cx * cx + cy * cy + cz * cz < r * r) ? { t, obj } : null;
    };
    let best = null;
    const consider = (h) => { if (h && (!best || h.t < best.t)) best = h; };
    for (const c of targets.policeCars || []) consider(test(c.x, c.z, 1.0, 2.4, { kind: 'policeCar', ref: c }));
    for (const o of targets.officers || []) consider(test(o.x, o.z, 1.2, 0.9, { kind: 'officer', ref: o }));
    for (const p of targets.peds || []) consider(test(p.x, p.z, 1.2, 0.9, { kind: 'ped', ref: p }));
    for (const c of targets.traffic || []) consider(test(c.x, c.z, 1.0, 2.4, { kind: 'traffic', ref: c }));
    if (!best) return null;
    return {
      damage: (amount) => {
        const o = best.obj;
        if (o.kind === 'policeCar') { o.ref.health -= amount; }
        if (o.kind === 'officer') { o.ref.dead = true; }
        if (o.kind === 'ped') { o.ref.flee = 8; }
        if (o.kind === 'traffic') { o.ref.health -= amount; }
      },
    };
  }
  _showTracer(origin, dir, range) {
    if (this.tracer) this.scene.remove(this.tracer);
    const end = origin.clone().add(dir.clone().multiplyScalar(range * 0.6));
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 }));
    this.scene.add(this.tracer);
    setTimeout(() => { if (this.tracer) { this.scene.remove(this.tracer); this.tracer = null; } }, 60);
  }
  update(dt, px, pz, onPickup) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2;
      if (dist2(px, pz, p.x, p.z) < 4) {
        p.taken = true; this.scene.remove(p.mesh);
        this.owned.add(p.kind); this.ammo[p.kind] = (this.ammo[p.kind] || 0) + 24;
        if (onPickup) onPickup(p.kind);
      }
    }
  }
}
