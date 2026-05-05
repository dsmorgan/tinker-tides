/* Tinker Tides — Game Engine (UI / state / animations).
 * Pure math lives in engine.js (window.Engine). REELS / ROWS / NUM_LINES
 * etc. come from data.js and are shared globals. */

const STORAGE_KEY = 'tnkr_tinker_tides';

// ─── State ───────────────────────────────────────────────────────────
function generatePlayerId() {
  return 'PIRATE #' + (1000 + Math.floor(Math.random() * 9000));
}

function defaultState() {
  return {
    version: 2,
    credits: STARTING_CREDITS,
    totalSpins: 0,
    totalWon: 0,
    totalBet: 0,
    totalInserted: 0,
    betPerLine: 1,
    jackpots: {
      mini: JACKPOT_CONFIG.mini.start,
      major: JACKPOT_CONFIG.major.start,
      grand: JACKPOT_CONFIG.grand.start,
    },
    freeSpins: { active: false, remaining: 0, multiplier: 1 },
    loyalty: {
      playerId: generatePlayerId(),
      cardInserted: false,
    },
    stats: {
      biggestWin: 0,
      cascadeRecord: 0,
      bonusesTriggered: 0,
      jackpotsWon: { mini: 0, major: 0, grand: 0 },
    },
  };
}

let state = defaultState();
let spinning = false;
let billInserting = false;
let currentGrid = []; // 5×3 grid of symbol IDs
let betLevelIdx = 0;
var displayedCredits = 0; // for tick-up animation
var creditTickTimer = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    var def = defaultState();
    // Migration: v1 coins → v2 credits
    if (saved.coins !== undefined && saved.credits === undefined) {
      saved.credits = saved.coins;
      delete saved.coins;
    }
    for (var k in def) {
      if (!(k in saved)) saved[k] = def[k];
    }
    if (!saved.stats) saved.stats = def.stats;
    for (var sk in def.stats) {
      if (!(sk in saved.stats)) saved.stats[sk] = def.stats[sk];
    }
    if (!saved.jackpots) saved.jackpots = def.jackpots;
    for (var jk in def.jackpots) {
      if (!(jk in saved.jackpots)) saved.jackpots[jk] = def.jackpots[jk];
    }
    if (!saved.freeSpins) saved.freeSpins = def.freeSpins;
    if (!saved.loyalty) saved.loyalty = def.loyalty;
    if (!saved.loyalty.playerId) saved.loyalty.playerId = generatePlayerId();
    if (saved.totalInserted === undefined) saved.totalInserted = 0;
    saved.version = 2;
    state = saved;
    betLevelIdx = BET_LEVELS.indexOf(state.betPerLine);
    if (betLevelIdx < 0) betLevelIdx = 0;
  } catch (e) {
    state = defaultState();
  }
}

// ─── Icon rendering ──────────────────────────────────────────────────
function iconHTML(slug, tier, size) {
  size = size || 48;
  const data = ICON_DATA[slug];
  if (!data) return '<div style="width:' + size + 'px;height:' + size + 'px;background:#333;border-radius:4px"></div>';
  return '<div class="sym-icon tier-' + tier + '" style="width:' + size + 'px;height:' + size + 'px;-webkit-mask-image:url(\'data:image/svg+xml,' + data + '\');mask-image:url(\'data:image/svg+xml,' + data + '\')"></div>';
}

// ─── Pure math (delegated to engine.js so simulate.js shares the impl) ──
// engine.js exposes window.Engine; we alias the functions locally so the
// rest of game.js can keep calling them by their bare names.
var randomSymbolFromReel = Engine.randomSymbolFromReel;
var generateGrid         = Engine.generateGrid;
var evaluateLine         = Engine.evaluateLine;
var evaluatePaylines     = Engine.evaluatePaylines;
var countSymbol          = Engine.countSymbol;
var checkBonusTrigger    = Engine.checkBonusTrigger;
var checkTreasureHunt    = Engine.checkTreasureHunt;

// ─── Rendering ───────────────────────────────────────────────────────
var $id = function(id) { return document.getElementById(id); };

function styleCell(cell, symId) {
  // Apply per-symbol background color
  var color = SYMBOL_COLORS[symId];
  if (color) cell.style.background = color;
  // Apply special class for symbols with custom treatments (defined in CSS)
  cell.classList.add('sym-' + symId);
}

function renderGrid(grid, highlightPositions) {
  var container = $id('reelGrid');
  container.textContent = '';
  var frameH = $id('reelFrame').clientHeight;
  var cellH = Math.floor(frameH / ROWS);
  for (var r = 0; r < REELS; r++) {
    var col = document.createElement('div');
    col.className = 'reel-col';
    col.dataset.reel = r;
    var strip = document.createElement('div');
    strip.className = 'reel-strip';
    for (var row = 0; row < ROWS; row++) {
      var symId = grid[r][row];
      var sym = SYMBOLS[symId];
      var cell = document.createElement('div');
      cell.className = 'symbol-cell';
      cell.style.height = cellH + 'px';
      cell.style.minHeight = cellH + 'px';
      cell.dataset.reel = r;
      cell.dataset.row = row;
      styleCell(cell, symId);
      if (highlightPositions) {
        for (var hi = 0; hi < highlightPositions.length; hi++) {
          if (highlightPositions[hi].reel === r && highlightPositions[hi].row === row) {
            cell.classList.add('win-highlight');
            break;
          }
        }
      }
      var iconEl = createIconEl(sym.icon, sym.tier);
      cell.appendChild(iconEl);
      strip.appendChild(cell);
    }
    col.appendChild(strip);
    container.appendChild(col);
  }
}

function createIconEl(slug, tier, size) {
  var el = document.createElement('div');
  el.className = 'sym-icon';
  if (size) {
    el.style.width = size + 'px';
    el.style.height = size + 'px';
  }
  var data = ICON_DATA[slug];
  if (data) {
    var maskUrl = 'url(\'data:image/svg+xml,' + data + '\')';
    el.style.webkitMaskImage = maskUrl;
    el.style.maskImage = maskUrl;
    el.style.webkitMaskSize = 'contain';
    el.style.maskSize = 'contain';
    el.style.webkitMaskRepeat = 'no-repeat';
    el.style.maskRepeat = 'no-repeat';
    el.style.webkitMaskPosition = 'center';
    el.style.maskPosition = 'center';
  } else {
    el.style.background = '#333';
    el.style.borderRadius = '4px';
  }
  return el;
}

