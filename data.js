/* Tinker Tides — Static Game Data */

// Grid dimensions
const REELS = 5;
const ROWS = 3;

// Per-symbol cell background colors (Style 7)
const SYMBOL_COLORS = {
  compass:  '#00897b', // teal
  anchor:   '#1565c0', // navy blue
  rum:      '#2e7d32', // forest green
  cannon:   '#4527a0', // deep purple
  parrot:   '#b71c1c', // deep red
  ship:     '#37474f', // slate
  hat:      '#37474f', // slate
  swords:   '#b71c1c', // deep red
  chest:    '#daa520', // bright goldenrod
  skull:    '#263238', // near-black
  captain:  '#263238', // near-black
  wild:     '#1a1208', // very dark (for coin contrast)
  scatter:  '#1f1208', // very dark leather
  bonus:    '#7d4a26', // wood brown
};

const RARITY_TINTS = {
  low:  { bg: 'linear-gradient(135deg,#4a6741,#2d4a2d)', glow: '#5a8a50' },
  mid:  { bg: 'linear-gradient(135deg,#3b6d9e,#1e3f6a)', glow: '#4a90d9' },
  high: { bg: 'linear-gradient(135deg,#8b5a2b,#5c3a1a)', glow: '#d4a44a' },
  wild: { bg: 'linear-gradient(135deg,#b8860b,#8b6914)', glow: '#ffd700' },
  scatter: { bg: 'linear-gradient(135deg,#6b3a7a,#3d1f4a)', glow: '#a855f7' },
  bonus: { bg: 'linear-gradient(135deg,#8b2020,#5c1010)', glow: '#ff4444' },
};

const SYMBOLS = {
  // Pay tiers (× betPerLine):
  //   pay[0] = 1-of-a-kind (always 0)
  //   pay[1] = 2-of-a-kind (only compass + anchor pay here — drives hit freq)
  //   pay[2..4] = 3/4/5-of-a-kind
  // Tuned for ~100% RTP / ~30% hit frequency.
  // Low value (4)
  compass:        { id: 'compass',        name: 'Compass',           icon: 'compass',              tier: 'low',     pay: [0, 1, 7, 20, 45] },
  anchor:         { id: 'anchor',         name: 'Anchor',            icon: 'anchor',               tier: 'low',     pay: [0, 1, 7, 20, 45] },
  rum:            { id: 'rum',            name: 'Rum Bottle',        icon: 'drink-me',             tier: 'low',     pay: [0, 1, 10, 32, 70] },
  cannon:         { id: 'cannon',         name: 'Cannon',            icon: 'cannon',               tier: 'low',     pay: [0, 1, 10, 32, 70] },
  // Mid value (4)
  parrot:         { id: 'parrot',         name: 'Parrot',            icon: 'parrot-head',          tier: 'mid',     pay: [0, 0, 18, 60, 140] },
  ship:           { id: 'ship',           name: 'Jolly Roger',       icon: 'pirate-flag',          tier: 'mid',     pay: [0, 0, 18, 60, 140] },
  hat:            { id: 'hat',            name: 'Pirate Hat',        icon: 'pirate-hat',           tier: 'mid',     pay: [0, 0, 30, 80, 225] },
  swords:         { id: 'swords',         name: 'Crossed Swords',    icon: 'crossed-swords',       tier: 'mid',     pay: [0, 0, 30, 80, 225] },
  // High value (was 3, now 2: chest moved to special since it's a pure scatter trigger).
  // Chest pays nothing on paylines — its only role is to trigger Treasure Hunt
  // (3+ anywhere = ×1, 4 = ×2, 5 = ×3 starting multiplier).
  chest:          { id: 'chest',          name: 'Treasure Chest',    icon: 'open-treasure-chest',  tier: 'scatter', pay: [0, 0, 0, 0, 0] },
  // Skull is now a PURE scatter trigger for the progressive jackpot picker.
  // 3+ skulls anywhere on the grid → opens the 3×3 jackpot reveal mini-game.
  // Pays nothing on paylines.
  skull:          { id: 'skull',          name: 'Skull & Crossbones',icon: 'skull-crossed-bones',  tier: 'scatter', pay: [0, 0, 0, 0, 0] },
  captain:        { id: 'captain',        name: 'Pirate Captain',    icon: 'pirate-captain',       tier: 'high',    pay: [0, 0, 90, 350, 1500] },
  // Special (3)
  // Wild has NO standalone pay — true wild, substitutes only. Wilds appear on
  // reels 2-5; ~85% of the time reel 1 has a substitutable symbol the wild can
  // extend, so standalone pay was just a consolation prize for the rare case
  // where reel 1 was a non-substitutable scatter/bonus.
  wild:           { id: 'wild',           name: 'Gold Coin (Wild)',  icon: 'two-coins',            tier: 'wild',    pay: [0, 0, 0, 0, 0], isWild: true },
  scatter:        { id: 'scatter',        name: 'Treasure Map',      icon: 'treasure-map',         tier: 'scatter', pay: [0, 0, 0, 0, 0] },
  bonus:          { id: 'bonus',          name: 'Ship Wheel',        icon: 'ship-wheel',           tier: 'bonus',   pay: [0, 0, 0, 0, 0] },
};

