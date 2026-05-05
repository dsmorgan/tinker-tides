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
  // Low value (4)
  compass:        { id: 'compass',        name: 'Compass',           icon: 'compass',              tier: 'low',     pay: [0, 0, 2, 5, 10] },
  anchor:         { id: 'anchor',         name: 'Anchor',            icon: 'anchor',               tier: 'low',     pay: [0, 0, 2, 5, 10] },
  rum:            { id: 'rum',            name: 'Rum Bottle',        icon: 'drink-me',             tier: 'low',     pay: [0, 0, 3, 8, 15] },
  cannon:         { id: 'cannon',         name: 'Cannon',            icon: 'cannon',               tier: 'low',     pay: [0, 0, 3, 8, 15] },
  // Mid value (4)
  parrot:         { id: 'parrot',         name: 'Parrot',            icon: 'parrot-head',          tier: 'mid',     pay: [0, 0, 5, 15, 30] },
  ship:           { id: 'ship',           name: 'Ship',              icon: 'pirate-flag',          tier: 'mid',     pay: [0, 0, 5, 15, 30] },
  hat:            { id: 'hat',            name: 'Pirate Hat',        icon: 'pirate-hat',           tier: 'mid',     pay: [0, 0, 8, 20, 50] },
  swords:         { id: 'swords',         name: 'Crossed Swords',    icon: 'crossed-swords',       tier: 'mid',     pay: [0, 0, 8, 20, 50] },
  // High value (3)
  chest:          { id: 'chest',          name: 'Treasure Chest',    icon: 'open-treasure-chest',  tier: 'high',    pay: [0, 0, 10, 40, 100] },
  skull:          { id: 'skull',          name: 'Skull & Crossbones',icon: 'skull-crossed-bones',  tier: 'high',    pay: [0, 0, 15, 50, 150] },
  captain:        { id: 'captain',        name: 'Pirate Captain',    icon: 'pirate-captain',       tier: 'high',    pay: [0, 0, 20, 75, 250] },
  // Special (3)
  wild:           { id: 'wild',           name: 'Gold Coin (Wild)',  icon: 'two-coins',            tier: 'wild',    pay: [0, 0, 25, 100, 500], isWild: true },
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

// Reel strips: array of symbol IDs per reel
// Symbol frequency controls actual odds
const REEL_STRIPS = [
  // Reel 0 (no wild)
  ['compass','compass','compass','compass','compass','compass','compass','compass','compass','compass',
   'anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor',
   'rum','rum','rum','rum','rum','rum','rum','rum',
   'cannon','cannon','cannon','cannon','cannon','cannon','cannon','cannon',
   'parrot','parrot','parrot','parrot','parrot',
   'ship','ship','ship','ship','ship',
   'hat','hat','hat','hat',
   'swords','swords','swords','swords',
   'chest','chest','chest',
   'skull','skull',
   'captain',
   'scatter','scatter',
   'bonus','bonus'],
  // Reel 1 (has wild)
  ['compass','compass','compass','compass','compass','compass','compass','compass','compass',
   'anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor',
   'rum','rum','rum','rum','rum','rum','rum',
   'cannon','cannon','cannon','cannon','cannon','cannon','cannon',
   'parrot','parrot','parrot','parrot','parrot',
   'ship','ship','ship','ship','ship',
   'hat','hat','hat','hat',
   'swords','swords','swords','swords',
   'chest','chest','chest',
   'skull','skull',
   'captain',
   'wild','wild','wild',
   'scatter','scatter',
   'bonus'],
  // Reel 2 (has wild)
  ['compass','compass','compass','compass','compass','compass','compass','compass','compass',
   'anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor',
   'rum','rum','rum','rum','rum','rum','rum',
   'cannon','cannon','cannon','cannon','cannon','cannon','cannon',
   'parrot','parrot','parrot','parrot','parrot',
   'ship','ship','ship','ship','ship',
   'hat','hat','hat','hat',
   'swords','swords','swords','swords',
   'chest','chest','chest',
   'skull','skull',
   'captain',
   'wild','wild','wild',
   'scatter','scatter',
   'bonus','bonus'],
  // Reel 3 (has wild)
  ['compass','compass','compass','compass','compass','compass','compass','compass','compass',
   'anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor',
   'rum','rum','rum','rum','rum','rum','rum',
   'cannon','cannon','cannon','cannon','cannon','cannon','cannon',
   'parrot','parrot','parrot','parrot','parrot',
   'ship','ship','ship','ship','ship',
   'hat','hat','hat','hat',
   'swords','swords','swords','swords',
   'chest','chest','chest',
   'skull','skull',
   'captain',
   'wild','wild','wild',
   'scatter','scatter',
   'bonus'],
  // Reel 4 (has wild)
  ['compass','compass','compass','compass','compass','compass','compass','compass','compass','compass',
   'anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor','anchor',
   'rum','rum','rum','rum','rum','rum','rum','rum',
   'cannon','cannon','cannon','cannon','cannon','cannon','cannon','cannon',
   'parrot','parrot','parrot','parrot','parrot',
   'ship','ship','ship','ship','ship',
   'hat','hat','hat','hat',
   'swords','swords','swords','swords',
   'chest','chest','chest',
   'skull','skull',
   'captain',
   'wild','wild','wild',
   'scatter','scatter',
   'bonus','bonus'],
];

// Cascade multipliers: index = cascade count (0-based)
const CASCADE_MULTIPLIERS = [1, 2, 3, 5, 8];

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
  mini:  { start: 100,   triggerChance: 1/500,   contribution: 0.005, label: 'Mini',  color: '#cd7f32' },
  major: { start: 1000,  triggerChance: 1/2500,  contribution: 0.0035, label: 'Major', color: '#c0c0c0' },
  grand: { start: 10000, triggerChance: 1/10000, contribution: 0.0015, label: 'Grand', color: '#ffd700' },
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
    CASCADE_MULTIPLIERS, FREE_SPINS_CONFIG, TREASURE_HUNT_CONFIG,
    WHEEL_SEGMENTS, JACKPOT_CONFIG,
    STARTING_CREDITS, BILL_VALUE, LOYALTY_TIERS,
    PAYLINE_COLOR_GROUPS, PAYLINE_GROUP_COUNTS, PAYLINE_COLORS,
  };
}