function updateUI() {
  // CASH display with tick-up (1 credit = 1 cent)
  animateCashDisplay(Math.floor(state.credits));

  // BET = denomination × number of lines (in credits)
  var totalBet = state.betPerLine * NUM_LINES;
  $id('betCalcDisplay').textContent = formatNum(totalBet);
  $id('denomDisplay').innerHTML = state.betPerLine + '&cent;';

  $id('jpMini').textContent = formatNum(Math.floor(state.jackpots.mini));
  $id('jpMajor').textContent = formatNum(Math.floor(state.jackpots.major));
  $id('jpGrand').textContent = formatNum(Math.floor(state.jackpots.grand));

  var fsBar = $id('freeSpinsBar');
  if (state.freeSpins.active) {
    fsBar.classList.add('active');
    $id('freeSpinsCount').textContent = state.freeSpins.remaining;
    $id('freeSpinsMult').textContent = state.freeSpins.multiplier;
  } else {
    fsBar.classList.remove('active');
  }

  // Loyalty badge
  updateLoyaltyBadge();

  // Spin button state
  var spinBtn = $id('spinBtn');
  if (state.freeSpins.active && state.freeSpins.remaining > 0) {
    spinBtn.textContent = 'FREE SPIN (' + state.freeSpins.remaining + ')';
    spinBtn.className = 'btn-spin free-spin-btn';
    spinBtn.disabled = spinning;
  } else if (state.credits < totalBet) {
    spinBtn.textContent = 'SPIN';
    spinBtn.className = 'btn-spin';
    spinBtn.disabled = true;
  } else {
    spinBtn.textContent = 'SPIN';
    spinBtn.className = 'btn-spin';
    spinBtn.disabled = spinning;
  }
}

// ─── Cash display animation (credits → $X.XX) ─────────────────────────
function formatCash(credits) {
  return '$' + (credits / 100).toFixed(2);
}

function animateCashDisplay(target) {
  if (creditTickTimer) clearInterval(creditTickTimer);
  var el = $id('cashDisplay');

  // Decrement = instant snap
  if (target <= displayedCredits) {
    displayedCredits = target;
    el.textContent = formatCash(target);
    return;
  }

  // Increment = count up
  var diff = target - displayedCredits;
  var step = Math.max(1, Math.floor(diff / 25));
  creditTickTimer = setInterval(function() {
    displayedCredits += step;
    if (displayedCredits >= target) {
      displayedCredits = target;
      el.textContent = formatCash(target);
      clearInterval(creditTickTimer);
      creditTickTimer = null;
    } else {
      el.textContent = formatCash(displayedCredits);
    }
  }, 30);
}

function showWinAmount(amount) {
  var el = $id('winLedDisplay');
  el.textContent = formatNum(Math.floor(amount));
  el.classList.add('win-flash');
}

function clearWinAmount() {
  var el = $id('winLedDisplay');
  el.textContent = '';   // empty (not "0") when nothing won
  el.classList.remove('win-flash');
}

// ─── Loyalty system ──────────────────────────────────────────────────
function getLoyaltyTier() {
  var wagered = state.totalBet;
  var tier = LOYALTY_TIERS[0];
  for (var i = 0; i < LOYALTY_TIERS.length; i++) {
    if (wagered >= LOYALTY_TIERS[i].minWagered) tier = LOYALTY_TIERS[i];
  }
  return tier;
}

function updateLoyaltyBadge() {
  var tier = getLoyaltyTier();
  $id('tierDot').style.background = tier.color;
  $id('tierLabel').textContent = tier.label;
  $id('tierLabel').style.color = tier.color;
  $id('playerId').textContent = state.loyalty.playerId;
}

var cardInsertSkip = false;
async function showCardInsert() {
  var overlay = $id('cardOverlay');
  var card = $id('loyaltyCard');
  var tier = getLoyaltyTier();

  $id('cardIdText').textContent = state.loyalty.playerId;
  $id('cardTierText').textContent = tier.label.toUpperCase();
  $id('cardTierText').style.color = tier.color;

  // Reset state
  cardInsertSkip = false;
  card.classList.remove('phase-rise', 'phase-insert');
  overlay.classList.remove('hidden');

  async function pause(ms) {
    var t = 0;
    while (t < ms && !cardInsertSkip) { await sleep(50); t += 50; }
  }

  await pause(1000);

  // Phase 1: Card rises from below up to just below the reader slot
  card.classList.add('phase-rise');
  await pause(1000);

  // Phase 2: Card slides up into the reader slot and disappears
  card.classList.add('phase-insert');
  await pause(600);

  // Fade out overlay
  overlay.style.transition = 'opacity 0.4s';
  overlay.style.opacity = '0';
  await sleep(400);

  overlay.classList.add('hidden');
  overlay.style.opacity = '';
  overlay.style.transition = '';
  card.classList.remove('phase-rise', 'phase-insert');

  state.loyalty.cardInserted = true;
  saveState();
}

// ─── Bill inserter ───────────────────────────────────────────────────
async function insertBill() {
  if (billInserting) return;
  billInserting = true;

  var billAnim = $id('billAnim');
  // Reset
  billAnim.classList.remove('phase-slide', 'phase-eat');
  billAnim.style.opacity = '';
  billAnim.style.display = 'flex';
  await sleep(50);

  // Phase 1: bill slides up to the slot opening
  billAnim.classList.add('phase-slide');
  await sleep(700);

  // Phase 2: bill gets eaten into the machine (slides further up, fades)
  billAnim.classList.remove('phase-slide');
  billAnim.classList.add('phase-eat');
  await sleep(600);

  // Hide and reset
  billAnim.style.display = 'none';
  billAnim.classList.remove('phase-eat');
  billAnim.style.opacity = '';

  // Add credits
  state.credits += BILL_VALUE;
  state.totalInserted += BILL_VALUE;
  saveState();
  updateUI();

  billInserting = false;
}

function formatNum(n) {
  return n.toLocaleString('en-US');
}

// ─── Spin Animation ──────────────────────────────────────────────────
async function doSpin() {
  if (spinning) return;
  spinning = true;

  var isFree = state.freeSpins.active && state.freeSpins.remaining > 0;
  var totalBet = state.betPerLine * NUM_LINES;

  if (!isFree) {
    if (state.credits < totalBet) {
      spinning = false;
      showRefillPrompt();
      return;
    }
    state.credits -= totalBet;
    state.totalBet += totalBet;
    // Contribute to jackpots
    for (var key in JACKPOT_CONFIG) {
      state.jackpots[key] += totalBet * JACKPOT_CONFIG[key].contribution;
    }
  } else {
    state.freeSpins.remaining--;
  }

  state.totalSpins++;
  clearWinAmount();
  clearPaylineOverlay();
  hideCascadeDisplay();
  updateUI();
  saveState();

  // Generate new grid
  currentGrid = generateGrid();

  // Animate reels
  await animateReels(currentGrid);

  // Process results
  await processSpinResult(currentGrid, isFree);

  spinning = false;
  updateUI();
  saveState();

  // Check if free spins just ended
  if (state.freeSpins.active && state.freeSpins.remaining <= 0) {
    state.freeSpins.active = false;
    state.freeSpins.remaining = 0;
    state.freeSpins.multiplier = 1;
    updateUI();
    saveState();
  }

  // Check if player is broke
  if (!state.freeSpins.active && state.credits < BET_LEVELS[0] * NUM_LINES) {
    showRefillPrompt();
  }
}