// Pay values are multiplied by betPerLine
// pay[i] = payout for (i+1) matching symbols; index 0=1-of-kind (no pay), index 4=5-of-kind

// 20 fixed paylines — each is array of row indices [reel0, reel1, reel2, reel3, reel4].
// Ordered top-anchored → middle-anchored → bottom-anchored so the indicator stripe
// position matches the row the line starts on (reel 1's top/middle/bottom cell).
// Distribution: 7 top-starters, 6 middle-starters, 7 bottom-starters.
const PAYLINES = [
  // Top-anchored (7) — line 1..7
  [0,0,0,0,0], // 1: top straight
  [0,1,2,1,0], // 2: V
  [0,0,1,0,0], // 3: slight dip
  [0,1,1,1,0], // 4: shallow V
  [0,1,0,1,0], // 5: small zigzag top
  [0,0,1,2,2], // 6: descending slope
  [0,1,2,2,1], // 7: top wave
  // Middle-anchored (6) — line 8..13
  [1,1,1,1,1], // 8: middle straight
  [1,0,0,0,1], // 9: U
  [1,2,2,2,1], // 10: inverted U
  [1,0,1,0,1], // 11: zigzag up
  [1,2,1,2,1], // 12: zigzag down
  [1,0,0,1,2], // 13: hook
  // Bottom-anchored (7) — line 14..20
  [2,2,2,2,2], // 14: bottom straight
  [2,1,0,1,2], // 15: inverted V
  [2,2,1,2,2], // 16: slight rise
  [2,1,1,1,2], // 17: shallow inv V
  [2,1,2,1,2], // 18: small zigzag bottom
  [2,2,1,0,0], // 19: ascending slope
  [2,1,0,0,1], // 20: bottom wave (mirror of line 7)
];

// Bet levels (credits per line, 1 credit = $0.01)
const BET_LEVELS = [1, 2, 3, 5, 10, 25];
const NUM_LINES = 20;

// Reel strips: each reel is a fixed circular sequence of symbol IDs.
//
// True-reel model: a spin picks one random "stop" position per reel, and the
// 3 visible cells are read consecutively from that position. So the placement
// of symbols on the strip — not just their count — matters: rows in a column
// are now correlated with strip-adjacency.
//
// Strips are built procedurally with structured placement:
//   - Rare symbols (captain, wild, skull, bonus, scatter, chest) get
//     max-distance greedy placement so they almost never appear adjacent —
//     keeps multi-row big-pay columns rare.
//   - Mid-pays (swords, hat, ship, parrot) get moderate spread.
//   - Low-pays fill the remaining slots in clusters of 2–3, which is what
//     creates the authentic "lots of compasses but not enough on the line"
//     near-miss feel of a real cabinet.
//
// Counts per reel are preserved from the previous random-pick model; only the
// ordering changed, so per-symbol odds (count/stripLen) are unchanged.
function buildReelStrip(counts) {
  var rareSyms = ['captain', 'wild', 'skull', 'bonus', 'scatter', 'chest'];
  var midSyms  = ['swords', 'hat', 'ship', 'parrot'];
  var lowSyms  = ['cannon', 'rum', 'anchor', 'compass'];

  var len = 0;
  for (var k in counts) len += counts[k];
  var strip = new Array(len);
  for (var z = 0; z < len; z++) strip[z] = null;

  function circDist(a, b) {
    var d = Math.abs(a - b);
    return Math.min(d, len - d);
  }

  function placeSpread(syms, considerOthers) {
    for (var si = 0; si < syms.length; si++) {
      var sym = syms[si];
      var c = counts[sym] || 0;
      var ownPlaced = [];
      for (var n = 0; n < c; n++) {
        var bestSlot = -1, bestScore = -2;
        for (var s = 0; s < len; s++) {
          if (strip[s] !== null) continue;
          var minSelf = len, minOther = len;
          for (var p = 0; p < ownPlaced.length; p++) {
            var d = circDist(s, ownPlaced[p]);
            if (d < minSelf) minSelf = d;
          }
          if (considerOthers) {
            for (var ss = 0; ss < len; ss++) {
              if (strip[ss] === null) continue;
              var d2 = circDist(s, ss);
              if (d2 < minOther) minOther = d2;
            }
          }
          // For rare symbols (considerOthers=true): score is min(own-spread,
          // other-spread) so a slot that's far from same-type but adjacent to
          // a different rare is rejected. For mids (considerOthers=false):
          // just spread own type, ignore neighbors.
          var score = considerOthers ? (Math.min(minSelf, minOther) * 100 + minSelf) : minSelf;
          if (score > bestScore) { bestScore = score; bestSlot = s; }
        }
        if (bestSlot < 0) {
          for (var f = 0; f < len; f++) if (strip[f] === null) { bestSlot = f; break; }
        }
        strip[bestSlot] = sym;
        ownPlaced.push(bestSlot);
      }
    }
  }

  placeSpread(rareSyms, true);
  placeSpread(midSyms, false);

  // Low-pays: queue them in cluster-runs, then fill leftover slots in order.
  // Empty slots are themselves clustered (the gaps between placed rares/mids),
  // so consecutive queue entries land as runs in the strip.
  var queue = [];
  for (var li = 0; li < lowSyms.length; li++) {
    var lsym = lowSyms[li];
    var rem = counts[lsym] || 0;
    while (rem > 0) {
      var clusterSize = Math.min(rem, 2 + (li % 2)); // 2 or 3
      for (var cs = 0; cs < clusterSize; cs++) queue.push(lsym);
      rem -= clusterSize;
    }
  }
  var qi = 0;
  for (var f2 = 0; f2 < len; f2++) {
    if (strip[f2] === null && qi < queue.length) {
      strip[f2] = queue[qi++];
    }
  }
  return strip;
}

