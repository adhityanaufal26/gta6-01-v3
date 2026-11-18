// Palmera Bay — actors: the player on foot, sidewalk pedestrians, and the
// police response (foot officers, patrol cars that ram, and the helicopter
// that joins at 4–5 wanted stars with a searchlight).
import * as THREE from 'three';
import { WORLD } from './config.js';
import { clamp, lerpAngle, mulberry32, pick, dist2 } from './util.js';
import { resolveCollisions } from './world.js';
import { makeCarMesh } from './vehicles.js';

const SKIN = [0xc98a5a, 0x8a5a3a, 0xe8b88a, 0x6a4a2a];
const SHIRTS = [0xd94f3d, 0x3d7dd9, 0x37b06a, 0xe8c832, 0x8a5fd0, 0xe8e8e8];

export function makePersonMesh(shirtColor, skinColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2b3a4a }));
  legs.position.y = 0.4; g.add(legs);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirt);
  body.position.y = 1.15; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.78; g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirt);
  armL.position.set(-0.4, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = makePersonMesh(0xffd23e, 0xc98a5a);
    this.mesh.position.set(0, 0, 0); scene.add(this.mesh);
    this.x = 0; this.z = 0; this.yaw = 0; this.camYaw = 0;
    this.speed = 0; this.health = 100; this.armor = 0;
    this.inCar = null; this.walkPhase = 0;
  }
  // On-foot step. input: {fwd, back, left, right, run}; camYaw = camera heading.
  step(dt, input, camYaw, colliders) {
    const run = input.run ? 8.5 : 4.2;
    let mx = 0, mz = 0;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    if (input.fwd) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      const nx = this.x + mx * run * dt, nz = this.z + mz * run * dt;
      const [px, pz] = resolveCollisions(nx, nz, 0.5, colliders);
      this.x = clamp(px, -WORLD.half, WORLD.half); this.z = clamp(pz, -WORLD.half, WORLD.half);
      this.yaw = lerpAngle(this.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));
      this.walkPhase += dt * run * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.mesh.userData.armL.rotation.x = swing; this.mesh.userData.armR.rotation.x = -swing;
    } else {
      this.mesh.userData.armL.rotation.x *= 0.8; this.mesh.userData.armR.rotation.x *= 0.8;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
  }
  damage(amount) {
    const absorbed = Math.min(this.armor, amount * 0.6);
    this.armor -= absorbed; this.health -= (amount - absorbed);
    if (this.health < 0) this.health = 0;
  }
}