// Check if reel r has a partial match building from left
function hasNearWin(targetGrid, reelIdx) {
  if (reelIdx < 3) return false;
  for (var li = 0; li < PAYLINES.length; li++) {
    var line = PAYLINES[li];
    var first = targetGrid[0][line[0]];
    if (first === 'scatter' || first === 'bonus') continue;
    var matchCount = 1;
    for (var ri = 1; ri < reelIdx; ri++) {
      var sym = targetGrid[ri][line[ri]];
      if (sym === first || (SYMBOLS[sym] && SYMBOLS[sym].isWild) || (SYMBOLS[first] && SYMBOLS[first].isWild)) {
        matchCount++;
      } else {
        break;
      }
    }
    if (matchCount >= reelIdx && matchCount >= 3) return true;
  }
  return false;
}

// Ease-out with overshoot for bounce-lock feel
function easeOutBack(t) {
  var s = 1.4; // overshoot amount
  var t1 = t - 1;
  return t1 * t1 * ((s + 1) * t1 + s) + 1;
}

function easeOutCubic(t) {
  var t1 = t - 1;
  return t1 * t1 * t1 + 1;
}

async function animateReels(targetGrid) {
  var container = $id('reelGrid');
  container.textContent = '';

  // Detect near-wins
  var anticipation = [];
  for (var ar = 0; ar < REELS; ar++) {
    anticipation.push(hasNearWin(targetGrid, ar));
  }

  // Measure: create one temp cell to get the real height
  var reelFrame = $id('reelFrame');
  var frameH = reelFrame.clientHeight;
  var cellH = Math.floor(frameH / ROWS); // each cell = 1/3 of frame height

  // Build reel columns
  var cols = [];
  for (var r = 0; r < REELS; r++) {
    var col = document.createElement('div');
    col.className = 'reel-col';
    var strip = document.createElement('div');
    strip.className = 'reel-strip';

    var extraCount = 30 + r * 8;
    if (anticipation[r]) extraCount += 15;

    for (var i = 0; i < extraCount; i++) {
      var symId = randomSymbolFromReel(r);
      strip.appendChild(makeSpinCell(symId, cellH));
    }
    // Target 3 at the end
    for (var row = 0; row < ROWS; row++) {
      strip.appendChild(makeSpinCell(targetGrid[r][row], cellH));
    }

    col.appendChild(strip);
    container.appendChild(col);

    // Stop time: reel 0 at 1.2s, each next +0.4s, anticipation +0.8s
    var stopTime = 1200 + r * 400;
    if (anticipation[r]) stopTime += 800;

    cols.push({
      col: col,
      strip: strip,
      extraCount: extraCount,
      targetOffset: extraCount * cellH, // pixels to scroll
      stopTime: stopTime,
      anticipation: anticipation[r],
      stopped: false,
    });
  }

  // JS-driven reel animation using requestAnimationFrame
  var startTime = performance.now();
  // Total animation = longest reel stopTime + 300ms for bounce settle
  var totalDuration = cols[REELS - 1].stopTime + 300;

  // Speed: pixels per ms during full-speed phase
  var spinSpeed = 3.0; // fast scroll

  return new Promise(function(resolve) {
    function frame(now) {
      var elapsed = now - startTime;

      for (var r = 0; r < REELS; r++) {
        var c = cols[r];
        if (c.stopped) continue;

        if (elapsed < c.stopTime) {
          // Still spinning: continuous scroll using modular wrapping
          // Slow down in the last 30% of this reel's time
          var reelProgress = elapsed / c.stopTime;
          var speed;
          if (reelProgress < 0.7) {
            speed = spinSpeed;
          } else {
            // Decelerate
            var decelT = (reelProgress - 0.7) / 0.3;
            speed = spinSpeed * (1 - decelT * 0.85);
          }
          var scrollPx = (elapsed * speed) % (c.extraCount * cellH);
          c.strip.style.transform = 'translateY(' + (-scrollPx) + 'px)';

          // Add anticipation glow in last 40% for near-win reels
          if (c.anticipation && reelProgress > 0.6) {
            c.col.classList.add('anticipation');
          }
        } else {
          // This reel stops now — animate to final position with bounce
          var bounceElapsed = elapsed - c.stopTime;
          var bounceDuration = 300; // ms for bounce settle
          var t = Math.min(bounceElapsed / bounceDuration, 1);
          var eased = easeOutBack(t);

          // Final position: scroll to show target symbols
          var finalOffset = c.targetOffset;
          c.strip.style.transform = 'translateY(' + (-finalOffset * eased) + 'px)';

          c.col.classList.remove('anticipation');

          if (t >= 1) {
            c.stopped = true;
            c.strip.style.transform = 'translateY(' + (-finalOffset) + 'px)';
          }
        }
      }

      if (elapsed < totalDuration) {
        requestAnimationFrame(frame);
      } else {
        // All done — snap to clean static grid
        renderGrid(targetGrid);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

function makeSpinCell(symId, cellH) {
  var sym = SYMBOLS[symId];
  var cell = document.createElement('div');
  cell.className = 'symbol-cell';
  cell.style.height = cellH + 'px';
  cell.style.minHeight = cellH + 'px';
  styleCell(cell, symId);
  cell.appendChild(createIconEl(sym.icon, sym.tier));
  return cell;
}

async function processSpinResult(grid, isFree) {
  var totalWin = 0;
  var cascadeCount = 0;
  var workingGrid = grid.map(function(col) { return col.slice(); });

  // Cascade loop
  while (true) {
    var wins = evaluatePaylines(workingGrid);

    // Check scatters (only on first cascade)
    if (cascadeCount === 0) {
      var scatterResult = countSymbol(workingGrid, 'scatter');
      if (scatterResult.count >= 3) {
        await triggerFreeSpins(scatterResult, isFree);
      }

      var bonusResult = checkBonusTrigger(workingGrid);
      if (bonusResult.triggered) {
        state.stats.bonusesTriggered++;
        await triggerWheelOfFortune();
      }

      var treasureResult = checkTreasureHunt(workingGrid);
      if (treasureResult.triggered) {
        state.stats.bonusesTriggered++;
        await triggerTreasureHunt();
      }
    }

    if (wins.length === 0) break;

    var cascadeMult = CASCADE_MULTIPLIERS[Math.min(cascadeCount, CASCADE_MULTIPLIERS.length - 1)];
    var freeSpinMult = isFree || state.freeSpins.active ? FREE_SPINS_CONFIG.baseMultiplier : 1;

    if (cascadeCount > 0) {
      showCascadeDisplay(cascadeMult);
      showNotification('CASCADE \u00d7' + cascadeMult, 'cascade-notify');
      await sleep(600);
    }

    // Collect all winning positions
    var winPosSet = {};
    var cascadeWin = 0;
    for (var wi = 0; wi < wins.length; wi++) {
      var win = wins[wi];
      cascadeWin += win.payout * state.betPerLine * cascadeMult * freeSpinMult;
      for (var pi = 0; pi < win.count; pi++) {
        var pos = win.positions[pi];
        winPosSet[pos.reel + ',' + pos.row] = true;
      }
    }
    totalWin += cascadeWin;

    var hlPositions = [];
    for (var key in winPosSet) {
      var parts = key.split(',');
      hlPositions.push({ reel: parseInt(parts[0]), row: parseInt(parts[1]) });
    }
    renderGrid(workingGrid, hlPositions);
    drawPaylines(wins);
    await sleep(800);

    await shatterSymbols(hlPositions);
    workingGrid = await cascadeDrop(workingGrid, hlPositions);
    cascadeCount++;
  }

  if (cascadeCount > state.stats.cascadeRecord) {
    state.stats.cascadeRecord = cascadeCount;
  }

  if (totalWin > 0) {
    state.credits += totalWin;
    state.totalWon += totalWin;
    if (totalWin > state.stats.biggestWin) state.stats.biggestWin = totalWin;
    showWinAmount(totalWin);
  }

  if (!isFree) {
    await checkRandomJackpot();
  }

  currentGrid = workingGrid;
  hideCascadeDisplay();
}

// ─── Cascade animations ─────────────────────────────────────────────
async function shatterSymbols(positions) {
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var cell = document.querySelector('.symbol-cell[data-reel="' + pos.reel + '"][data-row="' + pos.row + '"]');
    if (cell) cell.classList.add('shattering');
  }
  await sleep(400);
}

async function cascadeDrop(grid, removedPositions) {
  // Math: build the new grid (delegated to engine.js so simulate.js matches)
  var newGrid = Engine.cascadeDrop(grid, removedPositions);

  // For animation we still need a per-reel removed-row count
  var removedByReel = {};
  for (var i = 0; i < removedPositions.length; i++) {
    var pos = removedPositions[i];
    if (!removedByReel[pos.reel]) removedByReel[pos.reel] = {};
    removedByReel[pos.reel][pos.row] = true;
  }

  renderGrid(newGrid);
  for (var r2 = 0; r2 < REELS; r2++) {
    var removed2 = removedByReel[r2];
    if (!removed2) continue;
    var neededCount = Object.keys(removed2).length;
    for (var row2 = 0; row2 < neededCount; row2++) {
      var cell = document.querySelector('.symbol-cell[data-reel="' + r2 + '"][data-row="' + row2 + '"]');
      if (cell) cell.classList.add('dropping');
    }
  }
  await sleep(350);

  return newGrid;
}

function showCascadeDisplay(mult) {
  var el = $id('cascadeDisplay');
  el.textContent = '\u00d7' + mult;
  el.classList.add('active');
}

function hideCascadeDisplay() {
  $id('cascadeDisplay').classList.remove('active');
}

// ─── Payline overlay ─────────────────────────────────────────────────
function drawPaylines(wins) {
  var overlay = $id('paylineOverlay');
  var frame = $id('reelFrame');
  var frameW = frame.offsetWidth;
  var frameH = frame.offsetHeight;
  var cellW = frameW / REELS;
  var cellH = frameH / ROWS;

  // Build SVG using DOM methods
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + frameW + ' ' + frameH);

  for (var wi = 0; wi < wins.length; wi++) {
    var win = wins[wi];
    var color = PAYLINE_COLORS[win.lineIndex % PAYLINE_COLORS.length];
    var line = PAYLINES[win.lineIndex];
    var points = '';
    for (var ri = 0; ri < line.length; ri++) {
      var x = cellW * ri + cellW / 2;
      var y = cellH * line[ri] + cellH / 2;
      if (ri > 0) points += ' ';
      points += x + ',' + y;
    }
    var polyline = document.createElementNS(svgNS, 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', color);
    polyline.setAttribute('stroke-width', '3');
    polyline.setAttribute('stroke-opacity', '0.7');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);
  }

  overlay.textContent = '';
  overlay.appendChild(svg);

  // Light up the corresponding stripes in the line indicator
  highlightLineStripes(wins);
}

function clearPaylineOverlay() {
  $id('paylineOverlay').textContent = '';
  clearLineStripes();
}

// ─── Free Spins ──────────────────────────────────────────────────────
async function triggerFreeSpins(scatterResult, isDuringFreeSpins) {
  var count = scatterResult.count;
  var spinsAwarded = FREE_SPINS_CONFIG.scatterCounts[count] || 8;

  if (isDuringFreeSpins || state.freeSpins.active) {
    var newRemaining = Math.min(
      state.freeSpins.remaining + FREE_SPINS_CONFIG.retriggerAward,
      FREE_SPINS_CONFIG.maxSpins
    );
    state.freeSpins.remaining = newRemaining;
    showNotification('+' + FREE_SPINS_CONFIG.retriggerAward + ' FREE SPINS!', 'free-spins-notify');
  } else {
    state.freeSpins.active = true;
    state.freeSpins.remaining = spinsAwarded;
    state.freeSpins.multiplier = FREE_SPINS_CONFIG.baseMultiplier;
    showNotification(spinsAwarded + ' FREE SPINS!', 'free-spins-notify');
  }
  await sleep(2000);
  updateUI();
}

// ─── Treasure Hunt ───────────────────────────────────────────────────
async function triggerTreasureHunt() {
  return new Promise(function(resolve) {
    showNotification('TREASURE HUNT!', 'bonus-notify');
    setTimeout(function() {
      openTreasureHunt(resolve);
    }, 2000);
  });
}

function openTreasureHunt(onComplete) {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');

  var totalBet = state.betPerLine * NUM_LINES;
  var totalPrize = 0;
  var multiplier = 1;
  var finished = false;

  // Track which chests are opened individually
  var opened = [];
  for (var oi = 0; oi < TREASURE_HUNT_CONFIG.numChests; oi++) opened.push(false);

  // Generate chest contents
  var chestContents = [];
  var prizePool = TREASURE_HUNT_CONFIG.prizes;
  for (var i = 0; i < TREASURE_HUNT_CONFIG.numChests; i++) {
    chestContents.push(rollWeighted(prizePool));
  }
  // Ensure at least one skull
  var hasSkull = false;
  for (var si = 0; si < chestContents.length; si++) {
    if (chestContents[si].type === 'skull') { hasSkull = true; break; }
  }
  if (!hasSkull) {
    var skullPrize = null;
    for (var pi = 0; pi < prizePool.length; pi++) {
      if (prizePool[pi].type === 'skull') { skullPrize = prizePool[pi]; break; }
    }
    chestContents[Math.floor(Math.random() * chestContents.length)] = skullPrize;
  }
  shuffleArray(chestContents);

  // Chest icon using our open-treasure-chest SVG
  var chestIconData = ICON_DATA['open-treasure-chest'];
  var chestMaskCSS = chestIconData
    ? '-webkit-mask-image:url(\'data:image/svg+xml,' + chestIconData + '\');mask-image:url(\'data:image/svg+xml,' + chestIconData + '\');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;'
    : '';

  function renderTH() {
    contentEl.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'treasure-hunt';

    var h2 = document.createElement('h2');
    h2.textContent = 'TREASURE HUNT';
    wrap.appendChild(h2);

    var multDiv = document.createElement('div');
    multDiv.className = 'treasure-multiplier';
    multDiv.textContent = 'Multiplier: \u00d7' + multiplier;
    wrap.appendChild(multDiv);

    var totalDiv = document.createElement('div');
    totalDiv.className = 'treasure-total';
    totalDiv.textContent = 'Total: ' + formatNum(Math.floor(totalPrize * multiplier)) + ' credits';
    wrap.appendChild(totalDiv);

    var grid = document.createElement('div');
    grid.className = 'treasure-grid';
    for (var ci = 0; ci < TREASURE_HUNT_CONFIG.numChests; ci++) {
      var chest = document.createElement('div');
      chest.className = 'treasure-chest' + (opened[ci] ? ' opened' : '');
      chest.dataset.idx = ci;
      if (opened[ci]) {
        var c = chestContents[ci];
        var reveal = document.createElement('div');
        reveal.className = 'chest-reveal ' + (c.type === 'skull' ? 'skull-reveal' : 'prize');
        reveal.textContent = getChestText(c);
        chest.appendChild(reveal);
      } else {
        // Use treasure chest SVG icon instead of emoji
        var chestIcon = document.createElement('div');
        chestIcon.style.cssText = 'width:40px;height:40px;background:linear-gradient(135deg,#e8b44a,#ba8a2a);' + chestMaskCSS;
        chest.appendChild(chestIcon);
      }
      grid.appendChild(chest);
    }
    wrap.appendChild(grid);

    if (finished) {
      var finalPrize = Math.floor(totalPrize * multiplier);
      var finalDiv = document.createElement('div');
      finalDiv.className = 'treasure-total';
      finalDiv.style.fontSize = '22px';
      finalDiv.textContent = 'TOTAL WIN: ' + formatNum(finalPrize) + ' credits';
      wrap.appendChild(finalDiv);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.textContent = 'COLLECT';
      closeBtn.addEventListener('click', function() {
        state.credits += finalPrize;
        state.totalWon += finalPrize;
        if (finalPrize > state.stats.biggestWin) state.stats.biggestWin = finalPrize;
        modal.classList.add('hidden');
        updateUI();
        saveState();
        onComplete();
      });
      wrap.appendChild(closeBtn);
    } else {
      var unopened = wrap.querySelectorAll('.treasure-chest:not(.opened)');
      for (var ui = 0; ui < unopened.length; ui++) {
        (function(el) {
          el.addEventListener('click', function() {
            pickChest(parseInt(el.dataset.idx));
          });
        })(unopened[ui]);
      }
    }

    contentEl.appendChild(wrap);
  }

  function getChestText(c) {
    switch (c.type) {
      case 'coins': return '\uD83D\uDCB0 ' + c.min + '-' + c.max + '\u00d7';
      case 'multiplier': return '\u2728 \u00d7' + c.value;
      case 'extraPick': return '\uD83C\uDF81 +1 Pick';
      case 'jackpotMini': return '\uD83C\uDFC6 MINI JP';
      case 'jackpotMajor': return '\uD83C\uDFC6 MAJOR JP';
      case 'skull': return '\uD83D\uDC80 END';
      default: return '';
    }
  }

  function pickChest(idx) {
    if (finished || opened[idx]) return;
    opened[idx] = true;
    var prize = chestContents[idx];

    switch (prize.type) {
      case 'coins':
        var amount = (prize.min + Math.floor(Math.random() * (prize.max - prize.min + 1))) * totalBet;
        totalPrize += amount;
        break;
      case 'multiplier':
        multiplier *= prize.value;
        break;
      case 'extraPick':
        break;
      case 'jackpotMini':
        totalPrize += state.jackpots.mini;
        state.jackpots.mini = JACKPOT_CONFIG.mini.start;
        state.stats.jackpotsWon.mini++;
        break;
      case 'jackpotMajor':
        totalPrize += state.jackpots.major;
        state.jackpots.major = JACKPOT_CONFIG.major.start;
        state.stats.jackpotsWon.major++;
        break;
      case 'skull':
        finished = true;
        break;
    }

    var openCount = 0;
    for (var oc = 0; oc < opened.length; oc++) { if (opened[oc]) openCount++; }
    if (openCount >= TREASURE_HUNT_CONFIG.numChests) finished = true;
    renderTH();
  }

  renderTH();
}

// ─── Wheel of Fortune ────────────────────────────────────────────────
async function triggerWheelOfFortune() {
  return new Promise(function(resolve) {
    showNotification('WHEEL OF FORTUNE!', 'bonus-notify');
    setTimeout(function() {
      openWheel(resolve);
    }, 2000);
  });
}

function openWheel(onComplete) {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');

  contentEl.textContent = '';
  var wrap = document.createElement('div');
  wrap.className = 'wheel-container';

  var h2 = document.createElement('h2');
  h2.textContent = 'WHEEL OF FORTUNE';
  wrap.appendChild(h2);

  var wheelWrap = document.createElement('div');
  wheelWrap.className = 'wheel-wrap';

  var pointer = document.createElement('div');
  pointer.className = 'wheel-pointer';
  wheelWrap.appendChild(pointer);

  var canvas = document.createElement('canvas');
  canvas.className = 'wheel-canvas';
  canvas.id = 'wheelCanvas';
  canvas.width = 280;
  canvas.height = 280;
  wheelWrap.appendChild(canvas);

  var center = document.createElement('div');
  center.className = 'wheel-center';
  wheelWrap.appendChild(center);

  wrap.appendChild(wheelWrap);

  var resultDiv = document.createElement('div');
  resultDiv.className = 'wheel-result';
  resultDiv.id = 'wheelResult';
  wrap.appendChild(resultDiv);

  var spinBtn = document.createElement('button');
  spinBtn.className = 'btn-wheel-spin';
  spinBtn.id = 'wheelSpinBtn';
  spinBtn.textContent = 'SPIN THE WHEEL';
  wrap.appendChild(spinBtn);

  contentEl.appendChild(wrap);

  var ctx = canvas.getContext('2d');
  var segments = WHEEL_SEGMENTS;
  var segAngle = (Math.PI * 2) / segments.length;
  var currentAngle = 0;

  // Wood grain pattern: dark radial streaks + concentric rings
  function drawWoodGrain(cx, cy, r, segStart, segEnd, baseColor) {
    // Dark streaks radiating outward
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, segStart, segEnd);
    ctx.closePath();
    ctx.clip();

    // Concentric ring shading
    for (var ring = 1; ring <= 4; ring++) {
      var ringR = r * (ring / 5);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Radial grain streaks
    var streakCount = 6;
    for (var s = 0; s < streakCount; s++) {
      var t = s / streakCount;
      var streakAngle = segStart + (segEnd - segStart) * t + (Math.sin(s * 7.13) * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(streakAngle) * 10, cy + Math.sin(streakAngle) * 10);
      ctx.lineTo(cx + Math.cos(streakAngle) * r, cy + Math.sin(streakAngle) * r);
      ctx.strokeStyle = 'rgba(0,0,0,' + (0.06 + Math.abs(Math.sin(s * 3.7)) * 0.05) + ')';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Subtle highlight near outer edge for sheen
    var grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.restore();
  }

  function drawWheel(angle) {
    ctx.clearRect(0, 0, 280, 280);
    var cx = 140, cy = 140, r = 130;

    // Outer brass rim
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    var rimGrad = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 4);
    rimGrad.addColorStop(0, '#8b6914');
    rimGrad.addColorStop(1, '#daa520');
    ctx.fillStyle = rimGrad;
    ctx.fill();

    for (var i = 0; i < segments.length; i++) {
      var startAngle = angle + i * segAngle;
      var endAngle = startAngle + segAngle;

      // Base wood color (defines segment path)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = segments[i].color;
      ctx.fill();

      // Wood grain texture overlay
      drawWoodGrain(cx, cy, r, startAngle, endAngle, segments[i].color);

      // Brass divider lines — re-define segment path
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.strokeStyle = '#daa520';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.textAlign = 'right';
      var darkBgs = ['#8b5a2b', '#5c3a1a', '#a0521a'];
      var isDark = darkBgs.indexOf(segments[i].color) >= 0;
      ctx.fillStyle = isDark ? '#ffe5b4' : '#1a0d05';
      ctx.font = 'bold 10px Courier New';
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)';
      ctx.shadowBlur = 2;
      ctx.fillText(segments[i].label, r - 10, 4);
      ctx.restore();
    }
  }

  drawWheel(0);

  spinBtn.addEventListener('click', function doWheelSpin() {
    spinBtn.disabled = true;
    var resultIdx = Math.floor(Math.random() * segments.length);

    // Single dramatic clockwise spin, ~8 seconds, smooth deceleration
    var totalRotations = 7 + Math.random() * 2; // 7-9 full rotations (smoother feel)
    var targetAngle = -(resultIdx * segAngle + segAngle / 2) - Math.PI / 2;
    var totalRotation = totalRotations * Math.PI * 2 + targetAngle - currentAngle;
    while (totalRotation < Math.PI * 2 * 6) totalRotation += Math.PI * 2;

    var duration = 8000;
    var startTime = performance.now();
    var startAngle = currentAngle;

    // Smooth ease-out: quick wind-up, gradual deceleration, no abrupt crawl
    // Custom curve: easeOutQuart feels smoother than Quint while still dramatic
    function easeOutQuart(t) {
      var t1 = t - 1;
      return 1 - t1 * t1 * t1 * t1;
    }

    function animate(now) {
      var elapsed = now - startTime;
      var t = Math.min(elapsed / duration, 1);
      var eased = easeOutQuart(t);
      currentAngle = startAngle + totalRotation * eased;
      drawWheel(currentAngle);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        resolveWheelResult(segments[resultIdx], onComplete);
      }
    }
    requestAnimationFrame(animate);
  });
}

async function resolveWheelResult(segment, onComplete) {
  var resultEl = $id('wheelResult');
  var totalBet = state.betPerLine * NUM_LINES;

  switch (segment.type) {
    case 'coins':
      var amount = segment.value * totalBet;
      state.credits += amount;
      state.totalWon += amount;
      if (amount > state.stats.biggestWin) state.stats.biggestWin = amount;
      resultEl.textContent = 'WIN: ' + formatNum(Math.floor(amount)) + ' credits!';
      break;
    case 'freespins':
      if (state.freeSpins.active) {
        state.freeSpins.remaining = Math.min(
          state.freeSpins.remaining + segment.value,
          FREE_SPINS_CONFIG.maxSpins
        );
      } else {
        state.freeSpins.active = true;
        state.freeSpins.remaining = segment.value;
        state.freeSpins.multiplier = FREE_SPINS_CONFIG.baseMultiplier;
      }
      resultEl.textContent = segment.value + ' FREE SPINS!';
      break;
    case 'respin':
      resultEl.textContent = 'SPIN AGAIN!';
      await sleep(1500);
      $id('wheelSpinBtn').disabled = false;
      return;
    case 'jackpot':
      resultEl.textContent = 'JACKPOT CHANCE!';
      await sleep(1500);
      await resolveJackpotWheel(onComplete);
      return;
  }

  updateUI();
  saveState();

  await sleep(1500);
  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = 'CONTINUE';
  closeBtn.addEventListener('click', function() {
    $id('modal').classList.add('hidden');
    onComplete();
  });
  $id('modalContent').appendChild(closeBtn);
}

async function resolveJackpotWheel(onComplete) {
  var roll = Math.random();
  var tier;
  if (roll < 0.6) tier = 'mini';
  else if (roll < 0.9) tier = 'major';
  else tier = 'grand';

  await showJackpotWin(tier);
  $id('modal').classList.add('hidden');
  onComplete();
}

// ─── Jackpot ─────────────────────────────────────────────────────────
async function checkRandomJackpot() {
  for (var tier in JACKPOT_CONFIG) {
    if (Math.random() < JACKPOT_CONFIG[tier].triggerChance) {
      await showJackpotWin(tier);
      return;
    }
  }
}

async function showJackpotWin(tier) {
  var cfg = JACKPOT_CONFIG[tier];
  var amount = Math.floor(state.jackpots[tier]);
  state.credits += amount;
  state.totalWon += amount;
  state.jackpots[tier] = cfg.start;
  state.stats.jackpotsWon[tier]++;
  if (amount > state.stats.biggestWin) state.stats.biggestWin = amount;
  saveState();

  return new Promise(function(resolve) {
    var modal = $id('modal');
    var contentEl = $id('modalContent');
    modal.classList.remove('hidden');

    contentEl.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'jackpot-win';

    var h2 = document.createElement('h2');
    h2.style.color = cfg.color;
    h2.textContent = cfg.label.toUpperCase() + ' JACKPOT!';
    wrap.appendChild(h2);

    var amountDiv = document.createElement('div');
    amountDiv.className = 'jp-amount';
    amountDiv.style.color = cfg.color;
    amountDiv.textContent = formatNum(amount);
    wrap.appendChild(amountDiv);

    var desc = document.createElement('p');
    desc.style.marginTop = '12px';
    desc.style.color = 'var(--text-muted)';
    desc.textContent = 'credits added to your balance';
    wrap.appendChild(desc);

    contentEl.appendChild(wrap);

    spawnCoinRain();

    setTimeout(function() {
      var closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.textContent = 'AMAZING!';
      closeBtn.addEventListener('click', function() {
        modal.classList.add('hidden');
        updateUI();
        resolve();
      });
      contentEl.appendChild(closeBtn);
    }, 2000);
  });
}

function spawnCoinRain() {
  var container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:300';
  document.body.appendChild(container);

  for (var i = 0; i < 40; i++) {
    var coin = document.createElement('div');
    coin.className = 'coin-particle';
    coin.style.left = (Math.random() * 100) + '%';
    coin.style.animationDuration = (1 + Math.random() * 2) + 's';
    coin.style.animationDelay = (Math.random() * 1) + 's';
    container.appendChild(coin);
  }

  setTimeout(function() { container.remove(); }, 4000);
}

// ─── Notifications ───────────────────────────────────────────────────
function showNotification(text, className) {
  var el = document.createElement('div');
  el.className = 'notification ' + className;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2200);
}

