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
    var JACKPOT_PICKER_CONFIG = data.JACKPOT_PICKER_CONFIG;

    // ─── Reel + grid generation ──────────────────────────────────────
    // True-reel model: one random stop per reel. The 3 visible cells are
    // strip[stop], strip[stop+1], strip[stop+2] (modulo strip length). This
    // makes adjacent symbols on the strip correlated within a column —
    // key to the authentic "near-miss" feel of a real cabinet.
    function randomSymbolFromReel(reelIdx) {
      var strip = REEL_STRIPS[reelIdx];
      return strip[Math.floor(Math.random() * strip.length)];
    }

    // ─── Boosted reel-5 strip ────────────────────────────────────────
    // When reels 0-3 form a 4-of-a-kind on any payline, reel 4 (the 5th reel)
    // gets swapped to a boosted 14-cell strip with 2 wilds + 2 of the target
    // symbol = 1/7 each. Per-cell hit chance for {wild OR target} jumps from
    // ~6% (normal) to ~28%, ~5× boost — gives the player a real payoff for
    // the suspense of reel 4's anticipation hit.
    function findBoostTarget(grid03) {
      var bestSym = null;
      var bestPay = 0;
      for (var li = 0; li < PAYLINES.length; li++) {
        var line = PAYLINES[li];
        var base = null;
        var matched = true;
        for (var r = 0; r < 4; r++) {
          var s = grid03[r][line[r]];
          if (s === 'scatter' || s === 'bonus') { matched = false; break; }
          if (s !== 'wild') {
            if (base === null) base = s;
            else if (s !== base) { matched = false; break; }
          }
        }
        if (!matched || base === null) continue; // skip lines that are all-wild or broken
        var sd = SYMBOLS[base];
        if (!sd || !sd.pay) continue;
        var pay5 = sd.pay[4] || 0;
        if (pay5 > bestPay) { bestPay = pay5; bestSym = base; }
      }
      return bestSym;
    }

    function buildBoostedStrip(targetSym) {
      // 14 positions; target at 0,7; wild at 4,11 → 2/14 each = 1/7 each.
      // Fillers are everyday low/mid-pays so the wheel still "looks normal"
      // when it's spinning.
      var f = ['compass','anchor','rum','cannon','parrot','ship','hat','swords','compass','rum'];
      return [
        targetSym, f[0], f[1], f[2], 'wild', f[3], f[4],
        targetSym, f[5], f[6], f[7], 'wild', f[8], f[9],
      ];
    }

    function generateSpin() {
      var grid = [];
      var stops = [];
      var strips = []; // strip used per reel — REEL_STRIPS[r] or boosted
      // Reels 0-3: normal strips
      for (var r = 0; r < 4; r++) {
        var strip = REEL_STRIPS[r];
        var stop = Math.floor(Math.random() * strip.length);
        stops.push(stop);
        strips.push(strip);
        var col = [];
        for (var row = 0; row < ROWS; row++) {
          col.push(strip[(stop + row) % strip.length]);
        }
        grid.push(col);
      }
      // Reel 4: boosted strip if reels 0-3 form a 4-of-a-kind
      var boost = findBoostTarget(grid);
      var strip4 = boost ? buildBoostedStrip(boost) : REEL_STRIPS[4];
      var stop4 = Math.floor(Math.random() * strip4.length);
      stops.push(stop4);
      strips.push(strip4);
      var col4 = [];
      for (var row = 0; row < ROWS; row++) {
        col4.push(strip4[(stop4 + row) % strip4.length]);
      }
      grid.push(col4);
      return { grid: grid, stops: stops, strips: strips, boost: boost };
    }

    function generateGrid() {
      return generateSpin().grid;
    }

    // ─── Payline evaluation ──────────────────────────────────────────
    // wild / scatter / bonus / chest / skull never become the baseSymbol —
    // they're either substitutes (wild) or pure-trigger scatters with no
    // payline pay. Chest triggers Treasure Hunt; skull triggers Jackpot Picker.
    function evaluateLine(symbols) {
      var baseSymbol = null;
      for (var idx = 0; idx < symbols.length; idx++) {
        var s = symbols[idx];
        if (s !== 'wild' && s !== 'scatter' && s !== 'bonus' && s !== 'chest' && s !== 'skull') {
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
      // Allow 2-of-a-kind matches; symbols whose pay[1] is 0 will still bail
      // at the payout === 0 check below. Only the lowest tier opts in via data.js.
      if (count < 2) return null;
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

    // Treasure Hunt now triggers on 3+ Treasure Chest symbols ANYWHERE (scatter
     // behavior). The chest count drives the starting multiplier inside TH:
     //   3 chests → ×1   4 chests → ×2   5+ chests → ×3
    function checkTreasureHunt(grid) {
      var positions = [];
      var count = 0;
      for (var r = 0; r < REELS; r++) {
        for (var row = 0; row < ROWS; row++) {
          if (grid[r][row] === 'chest') {
            count++;
            positions.push({ reel: r, row: row });
          }
        }
      }
      return { triggered: count >= 3, count: count, positions: positions };
    }

    // Progressive Jackpot Picker triggers on 3+ Skull symbols ANYWHERE.
    // Player picks tiles from a 3×3 grid until 3 of a tier match (win that
    // tier) or 3 blanks come up (bust).
    function checkJackpotTrigger(grid) {
      var positions = [];
      var count = 0;
      for (var r = 0; r < REELS; r++) {
        for (var row = 0; row < ROWS; row++) {
          if (grid[r][row] === 'skull') {
            count++;
            positions.push({ reel: r, row: row });
          }
        }
      }
      return { triggered: count >= 3, count: count, positions: positions };
    }

    // ─── Headless spin ───────────────────────────────────────────────
    // Evaluates a single grid (no cascade), returning total payline win
    // in DENOM-MULTIPLIER UNITS (multiply by denom in credits to get credits).
    // opts.fixedGrid:    optional starting grid (otherwise random)
    // opts.freeSpinMult: multiplier applied to all line wins (1, or 2 in free spins)
    function runSpin(opts) {
      opts = opts || {};
      var freeSpinMult = opts.freeSpinMult || 1;
      var grid, stops, strips, boost;
      if (opts.fixedGrid) {
        grid = opts.fixedGrid.map(function(c) { return c.slice(); });
        stops = null; // forced grid → stop positions unknown
        strips = null;
        boost = null;
      } else {
        var sp = generateSpin();
        grid = sp.grid;
        stops = sp.stops;
        strips = sp.strips;
        boost = sp.boost;
      }

      var scatterResult = countSymbol(grid, 'scatter');
      var bonusResult = checkBonusTrigger(grid);
      var treasureResult = checkTreasureHunt(grid);
      var jackpotResult = checkJackpotTrigger(grid);

      var wins = evaluatePaylines(grid);
      var totalUnits = 0;
      for (var wi = 0; wi < wins.length; wi++) {
        totalUnits += wins[wi].payout * freeSpinMult;
      }

      var maxLineCount = 0;
      for (var ww = 0; ww < wins.length; ww++) {
        if (wins[ww].count > maxLineCount) maxLineCount = wins[ww].count;
      }

      return {
        grid: grid,
        stops: stops,
        strips: strips,
        boost: boost,
        wins: wins,
        maxLineCount: maxLineCount,
        paylineWinUnits: totalUnits,
        scatterCount: scatterResult.count,
        bonusTriggered: bonusResult.triggered,
        treasureHuntTriggered: treasureResult.triggered,
        treasureChestCount: treasureResult.count,
        jackpotTriggered: jackpotResult.triggered,
        jackpotSkullCount: jackpotResult.count,
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
    // chestCount = number of scatter chests that triggered TH (3, 4, or 5).
    // Drives the starting multiplier per TREASURE_HUNT_CONFIG.startMultiplier.
    function runTreasureHunt(jackpotPools, chestCount) {
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
      var startMult = TREASURE_HUNT_CONFIG.startMultiplier || {};
      var multiplier = startMult[chestCount] || 1;
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

    // ─── Progressive Jackpot Picker ──────────────────────────────────
    // Headless simulation of the 3×3 reveal mini-game. Player reveals tiles
    // in random order until 3 of any tier match (win that tier) or 3 blanks
    // come up (bust). Returns credits won + which tier (if any).
    function runJackpotPicker(jackpotPools, skullCount) {
      jackpotPools = jackpotPools || {
        mini: JACKPOT_CONFIG.mini.start,
        major: JACKPOT_CONFIG.major.start,
        grand: JACKPOT_CONFIG.grand.start,
      };
      var cfg = JACKPOT_PICKER_CONFIG;
      var totalWeight = 0;
      for (var ti = 0; ti < cfg.tiles.length; ti++) totalWeight += cfg.tiles[ti].weight;

      // Roll all 9 tile values up front
      var tiles = [];
      for (var n = 0; n < cfg.gridSize; n++) {
        var roll = Math.random() * totalWeight;
        var cum = 0, picked = null;
        for (var pi = 0; pi < cfg.tiles.length; pi++) {
          cum += cfg.tiles[pi].weight;
          if (roll < cum) { picked = cfg.tiles[pi].type; break; }
        }
        tiles.push(picked);
      }
      shuffle(tiles); // pick order is effectively random

      var counts = { blank: 0, mini: 0, major: 0, grand: 0 };
      var revealed = 0;
      var wonTier = null;
      for (var k = 0; k < tiles.length; k++) {
        counts[tiles[k]]++;
        revealed++;
        if (counts.mini  >= cfg.matchToWin) { wonTier = 'mini';  break; }
        if (counts.major >= cfg.matchToWin) { wonTier = 'major'; break; }
        if (counts.grand >= cfg.matchToWin) { wonTier = 'grand'; break; }
        if (counts.blank >= cfg.bustOn) break; // bust
      }

      var winCredits = wonTier ? jackpotPools[wonTier] : 0;
      var jackpotsWon = {};
      if (wonTier) jackpotsWon[wonTier] = 1;
      return {
        winCredits: winCredits,
        wonTier: wonTier,
        jackpotsWon: jackpotsWon,
        revealed: revealed,
        tiles: tiles,
      };
    }

    return {
      // Pure game functions (used by both game.js and simulate.js)
      randomSymbolFromReel: randomSymbolFromReel,
      generateGrid: generateGrid,
      generateSpin: generateSpin,
      evaluateLine: evaluateLine,
      evaluatePaylines: evaluatePaylines,
      countSymbol: countSymbol,
      checkBonusTrigger: checkBonusTrigger,
      checkTreasureHunt: checkTreasureHunt,
      checkJackpotTrigger: checkJackpotTrigger,
      // Headless spin (used by simulate.js)
      runSpin: runSpin,
      runFreeSpinsSession: runFreeSpinsSession,
      runWheelOfFortune: runWheelOfFortune,
      runTreasureHunt: runTreasureHunt,
      runJackpotPicker: runJackpotPicker,
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
      FREE_SPINS_CONFIG: FREE_SPINS_CONFIG,
      TREASURE_HUNT_CONFIG: TREASURE_HUNT_CONFIG,
      WHEEL_SEGMENTS: WHEEL_SEGMENTS,
      JACKPOT_CONFIG: JACKPOT_CONFIG,
      JACKPOT_PICKER_CONFIG: JACKPOT_PICKER_CONFIG,
    });
  }
})();