export class Pedestrians {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.rng = mulberry32(777);
    this.list = [];
    for (let i = 0; i < 30; i++) this.spawn(true);
  }
  spawn(anywhere) {
    const rng = this.rng;
    const road = pick(rng, [ -154, -110, -66, -22, 22, 66, 110, 154 ]);
    const x = road + (rng() < 0.5 ? -9 : 9);
    const z = anywhere ? -215 + rng() * 430 : (rng() < 0.5 ? -215 : 215);
    const mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, SKIN));
    mesh.position.set(x, 0, z); this.scene.add(mesh);
    this.list.push({ mesh, x, z, yaw: rng() * Math.PI * 2, speed: 1 + rng() * 1.2, flee: 0, side: rng() < 0.5 ? -1 : 1 });
  }
  scare(x, z, radius) {
    for (const p of this.list) if (dist2(p.x, p.z, x, z) < radius * radius) p.flee = 6;
  }
  update(dt, playerX, playerZ) {
    for (const p of this.list) {
      let sp = p.speed;
      if (p.flee > 0) { p.flee -= dt; sp = 5.5; }
      // Simple sidewalk stroll: drift along z, bounce at city edge.
      p.z += sp * dt * p.side;
      if (p.z > 220) { p.z = 220; p.side = -1; }
      if (p.z < -220) { p.z = -220; p.side = 1; }
      if (p.flee > 0) { // run away from the player
        const dx = p.x - playerX, dz = p.z - playerZ, d = Math.hypot(dx, dz) || 1;
        p.x = clamp(p.x + (dx / d) * sp * dt, -WORLD.half, WORLD.half);
        p.z = clamp(p.z + (dz / d) * sp * dt, -WORLD.half, WORLD.half);
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.flee > 0 ? Math.atan2(p.x - playerX, p.z - playerZ) : (p.side > 0 ? 0 : Math.PI);
    }
  }
}

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.cars = []; this.officers = []; this.heli = null; this.heliLight = null;
    this.spawnTimer = 0; this.officerTimer = 0;
  }
  get count() { return this.cars.length + this.officers.length + (this.heli ? 1 : 0); }
  clear() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const o of this.officers) this.scene.remove(o.mesh);
    if (this.heli) { this.scene.remove(this.heli); this.scene.remove(this.heliLight); }
    this.cars = []; this.officers = []; this.heli = null; this.heliLight = null;
  }
  spawnCar(px, pz) {
    const mesh = makeCarMesh(0x1a2a3a, 'Patrol');
    const g = new THREE.Group();
    // Light bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2233 }));
    bar.position.set(0, 1.45, -0.2); mesh.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.55; mesh.add(stripe);
    g.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    const x = clamp(px + Math.cos(angle) * 70, -220, 220);
    const z = clamp(pz + Math.sin(angle) * 70, -220, 220);
    g.position.set(x, 0, z); this.scene.add(g);
    this.cars.push({ mesh: g, x, z, yaw: Math.atan2(px - x, pz - z), speed: 0, health: 60 });
  }
  spawnOfficer(px, pz) {
    const mesh = makePersonMesh(0x1a2a3a, 0x8a5a3a);
    const angle = Math.random() * Math.PI * 2;
    const x = clamp(px + Math.cos(angle) * 26, -220, 220);
    const z = clamp(pz + Math.sin(angle) * 26, -220, 220);
    mesh.position.set(x, 0, z); this.scene.add(mesh);
    this.officers.push({ mesh, x, z, yaw: 0, punchCd: 0 });
  }
  spawnHeli(px, pz) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4),
      new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
    tail.position.set(0, 0.2, -4); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x333333 }));
    rotor.position.y = 1.0; g.add(rotor); g.userData.rotor = rotor;
    const light = new THREE.SpotLight(0xfff2b0, 3.2, 90, 0.32, 0.4);
    light.position.set(0, -0.6, 0); g.add(light);
    g.position.set(px, 9, pz + 30); this.scene.add(g);
    this.heli = g; this.heliLight = light;
  }
  update(dt, wanted, px, pz, player, onRam) {
    const wantCars = wanted >= 1 ? Math.min(1 + Math.floor(wanted / 2), 4) : 0;
    const wantOfficers = wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
    this.spawnTimer -= dt; this.officerTimer -= dt;
    if (wanted > 0) {
      if (this.cars.length < wantCars && this.spawnTimer <= 0) { this.spawnCar(px, pz); this.spawnTimer = 3; }
      if (this.officers.length < wantOfficers && this.officerTimer <= 0 && !player.inCar) {
        this.spawnOfficer(px, pz); this.officerTimer = 4;
      }
    }
    if (wanted >= 4 && !this.heli) this.spawnHeli(px, pz);
    if (wanted < 4 && this.heli) { this.scene.remove(this.heli); this.heli = null; }
    // Patrol cars chase and ram.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (wanted === 0 || c.health <= 0) { this.scene.remove(c.mesh); this.cars.splice(i, 1); continue; }
      const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz) || 1;
      const targetYaw = Math.atan2(dx, dz);
      c.yaw = lerpAngle(c.yaw, targetYaw, Math.min(1, dt * 1.6));
      c.speed = clamp(c.speed + (d > 12 ? 18 : 6) * dt, 0, 30);
      c.x += Math.sin(c.yaw) * c.speed * dt; c.z += Math.cos(c.yaw) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.yaw;
      if (d < 3.2) { onRam(c); c.speed *= 0.4; c.x -= Math.sin(c.yaw) * 2; c.z -= Math.cos(c.yaw) * 2; }
    }
    // Officers run at the player on foot and punch.
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (wanted === 0 || player.inCar) { this.scene.remove(o.mesh); this.officers.splice(i, 1); continue; }
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz) || 1;
      o.x += (dx / d) * 6.5 * dt; o.z += (dz / d) * 6.5 * dt;
      o.mesh.position.set(o.x, 0, o.z); o.mesh.rotation.y = Math.atan2(dx, dz);
      o.punchCd -= dt;
      if (d < 1.6 && o.punchCd <= 0) { player.damage(8); o.punchCd = 1.1; }
    }
    // Helicopter hovers off to the side and above the player, searchlight tracking,
    // so it stays visible in the chase camera's frame.
    if (this.heli) {
      const h = this.heli;
      // Offset front-left of the player's heading so it stays in the chase cam.
      const heading = player.inCar ? player.inCar.yaw : player.yaw;
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const hx = px + fx * 30, hz = pz + fz * 30;
      h.position.x += (hx - h.position.x) * Math.min(1, dt * 0.8);
      h.position.z += (hz - h.position.z) * Math.min(1, dt * 0.8);
      h.position.y += (9 + Math.sin(performance.now() * 0.001) * 1.5 - h.position.y) * Math.min(1, dt * 1.2);
      h.userData.rotor.rotation.y += dt * 22;
      h.rotation.y += dt * 0.3;
      this.heliLight.target.position.set(px - h.position.x, -9, pz - h.position.z);
      h.add(this.heliLight.target);
    }
  }
}