// ─── Refill ──────────────────────────────────────────────────────────
function showRefillPrompt() {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');
  contentEl.textContent = '';

  var wrap = document.createElement('div');
  wrap.className = 'refill-prompt';

  var h3 = document.createElement('h3');
  h3.textContent = 'Insufficient Credits';
  wrap.appendChild(h3);

  var p = document.createElement('p');
  p.textContent = 'Insert a $100 bill below to add ' + formatNum(BILL_VALUE) + ' credits.';
  wrap.appendChild(p);

  var insertBtn = document.createElement('button');
  insertBtn.className = 'btn-refill';
  insertBtn.textContent = 'INSERT $100';
  insertBtn.addEventListener('click', function() {
    modal.classList.add('hidden');
    insertBill();
  });
  wrap.appendChild(insertBtn);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', function() {
    modal.classList.add('hidden');
  });
  wrap.appendChild(closeBtn);

  contentEl.appendChild(wrap);
}

// ─── Modals: Paytable / Stats / Settings ─────────────────────────────
function openPaytable() {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');
  contentEl.textContent = '';

  var h2 = document.createElement('h2');
  h2.textContent = 'PAYTABLE';
  contentEl.appendChild(h2);

  var order = ['captain','skull','chest','swords','hat','ship','parrot','cannon','rum','anchor','compass','wild','scatter','bonus'];
  for (var oi = 0; oi < order.length; oi++) {
    var id = order[oi];
    var sym = SYMBOLS[id];
    var row = document.createElement('div');
    row.className = 'paytable-row';

    var iconWrap = document.createElement('div');
    iconWrap.className = 'paytable-icon';
    iconWrap.style.background = SYMBOL_COLORS[id] || '#333';
    iconWrap.style.display = 'flex';
    iconWrap.style.alignItems = 'center';
    iconWrap.style.justifyContent = 'center';
    iconWrap.style.borderRadius = '4px';
    iconWrap.style.border = '1px solid #d4a44a';
    iconWrap.appendChild(createIconEl(sym.icon, sym.tier, 24));
    row.appendChild(iconWrap);

    var nameDiv = document.createElement('div');
    nameDiv.className = 'paytable-name';
    nameDiv.textContent = sym.name;
    row.appendChild(nameDiv);

    var paysDiv = document.createElement('div');
    paysDiv.className = 'paytable-pays';
    if (sym.isWild) {
      var s = document.createElement('span');
      s.textContent = 'WILD - Substitutes for all';
      paysDiv.appendChild(s);
    } else if (id === 'scatter') {
      var s2 = document.createElement('span');
      s2.textContent = '3\u21928 / 4\u219212 / 5\u219215 Free Spins';
      paysDiv.appendChild(s2);
    } else if (id === 'bonus') {
      var s3 = document.createElement('span');
      s3.textContent = '3 on reels 1,3,5 \u2192 Wheel';
      paysDiv.appendChild(s3);
    } else {
      for (var pi = 2; pi < 5; pi++) {
        var s4 = document.createElement('span');
        s4.textContent = (pi + 1) + '\u00d7: ' + sym.pay[pi] + '\u00d7';
        paysDiv.appendChild(s4);
      }
    }
    row.appendChild(paysDiv);
    contentEl.appendChild(row);
  }

  var h2b = document.createElement('h2');
  h2b.style.marginTop = '16px';
  h2b.textContent = 'FEATURES';
  contentEl.appendChild(h2b);

  var features = [
    ['Cascading Wins:', 'Winning symbols explode, new ones drop. Multiplier: \u00d71\u2192\u00d72\u2192\u00d73\u2192\u00d75\u2192\u00d78', 'var(--gold)'],
    ['Free Spins:', '3+ Scatter = 8-15 free spins with \u00d72 multiplier. Can retrigger.', '#c084fc'],
    ['Treasure Hunt:', 'Captain on reels 1 & 5 \u2192 pick chests for prizes!', 'var(--red)'],
    ['Wheel of Fortune:', '3 Ship Wheels on reels 1, 3, 5 \u2192 spin the wheel!', 'var(--red)'],
    ['Jackpots:', 'Mini, Major, Grand \u2014 triggered randomly or via bonuses.', 'var(--gold)'],
  ];
  var featWrap = document.createElement('div');
  featWrap.style.cssText = 'font-size:11px;color:var(--text-muted);line-height:1.6';
  for (var fi = 0; fi < features.length; fi++) {
    var fp = document.createElement('p');
    var fb = document.createElement('b');
    fb.style.color = features[fi][2];
    fb.textContent = features[fi][0] + ' ';
    fp.appendChild(fb);
    fp.appendChild(document.createTextNode(features[fi][1]));
    featWrap.appendChild(fp);
  }
  contentEl.appendChild(featWrap);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', function() { modal.classList.add('hidden'); });
  contentEl.appendChild(closeBtn);
}

