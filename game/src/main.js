// Palmera Bay — entry point: renderer, camera, input, game state, wanted
// level, stealing, radio, shops, saves, and the ?shot= hooks used for the
// screenshots. No network requests: three.js is vendored under game/vendor.
import * as THREE from 'three';
import { WORLD, WEAPONS, STATIONS, MISSIONS, SAVE_KEY, START_CASH } from './config.js';
import { clamp, lerpAngle, mulberry32, pick, dist2, fmtCash } from './util.js';
import { SoundBank } from './audio.js';
import { buildWorld, resolveCollisions } from './world.js';
import { Car, Traffic } from './vehicles.js';
import { Player, Pedestrians, Police } from './actors.js';
import { MissionRunner } from './missions.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 20261118);
const rng = mulberry32(seed);
const shot = params.get('shot') || '';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const sound = new SoundBank();
const ui = new UI();
const world = buildWorld(scene, rng);
const traffic = new Traffic(scene, world.colliders);
const player = new Player(scene);
player.x = -22; player.z = 0; player.mesh.position.set(-22, 0, 0); // start on the road, not inside a block
const peds = new Pedestrians(scene, world.colliders);
const police = new Police(scene);
const missions = new MissionRunner(scene, rng);
const combat = new Combat(scene);

const game = {
  state: 'title',           // title | playing | briefing | results | shop | paused
  cash: START_CASH, wanted: 0, wantedPeak: 0, clockMin: 480,
  camYaw: 0, camMode: 0, camDist: 8,
  parkedCars: [],           // cars the player has left behind
  collectiblesGot: 0, bestScore: 0,
  upgrades: { engine: 0, carArmor: false, paint: false },
  hideTimer: 0, decayTimer: 0, damageTaken: 0,
  talkTimer: 0, muted: false,
  markers: world.markers,
  addCash(n) { this.cash += n; sound.cash(); },
  setWanted(n) { this.wanted = clamp(n, 0, 5); this.wantedPeak = Math.max(this.wantedPeak, this.wanted); },
  toast(t, s) { ui.toast(t, s); },
};
window.__PB = { game, missions, combat, player, traffic, police, ui, sound, camera, version: 3 };

// ---- input ----
const keys = {};
let mouseDown = false, lastMX = 0, lastMY = 0, pointerLocked = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true; sound.ensure();
  if (game.state === 'playing') {
    if (e.code === 'KeyE') tryEnterExitCar();
    if (e.code === 'KeyF') tryInteract();
    if (e.code === 'KeyR') cycleRadio();
    if (e.code === 'KeyC') cycleCamera();
    if (e.code === 'KeyM') ui.toggleMinimap();
    if (e.code === 'KeyU') { game.muted = sound.toggleMute(); ui.toast(game.muted ? 'Sound muted' : 'Sound on', ''); }
    if (e.code.startsWith('Digit')) {
      const idx = Number(e.code.slice(5)) - 1;
      const w = WEAPONS[idx + 1];
      if (w && combat.select(w.id)) { ui.toast(w.name, 'Weapon ready'); sound.blip(660, 0.06, 0.1); }
    }
    if (e.code === 'ArrowLeft') game.camYaw += 0.25;
    if (e.code === 'ArrowRight') game.camYaw -= 0.25;
    if (e.code === 'Escape') pauseGame(true);
  } else if (game.state === 'paused' && e.code === 'Escape') pauseGame(false);
  else if (game.state === 'shop' && e.code === 'KeyF') closeShop();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  mouseDown = true; lastMX = e.clientX; lastMY = e.clientY;
  sound.ensure();
  if (game.state === 'playing') {
    shootOnce();
  }
});
addEventListener('mouseup', () => { mouseDown = false; });
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (pointerLocked) { game.camYaw -= e.movementX * 0.0032; }
  else if (mouseDown) { game.camYaw -= (e.clientX - lastMX) * 0.006; lastMX = e.clientX; lastMY = e.clientY; }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- state helpers ----
