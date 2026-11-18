// Palmera Bay — UI: HUD text, live minimap, title screen, briefing,
// mission results, shop / garage / safehouse panels, pause, and save/load.
import { MISSIONS, SHOP_ITEMS, GARAGE_ITEMS, SAVE_KEY, START_CASH, STATIONS } from './config.js';
import { fmtCash, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.minimapBig = false;
    this.shopKind = null; // 'shop' | 'garage' | 'safehouse'
    this.onBuy = null;    // (item) => boolean (true if bought)
    this.onStartMission = null;
    this.onResume = null;
    this.onQuitTitle = null;
  }
  // ---- save / load ----
  loadSave() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  writeSave(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch { return false; }
  }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  // ---- HUD ----
  showHud(on) { $('hud').classList.toggle('hidden', !on); $('wantedFlash').classList.toggle('hidden', true); }
  setStats(cash, health, armor, wanted, clockMin, saveLabel) {
    $('cash').textContent = fmtCash(cash);
    $('health').textContent = String(Math.ceil(health));
    $('armor').textContent = String(Math.ceil(armor));
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="${i <= wanted ? '' : 'off'}">★</span>`;
    $('stars').innerHTML = s;
    const h = Math.floor(clockMin / 60) % 24, m = Math.floor(clockMin % 60);
    $('clockTime').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    $('saveState').textContent = saveLabel;
    $('wantedFlash').classList.toggle('hidden', wanted < 3);
  }
  setObjective(title, text) { $('objTitle').textContent = title; $('objText').textContent = text; }
  setRadio(station, song) { $('radioName').textContent = station.name; $('radioSong').textContent = song; }
  setSpeed(mph, carName, inCar) {
    $('speed').textContent = String(Math.round(mph));
    $('speedUnit').textContent = 'MPH';
    $('carName').textContent = inCar ? carName : 'On foot';
  }
  setWeapon(name, ammo) { $('weaponName').textContent = name; $('ammo').textContent = ammo; }
  setHint(text) {
    const el = $('hint');
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text; el.classList.remove('hidden');
  }
  toast(title, sub) {
    const el = $('toast');
    el.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.innerHTML = ''; }, 2600);
  }
  setCrosshair(on) { $('crosshair').classList.toggle('hidden', !on); }
  toggleMinimap() {
    this.minimapBig = !this.minimapBig;
    $('minimap').classList.toggle('big', this.minimapBig);
  }
  // ---- minimap ----
  drawMinimap(px, pz, yaw, police, mission, markers, collectibles, traffic) {
    const cv = $('minimap'); const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, S = this.minimapBig ? 340 : 180;
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    const scale = S / 480; // world half 230 -> ~480 span
    const toX = (x) => S / 2 + x * scale;
    const toY = (z) => S / 2 + z * scale;
    g.fillStyle = '#0e2a3d'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
    for (const r of [-198, -154, -110, -66, -22, 22, 66, 110, 154, 198]) {
      g.beginPath(); g.moveTo(toX(r), 0); g.lineTo(toX(r), S); g.stroke();
      g.beginPath(); g.moveTo(0, toY(r)); g.lineTo(S, toY(r)); g.stroke();
    }
    g.fillStyle = '#e8d8a0'; g.fillRect(toX(212), 0, S - toX(212), S); // beach
    g.fillStyle = '#2a7fc8'; g.fillRect(toX(236), 0, S - toX(236), S); // water
    g.fillStyle = '#58a85a'; g.fillRect(toX(-41), toY(91), 38 * scale, 38 * scale); // park
    const dot = (x, z, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(toX(x), toY(z), r, 0, 7); g.fill(); };
    for (const c of collectibles) if (!c.taken) dot(c.x, c.z, '#37ff8a', 2.5);
    dot(markers.shop.x, markers.shop.z, '#37b06a', 4);
    dot(markers.safehouse.x, markers.safehouse.z, '#3d7dd9', 4);
    dot(markers.garage.x, markers.garage.z, '#e87b2e', 4);
    if (mission) dot(mission.x, mission.z, '#ffd23e', 6);
    for (const t of traffic) dot(t.x, t.z, '#cfe8f5', 2);
    for (const p of police) dot(p.x, p.z, '#ff2233', 3.5);
    // Player arrow (rotates with heading)
    g.save(); g.translate(toX(px), toY(pz)); g.rotate(-yaw + Math.PI);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
  }
  // ---- title / menus ----
  renderTitle(save, bestScore) {
    const list = $('missionList');
    list.innerHTML = '';
    const done = save ? save.completed || [] : [];
    MISSIONS.forEach((m, i) => {
      const isDone = done.includes(m.id);
      const isNext = !isDone && i === (save ? (save.nextIndex || 0) : 0);
      const row = document.createElement('div');
      row.className = 'missionRow ' + (isDone ? 'done' : isNext ? 'next' : 'locked');
      row.innerHTML = `<span>${isDone ? '✓' : isNext ? '▶' : '🔒'} Job ${m.id}: ${m.name} <span style="color:#9fd8ff">— ${m.giver}</span></span><span class="pay">${fmtCash(m.pay)}</span>`;
      list.appendChild(row);
    });
    $('missionProgress').textContent = `${done.length} / 7 done`;
    $('bestLine').textContent = `Best score: ${bestScore || '—'} · Cash ${fmtCash(save ? save.cash : START_CASH)} · Packages ${(save ? save.collectibles || 0 : 0)}/12`;
    $('btnContinue').style.display = save ? '' : 'none';
  }
  showTitle(on) { $('title').classList.toggle('hidden', !on); }
  showBriefing(def, on) {
    if (def) {
      $('briefTitle').textContent = `Job ${def.id}: ${def.name}`;
      $('briefText').textContent = def.brief;
      $('briefMeta').textContent = `From ${def.giver} · Payout ${fmtCash(def.pay)} · Par time ${fmtTime(def.par)} · ${def.type === 'taxi' ? 'Taxi fares' : def.type === 'tail' ? 'Follow job' : def.type === 'survive' ? 'Escape the dragnet' : 'Drive & deliver'}`;
    }
    $('briefing').classList.toggle('hidden', !on);
  }
  showResults(def, grade, payout, stats, collectibles, on) {
    if (def) {
      $('resTitle').textContent = `JOB ${def.id} COMPLETE — ${def.name.toUpperCase()}`;
      $('resGrade').textContent = grade;
      $('resPayout').textContent = `Payout ${fmtCash(payout)}`;
      $('stTime').textContent = fmtTime(stats.time || 0);
      $('stDamage').textContent = String(Math.round(stats.damage || 0));
      $('stWanted').textContent = `${stats.wantedPeak || 0}★`;
      $('stAcc').textContent = stats.accuracy === null || stats.accuracy === undefined ? '—' : Math.round(stats.accuracy * 100) + '%';
      $('stColl').textContent = `${collectibles}/12`;
      $('resNote').textContent = grade === 'S' ? 'Flawless. Marla is impressed — the crew talks about this one.'
        : grade === 'A' ? 'Clean work. The crew pays in full.'
        : grade === 'B' ? 'Good enough. A few scratches, but the job is done.'
        : 'Rough, but done. The crew will not forget the mess — or the result.';
    }
    $('results').classList.toggle('hidden', !on);
  }
  showPause(on) { $('pause').classList.toggle('hidden', !on); }
  // ---- shop / garage / safehouse ----
  openShop(kind, cash) {
    this.shopKind = kind;
    const items = kind === 'garage' ? GARAGE_ITEMS : SHOP_ITEMS;
    $('shopTitle').textContent = kind === 'garage' ? '🔧 Palm Garage — Upgrades'
      : kind === 'safehouse' ? '🏠 Safehouse' : '🛒 Bay Arms — Weapons & Gear';
    $('shopCash').textContent = `Cash: ${fmtCash(cash)}`;
    const grid = $('shopItems'); grid.innerHTML = '';
    if (kind === 'safehouse') {
      grid.innerHTML = `<div class="shopItem"><h3>Rest &amp; save</h3><p>Sleep, save the game and clear your wanted level.</p><button class="btn" data-act="rest">REST — FREE</button></div>`;
    } else {
      for (const it of items) {
        const div = document.createElement('div');
        div.className = 'shopItem';
        div.innerHTML = `<h3>${it.name}</h3><p>${it.desc}</p><span class="price">${fmtCash(it.price)}</span><br><button class="btn" data-id="${it.id}" style="margin-top:8px;padding:8px 16px;font-size:15px">BUY</button>`;
        grid.appendChild(div);
      }
    }
    grid.querySelectorAll('button[data-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = items.find((x) => x.id === b.getAttribute('data-id'));
        if (it && this.onBuy) this.onBuy(it);
      });
    });
    const rest = grid.querySelector('button[data-act="rest"]');
    if (rest) rest.addEventListener('click', () => { if (this.onBuy) this.onBuy({ id: 'rest', kind: 'rest', price: 0, name: 'Rest' }); });
    $('shop').classList.remove('hidden');
  }
  closeShop() { $('shop').classList.add('hidden'); this.shopKind = null; }
  isShopOpen() { return this.shopKind !== null; }
  // ---- wiring ----
  wire(handlers) {
    $('btnContinue').addEventListener('click', () => handlers.continue());
    $('btnNew').addEventListener('click', () => handlers.newGame());
    $('btnFree').addEventListener('click', () => handlers.freeRoam());
    $('btnStartJob').addEventListener('click', () => handlers.startJob());
    $('btnCancelJob').addEventListener('click', () => handlers.cancelJob());
    $('btnNextJob').addEventListener('click', () => handlers.nextJob());
    $('btnCloseShop').addEventListener('click', () => handlers.closeShop());
    $('btnResume').addEventListener('click', () => handlers.resume());
    $('btnQuitTitle').addEventListener('click', () => handlers.quitTitle());
  }
}