function openStats() {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');
  contentEl.textContent = '';

  var h2 = document.createElement('h2');
  h2.textContent = 'STATISTICS';
  contentEl.appendChild(h2);

  var tier = getLoyaltyTier();
  var statsData = [
    ['Player', state.loyalty.playerId],
    ['Loyalty Tier', tier.label],
    ['Total Inserted', '$' + formatNum(Math.floor(state.totalInserted / 100))],
    ['Total Spins', formatNum(state.totalSpins)],
    ['Total Wagered', formatNum(Math.floor(state.totalBet)) + ' cr'],
    ['Total Won', formatNum(Math.floor(state.totalWon)) + ' cr'],
    ['Net', formatNum(Math.floor(state.totalWon - state.totalBet)) + ' cr'],
    ['Biggest Win', formatNum(Math.floor(state.stats.biggestWin)) + ' cr'],
    ['Longest Cascade', state.stats.cascadeRecord + ' chains'],
    ['Bonuses Triggered', formatNum(state.stats.bonusesTriggered)],
    ['Mini Jackpots Won', formatNum(state.stats.jackpotsWon.mini)],
    ['Major Jackpots Won', formatNum(state.stats.jackpotsWon.major)],
    ['Grand Jackpots Won', formatNum(state.stats.jackpotsWon.grand)],
  ];

  for (var si = 0; si < statsData.length; si++) {
    var row = document.createElement('div');
    row.className = 'stat-row';
    var label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = statsData[si][0];
    var value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = statsData[si][1];
    row.appendChild(label);
    row.appendChild(value);
    contentEl.appendChild(row);
  }

  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', function() { modal.classList.add('hidden'); });
  contentEl.appendChild(closeBtn);
}

