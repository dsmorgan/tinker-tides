#!/usr/bin/env node
/* Tinker Tides — RTP simulator.
 *
 * Headless Monte-Carlo: runs N spins through engine.js (the same code the
 * game uses for paylines/cascades/bonuses) and reports:
 *   - RTP (return-to-player as % of total wagered)
 *   - Hit frequency (% of spins that pay anything)
 *   - Win-size distribution
 *   - Bonus trigger rates
 *   - Jackpot trigger rates
 *
 * Usage:
 *   node simulate.js                 # default 1,000,000 spins
 *   node simulate.js 250000          # custom spin count
 *   node simulate.js 1000000 --quiet # only print final summary
 *
 * Assumes denom=1 throughout (1 credit per line, 20 credits per spin) — RTP
 * is a denom-invariant metric, so this gives the same number as any denom.
 */
'use strict';

var Engine = require('./engine.js');
var data   = require('./data.js');

var NUM_LINES         = data.NUM_LINES;
var JACKPOT_CONFIG    = data.JACKPOT_CONFIG;
var FREE_SPINS_CONFIG = data.FREE_SPINS_CONFIG;

// ─── Args ─────────────────────────────────────────────────────────────
var args = process.argv.slice(2);
var spins = parseInt(args[0], 10) || 1000000;
var quiet = args.indexOf('--quiet') !== -1;

// ─── Stats accumulator ────────────────────────────────────────────────
function newStats() {
  return {
    spins: 0,
    totalBet: 0,
    totalWon: 0,
    payingSpins: 0,
    biggestWin: 0,
    winsBySize: {                                // bucketed by multiple of bet
      tiny:   0,   // 0 < win < bet
      small:  0,   // bet ≤ win < 5×bet
      mid:    0,   // 5×bet ≤ win < 25×bet
      big:    0,   // 25×bet ≤ win < 100×bet
      huge:   0,   // 100×bet ≤ win < 500×bet
      mega:   0,   // 500×bet+
    },
    triggers: {
      scatter:      0, // free-spins triggers (3+ scatters)
      bonus:        0, // wheel triggers
      treasureHunt: 0,
      randomMini:   0,
      randomMajor:  0,
      randomGrand:  0,
      jackpotChestMini:  0,
      jackpotChestMajor: 0,
      wheelJackpotMini:  0,
      wheelJackpotMajor: 0,
      wheelJackpotGrand: 0,
    },
    bonusContribution: {
      paylines:     0,
      freeSpins:    0,
      wheel:        0,
      treasureHunt: 0,
      jackpots:     0,
    },
    jackpotPools: {
      mini: JACKPOT_CONFIG.mini.start,
      major: JACKPOT_CONFIG.major.start,
      grand: JACKPOT_CONFIG.grand.start,
    },
  };
}

function bucketWin(stats, win, bet) {
  if (win <= 0) return;
  var ratio = win / bet;
  if (ratio < 1)  stats.winsBySize.tiny++;
  else if (ratio < 5)   stats.winsBySize.small++;
  else if (ratio < 25)  stats.winsBySize.mid++;
  else if (ratio < 100) stats.winsBySize.big++;
  else if (ratio < 500) stats.winsBySize.huge++;
  else                  stats.winsBySize.mega++;
}

// Random check for per-spin progressive triggers (matches checkRandomJackpot
// in game.js: each tier rolls independently in tier-order, first hit wins).
function rollRandomJackpot(stats) {
  for (var tier in JACKPOT_CONFIG) {
    if (Math.random() < JACKPOT_CONFIG[tier].triggerChance) {
      var pool = stats.jackpotPools[tier];
      stats.jackpotPools[tier] = JACKPOT_CONFIG[tier].start;
      stats.triggers['random' + tier.charAt(0).toUpperCase() + tier.slice(1)]++;
      return { tier: tier, amount: pool };
    }
  }
  return null;
}

// ─── Main loop ────────────────────────────────────────────────────────
var stats = newStats();
var betPerSpin = NUM_LINES; // denom = 1 → bet = 20 credits/spin