const REEL_STRIPS = [
  // Reel 0 — no wild, low symbol density bumped (compass/anchor/rum/cannon)
  buildReelStrip({
    compass: 10, anchor: 10, rum: 8, cannon: 8,
    parrot: 5, ship: 5, hat: 4, swords: 4,
    chest: 1, skull: 3, captain: 1,
    scatter: 2, bonus: 2,
  }),
  // Reel 1 — has wild, slightly leaner low-pays
  buildReelStrip({
    compass: 9, anchor: 9, rum: 7, cannon: 7,
    parrot: 5, ship: 5, hat: 4, swords: 4,
    chest: 1, skull: 3, captain: 1,
    wild: 3, scatter: 2, bonus: 1,
  }),
  // Reel 2 — bonus reel (3 bonus symbols here gate the wheel feature)
  buildReelStrip({
    compass: 9, anchor: 9, rum: 7, cannon: 7,
    parrot: 5, ship: 5, hat: 4, swords: 4,
    chest: 1, skull: 3, captain: 1,
    wild: 3, scatter: 2, bonus: 2,
  }),
  // Reel 3
  buildReelStrip({
    compass: 9, anchor: 9, rum: 7, cannon: 7,
    parrot: 5, ship: 5, hat: 4, swords: 4,
    chest: 1, skull: 3, captain: 1,
    wild: 3, scatter: 2, bonus: 1,
  }),
  // Reel 4 — bonus reel + heavier low-pay tail (matches reel 0)
  buildReelStrip({
    compass: 10, anchor: 10, rum: 8, cannon: 8,
    parrot: 5, ship: 5, hat: 4, swords: 4,
    chest: 1, skull: 3, captain: 1,
    wild: 3, scatter: 2, bonus: 2,
  }),
];

// Free spins config
const FREE_SPINS_CONFIG = {
  scatterCounts: { 3: 8, 4: 12, 5: 15 },
  baseMultiplier: 2,
  retriggerAward: 5,
  maxSpins: 30,
};

// Treasure Hunt config
const TREASURE_HUNT_CONFIG = {
  numChests: 12,
  // Starting prize multiplier based on the number of scatter chests that
  // triggered TH. 3 chests opens a base hunt, 4/5 chests start with a
  // pre-applied 2× / 3× multiplier on all collected prizes.
  startMultiplier: { 3: 1, 4: 2, 5: 3 },
  prizes: [
    { type: 'coins', min: 5, max: 15, weight: 30 },
    { type: 'coins', min: 15, max: 30, weight: 20 },
    { type: 'coins', min: 30, max: 50, weight: 10 },
    { type: 'multiplier', value: 2, weight: 8 },
    { type: 'multiplier', value: 3, weight: 4 },
    { type: 'extraPick', weight: 6 },
    { type: 'jackpotMini', weight: 2 },
    { type: 'jackpotMajor', weight: 1 },
    { type: 'skull', weight: 19 },
  ],
};

