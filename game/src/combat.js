// A raid's strength, the same formula as WarheadzLands (checked in test/combat.test.js against numbers the contract's own tests
// pin). Units: 0 bruiser, 1 sniper, 2 trickster, 3 defender. Bruiser beats trickster, trickster beats sniper, sniper beats bruiser.
export const BRUISER = 0, SNIPER = 1, TRICKSTER = 2, DEFENDER = 3;
export const UNIT_NAMES = ['Bruiser', 'Sniper', 'Trickster', 'Defender'];
const BPS = 10000;

/**
 * @param send [bruisers, snipers, tricksters] sent; @param home the defender's [b, s, t, defenders]; @param wall @param tower @param onPass
 * @param attackerActivity @param defenderActivity each coin's trading-activity bonus in bps (0 to 2000: yesterday's volume in its own pool)
 */
export function powers(send, home, wall = 0, tower = 0, onPass = false, attackerActivity = 0, defenderActivity = 0) {
  const homeTotal = home[0] + home[1] + home[2];
  let attack = 0;
  for (let i = 0; i < 3; i++) {
    let mult = BPS;
    if (homeTotal > 0) {
      const beaten = Math.trunc((home[(i + 2) % 3] * BPS) / homeTotal);
      const beatenBy = Math.trunc((home[(i + 1) % 3] * BPS) / homeTotal);
      mult += Math.trunc((beaten - beatenBy) / 2);
    }
    attack += Math.trunc((send[i] * 100 * mult) / BPS);
  }
  const baseDefense = homeTotal * 100 + home[DEFENDER] * 150;
  let bonus = 1000 * (wall + tower);
  if (onPass) bonus += 2000;
  let defense = Math.trunc((baseDefense * (BPS + bonus)) / BPS);
  attack = Math.trunc((attack * (BPS + attackerActivity)) / BPS);
  defense = Math.trunc((defense * (BPS + defenderActivity)) / BPS);
  return { attack, defense, success: attack > defense };
}
