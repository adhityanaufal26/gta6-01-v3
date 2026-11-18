// Palmera Bay — the city itself: grid streets, procedural buildings, palms,
// beach and water, port, parks, markers, collectibles and stunt ramps.
// All geometry is generated at runtime; no external art or assets.
import * as THREE from 'three';
import { WORLD, DISTRICTS } from './config.js';
import { mulberry32, pick } from './util.js';

const BUILDING_COLORS = [0xf2e3c6, 0xe8b4a0, 0xa8c8d8, 0xd8c8e8, 0xf5d76e, 0x9fd8b0, 0xe8e8e8, 0xd98a6a, 0x7fb8c8];

function windowTexture(rng, base) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#' + base.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 14) for (let x = 6; x < 58; x += 14) {
    const lit = rng() < 0.45;
    g.fillStyle = lit ? '#ffe9a0' : '#20344a';
    g.fillRect(x, y, 9, 10);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 5.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
  trunk.position.y = 2.7; trunk.rotation.z = 0.08; g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.3, 5.6, Math.sin(a) * 1.3);
    leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
    g.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x6a4a20 }));
  nut.position.y = 5.2; g.add(nut);
  return g;
}

export function buildWorld(scene, rng) {
  const colliders = []; // {x, z, hx, hz}
  const buildings = [];
  const markers = {};   // shop / safehouse / garage / mission positions
  const collectibles = [];
  const ramps = [];

  // Sky, sun, ground
  scene.background = new THREE.Color(0x87c8e8);
  scene.fog = new THREE.Fog(0x9fd0e8, 260, 620);
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.1);
  sun.position.set(120, 180, 60); scene.add(sun);

  const groundMat = new THREE.MeshLambertMaterial({ color: 0x9a9a8a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), groundMat);
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // Grass parks
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x58a85a });
  for (const [px, pz] of [[-22, 110], [66, -66], [-110, 22]]) {
    const park = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), parkMat);
    park.rotation.x = -Math.PI / 2; park.position.set(px, 0.02, pz); scene.add(park);
  }
  // Beach sand + water (east edge)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(48, 470),
    new THREE.MeshLambertMaterial({ color: 0xe8d8a0 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(WORLD.beachX + 12, 0.03, 0); scene.add(sand);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 480),
    new THREE.MeshLambertMaterial({ color: 0x2a7fc8 }));
  water.rotation.x = -Math.PI / 2; water.position.set(WORLD.waterX + 50, 0.01, 0); scene.add(water);

  // Roads: dark asphalt strips + centre dashes
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xf2e9a0 });
  for (const r of WORLD.roads) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadW, 470), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, 0.04, 0); scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(470, WORLD.roadW), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.04, r); scene.add(h);
    for (let z = -220; z < 220; z += 16) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      d.rotation.x = -Math.PI / 2; d.position.set(r, 0.06, z); scene.add(d);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      d2.rotation.x = -Math.PI / 2; d2.position.set(z, 0.06, r); scene.add(d2);
    }
  }

  // Buildings: one or two per block, varied height and colour
  const blockCentres = [];
  for (let i = 0; i < WORLD.roads.length - 1; i++)
    for (let j = 0; j < WORLD.roads.length - 1; j++)
      blockCentres.push([(WORLD.roads[i] + WORLD.roads[i + 1]) / 2, (WORLD.roads[j] + WORLD.roads[j + 1]) / 2]);
  for (const [bx, bz] of blockCentres) {
    if (bx > 196 || (bx === -22 && bz === 110) || (bx === 66 && bz === -66) || (bx === -110 && bz === 22)) continue; // beach / parks
    if (rng() < 0.08) continue; // empty lot
    const n = rng() < 0.4 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = 12 + rng() * 14, d = 12 + rng() * 14;
      const h = 8 + rng() * rng() * 46;
      const ox = n === 2 ? (k === 0 ? -9 : 9) : 0, oz = n === 2 ? (k === 0 ? 6 : -6) : 0;
      const color = pick(rng, BUILDING_COLORS);
      const mat = new THREE.MeshLambertMaterial({ map: windowTexture(rng, color) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(bx + ox, h / 2, bz + oz); scene.add(b); buildings.push(b);
      colliders.push({ x: bx + ox, z: bz + oz, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
      // roof trim
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
        new THREE.MeshLambertMaterial({ color: 0x5a4a3a }));
      roof.position.set(bx + ox, h + 0.25, bz + oz); scene.add(roof);
    }
  }

  // Palm trees along the beach, sidewalks and parks
  for (let z = -210; z <= 210; z += 18) {
    const p = makePalm(); p.position.set(206, 0, z + (rng() - 0.5) * 6); scene.add(p);
  }
  for (let i = 0; i < 46; i++) {
    const p = makePalm();
    p.position.set(pick(rng, WORLD.roads) + (rng() < 0.5 ? -8 : 8), 0, -215 + rng() * 430);
    p.scale.setScalar(0.8 + rng() * 0.4); scene.add(p);
  }

  // Port: containers + cranes (south-west)
  const contColors = [0xc84a3d, 0x3d7dd9, 0x37b06a, 0xe8c832];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 3.4),
      new THREE.MeshLambertMaterial({ color: pick(rng, contColors) }));
    c.position.set(-205 + (i % 5) * 12, 1.5 + Math.floor(i / 5) * 3.2, 190 - (i % 3) * 8);
    c.rotation.y = (rng() - 0.5) * 0.1; scene.add(c);
    colliders.push({ x: c.position.x, z: c.position.z, hx: 5.4, hz: 2.1 });
  }

  // Stunt ramps (orange wedges)
  const rampMat = new THREE.MeshLambertMaterial({ color: 0xe87b2e });
  for (const [rx, rz, ry] of [[-22, -40, 0], [110, 88, Math.PI / 2], [-110, -88, Math.PI], [66, 154, -Math.PI / 2]]) {
    const ramp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 6, 8, 4, 1), rampMat);
    ramp.rotation.y = ry + Math.PI / 4; ramp.scale.set(1, 0.5, 1.4);
    ramp.position.set(rx, 1.2, rz); scene.add(ramp);
    ramps.push({ x: rx, z: rz, used: false });
  }

  // District name sprites (canvas textures on planes, floating above blocks)
  for (const d of DISTRICTS) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(8,24,38,0.65)'; g.fillRect(0, 0, 256, 48);
    g.fillStyle = '#ffffff'; g.font = 'bold 26px Arial'; g.textAlign = 'center';
    g.fillText(d.name.toUpperCase(), 128, 33);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(30, 5.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    sp.position.set(d.cx, 26, d.cz); scene.add(sp);
  }

  // Place markers: shop, safehouse, garage, mission start, taxi stand
  markers.shop = { x: 22, z: -22, label: 'AMMU-NATION style shop', kind: 'shop' };
  markers.safehouse = { x: -22, z: 132, label: 'Safehouse', kind: 'safehouse' };
  markers.garage = { x: 66, z: 66, label: 'Garage', kind: 'garage' };
  markers.mission = { x: -22, z: -22, label: 'Story job', kind: 'mission' };
  markers.taxi = { x: 110, z: -22, label: 'Taxi stand', kind: 'taxi' };
  const markerColors = { shop: 0x37b06a, safehouse: 0x3d7dd9, garage: 0xe87b2e, mission: 0xffd23e, taxi: 0xf2e9a0 };
  for (const [key, m] of Object.entries(markers)) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 8, 24),
      new THREE.MeshBasicMaterial({ color: markerColors[key] }));
    ring.rotation.x = Math.PI / 2; ring.position.set(m.x, 0.35, m.z); scene.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: markerColors[key], transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
    beam.position.set(m.x, 13, m.z); scene.add(beam);
    m.beam = beam; m.ring = ring;
  }

  // 12 hidden packages (glowing green crates)
  const pkgMat = new THREE.MeshLambertMaterial({ color: 0x37ff8a, emissive: 0x1a7a3a });
  for (let i = 0; i < 12; i++) {
    const x = pick(rng, WORLD.roads) + (rng() < 0.5 ? -9 : 9);
    const z = -200 + rng() * 400;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), pkgMat);
    p.position.set(x, 0.9, z); scene.add(p);
    collectibles.push({ x, z, mesh: p, taken: false });
  }

  return { colliders, buildings, markers, collectibles, ramps };
}

// Circle (radius r) vs AABB colliders: push the point out, return corrected pos.
export function resolveCollisions(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
      else { x = c.x + c.hx + r; }
    }
  }
  return [x, z];
}