function openSettings() {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');
  contentEl.textContent = '';

  var h2 = document.createElement('h2');
  h2.textContent = 'SETTINGS';
  contentEl.appendChild(h2);

  var section1 = document.createElement('div');
  section1.className = 'settings-section';
  var sh3 = document.createElement('h3');
  sh3.textContent = 'Reset Game';
  section1.appendChild(sh3);
  var sp = document.createElement('p');
  sp.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px';
  sp.textContent = 'This will erase all progress and start fresh.';
  section1.appendChild(sp);
  var resetBtn = document.createElement('button');
  resetBtn.className = 'btn-reset';
  resetBtn.textContent = 'Reset All Data';
  resetBtn.addEventListener('click', function() {
    if (confirm('Are you sure? All progress will be lost!')) {
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      currentGrid = generateGrid();
      renderGrid(currentGrid);
      updateUI();
      modal.classList.add('hidden');
    }
  });
  section1.appendChild(resetBtn);
  contentEl.appendChild(section1);

  var section2 = document.createElement('div');
  section2.className = 'settings-section';
  section2.style.marginTop = '16px';
  var sh3b = document.createElement('h3');
  sh3b.textContent = 'Credits';
  section2.appendChild(sh3b);
  var cp = document.createElement('p');
  cp.style.cssText = 'font-size:11px;color:var(--text-muted)';
  cp.textContent = 'Icons by Lorc, Delapouite, Skoll from game-icons.net (CC BY 3.0)';
  section2.appendChild(cp);
  contentEl.appendChild(section2);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', function() { modal.classList.add('hidden'); });
  contentEl.appendChild(closeBtn);
}

