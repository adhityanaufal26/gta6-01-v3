// Palmera Bay — shared constants: districts, weapons, stations, missions, prices.
// Everything here is original fiction: no real city, person or brand is named.
export const WORLD = {
  half: 230,            // playable half-extent (metres)
  block: 44,            // block pitch
  roadW: 12,            // road width
  roads: [-198, -154, -110, -66, -22, 22, 66, 110, 154, 198],
  beachX: 212,          // sand starts here (east edge)
  waterX: 236,
};

export const DISTRICTS = [
  { name: 'Old Marina', cx: -176, cz: -176 },
  { name: 'Coral Heights', cx: -66, cz: -176 },
  { name: 'Palm Court', cx: 66, cz: -176 },
  { name: 'The Boardwalk', cx: 176, cz: -176 },
  { name: 'Canal Row', cx: -176, cz: -66 },
  { name: 'Downtown Palmera', cx: -22, cz: -22 },
  { name: 'Sunset Strip', cx: 110, cz: -22 },
  { name: 'Portside', cx: -176, cz: 110 },
  { name: 'Jacaranda Park', cx: -22, cz: 110 },
  { name: 'Harbor Lights', cx: 110, cz: 110 },
  { name: 'South Beach', cx: 176, cz: 110 },
];

export const WEAPONS = [
  { id: 'fists',   name: 'Fists',      damage: 12, rate: 3.2, range: 3,   mag: Infinity, auto: false, price: 0,    color: 0xffd9a0 },
  { id: 'pistol',  name: 'PB-9 Pistol', damage: 22, rate: 3.0, range: 60,  mag: 12,  auto: false, price: 250,  color: 0xffe066 },
  { id: 'smg',     name: 'Stingray SMG', damage: 14, rate: 9.0, range: 55, mag: 32,  auto: true,  price: 900,  color: 0x7dffb0 },
  { id: 'shotgun', name: 'Gator-12',   damage: 16, rate: 1.1, range: 26,  mag: 6,   auto: false, price: 1400, color: 0xff8ad8, pellets: 6 },
  { id: 'rifle',   name: 'Longshot Rifle', damage: 46, rate: 1.6, range: 110, mag: 20, auto: false, price: 2600, color: 0x9fd8ff },
];

export const STATIONS = [
  { id: 'wave', name: 'PALMERA 88.2', genre: 'Synthwave', bpm: 96, root: 55.0, wave: 'sawtooth' },
  { id: 'calor', name: 'CALOR 101.5', genre: 'Latin Groove', bpm: 112, root: 65.41, wave: 'triangle' },
  { id: 'talk', name: 'BAY TALK 94.0', genre: 'News & Talk', bpm: 0, root: 0, wave: 'sine' },
];

export const TALK_LINES = [
  'Good morning, Palmera Bay — the sun is out and the traffic is already terrible.',
  'City Hall says the new boardwalk lights will be finished “soon”. We have heard that before.',
  'Police report a stolen sedan near Coral Heights. If you see it, maybe just let it go.',
  'Tonight at the marina: fireworks, food trucks, and at least one boat that should not be there.',
  'Weather: hot, humid, perfect. The bay is flat as glass this morning.',
  'Traffic tip: avoid Sunset Strip after sunset. Actually, avoid it always.',
];

