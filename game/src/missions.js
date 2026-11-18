// Palmera Bay — story: 7 missions in one arc, plus taxi fares and the
// collectible / stunt-jump side content. A mission is a small state machine
// of steps (goto, multi-stop, tail, collect, survive, taxi, heist).
import * as THREE from 'three';
import { MISSIONS, WORLD } from './config.js';
import { clamp, dist2, fmtTime, mulberry32, pick } from './util.js';

export function gradeFor(elapsed, par, damage, wantedPeak, accuracy) {
  let score = 100;
  score -= Math.max(0, (elapsed - par) / par) * 30;
  score -= damage * 0.4;
  score -= wantedPeak * 3;
  if (accuracy !== null) score += (accuracy - 0.5) * 20;
  if (score >= 92) return 'S';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export class MissionRunner {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng || mulberry32(4242);
    this.active = null;        // {def, step, t, ...}
    this.completed = new Set();
    this.nextIndex = 0;
    this.waypoint = null;      // THREE mesh for the current target
    this.waypointRing = null;
    this.collectMeshes = [];
    this.tailTarget = null;    // traffic car being tailed
    this.taxi = null;          // {phase, pickup, dropoff, fare}
    this.stats = { damage: 0, wantedPeak: 0, shots: 0, hits: 0 };
    this.onComplete = null;    // (def, grade, stats) => void
    this.onFail = null;        // (def, reason) => void
    this.onUpdate = null;      // (text) => void
  }
  get currentDef() { return this.active ? this.active.def : null; }
  nextDef() { return MISSIONS[this.nextIndex] || null; }
  unlockAll() { this.nextIndex = MISSIONS.length; }

  start(index) {
    const def = MISSIONS[index];
    if (!def) return false;
    this.clearWaypoint();
    this.active = { def, t: 0, step: 0, tailTime: 0, collected: 0, faresDone: 0, sub: 0 };
    this.stats = { damage: 0, wantedPeak: 0, shots: 0, hits: 0 };
    if (def.type === 'goto') this.setWaypoint(def.target.x, def.target.z);
    if (def.type === 'multi') this.setWaypoint(def.targets[0].x, def.targets[0].z);
    if (def.type === 'collect') this.spawnCollect(def.count);
    if (def.type === 'heist') this.spawnCollect(def.count);
    if (def.type === 'taxi') this.startFare();
    return true;
  }
  abort() { this.clearWaypoint(); this.clearCollect(); this.active = null; this.taxi = null; }
  setWaypoint(x, z) {
    this.clearWaypoint();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.4, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.4, z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    beam.position.set(x, 17, z);
    this.scene.add(ring); this.scene.add(beam);
    this.waypoint = { x, z, ring, beam };
  }
  moveWaypoint(x, z) {
    if (!this.waypoint) { this.setWaypoint(x, z); return; }
    this.waypoint.x = x; this.waypoint.z = z;
    this.waypoint.ring.position.set(x, this.waypoint.ring.position.y, z);
    this.waypoint.beam.position.set(x, 17, z);
  }
  clearWaypoint() {
    if (!this.waypoint) return;
    this.scene.remove(this.waypoint.ring); this.scene.remove(this.waypoint.beam);
    this.waypoint = null;
  }
  spawnCollect(n) {
    this.clearCollect();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x7a5a00 });
    for (let i = 0; i < n; i++) {
      const x = pick(this.rng, [-154, -110, -66, -22, 22, 66, 110, 154]) + (this.rng() < 0.5 ? -9 : 9);
      const z = -200 + this.rng() * 400;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat);
      m.position.set(x, 1.0, z); this.scene.add(m);
      this.collectMeshes.push({ x, z, mesh: m });
    }
  }
  clearCollect() {
    for (const c of this.collectMeshes) this.scene.remove(c.mesh);
    this.collectMeshes = [];
  }
  startFare() {
    const rng = this.rng;
    const road = () => pick(rng, [-154, -110, -66, -22, 22, 66, 110, 154]);
    const pickup = { x: road(), z: -180 + rng() * 360 };
    const dropoff = { x: road(), z: -180 + rng() * 360 };
    this.taxi = { pickup, dropoff, phase: 'pickup' };
    this.setWaypoint(pickup.x, pickup.z);
  }
  complete(def) {
    const acc = this.stats.shots > 0 ? this.stats.hits / this.stats.shots : null;
    const grade = gradeFor(this.active.t, def.par, this.stats.damage, this.stats.wantedPeak, acc);
    this.completed.add(def.id);
    this.nextIndex = Math.max(this.nextIndex, def.id); // ids are 1-based, sequential
    this.clearWaypoint(); this.clearCollect(); this.active = null; this.taxi = null;
    if (this.onComplete) this.onComplete(def, grade, { ...this.stats, accuracy: acc });
  }
  fail(reason) {
    const def = this.active ? this.active.def : null;
    this.clearWaypoint(); this.clearCollect(); this.active = null; this.taxi = null;
    if (this.onFail && def) this.onFail(def, reason);
  }
  // Called every frame; returns objective text for the HUD.
  update(dt, px, pz, game) {
    if (this.waypoint) {
      this.waypoint.ring.rotation.z += dt;
      this.waypoint.ring.position.y = 0.4 + Math.sin(performance.now() * 0.004) * 0.25;
    }
    for (const c of this.collectMeshes) c.mesh.rotation.y += dt * 2;
    if (!this.active) return null;
    const a = this.active, def = a.def;
    a.t += dt;
    const timeLeft = def.time - a.t;
    if (timeLeft <= 0 && def.type !== 'goto') { this.fail('Out of time.'); return null; }
    if (timeLeft <= 0 && def.type === 'goto') { this.fail('Out of time.'); return null; }
    const near = (x, z, r) => dist2(px, pz, x, z) < r * r;
    switch (def.type) {
      case 'goto': {
        if (near(def.target.x, def.target.z, 7)) { this.complete(def); return null; }
        return { title: `Job ${def.id}: ${def.name}`, text: `Drive to the gold marker. ${fmtTime(timeLeft)} left.` };
      }
      case 'multi': {
        const t = def.targets[a.step];
        if (near(t.x, t.z, 7)) {
          a.step++;
          if (a.step >= def.targets.length) { this.complete(def); return null; }
          this.setWaypoint(def.targets[a.step].x, def.targets[a.step].z);
        }
        return { title: `Job ${def.id}: ${def.name}`, text: `Drop ${a.step + 1} of ${def.targets.length} — reach the marker. ${fmtTime(timeLeft)} left.` };
      }
      case 'tail': {
        const tgt = this.tailTarget;
        if (!tgt) return { title: `Job ${def.id}: ${def.name}`, text: 'Get in a car and find the courier…' };
        const d = Math.sqrt(dist2(px, pz, tgt.x, tgt.z));
        if (d > 70) { this.fail('You lost the courier.'); return null; }
        if (d > 12 && d < 48) a.tailTime += dt;
        else a.tailTime = Math.max(0, a.tailTime - dt * 0.5);
        if (a.tailTime >= 30) { this.complete(def); return null; }
        return { title: `Job ${def.id}: ${def.name}`, text: `Stay 12–48m behind the courier: ${Math.floor(a.tailTime)}/30s. ${fmtTime(timeLeft)} left.` };
      }
      case 'collect': {
        for (let i = this.collectMeshes.length - 1; i >= 0; i--) {
          const c = this.collectMeshes[i];
          if (near(c.x, c.z, 4)) {
            this.scene.remove(c.mesh); this.collectMeshes.splice(i, 1);
            a.collected++; game.addCash(50); game.toast('Stash collected', `+ $50 · ${a.collected}/${def.count}`);
          }
        }
        if (a.collected >= def.count) {
          if (!this.waypoint) this.setWaypoint(def.target.x, def.target.z);
          if (near(def.target.x, def.target.z, 7)) { this.complete(def); return null; }
          return { title: `Job ${def.id}: ${def.name}`, text: 'All stashes grabbed — deliver them to the safehouse garage.' };
        }
        return { title: `Job ${def.id}: ${def.name}`, text: `Collect the stashes: ${a.collected}/${def.count}. ${fmtTime(timeLeft)} left.` };
      }
      case 'survive': {
        if (game.wanted < 2) game.setWanted(3);
        if (a.t >= def.time) {
          if (!this.waypoint) this.setWaypoint(game.markers.safehouse.x, game.markers.safehouse.z);
          if (near(game.markers.safehouse.x, game.markers.safehouse.z, 8)) {
            game.setWanted(0); this.complete(def); return null;
          }
          return { title: `Job ${def.id}: ${def.name}`, text: 'You survived the dragnet — slip into the safehouse zone to vanish.' };
        }
        return { title: `Job ${def.id}: ${def.name}`, text: `Lose the heat: survive ${fmtTime(def.time - a.t)} more, then reach the safehouse.` };
      }
      case 'taxi': {
        const tx = this.taxi;
        if (tx.phase === 'pickup' && near(tx.pickup.x, tx.pickup.z, 7)) {
          tx.phase = 'drop'; this.setWaypoint(tx.dropoff.x, tx.dropoff.z);
          game.toast('Passenger aboard', 'Drive to the destination marker.');
        } else if (tx.phase === 'drop' && near(tx.dropoff.x, tx.dropoff.z, 7)) {
          a.faresDone++; game.addCash(180); game.toast('Fare complete', `+ $180 · ${a.faresDone}/${def.fares} fares`);
          if (a.faresDone >= def.fares) { this.complete(def); return null; }
          this.startFare();
        }
        const phase = tx.phase === 'pickup' ? 'Pick up the passenger' : 'Drop off the passenger';
        return { title: `Job ${def.id}: ${def.name}`, text: `${phase} — fare ${a.faresDone + 1}/${def.fares}. ${fmtTime(timeLeft)} left.` };
      }
      case 'heist': {
        for (let i = this.collectMeshes.length - 1; i >= 0; i--) {
          const c = this.collectMeshes[i];
          if (near(c.x, c.z, 4)) {
            this.scene.remove(c.mesh); this.collectMeshes.splice(i, 1);
            a.collected++; game.setWanted(4);
            game.toast('Strongbox grabbed', `${a.collected}/${def.count} — the heat is on!`);
          }
        }
        if (a.collected >= def.count) {
          if (!this.waypoint) this.setWaypoint(def.target.x, def.target.z);
          if (near(def.target.x, def.target.z, 8)) { game.setWanted(0); this.complete(def); return null; }
          return { title: `Job ${def.id}: ${def.name}`, text: 'All three strongboxes — get to the boat at the Old Marina!' };
        }
        return { title: `Job ${def.id}: ${def.name}`, text: `Grab the strongboxes: ${a.collected}/${def.count}. ${fmtTime(timeLeft)} left.` };
      }
      default: return null;
    }
  }
}
