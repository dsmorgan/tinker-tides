/* Tinker Tides — Static Game Data */

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

// 20 fixed paylines — each is array of row indices [reel0, reel1, reel2, reel3, reel4]
const PAYLINES = [
  [1,1,1,1,1], // 1: middle
  [0,0,0,0,0], // 2: top
  [2,2,2,2,2], // 3: bottom
  [0,1,2,1,0], // 4: V
  [2,1,0,1,2], // 5: inverted V
  [0,0,1,0,0], // 6: slight dip
  [2,2,1,2,2], // 7: slight rise
  [1,0,0,0,1], // 8: U
  [1,2,2,2,1], // 9: inverted U
  [0,1,1,1,0], // 10: shallow V
  [2,1,1,1,2], // 11: shallow inv V
  [1,0,1,0,1], // 12: zigzag up
  [1,2,1,2,1], // 13: zigzag down
  [0,1,0,1,0], // 14: small zigzag top
  [2,1,2,1,2], // 15: small zigzag bottom
  [0,0,1,2,2], // 16: descending slope
  [2,2,1,0,0], // 17: ascending slope
  [1,0,0,1,2], // 18: hook left
  [1,2,2,1,0], // 19: hook right
  [0,1,2,2,1], // 20: wave
];

// Bet levels (coins per line)
const BET_LEVELS = [1, 2, 5, 10, 25, 50];
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

// Wheel of Fortune config
const WHEEL_SEGMENTS = [
  { label: '10×',        type: 'coins',    value: 10,  color: '#2d6a4f' },
  { label: '25×',        type: 'coins',    value: 25,  color: '#40916c' },
  { label: '5 FREE',     type: 'freespins',value: 5,   color: '#6b3a7a' },
  { label: '50×',        type: 'coins',    value: 50,  color: '#2d6a4f' },
  { label: '15×',        type: 'coins',    value: 15,  color: '#40916c' },
  { label: '100×',       type: 'coins',    value: 100, color: '#1b4332' },
  { label: 'SPIN AGAIN', type: 'respin',   value: 0,   color: '#b8860b' },
  { label: '20×',        type: 'coins',    value: 20,  color: '#40916c' },
  { label: '10 FREE',    type: 'freespins',value: 10,  color: '#6b3a7a' },
  { label: '250×',       type: 'coins',    value: 250, color: '#8b2020' },
  { label: '50×',        type: 'coins',    value: 50,  color: '#2d6a4f' },
  { label: 'JACKPOT',    type: 'jackpot',  value: 0,   color: '#ffd700' },
];

// Jackpot config
const JACKPOT_CONFIG = {
  mini:  { start: 100,   triggerChance: 1/500,   contribution: 0.005, label: 'Mini',  color: '#cd7f32' },
  major: { start: 1000,  triggerChance: 1/2500,  contribution: 0.0035, label: 'Major', color: '#c0c0c0' },
  grand: { start: 10000, triggerChance: 1/10000, contribution: 0.0015, label: 'Grand', color: '#ffd700' },
};

// Economy
const STARTING_COINS = 1000;
const REFILL_AMOUNT = 500;
const REFILL_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours in ms

// Payline colors for highlighting
const PAYLINE_COLORS = [
  '#ff4444','#44ff44','#4444ff','#ffff44','#ff44ff',
  '#44ffff','#ff8844','#88ff44','#4488ff','#ff4488',
  '#44ff88','#8844ff','#ffaa44','#44ffaa','#aa44ff',
  '#ff6644','#66ff44','#4466ff','#ff4466','#66ff66',
];