export const MISSIONS = [
  { id: 1, name: 'First Wheels', giver: 'Marla Voss', pay: 400, par: 75,
    brief: 'Marla runs the Marlin crew out of the Old Marina. She needs a driver she can trust — that is you, if you can get her courier van across town before the buyers walk. Drive to the gold marker. No cops, no dents, no excuses.',
    type: 'goto', target: { x: 176, z: 176 }, time: 90 },
  { id: 2, name: 'Sunset Courier', giver: 'Marla Voss', pay: 900, par: 150,
    brief: 'Three drops, one evening: a parcel for the Coral Heights penthouse, a package for the boardwalk arcade, and a “gift” for the port office. The clock is already running. Drive fast, park close, do not get spotted.',
    type: 'multi', targets: [{ x: -66, z: -176 }, { x: 176, z: -110 }, { x: -176, z: 154 }], time: 170 },
  { id: 3, name: 'Tail the Courier', giver: 'Dex Harlow', pay: 1200, par: 120,
    brief: 'Dex swears a rival courier is skimming the crew’s routes. Follow his car through the city — close enough to read the plates, far enough that he never looks twice. Stay in the gold zone for 30 seconds. Lose him and the job is blown.',
    type: 'tail', time: 150 },
  { id: 4, name: 'Package Run', giver: 'Marla Voss', pay: 1500, par: 160,
    brief: 'Five stashes hidden around Downtown and Canal Row, left by a runner who got cold feet. Scoop them all up, then bring them to the safehouse garage. The crew pays for discretion — and for speed.',
    type: 'collect', count: 5, target: { x: -22, z: 132 }, time: 200 },
  { id: 5, name: 'Heat Escape', giver: 'Dex Harlow', pay: 1800, par: 90,
    brief: 'A deal went sideways and now every cruiser in Palmera Bay knows your plate. Lose the dragnet: survive 60 seconds with the heat on, then slip into the safehouse zone to vanish. Do not stop. Do not get boxed in.',
    type: 'survive', time: 60, wanted: 3 },
  { id: 6, name: 'Cab Shift', giver: 'Rosa Delgado', pay: 1600, par: 200,
    brief: 'Rosa’s cab company is short a driver and the fares are flowing. Three pickups across the city — tourists, a chef, a very nervous accountant. Get each one to their stop on time and the tips are yours.',
    type: 'taxi', fares: 3, time: 240 },
  { id: 7, name: 'The Marina Heist', giver: 'Marla Voss', pay: 6000, par: 300,
    brief: 'The finale. A smuggler’s yacht is anchored off the marina with three strongboxes aboard the dock crew’s truck route. Grab all three, shake the 4-star response, and bring the haul to the boat at the Old Marina. Do this clean and you are crew for life.',
    type: 'heist', count: 3, target: { x: -198, z: -198 }, time: 320, wanted: 4 },
];

export const SHOP_ITEMS = [
  { id: 'pistol', kind: 'weapon', name: 'PB-9 Pistol', price: 250, desc: 'Reliable sidearm. 12 rounds, quick draw.' },
  { id: 'smg', kind: 'weapon', name: 'Stingray SMG', price: 900, desc: 'Rapid fire for close work. 32-round mag.' },
  { id: 'shotgun', kind: 'weapon', name: 'Gator-12', price: 1400, desc: 'Six pellets of bad news at close range.' },
  { id: 'rifle', kind: 'weapon', name: 'Longshot Rifle', price: 2600, desc: 'Long-range precision. 20 rounds.' },
  { id: 'ammo', kind: 'ammo', name: 'Ammo crate', price: 120, desc: 'Refills every owned weapon to full.' },
  { id: 'health', kind: 'health', name: 'First-aid kit', price: 150, desc: 'Restores health to 100.' },
  { id: 'armor', kind: 'armor', name: 'Kevlar vest', price: 300, desc: 'Adds 50 armor. Stops the worst of it.' },
];

export const GARAGE_ITEMS = [
  { id: 'engine1', kind: 'engine', name: 'Tuned engine Mk I', price: 800, desc: '+25% top speed and acceleration.' },
  { id: 'engine2', kind: 'engine', name: 'Tuned engine Mk II', price: 2000, desc: '+50% top speed. Requires Mk I.' },
  { id: 'armor1', kind: 'cararmor', name: 'Reinforced frame', price: 1000, desc: 'Your car takes half damage from rams.' },
  { id: 'paint', kind: 'paint', name: 'Sunset paint job', price: 400, desc: 'Hot coral paint. Pure style, zero stealth.' },
];

export const CAR_COLORS = [0xd94f3d, 0x3d7dd9, 0xe8c832, 0x37b06a, 0x8a5fd0, 0xe8e8e8, 0x2b2f36, 0xe07b39];
export const CAR_NAMES = ['Comet', 'Sunrunner', 'Bayliner', 'Palm GT', 'Coral Coupe', 'Marlin', 'Tide Runner', 'Solstice'];
export const SAVE_KEY = 'palmera-bay-save-v3';
export const START_CASH = 200;
