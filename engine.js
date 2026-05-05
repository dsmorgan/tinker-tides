/* Tinker Tides — Pure game engine.
 *
 * No DOM, no animations, no state mutation. Just the math.
 *
 * Loads in two environments:
 *   - Browser:  <script src="data.js"> + <script src="engine.js"> exposes
 *               window.Engine (and globals from data.js are read directly).
 *   - Node:     `const Engine = require('./engine.js');` — engine pulls data
 *               via require under the hood.
 *
 * Both environments share the SAME implementation of paylines, cascades,
 * bonus payouts, and jackpots, so simulate.js and game.js can never drift.
 */
(function() {
  'use strict';

  function createEngine(data) {
    var REELS = data.REELS;
    var ROWS = data.ROWS;
    var NUM_LINES = data.NUM_LINES;
    var SYMBOLS = data.SYMBOLS;
    var PAYLINES = data.PAYLINES;
    var REEL_STRIPS = data.REEL_STRIPS;
    var FREE_SPINS_CONFIG = data.FREE_SPINS_CONFIG;
    var TREASURE_HUNT_CONFIG = data.TREASURE_HUNT_CONFIG;
    var WHEEL_SEGMENTS = data.WHEEL_SEGMENTS;
    var JACKPOT_CONFIG = data.JACKPOT_CONFIG;

    // ─── Reel + grid generation ──────────────────────────────────────
    function randomSymbolFromReel(reelIdx) {
      var strip = REEL_STRIPS[reelIdx];
      return strip[Math.floor(Math.random() * strip.length)];
    }

    function generateGrid() {
      var grid = [];
      for (var r = 0; r < REELS; r++) {
        var col = [];
        for (var row = 0; row < ROWS; row++) col.push(randomSymbolFromReel(r));
        grid.push(col);
      }
      return grid;
    }

    // ─── Payline evaluation ──────────────────────────────────────────
    function evaluateLine(symbols) {
      var baseSymbol = null;
      for (var idx = 0; idx < symbols.length; idx++) {
        var s = symbols[idx];
        if (s !== 'wild' && s !== 'scatter' && s !== 'bonus') {
          baseSymbol = s;
          break;
        }
      }
      if (!baseSymbol) {
        if (symbols[0] === 'wild') baseSymbol = 'wild';
        else return null;
      }
      var count = 0;
      for (var i = 0; i < symbols.length; i++) {
        var sym = symbols[i];
        if (sym === baseSymbol || (SYMBOLS[sym] && SYMBOLS[sym].isWild)) {
          count++;
        } else {
          break;
        }
      }
      if (count < 3) return null;
      var symDef = SYMBOLS[baseSymbol];
      if (!symDef) return null;
      var payout = symDef.pay[count - 1] || 0;
      if (payout === 0) return null;
      return { symbol: baseSymbol, count: count, payout: payout };
    }

    function evaluatePaylines(grid) {
      var wins = [];
      for (var i = 0; i < PAYLINES.length; i++) {
        var line = PAYLINES[i];
        var symbols = [];
        for (var r = 0; r < REELS; r++) symbols.push(grid[r][line[r]]);
        var result = evaluateLine(symbols);
        if (result) {
          result.lineIndex = i;
          result.positions = line.map(function(row, reel) { return { reel: reel, row: row }; });
          wins.push(result);
        }
      }
      return wins;
    }

    function countSymbol(grid, symId) {
      var count = 0;
      var positions = [];
      for (var r = 0; r < REELS; r++) {
        for (var row = 0; row < ROWS; row++) {
          if (grid[r][row] === symId) {
            count++;
            positions.push({ reel: r, row: row });
          }
        }
      }
      return { count: count, positions: positions };
    }

    function checkBonusTrigger(grid) {
      var count = 0;
      var positions = [];
      var targetReels = [0, 2, 4];
      for (var ri = 0; ri < targetReels.length; ri++) {
        var r = targetReels[ri];
        for (var row = 0; row < ROWS; row++) {
          if (grid[r][row] === 'bonus') {
            count++;
            positions.push({ reel: r, row: row });
            break;
          }
        }
      }
      return { triggered: count >= 3, count: count, positions: positions };
    }

    function checkTreasureHunt(grid) {
      var reel0 = false, reel4 = false;
      var positions = [];
      for (var row = 0; row < ROWS; row++) {
        if (grid[0][row] === 'captain') { reel0 = true; positions.push({ reel: 0, row: row }); }
        if (grid[4][row] === 'captain') { reel4 = true; positions.push({ reel: 4, row: row }); }
      }
      return { triggered: reel0 && reel4, positions: positions };
    }

    // ─── Headless spin ───────────────────────────────────────────────
    // Evaluates a single grid (no cascade), returning total payline win
    // in DENOM-MULTIPLIER UNITS (multiply by denom in credits to get credits).
    // opts.fixedGrid:    optional starting grid (otherwise random)
    // opts.freeSpinMult: multiplier applied to all line wins (1, or 2 in free spins)
    function runSpin(opts) {
      opts = opts || {};
      var freeSpinMult = opts.freeSpinMult || 1;
      var grid = opts.fixedGrid
        ? opts.fixedGrid.map(function(c) { return c.slice(); })
        : generateGrid();

      var scatterResult = countSymbol(grid, 'scatter');
      var bonusResult = checkBonusTrigger(grid);
      var treasureResult = checkTreasureHunt(grid);

      var wins = evaluatePaylines(grid);
      var totalUnits = 0;
      for (var wi = 0; wi < wins.length; wi++) {
        totalUnits += wins[wi].payout * freeSpinMult;
      }

      return {
        grid: grid,
        wins: wins,
        paylineWinUnits: totalUnits,
        scatterCount: scatterResult.count,
        bonusTriggered: bonusResult.triggered,
        treasureHuntTriggered: treasureResult.triggered,
      };
    }

    // ─── Free spins session ──────────────────────────────────────────
    // Runs a complete free-spin session (with retriggers up to maxSpins).
    // Returns total payline-win units (in denom multipliers, denom=1 → credits).
    function runFreeSpinsSession(scatterCount) {
      var spinsAwarded = FREE_SPINS_CONFIG.scatterCounts[scatterCount] || 8;
      var remaining = spinsAwarded;
      var totalSpinsAwarded = spinsAwarded;
      var winUnits = 0;
      var spinsPlayed = 0;
      while (remaining > 0) {
        remaining--;
        spinsPlayed++;
        var result = runSpin({ freeSpinMult: FREE_SPINS_CONFIG.baseMultiplier });
        winUnits += result.paylineWinUnits;
        // Retrigger: 3+ scatters during free spins → +retriggerAward (capped)
        if (result.scatterCount >= 3) {
          var room = FREE_SPINS_CONFIG.maxSpins - totalSpinsAwarded;
          var add = Math.min(FREE_SPINS_CONFIG.retriggerAward, Math.max(0, room));
          remaining += add;
          totalSpinsAwarded += add;
        }
      }
      return { winUnits: winUnits, spinsPlayed: spinsPlayed };
    }

    // ─── Wheel of Fortune ────────────────────────────────────────────
    // Returns credits won (assuming denom=1 → totalBet = NUM_LINES) plus
    // metadata for stats. Recurses on SPIN AGAIN, drills into mini/major/grand
    // on JACKPOT, runs free spins inline on FREESPINS segments.
    function runWheelOfFortune(jackpotPools) {
      jackpotPools = jackpotPools || {
        mini: JACKPOT_CONFIG.mini.start,
        major: JACKPOT_CONFIG.major.start,
        grand: JACKPOT_CONFIG.grand.start,
      };
      var seg = WHEEL_SEGMENTS[Math.floor(Math.random() * WHEEL_SEGMENTS.length)];
      var winCredits = 0;
      var segments = [seg.label];
      var jackpotsWon = {};
      var totalBet = NUM_LINES; // assuming denom=1
      switch (seg.type) {
        case 'coins':
          winCredits = seg.value * totalBet;
          break;
        case 'freespins':
          // Wheel awards a flat number of free spins; treat them like a session.
          // Approximate by mapping count to scatter equivalent (or just running directly).
          var fsRemaining = seg.value;
          var fsWinUnits = 0;
          while (fsRemaining > 0) {
            fsRemaining--;
            var fs = runSpin({ freeSpinMult: FREE_SPINS_CONFIG.baseMultiplier });
            fsWinUnits += fs.paylineWinUnits;
          }
          winCredits = fsWinUnits; // denom=1
          break;
        case 'respin':
          var inner = runWheelOfFortune(jackpotPools);
          winCredits = inner.winCredits;
          segments = segments.concat(inner.segments);
          for (var k in inner.jackpotsWon) jackpotsWon[k] = (jackpotsWon[k] || 0) + inner.jackpotsWon[k];
          break;
        case 'jackpot':
          // Inner jackpot wheel — same probabilities as resolveJackpotWheel in game.js
          var roll = Math.random();
          var tier = (roll < 0.6) ? 'mini' : (roll < 0.9 ? 'major' : 'grand');
          winCredits = jackpotPools[tier];
          jackpotsWon[tier] = 1;
          break;
      }
      return { winCredits: winCredits, segments: segments, jackpotsWon: jackpotsWon };
    }

    // ─── Treasure Hunt ───────────────────────────────────────────────
    // Returns credits won (assuming denom=1) by sampling chest contents
    // until a skull is opened or all chests are revealed.
    function runTreasureHunt(jackpotPools) {
      jackpotPools = jackpotPools || {
        mini: JACKPOT_CONFIG.mini.start,
        major: JACKPOT_CONFIG.major.start,
        grand: JACKPOT_CONFIG.grand.start,
      };
      var prizes = TREASURE_HUNT_CONFIG.prizes;
      var totalWeight = 0;
      for (var i = 0; i < prizes.length; i++) totalWeight += prizes[i].weight;
      var totalBet = NUM_LINES; // assuming denom=1
      var coinsCollected = 0;
      var multiplier = 1;
      var jackpotsWon = {};

      // Generate chest contents up front (matches game.js logic), then sample picks
      var maxChests = TREASURE_HUNT_CONFIG.numChests;
      var chestContents = [];
      var hasSkull = false;
      for (var ci = 0; ci < maxChests; ci++) {
        var roll = Math.random() * totalWeight;
        var cum = 0, picked = null;
        for (var pi = 0; pi < prizes.length; pi++) {
          cum += prizes[pi].weight;
          if (roll < cum) { picked = prizes[pi]; break; }
        }
        chestContents.push(picked);
        if (picked.type === 'skull') hasSkull = true;
      }
      if (!hasSkull) {
        var skullPrize = null;
        for (var sp = 0; sp < prizes.length; sp++) if (prizes[sp].type === 'skull') { skullPrize = prizes[sp]; break; }
        chestContents[Math.floor(Math.random() * chestContents.length)] = skullPrize;
      }
      shuffle(chestContents);

      var picksRemaining = maxChests;
      var picksTaken = 0;
      while (picksRemaining > 0 && picksTaken < chestContents.length) {
        var prize = chestContents[picksTaken];
        picksTaken++;
        if (prize.type === 'skull') break;
        switch (prize.type) {
          case 'coins':
            coinsCollected += (prize.min + Math.floor(Math.random() * (prize.max - prize.min + 1))) * totalBet;
            break;
          case 'multiplier':
            multiplier *= prize.value;
            break;
          case 'extraPick':
            picksRemaining++;
            break;
          case 'jackpotMini':
            coinsCollected += jackpotPools.mini;
            jackpotsWon.mini = 1;
            break;
          case 'jackpotMajor':
            coinsCollected += jackpotPools.major;
            jackpotsWon.major = 1;
            break;
        }
        picksRemaining--;
      }
      return {
        winCredits: Math.floor(coinsCollected * multiplier),
        multiplier: multiplier,
        picksTaken: picksTaken,
        jackpotsWon: jackpotsWon,
      };
    }

    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
    }

    return {
      // Pure game functions (used by both game.js and simulate.js)
      randomSymbolFromReel: randomSymbolFromReel,
      generateGrid: generateGrid,
      evaluateLine: evaluateLine,
      evaluatePaylines: evaluatePaylines,
      countSymbol: countSymbol,
      checkBonusTrigger: checkBonusTrigger,
      checkTreasureHunt: checkTreasureHunt,
      // Headless spin (used by simulate.js)
      runSpin: runSpin,
      runFreeSpinsSession: runFreeSpinsSession,
      runWheelOfFortune: runWheelOfFortune,
      runTreasureHunt: runTreasureHunt,
    };
  }

  // Boot — Node uses require, browser reads data.js globals from the shared
  // script-level scope.
  var isNode = (typeof require === 'function' && typeof module !== 'undefined' && module.exports);
  if (isNode) {
    module.exports = createEngine(require('./data.js'));
  } else {
    var globalNS = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
    globalNS.Engine = createEngine({
      REELS: REELS, ROWS: ROWS, NUM_LINES: NUM_LINES,
      SYMBOLS: SYMBOLS, PAYLINES: PAYLINES, REEL_STRIPS: REEL_STRIPS,
      CASCADE_MULTIPLIERS: CASCADE_MULTIPLIERS,
      FREE_SPINS_CONFIG: FREE_SPINS_CONFIG,
      TREASURE_HUNT_CONFIG: TREASURE_HUNT_CONFIG,
      WHEEL_SEGMENTS: WHEEL_SEGMENTS,
      JACKPOT_CONFIG: JACKPOT_CONFIG,
    });
  }
})();