var startTime = Date.now();
var lastReport = startTime;

for (var i = 0; i < spins; i++) {
  // Place the bet and contribute to jackpots
  stats.totalBet += betPerSpin;
  for (var jt in JACKPOT_CONFIG) {
    stats.jackpotPools[jt] += betPerSpin * JACKPOT_CONFIG[jt].contribution;
  }

  // Spin: single payline evaluation (no cascade) returns total payline win
  // in denom units (= credits at denom=1).
  var spin = Engine.runSpin();
  var paylineWin = spin.paylineWinUnits;
  stats.bonusContribution.paylines += paylineWin;

  var spinWin = paylineWin;

  // Handle triggers (bonus features)
  if (spin.scatterCount >= 3) {
    stats.triggers.scatter++;
    var fs = Engine.runFreeSpinsSession(spin.scatterCount);
    spinWin += fs.winUnits;
    stats.bonusContribution.freeSpins += fs.winUnits;
  }
  if (spin.bonusTriggered) {
    stats.triggers.bonus++;
    var wheel = Engine.runWheelOfFortune(stats.jackpotPools);
    spinWin += wheel.winCredits;
    stats.bonusContribution.wheel += wheel.winCredits;
    for (var wjt in wheel.jackpotsWon) {
      stats.triggers['wheelJackpot' + wjt.charAt(0).toUpperCase() + wjt.slice(1)] += wheel.jackpotsWon[wjt];
      stats.jackpotPools[wjt] = JACKPOT_CONFIG[wjt].start;
    }
  }
  if (spin.treasureHuntTriggered) {
    stats.triggers.treasureHunt++;
    var th = Engine.runTreasureHunt(stats.jackpotPools);
    spinWin += th.winCredits;
    stats.bonusContribution.treasureHunt += th.winCredits;
    for (var tjt in th.jackpotsWon) {
      stats.triggers['jackpotChest' + tjt.charAt(0).toUpperCase() + tjt.slice(1)] += th.jackpotsWon[tjt];
      stats.jackpotPools[tjt] = JACKPOT_CONFIG[tjt].start;
    }
  }

  // Random per-spin progressive trigger (separate from chests/wheel)
  var rj = rollRandomJackpot(stats);
  if (rj) {
    spinWin += rj.amount;
    stats.bonusContribution.jackpots += rj.amount;
  }

  if (spinWin > 0) stats.payingSpins++;
  if (spinWin > stats.biggestWin) stats.biggestWin = spinWin;
  bucketWin(stats, spinWin, betPerSpin);
  stats.totalWon += spinWin;
  stats.spins++;

  if (!quiet && Date.now() - lastReport > 2000) {
    var rtp = (stats.totalWon / stats.totalBet * 100).toFixed(2);
    var pct = (stats.spins / spins * 100).toFixed(1);
    process.stdout.write('\r' + pct + '% — ' + stats.spins.toLocaleString() +
      ' spins, RTP ' + rtp + '%, biggest win ' + stats.biggestWin.toLocaleString() + ' credits      ');
    lastReport = Date.now();
  }
}

if (!quiet) process.stdout.write('\n\n');

// ─── Report ───────────────────────────────────────────────────────────
var elapsed = (Date.now() - startTime) / 1000;
var rtp = stats.totalWon / stats.totalBet * 100;
var hitFreq = stats.payingSpins / stats.spins * 100;

function pct(n, d) { return (n / d * 100).toFixed(3) + '%'; }
function fmt(n) { return Math.round(n).toLocaleString(); }
function bar(label, val) {
  var line = label.padEnd(28) + (val + '').padStart(14);
  return line;
}

console.log('═══ Tinker Tides RTP simulation ' + '═'.repeat(28));
console.log('Spins:                  ' + fmt(stats.spins).padStart(20) +
            '   (' + elapsed.toFixed(1) + 's, ' + Math.round(stats.spins / elapsed).toLocaleString() + ' spins/s)');
