# gta6-01-v3

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/adhityanaufal26/gta6-01-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/adhityanaufal26/gta6-01-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Palmera Bay — a 3D open-world crime game in the browser: 7 story jobs, helicopter police, car stealing, radio, shops, garage, safehouse and saves, built with three.js (WebGL2) and procedural WebAudio.

## What it is

An original sun-soaked coastal city, Palmera Bay, explored on foot and by car. Work for the Marlin crew through 7 story jobs — getaway drives, timed deliveries, tailing a courier, stash runs, escaping a dragnet, taxi fares and a marina heist finale. Steal any car, build a wanted level from 0–5 stars, outrun patrol cars and the police helicopter, switch radio stations, buy weapons and upgrades, and save at the safehouse.

## Controls

- **W A S D** — move / drive · **Shift** — run · **Space** — handbrake
- **E** — enter / exit / steal car · **F** — interact (shop, safehouse, garage, story job)
- **Mouse** — aim (drag to orbit the camera) · **Click** — shoot
- **R** — radio station · **C** — camera · **M** — minimap zoom
- **1–4** — weapons · **U** — mute · **Esc** — pause

## Systems

- 3D city: grid streets, procedural buildings, palms, beach, boardwalk, port, parks
- Traffic cars on road lanes, pedestrians who flee gunfire and crashes
- Wanted 0–5 stars: foot police, ramming patrol cars, helicopter with searchlight at 4–5★
- 7 story missions with briefings, waypoints, timers, grades S–D and payouts
- 4 weapons (pistol, SMG, shotgun, rifle) + ammo and weapon pickups
- 3 radio stations (synthwave, latin groove, talk/news) — procedural WebAudio
- Shop (weapons/ammo/health/armor), garage (engine/armor/paint), safehouse (save + clear wanted)
- HUD: cash, health, armor, wanted stars, weapon/ammo, speed, objective, clock, live minimap
- Side content: taxi fares, 12 hidden packages, stunt jumps
- localStorage save: story progress, cash, garage, collectibles, best score

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network requests at runtime — every file is under `game/`.

---

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