// ─── Utilities ───────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function rollWeighted(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) total += items[i].weight;
  var roll = Math.random() * total;
  for (var j = 0; j < items.length; j++) {
    roll -= items[j].weight;
    if (roll <= 0) return items[j];
  }
  return items[items.length - 1];
}

function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ─── Debug helpers ───────────────────────────────────────────────────
function wireDebug(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', function() {
    try { fn(); } catch (e) { console.error('Debug ' + id + ':', e); }
  });
}

// ─── Line indicator (vertical bar beside reels) ──────────────────────
// Stripes are grouped into 3 sections (top/middle/bottom) — each section
// occupies 1/3 of the indicator height, matching one row of the leftmost
// reel. A payline lands in the section corresponding to its starting row
// (PAYLINES[i][0] ∈ {0,1,2}).
function initLineIndicator() {
  var list = $id('lineStripeList');
  if (!list) return;
  list.textContent = '';
  var sections = [];
  for (var s = 0; s < ROWS; s++) {
    var section = document.createElement('div');
    section.className = 'line-section';
    list.appendChild(section);
    sections.push(section);
  }
  for (var i = 0; i < NUM_LINES; i++) {
    var rowIdx = PAYLINES[i][0];
    var stripe = document.createElement('div');
    stripe.className = 'line-stripe';
    stripe.dataset.lineIdx = i;
    var color = PAYLINE_COLORS[i % PAYLINE_COLORS.length];
    stripe.style.backgroundColor = color;
    stripe.style.color = color; // currentColor for glow box-shadow
    sections[rowIdx].appendChild(stripe);
  }
  var lc = $id('lineCount');
  if (lc) lc.textContent = NUM_LINES;
}