function saveLabel() {
  const s = ui.loadSave();
  return s ? `Saved · ${s.completed.length}/7 jobs · ${fmtCash(s.cash)}` : 'No save yet';
}
function collectSave() {
  return {
    cash: game.cash, health: player.health, armor: player.armor,
    completed: [...missions.completed], nextIndex: missions.nextIndex,
    collectibles: game.collectiblesGot, upgrades: game.upgrades,
    weapons: [...combat.owned], bestScore: game.bestScore,
    station: sound.station, clockMin: game.clockMin,
  };
}
function applySave(s) {
  game.cash = s.cash; player.health = s.health ?? 100; player.armor = s.armor ?? 0;
  missions.completed = new Set(s.completed || []);
  missions.nextIndex = s.nextIndex || 0;
  game.collectiblesGot = s.collectibles || 0;
  Object.assign(game.upgrades, s.upgrades || {});
  combat.owned = new Set(s.weapons || ['fists']);
  game.bestScore = s.bestScore || 0;
  game.clockMin = s.clockMin || 480;
  if (typeof s.station === 'number') sound.station = s.station;
}
function saveGame(silent) {
  const ok = ui.writeSave(collectSave());
  if (!silent) ui.toast(ok ? 'Game saved' : 'Save failed', ok ? 'Progress stored at the safehouse.' : '');
  return ok;
}
function startPlay(fresh) {
  if (fresh) {
    game.cash = START_CASH; game.wanted = 0; game.wantedPeak = 0; game.clockMin = 480;
    game.collectiblesGot = 0; game.bestScore = 0;
    game.upgrades = { engine: 0, carArmor: false, paint: false };
    missions.completed = new Set(); missions.nextIndex = 0;
    combat.owned = new Set(['fists']); combat.current = 'fists'; combat.refillAmmo();
    player.health = 100; player.armor = 0;
    police.clear(); missions.abort();
    player.x = -22; player.z = 0; player.mesh.position.set(-22, 0, 0); player.inCar = null;
  }
  ui.showTitle(false); ui.showResults(null, '', 0, {}, 0, false); ui.showBriefing(null, false);
  ui.showPause(false); ui.closeShop(); ui.showHud(true);
  game.state = 'playing';
  updateRadioHud();
}
function pauseGame(on) {
  if (on) { game.state = 'paused'; ui.showPause(true); }
  else { game.state = 'playing'; ui.showPause(false); }
}
function quitToTitle() {
  game.state = 'title'; police.clear(); missions.abort();
  if (player.inCar) { player.inCar = null; }
  ui.showHud(false); ui.showPause(false); ui.closeShop(); ui.showResults(null, '', 0, {}, 0, false);
  ui.renderTitle(ui.loadSave(), game.bestScore);
  ui.showTitle(true);
}

