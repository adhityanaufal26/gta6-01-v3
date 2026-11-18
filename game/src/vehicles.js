// Palmera Bay — cars: mesh factory, arcade driving physics, traffic AI.
// Traffic cars follow the road grid in lanes; the player car uses simple
// arcade physics (accelerate / brake / steer / handbrake) with AABB collisions.
import * as THREE from 'three';
import { WORLD, CAR_COLORS, CAR_NAMES } from './config.js';
import { clamp, lerpAngle, mulberry32, pick, dist2 } from './util.js';
import { resolveCollisions } from './world.js';

export function makeCarMesh(color, name) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1a2a3a }));
  cabin.position.set(0, 1.1, -0.2); g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.5), bodyMat);
  nose.position.set(0, 0.5, 2.3); g.add(nose);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    l.position.set(sx, 0.62, 2.56); g.add(l);
  }
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
    g.userData.wheels.push(w);
  }
  g.userData.name = name || 'Car';
  return g;
}

export class Car {
  constructor(scene, x, z, yaw, color, name, opts = {}) {
    this.mesh = makeCarMesh(color, name);
    this.mesh.position.set(x, 0, z); this.mesh.rotation.y = yaw;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.yaw = yaw;
    this.speed = 0; this.health = 100;
    this.isPlayer = !!opts.player; this.isPolice = !!opts.police; this.isTraffic = !!opts.traffic;
    this.name = name || 'Car'; this.color = color;
    this.topSpeed = opts.topSpeed || 26;
    this.accel = opts.accel || 14;
    this.stolen = false; this.driver = null; // traffic driver ped ref
    this.engine = opts.engine || 0; // upgrade level
    this.carArmor = !!opts.carArmor;
    this.paint = !!opts.paint;
  }
  get top() { return this.topSpeed * (1 + 0.25 * this.engine); }
  // Arcade drive step. input: {fwd, back, left, right, handbrake}
  drive(dt, input, colliders) {
    const accel = this.accel * (1 + 0.2 * this.engine);
    if (input.fwd) this.speed += accel * dt;
    if (input.back) this.speed -= (this.speed > 0.5 ? 22 : 9) * dt;
    if (!input.fwd && !input.back) this.speed -= Math.sign(this.speed) * 6 * dt;
    if (input.handbrake) this.speed -= Math.sign(this.speed) * 26 * dt;
    this.speed = clamp(this.speed, -10, this.top);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const dir = this.speed >= 0 ? 1 : -1;
    this.yaw += steer * 1.9 * dt * clamp(Math.abs(this.speed) / 8, 0, 1) * dir * (input.handbrake ? 1.5 : 1);
    const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    const [rx, rz] = resolveCollisions(nx, nz, 1.6, colliders);
    if (rx !== nx || rz !== nz) { if (Math.abs(this.speed) > 8) this.health -= 1; this.speed *= 0.55; }
    this.x = clamp(rx, -WORLD.half, WORLD.half);
    this.z = clamp(rz, -WORLD.half, WORLD.half);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2;
    this.mesh.rotation.z = -steer * clamp(Math.abs(this.speed) / 26, 0, 1) * 0.05;
  }
  damage(amount) {
    this.health -= this.carArmor ? amount * 0.5 : amount;
    if (this.health < 0) this.health = 0;
  }
  remove(scene) { scene.remove(this.mesh); }
}

export class Traffic {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.cars = []; this.rng = mulberry32(1337);
    for (let i = 0; i < 36; i++) this.spawn(true);
  }
  spawn(anywhere) {
    const rng = this.rng;
    const vertical = rng() < 0.5;
    const road = pick(rng, WORLD.roads);
    const lane = (rng() < 0.5 ? -2.8 : 2.8);
    const along = anywhere ? -215 + rng() * 430 : (rng() < 0.5 ? -215 : 215);
    const dir = rng() < 0.5 ? 1 : -1;
    const x = vertical ? road + lane : along;
    const z = vertical ? along : road + lane;
    const yaw = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = new Car(this.scene, x, z, yaw, pick(rng, CAR_COLORS), pick(rng, CAR_NAMES), { traffic: true });
    car.vertical = vertical; car.road = road; car.dir = dir; car.lane = lane;
    car.cruise = 9 + rng() * 6;
    this.cars.push(car);
    return car;
  }
  // Find the nearest traffic car to a point (for stealing / entering).
  nearest(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.cars) { const d = dist2(x, z, c.x, c.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  update(dt, playerX, playerZ, playerCar) {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      // Slow down for the player car ahead, and for collisions.
      let target = c.cruise;
      if (playerCar && dist2(c.x, c.z, playerCar.x, playerCar.z) < 100) target = c.cruise * 0.35;
      if (playerCar && dist2(c.x, c.z, playerCar.x, playerCar.z) < 16) target = 0;
      c.speed = lerpAngle(c.speed, target, Math.min(1, dt * 2));
      // Move along the road axis using yaw (forward = +sin/+cos of yaw).
      c.x += Math.sin(c.yaw) * c.speed * dt;
      c.z += Math.cos(c.yaw) * c.speed * dt;
      if (c.x < -225 || c.x > 225 || c.z < -225 || c.z > 225) {
        // Wrap: respawn on the opposite edge of the same road.
        const along = c.dir > 0 ? -215 : 215;
        if (c.vertical) { c.z = along; } else { c.x = along; }
      }
      c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.yaw;
      for (const w of c.mesh.userData.wheels) w.rotation.x += c.speed * dt * 2;
    }
    // Keep the fleet topped up.
    while (this.cars.length < 36) this.spawn(false);
  }
  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