console.log('Total wagered (credits):' + fmt(stats.totalBet).padStart(20));
console.log('Total returned:         ' + fmt(stats.totalWon).padStart(20));
console.log('────────────────────────────────────────────────────────────');
console.log('RTP:                    ' + (rtp.toFixed(3) + '%').padStart(20));
console.log('Hit frequency:          ' + (hitFreq.toFixed(2) + '%').padStart(20));
console.log('Biggest win:            ' + fmt(stats.biggestWin).padStart(20) + ' credits  (' + (stats.biggestWin / betPerSpin).toFixed(0) + '× bet)');
console.log();

console.log('── Win-size distribution (% of paying spins) ───────────────');
var paying = stats.payingSpins;
console.log(bar('Tiny    (< 1× bet):',     pct(stats.winsBySize.tiny,  paying)));
console.log(bar('Small   (1–5× bet):',     pct(stats.winsBySize.small, paying)));
console.log(bar('Mid     (5–25× bet):',    pct(stats.winsBySize.mid,   paying)));
console.log(bar('Big     (25–100× bet):',  pct(stats.winsBySize.big,   paying)));
console.log(bar('Huge    (100–500× bet):', pct(stats.winsBySize.huge,  paying)));
console.log(bar('Mega    (500×+ bet):',    pct(stats.winsBySize.mega,  paying)));
console.log();

console.log('── Bonus trigger frequency ─────────────────────────────────');
console.log(bar('Free spins (3+ scatter):',  pct(stats.triggers.scatter,      stats.spins)) +
            '   1 in ' + (stats.triggers.scatter ? Math.round(stats.spins / stats.triggers.scatter).toLocaleString() : '∞'));
console.log(bar('Wheel of Fortune:',         pct(stats.triggers.bonus,        stats.spins)) +
            '   1 in ' + (stats.triggers.bonus ? Math.round(stats.spins / stats.triggers.bonus).toLocaleString() : '∞'));
console.log(bar('Treasure Hunt:',            pct(stats.triggers.treasureHunt, stats.spins)) +
            '   1 in ' + (stats.triggers.treasureHunt ? Math.round(stats.spins / stats.triggers.treasureHunt).toLocaleString() : '∞'));
console.log();

console.log('── Jackpot trigger frequency ───────────────────────────────');
var totalJpMini  = stats.triggers.randomMini  + stats.triggers.jackpotChestMini  + stats.triggers.wheelJackpotMini;
var totalJpMajor = stats.triggers.randomMajor + stats.triggers.jackpotChestMajor + stats.triggers.wheelJackpotMajor;
var totalJpGrand = stats.triggers.randomGrand + stats.triggers.wheelJackpotGrand;
console.log(bar('Mini:',  totalJpMini)  + '   1 in ' + (totalJpMini  ? Math.round(stats.spins / totalJpMini).toLocaleString()  : '∞'));
console.log(bar('Major:', totalJpMajor) + '   1 in ' + (totalJpMajor ? Math.round(stats.spins / totalJpMajor).toLocaleString() : '∞'));
console.log(bar('Grand:', totalJpGrand) + '   1 in ' + (totalJpGrand ? Math.round(stats.spins / totalJpGrand).toLocaleString() : '∞'));
console.log();

console.log('── RTP contribution by source ──────────────────────────────');
var pl = stats.bonusContribution.paylines / stats.totalBet * 100;
var fs = stats.bonusContribution.freeSpins / stats.totalBet * 100;
var wh = stats.bonusContribution.wheel / stats.totalBet * 100;
var th = stats.bonusContribution.treasureHunt / stats.totalBet * 100;
var jp = stats.bonusContribution.jackpots / stats.totalBet * 100;
console.log(bar('Paylines:',            pl.toFixed(3) + '%'));
console.log(bar('Free spins:',          fs.toFixed(3) + '%'));
console.log(bar('Wheel of Fortune:',    wh.toFixed(3) + '%'));
console.log(bar('Treasure Hunt:',       th.toFixed(3) + '%'));
console.log(bar('Random progressives:', jp.toFixed(3) + '%'));
console.log(bar('TOTAL:',               (pl + fs + wh + th + jp).toFixed(3) + '%'));
console.log();