// Wheel of Fortune config — alternating wood tones (light/dark oak)
const WHEEL_SEGMENTS = [
  { label: '10×',        type: 'coins',    value: 10,  color: '#8b5a2b' }, // dark oak
  { label: '25×',        type: 'coins',    value: 25,  color: '#c89060' }, // light oak
  { label: '5 FREE',     type: 'freespins',value: 5,   color: '#5c3a1a' }, // walnut
  { label: '50×',        type: 'coins',    value: 50,  color: '#c89060' }, // light oak
  { label: '15×',        type: 'coins',    value: 15,  color: '#8b5a2b' }, // dark oak
  { label: '100×',       type: 'coins',    value: 100, color: '#5c3a1a' }, // walnut
  { label: 'SPIN AGAIN', type: 'respin',   value: 0,   color: '#b8860b' }, // gold accent
  { label: '20×',        type: 'coins',    value: 20,  color: '#8b5a2b' }, // dark oak
  { label: '10 FREE',    type: 'freespins',value: 10,  color: '#5c3a1a' }, // walnut
  { label: '250×',       type: 'coins',    value: 250, color: '#a0521a' }, // mahogany (premium)
  { label: '50×',        type: 'coins',    value: 50,  color: '#c89060' }, // light oak
  { label: 'JACKPOT',    type: 'jackpot',  value: 0,   color: '#ffd700' }, // gold
];

// Jackpot config
const JACKPOT_CONFIG = {
  // triggerChance: 0 disables the old hidden per-spin RNG trigger — jackpots
  // now ONLY fire from the visible skull-scatter picker, the wheel JACKPOT
  // segment, and treasure-hunt jackpot chests. Pool growth is unchanged.
  mini:  { start: 175,   triggerChance: 0, contribution: 0.005,  label: 'Mini',  color: '#cd7f32' },
  major: { start: 1750,  triggerChance: 0, contribution: 0.0035, label: 'Major', color: '#c0c0c0' },
  grand: { start: 17500, triggerChance: 0, contribution: 0.0015, label: 'Grand', color: '#ffd700' },
};

// Skull-triggered jackpot picker (3×3 reveal grid).
// Each tile rolls independently from these weights. Player keeps revealing
// until 3 of the same TIER appear (win that tier) or 3 BLANKS appear (bust).
const JACKPOT_PICKER_CONFIG = {
  gridSize: 9,        // 3×3
  matchToWin: 3,      // 3 of a tier wins
  bustOn: 3,          // 3 blanks ends the round with no jackpot
  tiles: [
    { type: 'blank', weight: 50 },
    { type: 'mini',  weight: 30 },
    { type: 'major', weight: 15 },
    { type: 'grand', weight: 5 },
  ],
};

// Economy (credits = pennies, $1 = 100 credits)
const STARTING_CREDITS = 0; // machine starts empty
const BILL_VALUE = 10000;   // $100 bill = 10,000 credits

// Loyalty card tiers (by total wagered credits)
const LOYALTY_TIERS = [
  { id: 'bronze',   label: 'Bronze',   color: '#cd7f32', minWagered: 0 },
  { id: 'silver',   label: 'Silver',   color: '#c0c0c0', minWagered: 5000 },    // $50
  { id: 'gold',     label: 'Gold',     color: '#ffd700', minWagered: 50000 },   // $500
  { id: 'platinum', label: 'Platinum', color: '#e5e4e2', minWagered: 500000 },  // $5,000
];

// 6-color rainbow grouping (red, orange, yellow, green, blue, purple).
// Custom counts 3/4/3/3/4/3 = 20 align with the reel-row split (7/6/7):
//   Top section    (7 lines): 3 red + 4 orange
//   Middle section (6 lines): 3 yellow + 3 green
//   Bottom section (7 lines): 4 blue + 3 purple
const PAYLINE_COLOR_GROUPS = ['#ff4444','#ff8844','#ffcc44','#44dd44','#4488ff','#cc44ff'];
const PAYLINE_GROUP_COUNTS = [3, 4, 3, 3, 4, 3];
const PAYLINE_COLORS = (function() {
  var arr = [];
  for (var g = 0; g < PAYLINE_COLOR_GROUPS.length; g++) {
    for (var n = 0; n < PAYLINE_GROUP_COUNTS[g]; n++) {
      arr.push(PAYLINE_COLOR_GROUPS[g]);
    }
  }
  return arr;
})();

// UMD export: this file is loaded as a classic <script> in browser (consts go
// into the script-level lexical scope, shared with engine.js / game.js).
// In Node it's required by engine.js and simulate.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REELS, ROWS, NUM_LINES,
    SYMBOL_COLORS, RARITY_TINTS, SYMBOLS,
    PAYLINES, BET_LEVELS, REEL_STRIPS,
    FREE_SPINS_CONFIG, TREASURE_HUNT_CONFIG,
    WHEEL_SEGMENTS, JACKPOT_CONFIG, JACKPOT_PICKER_CONFIG,
    STARTING_CREDITS, BILL_VALUE, LOYALTY_TIERS,
    PAYLINE_COLOR_GROUPS, PAYLINE_GROUP_COUNTS, PAYLINE_COLORS,
  };
}
