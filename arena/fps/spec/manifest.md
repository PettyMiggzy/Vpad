---
category: game
title: Token Arena
summary: First-person team shooter where two token teams fight best-of-three rounds, with a loadout shop and bots filling empty seats.
render: webgpu
---

# Token Arena
Role: A first-person, round-based team shooter. Each side is a token's team; holders join their token's side, buy loadouts, and bots fill empty seats up to 32 a side.

## Invariants
- The rules engine in `src/sim/` is the match server's own file: movement, hitscan shots, bots, rounds. The page draws it; it never decides a hit differently.
- Shots land the instant they are fired (ray against walls and enemy circles). Team-mates are never hit.
- First to two rounds wins the match. A round ends when a side has nobody standing, or on the timer (most standing, then most health).
- Play money only; the shop's prices and rewards come from `src/sim/items.ts`.

## Blocks Used
- custom: arena builder, box soldiers, viewmodel, DOM HUD and shop (no library block covers a multiplayer first-person shooter)

## Tuning
| Name | Value |
|---|---|
| Map | 32 m by 20 m (1600 by 1000 px in the rules engine, 50 px per metre) |
| Eye height | 1.65 m |
| Player speed | 4 m/s times armour and boots |
| Round length | 80 s, 3 s countdown |
| Seats per side | 4 to 32 |

## Wiring
Input → `Match.players.get('me').input` → `Match.step(1/60)` → events (`shot`, `hit`, `kill`, `round`, `roundEnd`, `match`) → tracers, sounds, HUD, coins.

## Acceptance Tests
- Bots alone play whole matches and stay on the map.
- A shot hits an enemy, passes a team-mate, and is stopped by a wall.
- The shop refuses what you cannot afford and cleans stored data.
