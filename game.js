/* Tinker Tides — Game Engine */

const STORAGE_KEY = 'tnkr_tinker_tides';
const REELS = 5;
const ROWS = 3;

// ─── State ───────────────────────────────────────────────────────────
function defaultState() {
  return {
    version: 1,
    coins: STARTING_COINS,
    totalSpins: 0,
    totalWon: 0,
    totalBet: 0,
    betPerLine: 1,
    jackpots: {
      mini: JACKPOT_CONFIG.mini.start,
      major: JACKPOT_CONFIG.major.start,
      grand: JACKPOT_CONFIG.grand.start,
    },
    freeSpins: { active: false, remaining: 0, multiplier: 1 },
    lastRefill: 0,
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
let currentGrid = []; // 5×3 grid of symbol IDs
let betLevelIdx = 0;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Migration
    const def = defaultState();
    for (const k of Object.keys(def)) {
      if (!(k in saved)) saved[k] = def[k];
    }
    if (!saved.stats) saved.stats = def.stats;
    for (const k of Object.keys(def.stats)) {
      if (!(k in saved.stats)) saved.stats[k] = def.stats[k];
    }
    if (!saved.jackpots) saved.jackpots = def.jackpots;
    for (const k of Object.keys(def.jackpots)) {
      if (!(k in saved.jackpots)) saved.jackpots[k] = def.jackpots[k];
    }
    if (!saved.freeSpins) saved.freeSpins = def.freeSpins;
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

// ─── Reel logic ──────────────────────────────────────────────────────
function randomSymbolFromReel(reelIdx) {
  const strip = REEL_STRIPS[reelIdx];
  return strip[Math.floor(Math.random() * strip.length)];
}

function generateGrid() {
  const grid = [];
  for (let r = 0; r < REELS; r++) {
    const col = [];
    for (let row = 0; row < ROWS; row++) {
      col.push(randomSymbolFromReel(r));
    }
    grid.push(col);
  }
  return grid;
}

// ─── Win evaluation ──────────────────────────────────────────────────
function evaluatePaylines(grid) {
  const wins = [];
  for (let i = 0; i < PAYLINES.length; i++) {
    const line = PAYLINES[i];
    const symbols = line.map(function(row, reel) { return grid[reel][row]; });
    const result = evaluateLine(symbols);
    if (result) {
      result.lineIndex = i;
      result.positions = line.map(function(row, reel) { return { reel: reel, row: row }; });
      wins.push(result);
    }
  }
  return wins;
}

function evaluateLine(symbols) {
  // Find the first non-wild symbol
  var baseSymbol = null;
  for (var idx = 0; idx < symbols.length; idx++) {
    var s = symbols[idx];
    if (s !== 'wild' && s !== 'scatter' && s !== 'bonus') {
      baseSymbol = s;
      break;
    }
  }
  // All wilds
  if (!baseSymbol) {
    if (symbols[0] === 'wild') baseSymbol = 'wild';
    else return null;
  }

  // Count consecutive matches from left (wilds substitute)
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

// Count scatters/bonus anywhere on grid
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

// Check bonus trigger: bonus on reels 0, 2, 4
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

// Check treasure hunt: captain on reels 0 AND 4
function checkTreasureHunt(grid) {
  var reel0 = false, reel4 = false;
  var positions = [];
  for (var row = 0; row < ROWS; row++) {
    if (grid[0][row] === 'captain') { reel0 = true; positions.push({ reel: 0, row: row }); }
    if (grid[4][row] === 'captain') { reel4 = true; positions.push({ reel: 4, row: row }); }
  }
  return { triggered: reel0 && reel4, positions: positions };
}

// ─── Rendering ───────────────────────────────────────────────────────
var $id = function(id) { return document.getElementById(id); };

function renderGrid(grid, highlightPositions) {
  var container = $id('reelGrid');
  container.textContent = '';
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
      cell.dataset.reel = r;
      cell.dataset.row = row;
      if (highlightPositions) {
        for (var hi = 0; hi < highlightPositions.length; hi++) {
          if (highlightPositions[hi].reel === r && highlightPositions[hi].row === row) {
            cell.classList.add('win-highlight');
            break;
          }
        }
      }
      // Icon is built from static game data constants only
      var iconEl = document.createElement('div');
      iconEl.className = 'sym-icon tier-' + sym.tier;
      iconEl.style.width = '48px';
      iconEl.style.height = '48px';
      var maskUrl = 'url(\'data:image/svg+xml,' + ICON_DATA[sym.icon] + '\')';
      iconEl.style.webkitMaskImage = maskUrl;
      iconEl.style.maskImage = maskUrl;
      iconEl.style.webkitMaskSize = 'contain';
      iconEl.style.maskSize = 'contain';
      iconEl.style.webkitMaskRepeat = 'no-repeat';
      iconEl.style.maskRepeat = 'no-repeat';
      iconEl.style.webkitMaskPosition = 'center';
      iconEl.style.maskPosition = 'center';
      cell.appendChild(iconEl);
      strip.appendChild(cell);
    }
    col.appendChild(strip);
    container.appendChild(col);
  }
}

function createIconEl(slug, tier, size) {
  size = size || 48;
  var el = document.createElement('div');
  el.className = 'sym-icon tier-' + tier;
  el.style.width = size + 'px';
  el.style.height = size + 'px';
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
  $id('coinDisplay').textContent = formatNum(Math.floor(state.coins));
  $id('betDisplay').textContent = state.betPerLine;
  $id('totalBetDisplay').textContent = formatNum(state.betPerLine * NUM_LINES);
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

  // Spin button state
  var spinBtn = $id('spinBtn');
  var totalBet = state.betPerLine * NUM_LINES;
  if (state.freeSpins.active && state.freeSpins.remaining > 0) {
    spinBtn.textContent = 'FREE SPIN (' + state.freeSpins.remaining + ')';
    spinBtn.className = 'btn-spin free-spin-btn';
    spinBtn.disabled = spinning;
  } else if (state.coins < totalBet) {
    spinBtn.textContent = 'SPIN';
    spinBtn.className = 'btn-spin';
    spinBtn.disabled = true;
  } else {
    spinBtn.textContent = 'SPIN';
    spinBtn.className = 'btn-spin';
    spinBtn.disabled = spinning;
  }
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
    if (state.coins < totalBet) {
      spinning = false;
      showRefillPrompt();
      return;
    }
    state.coins -= totalBet;
    state.totalBet += totalBet;
    // Contribute to jackpots
    for (var key in JACKPOT_CONFIG) {
      state.jackpots[key] += totalBet * JACKPOT_CONFIG[key].contribution;
    }
  } else {
    state.freeSpins.remaining--;
  }

  state.totalSpins++;
  $id('winDisplay').textContent = '';
  $id('winDisplay').className = 'win-display';
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
  if (!state.freeSpins.active && state.coins < BET_LEVELS[0] * NUM_LINES) {
    showRefillPrompt();
  }
}