// ---- cars: enter / exit / steal ----
function nearestParked() {
  let best = null, bd = 5 * 5;
  for (const c of game.parkedCars) { const d = dist2(player.x, player.z, c.x, c.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function tryEnterExitCar() {
  if (player.inCar) {
    const car = player.inCar;
    player.inCar = null;
    player.x = car.x - Math.cos(car.yaw) * 3; player.z = car.z + Math.sin(car.yaw) * 3;
    if (!game.parkedCars.includes(car)) game.parkedCars.push(car);
    sound.setRadioAudible(false);
    ui.toast('On foot', car.name);
    return;
  }
  const parked = nearestParked();
  if (parked) { enterCar(parked, false); return; }
  const t = traffic.nearest(player.x, player.z, 5);
  if (t) {
    traffic.removeCar(t);
    t.isTraffic = false; t.stolen = true;
    if (t.driver) { t.driver = null; }
    enterCar(t, true);
    game.setWanted(game.wanted + 1);
    peds.scare(player.x, player.z, 25);
    ui.toast('Car stolen!', 'The law noticed. Wanted level up.');
    sound.blip(220, 0.2, 0.2);
  }
}
function enterCar(car, stolen) {
  // Apply garage upgrades to the player's car.
  car.engine = game.upgrades.engine; car.carArmor = game.upgrades.carArmor;
  player.inCar = car;
  if (!game.parkedCars.includes(car)) game.parkedCars.push(car);
  sound.setRadioAudible(true);
  ui.toast(stolen ? 'You took the ' + car.name : 'In the ' + car.name, stolen ? '' : 'Drive with WASD · Space handbrake');
}
// ---- interact: shops, safehouse, garage, mission start ----
function nearestMarker(maxD) {
  let best = null, bd = maxD * maxD;
  for (const [key, m] of Object.entries(world.markers)) {
    const d = dist2(player.x, player.z, m.x, m.z);
    if (d < bd) { bd = d; best = { key, ...m }; }
  }
  return best;
}
function tryInteract() {
  const m = nearestMarker(7);
  if (!m) return;
  if (m.kind === 'mission') {
    const def = missions.nextDef();
    if (!def) { ui.toast('All jobs done', 'You finished the story. Free roam, legend.'); return; }
    game.state = 'briefing'; ui.showBriefing(def, true);
    return;
  }
  if (m.kind === 'safehouse' || m.kind === 'shop' || m.kind === 'garage') {
    game.state = 'shop'; ui.openShop(m.kind, game.cash);
  }
}
function closeShop() { ui.closeShop(); game.state = 'playing'; }
ui.onBuy = (item) => {
  if (item.kind === 'rest') {
    game.setWanted(0); player.health = 100;
    saveGame(true);
    ui.toast('Rested at the safehouse', 'Game saved · wanted cleared · health restored');
    sound.cash(); closeShop(); return;
  }
  if (game.cash < item.price) { ui.toast('Not enough cash', `Need ${fmtCash(item.price)} — you have ${fmtCash(game.cash)}.`); return; }
  if (item.kind === 'weapon') {
    if (combat.owned.has(item.id)) { ui.toast('Already owned', item.name + ' is in your arsenal.'); return; }
    combat.buy(item.id); combat.select(item.id);
  } else if (item.kind === 'ammo') combat.refillAmmo();
  else if (item.kind === 'health') player.health = 100;
  else if (item.kind === 'armor') player.armor = Math.min(100, player.armor + 50);
  else if (item.kind === 'engine') {
    if (item.id === 'engine2' && game.upgrades.engine < 1) { ui.toast('Requires Mk I', 'Buy the Mk I engine first.'); return; }
    game.upgrades.engine = item.id === 'engine2' ? 2 : 1;
    if (player.inCar) { player.inCar.engine = game.upgrades.engine; }
  } else if (item.kind === 'cararmor') game.upgrades.carArmor = true;
  else if (item.kind === 'paint') game.upgrades.paint = true;
  game.cash -= item.price;
  ui.toast('Bought: ' + item.name, `-${fmtCash(item.price)}`);
  sound.cash();
  ui.openShop(ui.shopKind, game.cash); // refresh cash display
};

// ---- radio / camera / shooting ----
function updateRadioHud() {
  const st = STATIONS[sound.station];
  const song = st.id === 'talk' ? 'Bay Talk — live from Downtown' : `${st.genre} · 96–112 BPM loop`;
  ui.setRadio(st, song);
}
function cycleRadio() {
  const st = sound.setStation(sound.station + 1, !!player.inCar);
  updateRadioHud();
  ui.toast(st.name, st.genre + (player.inCar ? '' : ' — hop in a car to hear it'));
  sound.blip(990, 0.06, 0.1);
}
function cycleCamera() {
  game.camMode = (game.camMode + 1) % 3;
  game.camDist = [8, 13, 22][game.camMode];
}
function shootOnce() {
  if (game.state !== 'playing') return;
  const res = combat.shoot(camera, {
    policeCars: police.cars, officers: police.officers,
    peds: peds.list, traffic: traffic.cars,
  }, (hit) => {
    missions.stats.shots++;
    if (hit) missions.stats.hits++;
  });
  if (res === 'empty') { ui.toast('Out of ammo', 'Visit the shop (F) or pick up a crate.'); return; }
  if (res === 'cooldown') return;
  sound.gunshot();
  peds.scare(player.x, player.z, 40);
  if (res === 'hit') game.setWanted(Math.min(5, game.wanted + 1));
  else if (Math.random() < 0.35) game.setWanted(Math.min(5, game.wanted + 1));
  if (combat.weapon().id !== 'fists') ui.setWeapon(combat.weapon().name, combat.ammo[combat.current]);
}

// ---- missions wiring ----
missions.onComplete = (def, grade, stats) => {
  game.cash += def.pay;
  game.bestScore = Math.max(game.bestScore, def.pay);
  saveGame(true);
  game.state = 'results';
  ui.showResults(def, grade, def.pay, { time: missions._lastT || 0, damage: stats.damage, wantedPeak: stats.wantedPeak, accuracy: stats.accuracy }, game.collectiblesGot, true);
  sound.cash();
};
missions.onFail = (def, reason) => {
  game.state = 'playing';
  ui.toast('Job failed: ' + def.name, reason + ' Try again at the gold marker.');
  sound.blip(160, 0.3, 0.2);
};
ui.wire({
  continue: () => { const s = ui.loadSave(); if (s) applySave(s); startPlay(false); },
  newGame: () => { ui.clearSave(); startPlay(true); },
  freeRoam: () => startPlay(true),
  startJob: () => {
    const def = missions.nextDef();
    ui.showBriefing(null, false);
    if (def) { missions.start(def.id - 1); game.state = 'playing'; ui.toast('Job started: ' + def.name, def.type === 'tail' ? 'Find the courier car — follow the gold beam.' : 'Follow the gold marker.'); }
  },
  cancelJob: () => { ui.showBriefing(null, false); game.state = 'playing'; },
  nextJob: () => {
    ui.showResults(null, '', 0, {}, 0, false);
    const def = missions.nextDef();
    if (def) { game.state = 'briefing'; ui.showBriefing(def, true); }
    else { game.state = 'playing'; ui.toast('Story complete!', 'All 7 jobs done. Palmera Bay is yours.'); }
  },
  closeShop, resume: () => pauseGame(false), quitTitle: quitToTitle,
});

// ---- per-frame update ----
const clock = new THREE.Clock();
let hudTimer = 0;

function readInput() {
  return {
    fwd: keys.KeyW || keys.ArrowUp, back: keys.KeyS || keys.ArrowDown,
    left: keys.KeyA, right: keys.KeyD, run: keys.ShiftLeft || keys.ShiftRight,
    handbrake: keys.Space,
  };
}
function updateWanted(dt, px, pz) {
  if (game.wanted === 0) { game.hideTimer = 0; game.decayTimer = 0; return; }
  // Hiding: no police unit close by.
  let nearest = 1e9;
  for (const c of police.cars) nearest = Math.min(nearest, Math.hypot(c.x - px, c.z - pz));
  for (const o of police.officers) nearest = Math.min(nearest, Math.hypot(o.x - px, o.z - pz));
  if (police.heli) nearest = Math.min(nearest, 60);
  if (nearest > 80) {
    game.hideTimer += dt;
    if (game.hideTimer > 12) {
      game.decayTimer += dt;
      if (game.decayTimer > 8) { game.setWanted(game.wanted - 1); game.decayTimer = 0; game.hideTimer = 0; ui.toast('Heat cooling off', `Wanted level ${game.wanted}★`); }
    }
  } else { game.hideTimer = 0; game.decayTimer = 0; }
  sound.setSiren(game.wanted >= 1);
}
function updateCamera(dt) {
  const target = player.inCar ? player.inCar : player;
  const heading = player.inCar ? player.inCar.yaw : game.camYaw;
  // Camera sits behind the heading, smoothed.
  const dist = game.camDist, height = game.camMode === 2 ? 16 : 3.6 + game.camDist * 0.12;
  const cx = target.x - Math.sin(heading) * dist;
  const cz = target.z - Math.cos(heading) * dist;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (height - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
  camera.lookAt(target.x, 2.0, target.z);
  if (!player.inCar) game.camYaw = heading; // on foot, camera yaw is the move heading
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const px = player.inCar ? player.inCar.x : player.x;
  const pz = player.inCar ? player.inCar.z : player.z;
  const input = readInput();

  if (game.state === 'playing') {
    game.clockMin += dt * 0.6;
    game.talkTimer += dt;
    if (game.talkTimer > 25) { game.talkTimer = 0; sound.talkTick(); }
    if (player.inCar) {
      const car = player.inCar;
      car.drive(dt, input, world.colliders);
      player.x = car.x; player.z = car.z;
      // Car vs pedestrian: running someone over is a crime.
      for (const p of peds.list) {
        if (dist2(car.x, car.z, p.x, p.z) < 4 && Math.abs(car.speed) > 9) {
          p.flee = 8; game.setWanted(Math.min(5, game.wanted + 1));
          ui.toast('Pedestrian hit!', 'Wanted level up.');
        }
      }
      // Stunt ramps: speed over a ramp pays out.
      for (const r of world.ramps) {
        if (!r.used && dist2(car.x, car.z, r.x, r.z) < 25 && Math.abs(car.speed) > 17) {
          r.used = true; game.addCash(100); ui.toast('STUNT JUMP!', '+ $100 — airtime pays.');
        }
      }
      sound.setEngine(Math.abs(car.speed) / 30, true);
    } else {
      player.step(dt, input, game.camYaw, world.colliders);
      sound.setEngine(0, false);
    }
    traffic.update(dt, px, pz, player.inCar);
    peds.update(dt, px, pz);
    police.update(dt, game.wanted, px, pz, player, (cop) => {
      // Ram: damage the player (or their car).
      if (player.inCar) { player.inCar.damage(6); if (player.inCar.health <= 0) { ui.toast('Your car is wrecked!', 'You bail out.'); player.inCar = null; } }
      else { player.damage(6); missions.stats.damage += 6; }
      sound.crash();
    });
    // Officers that were shot are removed.
    for (let i = police.officers.length - 1; i >= 0; i--) {
      if (police.officers[i].dead) { scene.remove(police.officers[i].mesh); police.officers.splice(i, 1); game.setWanted(Math.min(5, game.wanted + 1)); }
    }
    for (let i = police.cars.length - 1; i >= 0; i--) {
      if (police.cars[i].health <= 0) { scene.remove(police.cars[i].mesh); police.cars.splice(i, 1); game.setWanted(Math.min(5, game.wanted + 1)); }
    }
    // Mission update (also drives the tail target car).
    if (missions.active && missions.active.def.type === 'tail' && !missions.tailTarget) {
      const t = traffic.cars[0];
      if (t) { missions.tailTarget = t; missions.setWaypoint(t.x, t.z); }
    }
    if (missions.active && missions.active.def.type === 'tail' && missions.tailTarget) {
      missions.moveWaypoint(missions.tailTarget.x, missions.tailTarget.z);
      missions._lastT = missions.active.t;
    }
    const obj = missions.update(dt, px, pz, game);
    if (missions.active) missions._lastT = missions.active.t;
    if (obj) ui.setObjective(obj.title, obj.text);
    else if (!missions.active) ui.setObjective('Free roam', 'Steal a car, explore the city, or start a story job at the gold marker.');
    // Collectibles
    for (const c of world.collectibles) {
      if (!c.taken && dist2(px, pz, c.x, c.z) < 5) {
        c.taken = true; scene.remove(c.mesh); game.collectiblesGot++;
        game.addCash(25); ui.toast('Hidden package found', `+ $25 · ${game.collectiblesGot}/12`);
      }
    }
    combat.update(dt, px, pz, (kind) => {
      ui.toast('Weapon picked up', WEAPONS.find((w) => w.id === kind).name + ' — press ' + (WEAPONS.findIndex((w) => w.id === kind)) + ' to equip.');
      sound.blip(1100, 0.1, 0.12);
    });
    // Player death: respawn at the safehouse, lose some cash.
    if (player.health <= 0) {
      const lost = Math.min(game.cash, 200);
      game.cash -= lost; player.health = 100; player.armor = 0;
      player.x = world.markers.safehouse.x; player.z = world.markers.safehouse.z;
      player.inCar = null; game.setWanted(0); police.clear(); missions.abort();
      ui.toast('WASTED', `You woke up at the safehouse. Lost ${fmtCash(lost)}.`);
    }
    updateWanted(dt, px, pz);
    // Hint line near markers / cars.
    const m = nearestMarker(7);
    const nearCar = !player.inCar && (nearestParked() || traffic.nearest(px, pz, 5));
    ui.setHint(m && m.kind === 'mission' ? 'Press F — start the next story job'
      : m && m.kind === 'shop' ? 'Press F — weapons & gear shop'
      : m && m.kind === 'garage' ? 'Press F — garage upgrades'
      : m && m.kind === 'safehouse' ? 'Press F — safehouse (save · clear wanted)'
      : nearCar ? 'Press E — steal / enter car'
      : player.inCar ? 'E exit · R radio · Space handbrake · C camera' : 'WASD move · Shift run · E enter car');
    ui.setCrosshair(!player.inCar && combat.current !== 'fists');
  }

  // Camera: always follow (even on the title screen, slow orbit for a backdrop).
  if (game.state === 'title') {
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 120, 55, Math.cos(t) * 120);
    camera.lookAt(0, 0, 0);
  } else updateCamera(dt);

  // HUD refresh (10 Hz).
  hudTimer += dt;
  if (hudTimer > 0.1 && game.state !== 'title') {
    hudTimer = 0;
    const speedMph = player.inCar ? Math.abs(player.inCar.speed) * 2.24 : 0;
    ui.setStats(game.cash, player.health, player.armor, game.wanted, game.clockMin, saveLabel());
    ui.setSpeed(speedMph, player.inCar ? player.inCar.name : '', !!player.inCar);
    const w = combat.weapon();
    ui.setWeapon(w.name, w.mag === Infinity ? '∞' : String(combat.ammo[w.id] ?? 0));
    const policeDots = [...police.cars, ...police.officers, ...(police.heli ? [{ x: police.heli.position.x, z: police.heli.position.z }] : [])];
    ui.drawMinimap(px, pz, player.inCar ? player.inCar.yaw : game.camYaw, policeDots,
      missions.waypoint ? { x: missions.waypoint.x, z: missions.waypoint.z } : null,
      world.markers, world.collectibles, traffic.cars);
  }
  renderer.render(scene, camera);
}

// ---- ?shot= hooks (deterministic staged scenes for screenshots / tests) ----
function stageShot() {
  const save = ui.loadSave();
  if (shot === 'title') { ui.renderTitle(save, game.bestScore); return; }
  if (shot === 'results') {
    ui.showTitle(false);
    ui.showResults(MISSIONS[0], 'S', 400, { time: 61, damage: 4, wantedPeak: 2, accuracy: 0.82 }, 3, true);
    return;
  }
  if (shot !== 'play' && shot !== 'chase' && shot !== 'shop' && shot !== 'garage') return; // plain load: title screen
  startPlay(true);
  if (shot === 'play') {
    missions.start(0);
    const car = new Car(scene, -22, -10, 0, 0xd94f3d, 'Comet', { player: true });
    game.parkedCars.push(car); enterCar(car, false);
    return;
  }
  if (shot === 'chase') {
    const car = new Car(scene, 66, -40, 0.3, 0xd94f3d, 'Comet', { player: true });
    game.parkedCars.push(car); enterCar(car, false);
    game.setWanted(5);
    police.spawnCar(player.inCar.x - 20, player.inCar.z - 10);
    police.spawnCar(player.inCar.x + 25, player.inCar.z - 15);
    police.spawnCar(player.inCar.x - 5, player.inCar.z + 30);
    // Keep one patrol car ahead of the player so the chase reads on screen.
    if (police.cars[2]) { police.cars[2].x = player.inCar.x - 6; police.cars[2].z = player.inCar.z + 34; police.cars[2].yaw = Math.PI; }
    police.spawnHeli(player.inCar.x, player.inCar.z);
    missions.start(0);
    ui.setObjective('Job 1: First Wheels', 'Drive to the gold marker — and lose the 5★ heat on your tail.');
    return;
  }
  if (shot === 'shop') {
    player.x = world.markers.shop.x; player.z = world.markers.shop.z + 4;
    game.cash = 2400;
    game.state = 'shop'; ui.openShop('shop', game.cash);
    return;
  }
  if (shot === 'garage') {
    player.x = world.markers.garage.x; player.z = world.markers.garage.z + 4;
    game.cash = 3000;
    game.state = 'shop'; ui.openShop('garage', game.cash);
  }
}

// Parked cars along the roads: enterable any time (E), no wanted for taking one.
for (const [px, pz, pyaw] of [[-19, 30, 0], [-25, -60, Math.PI], [25, 90, 0], [69, -30, Math.PI / 2], [-63, 120, -Math.PI / 2], [113, 40, 0]]) {
  const pc = new Car(scene, px, pz, pyaw, pick(rng, [0xd94f3d, 0x3d7dd9, 0xe8c832, 0x37b06a, 0xe8e8e8, 0x2b2f36]),
    pick(rng, ['Comet', 'Sunrunner', 'Bayliner', 'Palm GT', 'Marlin', 'Solstice']));
  game.parkedCars.push(pc);
}

// ---- boot ----
ui.renderTitle(ui.loadSave(), game.bestScore);
ui.showTitle(true);
stageShot();
animate();

// ---- debug / play-test API (used by the headless play-test, not by players) ----
window.__PB.startMission = (i) => { if (game.state === 'title') startPlay(true); missions.start(i); game.state = 'playing'; return !!missions.active; };
window.__PB.completeMission = () => { if (missions.active) missions.complete(missions.active.def); };
window.__PB.failMission = () => { if (missions.active) missions.fail('test'); };
window.__PB.setWanted = (n) => game.setWanted(n);
window.__PB.giveCash = (n) => { game.cash += n; };
window.__PB.teleport = (x, z) => { player.x = x; player.z = z; if (player.inCar) { player.inCar.x = x; player.inCar.z = z; } };
window.__PB.enterNearestCar = () => tryEnterExitCar();
window.__PB.state = () => ({
  state: game.state, cash: game.cash, wanted: game.wanted, health: player.health,
  inCar: !!player.inCar, mission: missions.active ? missions.active.def.id : null,
  completed: [...missions.completed], heli: !!police.heli,
  policeCars: police.cars.length, officers: police.officers.length,
  collectibles: game.collectiblesGot, x: player.x, z: player.z,
});
window.__PB.save = () => saveGame(true);
window.__PB.load = () => { const s = ui.loadSave(); if (s) applySave(s); return !!s; };