function highlightLineStripes(wins) {
  clearLineStripes();
  if (!wins || !wins.length) return;
  var seen = {};
  for (var i = 0; i < wins.length; i++) {
    var idx = wins[i].lineIndex;
    if (seen[idx]) continue;
    seen[idx] = true;
    var stripe = document.querySelector('.line-stripe[data-line-idx="' + idx + '"]');
    if (stripe) stripe.classList.add('active');
  }
}

function clearLineStripes() {
  var stripes = document.querySelectorAll('.line-stripe.active');
  for (var i = 0; i < stripes.length; i++) stripes[i].classList.remove('active');
}

// ─── Init ────────────────────────────────────────────────────────────
function init() {
  loadState();

  // Sync displayed credits to actual
  displayedCredits = Math.floor(state.credits);

  initLineIndicator();
  currentGrid = generateGrid();
  renderGrid(currentGrid);
  updateUI();

  // Spin button
  $id('spinBtn').addEventListener('click', doSpin);

  // Denomination toggle: click cycles through BET_LEVELS (1, 2, 3, 5, 10, 25 cents)
  $id('denomBox').addEventListener('click', function() {
    if (spinning) return;
    betLevelIdx = (betLevelIdx + 1) % BET_LEVELS.length;
    state.betPerLine = BET_LEVELS[betLevelIdx];
    updateUI();
    saveState();
  });

  // Bill inserter
  $id('billSlot').addEventListener('click', function() {
    insertBill();
  });

  // Footer tabs
  var footerTabs = document.querySelectorAll('.footer-tab');
  for (var ti = 0; ti < footerTabs.length; ti++) {
    (function(tab) {
      tab.addEventListener('click', function() {
        for (var j = 0; j < footerTabs.length; j++) footerTabs[j].classList.remove('active');
        tab.classList.add('active');
        var tabName = tab.dataset.tab;
        if (tabName === 'paytable') openPaytable();
        else if (tabName === 'stats') openStats();
        else if (tabName === 'settings') openSettings();
      });
    })(footerTabs[ti]);
  }

  // Keyboard
  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !spinning) {
      e.preventDefault();
      doSpin();
    }
  });

  // Loyalty card insert animation on first visit
  if (!state.loyalty.cardInserted) {
    showCardInsert();
  } else {
    $id('cardOverlay').classList.add('hidden');
  }

  // Click anywhere on the card overlay to skip ahead through the animation
  $id('cardOverlay').addEventListener('click', function() {
    cardInsertSkip = true;
  });

  // Click the loyalty badge in the win panel to re-trigger the card insert
  var badge = $id('loyaltyBadge');
  if (badge) {
    badge.style.cursor = 'pointer';
    badge.title = 'Tap to re-insert your loyalty card';
    badge.addEventListener('click', function() {
      showCardInsert();
    });
  }

  // Debug buttons
  wireDebug('dbgFreeSpins', function() {
    state.freeSpins.active = true;
    state.freeSpins.remaining = 8;
    state.freeSpins.multiplier = FREE_SPINS_CONFIG.baseMultiplier;
    updateUI();
    saveState();
  });
  wireDebug('dbgTreasure', function() {
    openTreasureHunt(function() { updateUI(); saveState(); });
  });
  wireDebug('dbgWheel', function() {
    openWheel(function() { updateUI(); saveState(); });
    // Auto-trigger the spin so debug doesn't require a second click
    setTimeout(function() {
      var btn = document.getElementById('wheelSpinBtn');
      if (btn && !btn.disabled) btn.click();
    }, 600);
  });
  wireDebug('dbgJackpotMini', function() {
    showJackpotWin('mini');
  });
  wireDebug('dbgJackpotMajor', function() {
    showJackpotWin('major');
  });
  wireDebug('dbgJackpotGrand', function() {
    showJackpotWin('grand');
  });
  wireDebug('dbgCascade', function() {
    var forced = generateGrid();
    forced[0][1] = 'chest';
    forced[1][1] = 'chest';
    forced[2][1] = 'chest';
    currentGrid = forced;
    renderGrid(currentGrid);
    processSpinResult(currentGrid, false);
  });
  wireDebug('dbgBigWin', function() {
    var forced = generateGrid();
    for (var dr = 0; dr < REELS; dr++) forced[dr][1] = 'captain';
    currentGrid = forced;
    renderGrid(currentGrid);
    processSpinResult(currentGrid, false);
  });
  wireDebug('dbgRollLines', async function() {
    if (spinning) return;
    for (var i = 0; i < NUM_LINES; i++) {
      drawPaylines([{ lineIndex: i, payout: 0, count: 5, positions: [] }]);
      await sleep(550);
    }
    clearPaylineOverlay();
  });
}

init();