async function animateReels(targetGrid) {
  var container = $id('reelGrid');
  container.textContent = '';
  var cols = [];

  for (var r = 0; r < REELS; r++) {
    var col = document.createElement('div');
    col.className = 'reel-col spinning';
    var strip = document.createElement('div');
    strip.className = 'reel-strip';

    // Add extra random symbols for scrolling effect + target
    var extraCount = 8 + r * 3;
    for (var i = 0; i < extraCount; i++) {
      var symId = randomSymbolFromReel(r);
      var sym = SYMBOLS[symId];
      var cell = document.createElement('div');
      cell.className = 'symbol-cell';
      cell.appendChild(createIconEl(sym.icon, sym.tier));
      strip.appendChild(cell);
    }
    // Add final 3 (the target)
    for (var row = 0; row < ROWS; row++) {
      var symId2 = targetGrid[r][row];
      var sym2 = SYMBOLS[symId2];
      var cell2 = document.createElement('div');
      cell2.className = 'symbol-cell';
      cell2.appendChild(createIconEl(sym2.icon, sym2.tier));
      strip.appendChild(cell2);
    }

    col.appendChild(strip);
    container.appendChild(col);
    cols.push({ col: col, strip: strip, extraCount: extraCount });
  }

  // Wait a frame for layout
  await sleep(30);

  // Measure cell height
  var firstCell = cols[0].strip.querySelector('.symbol-cell');
  var cellH = firstCell ? firstCell.offsetHeight + 2 : 60;

  // Start scroll animation
  for (var ri = 0; ri < REELS; ri++) {
    var info = cols[ri];
    var offset = -(info.extraCount * cellH);
    info.strip.style.transform = 'translateY(0)';
    info.strip.offsetHeight; // force reflow
    info.strip.style.transition = 'transform ' + (0.4 + ri * 0.15) + 's cubic-bezier(.17,.67,.12,1)';
    info.strip.style.transform = 'translateY(' + offset + 'px)';
  }

  // Wait for all reels to stop
  await sleep(400 + (REELS - 1) * 150 + 100);

  // Replace with clean static grid
  renderGrid(targetGrid);
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
    state.coins += totalWin;
    state.totalWon += totalWin;
    if (totalWin > state.stats.biggestWin) state.stats.biggestWin = totalWin;

    var totalBet = state.betPerLine * NUM_LINES;
    var winRatio = totalWin / totalBet;
    $id('winDisplay').textContent = 'WIN: ' + formatNum(Math.floor(totalWin));
    if (winRatio >= 10) {
      $id('winDisplay').className = 'win-display big-win';
    }
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
  var newGrid = grid.map(function(col) { return col.slice(); });
  var removedByReel = {};
  for (var i = 0; i < removedPositions.length; i++) {
    var pos = removedPositions[i];
    if (!removedByReel[pos.reel]) removedByReel[pos.reel] = {};
    removedByReel[pos.reel][pos.row] = true;
  }

  for (var r = 0; r < REELS; r++) {
    var removed = removedByReel[r];
    if (!removed) continue;

    var kept = [];
    for (var row = 0; row < ROWS; row++) {
      if (!removed[row]) kept.push(newGrid[r][row]);
    }
    var needed = ROWS - kept.length;
    var newSyms = [];
    for (var ni = 0; ni < needed; ni++) {
      newSyms.push(randomSymbolFromReel(r));
    }
    newGrid[r] = newSyms.concat(kept);
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
}

function clearPaylineOverlay() {
  $id('paylineOverlay').textContent = '';
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
  var chestsOpened = 0;
  var finished = false;

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
    totalDiv.textContent = 'Total: ' + formatNum(Math.floor(totalPrize * multiplier)) + ' coins';
    wrap.appendChild(totalDiv);

    var grid = document.createElement('div');
    grid.className = 'treasure-grid';
    for (var ci = 0; ci < TREASURE_HUNT_CONFIG.numChests; ci++) {
      var chest = document.createElement('div');
      chest.className = 'treasure-chest' + (ci < chestsOpened ? ' opened' : '');
      chest.dataset.idx = ci;
      if (ci < chestsOpened) {
        var c = chestContents[ci];
        var reveal = document.createElement('div');
        reveal.className = 'chest-reveal ' + (c.type === 'skull' ? 'skull-reveal' : 'prize');
        reveal.textContent = getChestText(c);
        chest.appendChild(reveal);
      } else {
        chest.textContent = '\uD83D\uDCE6'; // 📦
      }
      grid.appendChild(chest);
    }
    wrap.appendChild(grid);

    if (finished) {
      var finalPrize = Math.floor(totalPrize * multiplier);
      var finalDiv = document.createElement('div');
      finalDiv.className = 'treasure-total';
      finalDiv.style.fontSize = '22px';
      finalDiv.textContent = 'TOTAL WIN: ' + formatNum(finalPrize) + ' coins';
      wrap.appendChild(finalDiv);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.textContent = 'COLLECT';
      closeBtn.addEventListener('click', function() {
        state.coins += finalPrize;
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
    if (finished || idx < chestsOpened) return;
    if (idx !== chestsOpened) {
      var tmp = chestContents[chestsOpened];
      chestContents[chestsOpened] = chestContents[idx];
      chestContents[idx] = tmp;
    }
    var prize = chestContents[chestsOpened];
    chestsOpened++;

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

    if (chestsOpened >= TREASURE_HUNT_CONFIG.numChests) finished = true;
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

  function drawWheel(angle) {
    ctx.clearRect(0, 0, 280, 280);
    var cx = 140, cy = 140, r = 130;
    for (var i = 0; i < segments.length; i++) {
      var startAngle = angle + i * segAngle;
      var endAngle = startAngle + segAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = segments[i].color;
      ctx.fill();
      ctx.strokeStyle = '#1a1a30';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Courier New';
      ctx.fillText(segments[i].label, r - 10, 4);
      ctx.restore();
    }
  }

  drawWheel(0);

  spinBtn.addEventListener('click', function doWheelSpin() {
    spinBtn.disabled = true;
    var resultIdx = Math.floor(Math.random() * segments.length);
    var fullRotations = 4 + Math.floor(Math.random() * 3);
    var targetAngle = -(resultIdx * segAngle + segAngle / 2) - Math.PI / 2;
    var totalRotation = fullRotations * Math.PI * 2 + targetAngle - currentAngle;
    var duration = 3000 + Math.random() * 1000;
    var startTime = performance.now();
    var startAngle = currentAngle;

    function animate(now) {
      var elapsed = now - startTime;
      var t = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
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
      state.coins += amount;
      state.totalWon += amount;
      if (amount > state.stats.biggestWin) state.stats.biggestWin = amount;
      resultEl.textContent = 'WIN: ' + formatNum(Math.floor(amount)) + ' coins!';
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
  state.coins += amount;
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
    desc.textContent = 'coins added to your balance';
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
  var now = Date.now();
  var canRefill = (now - state.lastRefill) >= REFILL_COOLDOWN;
  var timeLeft = Math.max(0, REFILL_COOLDOWN - (now - state.lastRefill));

  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');
  contentEl.textContent = '';

  var wrap = document.createElement('div');
  wrap.className = 'refill-prompt';

  var h3 = document.createElement('h3');
  h3.textContent = 'Out of Coins!';
  wrap.appendChild(h3);

  var p = document.createElement('p');
  if (canRefill) {
    p.textContent = 'Claim your free ' + REFILL_AMOUNT + ' coins to keep playing!';
    wrap.appendChild(p);
    var refillBtn = document.createElement('button');
    refillBtn.className = 'btn-refill';
    refillBtn.textContent = 'CLAIM COINS';
    refillBtn.addEventListener('click', function() {
      state.coins += REFILL_AMOUNT;
      state.lastRefill = Date.now();
      modal.classList.add('hidden');
      updateUI();
      saveState();
    });
    wrap.appendChild(refillBtn);
  } else {
    var mins = Math.ceil(timeLeft / 60000);
    p.textContent = 'Next free coins available in ' + mins + ' minutes.';
    wrap.appendChild(p);
  }

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
    iconWrap.appendChild(createIconEl(sym.icon, sym.tier, 32));
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

  var statsData = [
    ['Total Spins', formatNum(state.totalSpins)],
    ['Total Bet', formatNum(Math.floor(state.totalBet))],
    ['Total Won', formatNum(Math.floor(state.totalWon))],
    ['Net Profit', formatNum(Math.floor(state.totalWon - state.totalBet))],
    ['Biggest Win', formatNum(Math.floor(state.stats.biggestWin))],
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

// ─── Init ────────────────────────────────────────────────────────────
function init() {
  loadState();

  currentGrid = generateGrid();
  renderGrid(currentGrid);
  updateUI();

  $id('spinBtn').addEventListener('click', doSpin);

  $id('betDown').addEventListener('click', function() {
    if (spinning) return;
    betLevelIdx = Math.max(0, betLevelIdx - 1);
    state.betPerLine = BET_LEVELS[betLevelIdx];
    updateUI();
    saveState();
  });
  $id('betUp').addEventListener('click', function() {
    if (spinning) return;
    betLevelIdx = Math.min(BET_LEVELS.length - 1, betLevelIdx + 1);
    state.betPerLine = BET_LEVELS[betLevelIdx];
    updateUI();
    saveState();
  });

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

  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !spinning) {
      e.preventDefault();
      doSpin();
    }
  });
}

init();
