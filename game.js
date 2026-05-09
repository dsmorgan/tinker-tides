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
    freeSpins: { active: false, remaining: 0, multiplier: 1, sessionWin: 0 },
    loyalty: {
      playerId: generatePlayerId(),
      cardInserted: false,
    },
    stats: {
      biggestWin: 0,
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
    if (saved.freeSpins.sessionWin === undefined) saved.freeSpins.sessionWin = 0;
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
var generateSpin         = Engine.generateSpin;
var evaluateLine         = Engine.evaluateLine;
var evaluatePaylines     = Engine.evaluatePaylines;
var countSymbol          = Engine.countSymbol;
var checkBonusTrigger    = Engine.checkBonusTrigger;
var checkTreasureHunt    = Engine.checkTreasureHunt;
var checkJackpotTrigger  = Engine.checkJackpotTrigger;

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
      cell.className = 'symbol-cell is-landed';
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
    // Default white-ish background so the icon is visible OUTSIDE a .symbol-cell
    // (e.g. in the paytable list). Inside the reels, .symbol-cell .sym-icon's
    // CSS rule re-applies the same gradient (and per-symbol overrides use !important).
    el.style.background = 'radial-gradient(circle,#fff,#ddd)';
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

  // Spin button state. Circular layout — use innerHTML with line breaks
  // so "FREE SPIN" + remaining count stack vertically inside the circle.
  var spinBtn = $id('spinBtn');
  if (state.freeSpins.active && state.freeSpins.remaining > 0) {
    spinBtn.innerHTML = 'FREE SPIN<br>' + state.freeSpins.remaining;
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
// Full bill-reader sequence:
//   1. Insert animation (~1.8s) — bill rises into the slot
//   2. Indicator blinks WHITE 5×        — "reading the bill"
//   3a. 9-in-10:  indicator turns GREEN — Cash ticks up over 2s
//   3b. 1-in-10:  indicator turns RED   — bill is ejected (reverse animation),
//                                         credits stay where they were so the
//                                         user can click Insert again to retry.
var BILL_REJECT_RATE = 0.10;
async function insertBill() {
  if (billInserting) return;
  billInserting = true;

  var insertBtn = $id('insertBtn');
  var indicator = $id('billIndicator');

  // Reset indicator to its idle (off) state
  if (indicator) {
    indicator.classList.remove('blinking', 'green', 'red');
  }

  // Phase 1 — bill rises into the slot
  if (insertBtn) insertBtn.classList.add('inserting');
  await sleep(1800);
  if (insertBtn) insertBtn.classList.remove('inserting');

  // Phase 2 — indicator blinks white 5 times (~350ms × 2 per cycle = ~700ms × 5 ≈ 1.75s)
  // The CSS keyframe alternates 0.35s, so 5 full blinks ≈ 1750ms total.
  if (indicator) indicator.classList.add('blinking');
  await sleep(1750);
  if (indicator) indicator.classList.remove('blinking');

  // Phase 3 — accept or reject
  var rejected = Math.random() < BILL_REJECT_RATE;

  if (rejected) {
    // RED light, then eject the bill back out the slot. No credit change.
    if (indicator) indicator.classList.add('red');
    await sleep(450);
    if (insertBtn) insertBtn.classList.add('ejecting');
    await sleep(1000);
    if (insertBtn) insertBtn.classList.remove('ejecting');
    // Brief tail on the red indicator so the user clearly registers the reject
    await sleep(400);
    if (indicator) indicator.classList.remove('red');
  } else {
    // GREEN light + tick the Cash display up by BILL_VALUE over ~2s
    if (indicator) indicator.classList.add('green');
    var startCredits = state.credits;
    var endCredits = startCredits + BILL_VALUE;
    state.credits = endCredits;
    state.totalInserted += BILL_VALUE;
    tickUp('cashDisplay', startCredits, endCredits, 2000, formatCash);
    await sleep(2000);
    displayedCredits = Math.floor(state.credits);
    saveState();
    updateUI();
    if (indicator) indicator.classList.remove('green');
  }

  billInserting = false;
}

function formatNum(n) {
  return n.toLocaleString('en-US');
}

// ─── Spin Animation ──────────────────────────────────────────────────
// Outer wrapper: kicks off one spin, then auto-plays REMAINING free spins
// once the user has manually started the session.
//
// Flow when free spins are awarded:
//   1. User clicks SPIN (paid trigger spin). singleSpin runs as a paid spin.
//      Auto-loop check sees wasFree=false → exits. Button now says "FREE SPIN".
//   2. User clicks SPIN again to start the FIRST free spin (manual).
//   3. After that first free spin returns (wasFree=true), the auto-loop kicks
//      in and runs the remaining free spins back-to-back.
async function doSpin() {
  if (spinning) return;
  spinning = true;

  var result = await singleSpin();

  // Auto-loop only if the last spin we just ran was itself a free spin.
  // The trigger paid spin (wasFree=false) doesn't auto-cascade into free
  // spins — the user clicks SPIN once to start them.
  while (result.wasFree && state.freeSpins.active && state.freeSpins.remaining > 0) {
    // Wait for at least one full phase-3 showcase cycle if the previous spin
    // had wins, otherwise a brief breather between dry free spins.
    var waitMs;
    if (result.winCount > 0) {
      waitMs = result.winCount * (SHOWCASE_FADE_MS + SHOWCASE_LINE_MS)
             + (SHOWCASE_FADE_MS + SHOWCASE_ALL_MS)
             + (SHOWCASE_FADE_MS + SHOWCASE_BLANK_MS);
    } else {
      waitMs = 800;
    }
    await sleep(waitMs);
    result = await singleSpin();
  }

  spinning = false;
  updateUI(); // re-enable Spin button (singleSpin's last updateUI ran while spinning=true)

  // Player broke? Only matters once free spins are over.
  if (!state.freeSpins.active && state.credits < BET_LEVELS[0] * NUM_LINES) {
    showRefillPrompt();
  }
}

// One spin (paid or free, depending on current state). Returns the number of
// winning paylines so doSpin's auto-loop knows how long to wait before the
// next spin's win showcase has cycled at least once.
async function singleSpin() {
  var isFree = state.freeSpins.active && state.freeSpins.remaining > 0;
  var totalBet = state.betPerLine * NUM_LINES;

  if (!isFree) {
    if (state.credits < totalBet) {
      spinning = false;
      showRefillPrompt();
      return { winCount: 0, wasFree: false };
    }
    state.credits -= totalBet;
    state.totalBet += totalBet;
    for (var key in JACKPOT_CONFIG) {
      state.jackpots[key] += totalBet * JACKPOT_CONFIG[key].contribution;
    }
  } else {
    state.freeSpins.remaining--;
  }

  state.totalSpins++;
  cancelWinShowcase();
  clearTriggerGlow();
  // During free spins, KEEP the Win display showing the running session total
  // (sessionWin) — only clear it on paid spins.
  if (!isFree) clearWinAmount();
  clearPaylineOverlay();
  updateUI();
  saveState();

  var spinResult = generateSpin();
  currentGrid = spinResult.grid;
  await animateReels(currentGrid, spinResult.stops, spinResult.strips);

  var processResult = await processSpinResult(currentGrid, isFree);

  updateUI();
  saveState();

  if (state.freeSpins.active && state.freeSpins.remaining <= 0) {
    state.freeSpins.active = false;
    state.freeSpins.remaining = 0;
    state.freeSpins.multiplier = 1;
    updateUI();
    saveState();
  }

  return {
    winCount: processResult ? processResult.winCount : 0,
    wasFree: isFree,
  };
}

// Check if reel r has a partial match building from left.
// Returns true for either: (a) 3+ payline match through reels 0..r-1, OR
// (b) 2+ skull scatters in reels 0..r-1 (where landing one more skull on
// reel r could trigger the Jackpot Picker). Same trick is used for chest +
// scatter so the player gets reel-stop tension on every potential trigger.
function hasNearWin(targetGrid, reelIdx) {
  if (reelIdx < 2) return false;
  // Scatter near-misses: count skulls / chests / scatters in the prior reels;
  // one more on reel r could complete the 3+ trigger.
  var scatters = ['skull', 'chest', 'scatter'];
  for (var si = 0; si < scatters.length; si++) {
    var sc = scatters[si];
    var scatterCount = 0;
    for (var rs = 0; rs < reelIdx; rs++) {
      for (var rowS = 0; rowS < ROWS; rowS++) {
        if (targetGrid[rs][rowS] === sc) scatterCount++;
      }
    }
    if (scatterCount >= 2) return true;
  }
  // Payline near-miss (3+ matching from reel 0)
  if (reelIdx < 3) return false;
  for (var li = 0; li < PAYLINES.length; li++) {
    var line = PAYLINES[li];
    var first = targetGrid[0][line[0]];
    if (first === 'scatter' || first === 'bonus' || first === 'chest' || first === 'skull') continue;
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

async function animateReels(targetGrid, stops, strips) {
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

    // Build the visible strip as a contiguous slice of the actual reel strip,
    // ending at the target stop position. The blur cells the user sees while
    // spinning are exactly the cells preceding `stop` on the strip — so the
    // reel really does look like a single strip rolling past.
    // Per-reel strip: usually REEL_STRIPS[r], but reel 4 may carry a boosted
    // strip when the engine swapped it in (4-of-a-kind through reels 0-3).
    var reelStrip = (strips && strips[r]) ? strips[r] : REEL_STRIPS[r];
    var stripLen = reelStrip.length;
    var stop = (stops && stops[r] != null) ? stops[r] : 0;

    for (var i = 0; i < extraCount; i++) {
      // i=0 → strip[stop - extraCount], i=extraCount-1 → strip[stop - 1]
      var idx = (((stop - extraCount + i) % stripLen) + stripLen) % stripLen;
      strip.appendChild(makeSpinCell(reelStrip[idx], cellH));
    }
    // Target 3 at the end (= strip[stop], strip[stop+1], strip[stop+2])
    for (var row = 0; row < ROWS; row++) {
      strip.appendChild(makeSpinCell(targetGrid[r][row], cellH));
    }

    col.appendChild(strip);
    container.appendChild(col);

    // Stop time is sequential: each reel stops at least 400ms after the
    // previous one, guaranteeing later reels are still spinning while an
    // earlier reel is in its anticipation tail. Anticipation adds extra
    // time AFTER the previous reel stops — reel 3 (+3.0s) and reel 4
    // (+5.4s), so the 5th reel feels noticeably more tense.
    var stopTime;
    if (r === 0) {
      stopTime = 1200;
    } else {
      stopTime = cols[r - 1].stopTime + 400;
      if (anticipation[r]) stopTime += (r === 3) ? 3000 : 5400;
    }

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
  // Total animation = MAX reel stopTime + 300ms for bounce settle. Earlier
  // versions used cols[REELS - 1].stopTime, but that was wrong when reel 3
  // anticipates and reel 4 doesn't — reel 3 then ends up being the longest
  // and gets cut off mid-animation.
  var maxStopTime = 0;
  for (var i = 0; i < cols.length; i++) {
    if (cols[i].stopTime > maxStopTime) maxStopTime = cols[i].stopTime;
  }
  var totalDuration = maxStopTime + 300;

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

          // Anticipation glow kicks in once the previous reel has begun
          // stopping (so reel 3's tension shows after reel 2 settles, and
          // reel 4's tension shows after reel 3 settles).
          if (c.anticipation && r > 0 && elapsed > cols[r - 1].stopTime) {
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
  var freeSpinMult = isFree || state.freeSpins.active ? FREE_SPINS_CONFIG.baseMultiplier : 1;

  // Trigger checks (scatter / bonus / treasure)
  var scatterResult = countSymbol(grid, 'scatter');
  if (scatterResult.count >= 3) {
    await triggerFreeSpins(scatterResult, isFree);
  }
  // Bonus wins (Wheel of Fortune, Treasure Hunt) get collected first and
  // then APPENDED to the payline winData so they flow through the same
  // Phase 1/2/3 display — each one shows up as a callout with no payline lit.
  var bonusWins = [];

  var bonusResult = checkBonusTrigger(grid);
  if (bonusResult.triggered) {
    state.stats.bonusesTriggered++;
    // Glow EVERY ship-wheel on the grid so it's visually clear which symbols
    // earned the wheel bonus. The glow stays through the wheel modal and
    // clears at the next spin's pre-cleanup (clearTriggerGlow in singleSpin).
    var allBonus = countSymbol(grid, 'bonus');
    setTriggerGlow(allBonus.positions);
    var wheelOutcome = await triggerWheelOfFortune();
    if (wheelOutcome && wheelOutcome.amount > 0) {
      bonusWins.push({ bonus: true, label: wheelOutcome.label, amount: wheelOutcome.amount });
    }
  }
  var treasureResult = checkTreasureHunt(grid);
  if (treasureResult.triggered) {
    state.stats.bonusesTriggered++;
    // Glow every chest scatter on the grid so the player can see what triggered TH
    setTriggerGlow(treasureResult.positions);
    var thOutcome = await triggerTreasureHunt(treasureResult.count);
    if (thOutcome && thOutcome.amount > 0) {
      bonusWins.push({ bonus: true, label: thOutcome.label, amount: thOutcome.amount });
    }
  }
  var jackpotResult = checkJackpotTrigger(grid);
  if (jackpotResult.triggered) {
    state.stats.bonusesTriggered++;
    // Glow every skull on the grid so the player sees what triggered the picker
    setTriggerGlow(jackpotResult.positions);
    var jpOutcome = await triggerJackpotPicker(jackpotResult.count);
    if (jpOutcome && jpOutcome.amount > 0) {
      bonusWins.push({ bonus: true, label: jpOutcome.label, amount: jpOutcome.amount });
    }
  } else if (jackpotResult.count === 2) {
    // 2 skulls — didn't trigger, but pulse them red so the player feels the
    // near-miss. Glow class is cleared by the next spin's pre-cleanup.
    setSkullNearMiss(jackpotResult.positions);
  }

  // Single payline evaluation (no cascade)
  var wins = evaluatePaylines(grid);

  if (wins.length > 0 || bonusWins.length > 0) {
    // Compute per-line amounts. Wins come back ordered by lineIndex (top→bottom).
    // Bonus wins (wheel/TH) are appended at the end of winData so they show
    // last in the showcase — typically the biggest single payout of the spin.
    var winData = [];
    var totalWin = 0;
    for (var wi = 0; wi < wins.length; wi++) {
      var amount = wins[wi].payout * state.betPerLine * freeSpinMult;
      totalWin += amount;
      winData.push({ win: wins[wi], amount: amount });
    }
    for (var bwi = 0; bwi < bonusWins.length; bwi++) {
      totalWin += bonusWins[bwi].amount;
      winData.push(bonusWins[bwi]);
    }

    // Render grid once with all winning cells highlighted (no re-render between
    // phase 2 steps — we toggle .win-highlight via setWinHighlight).
    var allHighlights = [];
    for (var wi2 = 0; wi2 < wins.length; wi2++) {
      for (var pi2 = 0; pi2 < wins[wi2].count; pi2++) {
        allHighlights.push(wins[wi2].positions[pi2]);
      }
    }
    renderGrid(grid, allHighlights);

    // Phase 1: rapid top-to-bottom sweep (multi-line wins only). For each
    // step we re-draw the paylines with one more win added — so by the end of
    // the sweep, every payline is on the grid and every indicator stripe is lit.
    // Bonus entries have no payline, so they're skipped in this phase.
    var paylineEntries = winData.filter(function(w) { return !w.bonus; });
    if (paylineEntries.length > 1) {
      clearLineStripes();
      clearPaylineOverlay();
      var accumWins = [];
      for (var p1 = 0; p1 < paylineEntries.length; p1++) {
        accumWins.push(paylineEntries[p1].win);
        drawPaylines(accumWins); // also re-lights the indicator stripes
        await sleep(80);
      }
      await sleep(1200); // dwell with all lines + indicators visible
      clearLineStripes();
      clearPaylineOverlay();
      await sleep(150);
    }

    // Phase 2: showcase each entry one at a time. Win + Cash count up per-entry.
    // During free spins, the Win counter accumulates across the whole session
    // — start each spin's tick-up from where sessionWin left off.
    // For bonus entries (wheel / treasure hunt) we skip the cell highlight + payline
    // overlay — only the callout shows ("Wheel of Fortune: 250 credits").
    var preSessionWin = isFree ? (state.freeSpins.sessionWin || 0) : 0;
    var preWinCredits = state.credits;
    var accumulated = 0;
    for (var p2 = 0; p2 < winData.length; p2++) {
      var item = winData[p2];
      var label;
      if (item.bonus) {
        setWinHighlight(null);
        clearPaylineOverlay();
        label = item.label + ': ' + formatNum(Math.floor(item.amount)) + ' credits';
      } else {
        var lineHl = item.win.positions.slice(0, item.win.count);
        setWinHighlight(lineHl);
        drawPaylines([item.win]);
        label = item.win.count + ' ' +
                displaySymbolName(item.win.symbol, item.win.count) + ', ' +
                formatNum(Math.floor(item.amount)) + ' credits';
      }
      showWinLineCallout(label);

      var winFrom = accumulated;
      var winTo   = accumulated + item.amount;
      tickUp('winLedDisplay', preSessionWin + winFrom, preSessionWin + winTo, 380,
        function(v) { return formatNum(Math.floor(v)); });
      tickUp('cashDisplay', preWinCredits + winFrom, preWinCredits + winTo, 380, formatCash);
      accumulated = winTo;

      await sleep(400);
    }

    // Commit state and settle displays
    state.credits += totalWin;
    state.totalWon += totalWin;
    if (totalWin > state.stats.biggestWin) state.stats.biggestWin = totalWin;
    displayedCredits = Math.floor(state.credits);
    if (isFree) state.freeSpins.sessionWin = preSessionWin + totalWin;
    var displayedWin = isFree ? state.freeSpins.sessionWin : totalWin;
    showWinAmount(displayedWin); // ensures win-flash class applied after the tick-up
    await sleep(300);

    // Transition between Phase 2 (per-line) and Phase 3 (looping showcase):
    // light up ALL paylines + every winning cell, show "Total: X credits"
    // callout, dwell 1500ms. Bonus entries don't have paylines/cells so they
    // contribute amount-only to the total. Mirrors Phase 3's all-lines step.
    var transitionWins = [];
    var transitionHl = [];
    for (var twi = 0; twi < winData.length; twi++) {
      if (winData[twi].bonus) continue;
      transitionWins.push(winData[twi].win);
      for (var thi = 0; thi < winData[twi].win.count; thi++) {
        transitionHl.push(winData[twi].win.positions[thi]);
      }
    }
    if (transitionWins.length > 0) {
      setWinHighlight(transitionHl);
      drawPaylines(transitionWins);
    } else {
      setWinHighlight(null);
      clearPaylineOverlay();
    }
    showWinLineCallout('Total: ' + formatNum(Math.floor(totalWin)) + ' credits');
    await sleep(3000);

    // Phase 3: keep cycling through each winning line + callout until the
    // next spin (cancelWinShowcase is called from doSpin's pre-spin cleanup).
    startWinShowcase(winData);
  }

  // (Random per-spin progressive trigger removed — jackpots now fire only
  // from the visible skull-scatter picker, the wheel JACKPOT segment, and TH
  // jackpot chests. JACKPOT_CONFIG.*.triggerChance left at 0 for safety.)

  currentGrid = grid;
  // Entry count drives doSpin's auto-play sleep (one showcase cycle worth).
  // Bonus wins also display in the showcase, so include them in the count.
  var entryCount = wins.length + bonusWins.length;
  return { winCount: entryCount, totalWin: entryCount > 0 ? totalWin : 0 };
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
    state.freeSpins.sessionWin = 0; // fresh session — reset cumulative win counter
    showNotification(spinsAwarded + ' FREE SPINS!', 'free-spins-notify');
  }
  await sleep(2000);
  updateUI();
}

// ─── Treasure Hunt ───────────────────────────────────────────────────
// chestCount = number of scatter chests that triggered TH (3, 4, or 5).
// Drives the starting multiplier inside TH per TREASURE_HUNT_CONFIG.startMultiplier.
async function triggerTreasureHunt(chestCount) {
  return new Promise(function(resolve) {
    showNotification('TREASURE HUNT!', 'bonus-notify');
    setTimeout(function() {
      openTreasureHunt(resolve, chestCount);
    }, 2000);
  });
}

function openTreasureHunt(onComplete, chestCount) {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');

  var totalBet = state.betPerLine * NUM_LINES;
  var totalPrize = 0;
  var startMult = TREASURE_HUNT_CONFIG.startMultiplier || {};
  var multiplier = startMult[chestCount] || 1;
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

    // Always render the final-total + COLLECT footer so the modal height is
    // identical whether we're mid-hunt or finished. We just hide it (via
    // visibility, which keeps the layout box) until `finished` is true.
    var footer = document.createElement('div');
    footer.className = 'treasure-footer';
    if (!finished) footer.style.visibility = 'hidden';

    var finalPrize = Math.floor(totalPrize * multiplier);
    var finalDiv = document.createElement('div');
    finalDiv.className = 'treasure-total';
    finalDiv.style.fontSize = '22px';
    finalDiv.textContent = 'TOTAL WIN: ' + formatNum(finalPrize) + ' credits';
    footer.appendChild(finalDiv);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = 'COLLECT';
    closeBtn.addEventListener('click', function() {
      if (!finished) return; // safety — shouldn't fire while hidden, but guard anyway
      modal.classList.add('hidden');
      // Hand the prize to the caller (processSpinResult) so it can be
      // counted into Win/Cash via the same tick-up flow as paylines.
      onComplete({ amount: finalPrize, label: 'Treasure Hunt' });
    });
    footer.appendChild(closeBtn);

    wrap.appendChild(footer);

    if (!finished) {
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

// ─── Jackpot Picker (3+ skulls) ──────────────────────────────────────
// 3×3 reveal grid. Each tile is one of: blank / Mini / Major / Grand.
// Player picks one tile at a time. Win when 3 of any tier are revealed.
// Bust when 3 blanks are revealed. Lots of "2 of tier!" near-miss tension.
async function triggerJackpotPicker(skullCount) {
  return new Promise(function(resolve) {
    showNotification('JACKPOT PICKER!', 'bonus-notify');
    setTimeout(function() {
      openJackpotPicker(resolve, skullCount);
    }, 2000);
  });
}

function openJackpotPicker(onComplete, skullCount) {
  var modal = $id('modal');
  var contentEl = $id('modalContent');
  modal.classList.remove('hidden');
  contentEl.textContent = '';

  var cfg = JACKPOT_PICKER_CONFIG;

  // Pre-roll all 9 tiles up front (matches engine.runJackpotPicker shape so
  // the visual outcome distribution mirrors the headless sim).
  var totalWeight = 0;
  for (var ti = 0; ti < cfg.tiles.length; ti++) totalWeight += cfg.tiles[ti].weight;
  function rollTile() {
    var roll = Math.random() * totalWeight;
    var cum = 0;
    for (var pi = 0; pi < cfg.tiles.length; pi++) {
      cum += cfg.tiles[pi].weight;
      if (roll < cum) return cfg.tiles[pi].type;
    }
    return 'blank';
  }
  var tiles = [];
  for (var t = 0; t < cfg.gridSize; t++) tiles.push(rollTile());
  // Pre-shuffle so click order doesn't matter (player picks an unrevealed tile)
  for (var s = tiles.length - 1; s > 0; s--) {
    var j = Math.floor(Math.random() * (s + 1));
    var tmp = tiles[s]; tiles[s] = tiles[j]; tiles[j] = tmp;
  }

  var revealed = new Array(cfg.gridSize).fill(false);
  var counts = { blank: 0, mini: 0, major: 0, grand: 0 };
  var finished = false;
  var wonTier = null;

  // Header + tier-progress tracker + grid + result + close button
  var wrap = document.createElement('div');
  wrap.className = 'jackpot-picker';

  var h2 = document.createElement('h2');
  h2.textContent = 'JACKPOT PICKER';
  wrap.appendChild(h2);

  var hint = document.createElement('div');
  hint.className = 'jp-hint';
  hint.textContent = 'Reveal 3 of the same tier to win it. Avoid 3 ☠ Blanks!';
  wrap.appendChild(hint);

  // Tier progress meter
  var tracker = document.createElement('div');
  tracker.className = 'jp-tracker';
  function makeMeter(tier, label) {
    var box = document.createElement('div');
    box.className = 'jp-tier jp-tier-' + tier;
    var lab = document.createElement('span');
    lab.className = 'jp-tier-label';
    lab.textContent = label;
    box.appendChild(lab);
    var dotsWrap = document.createElement('span');
    dotsWrap.className = 'jp-dots';
    for (var d = 0; d < cfg.matchToWin; d++) {
      var dot = document.createElement('span');
      dot.className = 'jp-dot';
      dotsWrap.appendChild(dot);
    }
    box.appendChild(dotsWrap);
    return box;
  }
  var miniMeter  = makeMeter('mini',  'Mini');
  var majorMeter = makeMeter('major', 'Major');
  var grandMeter = makeMeter('grand', 'Grand');
  var blankMeter = makeMeter('blank', '☠ Blank');
  blankMeter.classList.add('jp-tier-bust');
  tracker.appendChild(miniMeter);
  tracker.appendChild(majorMeter);
  tracker.appendChild(grandMeter);
  tracker.appendChild(blankMeter);
  wrap.appendChild(tracker);

  // 3×3 grid of tiles
  var grid = document.createElement('div');
  grid.className = 'jp-grid';
  var tileEls = [];
  for (var i = 0; i < cfg.gridSize; i++) {
    (function(idx) {
      var tile = document.createElement('button');
      tile.className = 'jp-tile';
      tile.dataset.idx = idx;
      var face = document.createElement('span');
      face.className = 'jp-face';
      face.textContent = '☠'; // facedown shows a skull
      tile.appendChild(face);
      tile.addEventListener('click', function() { pickTile(idx); });
      grid.appendChild(tile);
      tileEls.push(tile);
    })(i);
  }
  wrap.appendChild(grid);

  var resultDiv = document.createElement('div');
  resultDiv.className = 'jp-result';
  wrap.appendChild(resultDiv);

  // Pre-allocate the close button so the modal doesn't reflow when it appears
  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = 'CONTINUE';
  closeBtn.style.visibility = 'hidden';
  var pendingPayout = { amount: 0, label: 'Jackpot' };
  closeBtn.addEventListener('click', function() {
    modal.classList.add('hidden');
    onComplete({ amount: pendingPayout.amount, label: pendingPayout.label });
  });
  wrap.appendChild(closeBtn);

  contentEl.appendChild(wrap);

  function updateMeter(meter, count) {
    var dots = meter.querySelectorAll('.jp-dot');
    for (var k = 0; k < dots.length; k++) {
      if (k < count) dots[k].classList.add('lit');
      else dots[k].classList.remove('lit');
    }
    if (count === cfg.matchToWin - 1) meter.classList.add('jp-tier-near'); // "almost!"
    else meter.classList.remove('jp-tier-near');
  }

  function tierToReveal(type) {
    switch (type) {
      case 'mini':  return { glyph: '$', label: 'MINI',  cls: 'jp-mini'  };
      case 'major': return { glyph: '$$', label: 'MAJOR', cls: 'jp-major' };
      case 'grand': return { glyph: '$$$', label: 'GRAND', cls: 'jp-grand' };
      default:      return { glyph: '☠',   label: '',      cls: 'jp-blank' };
    }
  }

  async function pickTile(idx) {
    if (finished || revealed[idx]) return;
    revealed[idx] = true;
    var type = tiles[idx];
    counts[type]++;

    // Reveal animation
    var tile = tileEls[idx];
    var info = tierToReveal(type);
    tile.classList.add('revealed', info.cls);
    var face = tile.querySelector('.jp-face');
    if (face) face.textContent = info.glyph;
    tile.disabled = true;

    // Update tier meters
    updateMeter(miniMeter,  counts.mini);
    updateMeter(majorMeter, counts.major);
    updateMeter(grandMeter, counts.grand);
    updateMeter(blankMeter, counts.blank);

    // Check end conditions
    if (counts.mini  >= cfg.matchToWin) wonTier = 'mini';
    else if (counts.major >= cfg.matchToWin) wonTier = 'major';
    else if (counts.grand >= cfg.matchToWin) wonTier = 'grand';
    var busted = (!wonTier && counts.blank >= cfg.bustOn);

    if (wonTier || busted) {
      finished = true;
      // Disable remaining tiles
      for (var d = 0; d < tileEls.length; d++) tileEls[d].disabled = true;

      await sleep(600); // beat to register the final reveal

      if (wonTier) {
        var amount = Math.floor(state.jackpots[wonTier]);
        // Reset the pool now that it's been won
        state.jackpots[wonTier] = JACKPOT_CONFIG[wonTier].start;
        state.stats.jackpotsWon[wonTier]++;
        pendingPayout.amount = amount;
        pendingPayout.label = wonTier.charAt(0).toUpperCase() + wonTier.slice(1) + ' Jackpot';
        resultDiv.textContent = wonTier.toUpperCase() + ' JACKPOT — ' + formatNum(amount) + ' credits!';
        resultDiv.classList.add('jp-win', 'jp-' + wonTier);
      } else {
        pendingPayout.amount = 0;
        pendingPayout.label = 'Jackpot Picker';
        resultDiv.textContent = 'BUSTED — 3 blanks';
        resultDiv.classList.add('jp-bust');
      }
      saveState();
      closeBtn.style.visibility = 'visible';
    }
  }
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

  // Pre-allocate the CONTINUE button so the modal doesn't reflow after the
  // wheel resolves. Hidden via visibility (still occupies space) until
  // resolveWheelResult flips it visible. The amount won is stashed on
  // `pendingResult` so the close handler can hand it to onComplete — that
  // lets processSpinResult flow it through the normal Win/Cash tick-up.
  var pendingResult = { amount: 0, label: 'Wheel of Fortune' };
  var closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.id = 'wheelCloseBtn';
  closeBtn.textContent = 'CONTINUE';
  closeBtn.style.visibility = 'hidden';
  closeBtn.addEventListener('click', function() {
    $id('modal').classList.add('hidden');
    onComplete({ amount: pendingResult.amount, label: pendingResult.label });
  });
  wrap.appendChild(closeBtn);

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
    spinBtn.style.visibility = 'hidden';
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
        resolveWheelResult(segments[resultIdx], pendingResult, spinBtn, onComplete);
      }
    }
    requestAnimationFrame(animate);
  });
}

// Records the wheel outcome into pendingResult so the CONTINUE button can
// hand it to onComplete (and processSpinResult routes it through the normal
// Win/Cash tick-up). The credit add is NOT done here — done later via the
// payline-style flow so the user sees the amount tick into Win and Cash
// after the modal closes.
async function resolveWheelResult(segment, pendingResult, spinBtn, onComplete) {
  var resultEl = $id('wheelResult');
  var totalBet = state.betPerLine * NUM_LINES;

  switch (segment.type) {
    case 'coins':
      var amount = segment.value * totalBet;
      pendingResult.amount = amount;
      pendingResult.label = 'Wheel of Fortune';
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
      // Free spins don't add credits — left at amount=0 so processSpinResult
      // skips the bonus-win flow (it filters on amount > 0).
      break;
    case 'respin':
      resultEl.textContent = 'SPIN AGAIN!';
      await sleep(1500);
      // Re-show + re-enable the spin button for the respin
      spinBtn.style.visibility = 'visible';
      spinBtn.disabled = false;
      return;
    case 'jackpot':
      resultEl.textContent = 'JACKPOT CHANCE!';
      await sleep(1500);
      // Jackpot path manages its own credit add + celebration, then closes
      // the wheel modal and calls onComplete() with no args. processSpinResult
      // sees an undefined outcome and skips routing through Win/Cash.
      await resolveJackpotWheel(onComplete);
      return;
  }

  updateUI();
  saveState();

  await sleep(1500);
  // Reveal the pre-allocated CONTINUE button — its click handler is already
  // wired in openWheel(), so flipping visibility is enough.
  var closeBtn = $id('wheelCloseBtn');
  if (closeBtn) closeBtn.style.visibility = 'visible';
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

  // Specials at the top (wild, scatter, bonus, chest, skull), then regular symbols high → low.
  var order = ['wild','scatter','bonus','chest','skull','captain','swords','hat','ship','parrot','cannon','rum','anchor','compass'];
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
      var sw = document.createElement('span');
      sw.textContent = 'WILD - Subs for all';
      paysDiv.appendChild(sw);
      for (var pw = 1; pw < 5; pw++) {
        if (!sym.pay[pw]) continue;
        var swp = document.createElement('span');
        swp.textContent = (pw + 1) + '×: ' + sym.pay[pw] + '×';
        paysDiv.appendChild(swp);
      }
    } else if (id === 'scatter') {
      var s2 = document.createElement('span');
      s2.textContent = '3\u21928 / 4\u219212 / 5\u219215 Free Spins';
      paysDiv.appendChild(s2);
    } else if (id === 'bonus') {
      var s3 = document.createElement('span');
      s3.textContent = '3 on reels 1,3,5 \u2192 Wheel';
      paysDiv.appendChild(s3);
    } else if (id === 'chest') {
      // Chest is a pure scatter trigger \u2014 no payline pay.
      var ch = document.createElement('span');
      ch.textContent = '3+ anywhere \u2192 Treasure Hunt (\u00d71 / \u00d72 / \u00d73 multiplier)';
      paysDiv.appendChild(ch);
    } else if (id === 'skull') {
      // Skull is a pure scatter trigger for the Jackpot Picker.
      var sk = document.createElement('span');
      sk.textContent = '3+ anywhere \u2192 Jackpot Picker (Mini / Major / Grand)';
      paysDiv.appendChild(sk);
    } else {
      // Loop from pay[1] (2-of-a-kind) through pay[4] (5-of-a-kind);
      // skip tiers that don't pay so the row stays clean.
      for (var pi = 1; pi < 5; pi++) {
        if (!sym.pay[pi]) continue;
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
    ['Free Spins:', '3+ Scatter = 8-15 free spins with \u00d72 multiplier. Can retrigger.', '#c084fc'],
    ['Treasure Hunt:', '3+ Treasure Chests anywhere \u2192 pick chests for prizes! 4 chests = \u00d72, 5 = \u00d73 starting multiplier.', 'var(--red)'],
    ['Wheel of Fortune:', '3 Ship Wheels on reels 1, 3, 5 \u2192 spin the wheel!', 'var(--red)'],
    ['Mystery Reel:', '4-of-a-kind on reels 1-4 \u2192 reel 5 swaps to a boosted strip with extra wilds.', 'var(--gold)'],
    ['Jackpot Picker:', '3+ Skulls anywhere \u2192 3\u00d73 reveal grid. Match 3 of a tier to win Mini/Major/Grand.', 'var(--gold)'],
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
    lightUpStripe(idx);
  }
}

function lightUpStripe(lineIdx) {
  var stripe = document.querySelector('.line-stripe[data-line-idx="' + lineIdx + '"]');
  if (stripe) stripe.classList.add('active');
}

function setWinHighlight(positions) {
  var current = document.querySelectorAll('.symbol-cell.win-highlight');
  for (var i = 0; i < current.length; i++) current[i].classList.remove('win-highlight');
  if (!positions) return;
  for (var p = 0; p < positions.length; p++) {
    var cell = document.querySelector('.symbol-cell[data-reel="' + positions[p].reel + '"][data-row="' + positions[p].row + '"]');
    if (cell) cell.classList.add('win-highlight');
  }
}

// Glow on bonus-trigger symbols (ship wheels). Distinct from win-highlight so
// it's clear what TRIGGERED the wheel, vs what PAID on a payline.
function setTriggerGlow(positions) {
  clearTriggerGlow();
  if (!positions) return;
  for (var p = 0; p < positions.length; p++) {
    var cell = document.querySelector('.symbol-cell[data-reel="' + positions[p].reel + '"][data-row="' + positions[p].row + '"]');
    if (cell) cell.classList.add('bonus-trigger-glow');
  }
}

function clearTriggerGlow() {
  var current = document.querySelectorAll('.symbol-cell.bonus-trigger-glow');
  for (var i = 0; i < current.length; i++) current[i].classList.remove('bonus-trigger-glow');
  clearSkullNearMiss();
}

// Pulses red on the 2 skulls when the player almost (but didn't quite) trigger
// the Jackpot Picker. Cleared by clearTriggerGlow on the next spin's cleanup.
function setSkullNearMiss(positions) {
  clearSkullNearMiss();
  if (!positions) return;
  for (var p = 0; p < positions.length; p++) {
    var cell = document.querySelector('.symbol-cell[data-reel="' + positions[p].reel + '"][data-row="' + positions[p].row + '"]');
    if (cell) cell.classList.add('skull-near-miss');
  }
}
function clearSkullNearMiss() {
  var current = document.querySelectorAll('.symbol-cell.skull-near-miss');
  for (var i = 0; i < current.length; i++) current[i].classList.remove('skull-near-miss');
}

function showWinLineCallout(text) {
  var el = $id('winLineCallout');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
}

function hideWinLineCallout() {
  var el = $id('winLineCallout');
  if (el) el.classList.remove('visible');
}

// Looping showcase used in phase 3: cycles through each winning line, then
// shows ALL lines together, then pauses, then repeats. Each transition fades
// the callout out for ~100ms before swapping in the new state, then fades it
// back in (CSS transition on .win-line-callout opacity handles the visual).
// Runs until cancelWinShowcase() is called from the next spin's pre-cleanup.
var winShowcaseTimer = null;
var winShowcaseFadeTimer = null;
var SHOWCASE_FADE_MS  = 150;   // out-then-in transition before each step
var SHOWCASE_LINE_MS  = 1500;   // dwell per individual line (~1050ms incl fade)
var SHOWCASE_ALL_MS   = 3000;  // dwell for the all-lines summary
var SHOWCASE_BLANK_MS = 675;   // blank pause between cycles

function startWinShowcase(winData) {
  cancelWinShowcase();
  if (!winData || winData.length === 0) return;

  // Pre-compute the all-lines bundle once. Bonus entries (wheel / TH) don't
  // contribute payline cells or stripes — only their amount adds to total.
  var totalWin = 0;
  var allHl = [];
  var allWins = [];
  for (var i = 0; i < winData.length; i++) {
    totalWin += winData[i].amount;
    if (winData[i].bonus) continue;
    allWins.push(winData[i].win);
    for (var pi = 0; pi < winData[i].win.count; pi++) {
      allHl.push(winData[i].win.positions[pi]);
    }
  }

  // Build the step sequence for one cycle. Each step has an apply() function
  // and a dwell time. The cycle loops indefinitely until cancelled.
  var steps = [];
  for (var li = 0; li < winData.length; li++) {
    (function(item) {
      steps.push({
        dwell: SHOWCASE_LINE_MS,
        apply: function() {
          if (item.bonus) {
            setWinHighlight(null);
            clearPaylineOverlay();
            showWinLineCallout(item.label + ': ' + formatNum(Math.floor(item.amount)) + ' credits');
          } else {
            var lineHl = item.win.positions.slice(0, item.win.count);
            setWinHighlight(lineHl);
            drawPaylines([item.win]);
            var label = item.win.count + ' ' +
                        displaySymbolName(item.win.symbol, item.win.count) + ', ' +
                        formatNum(Math.floor(item.amount)) + ' credits';
            showWinLineCallout(label);
          }
        }
      });
    })(winData[li]);
  }
  // All-lines summary
  steps.push({
    dwell: SHOWCASE_ALL_MS,
    apply: function() {
      setWinHighlight(allHl);
      drawPaylines(allWins);
      showWinLineCallout('Total: ' + formatNum(Math.floor(totalWin)) + ' credits');
    }
  });
  // Blank pause between cycles (everything cleared)
  steps.push({
    dwell: SHOWCASE_BLANK_MS,
    apply: function() {
      hideWinLineCallout();
      setWinHighlight(null);
      clearPaylineOverlay();
    }
  });

  var idx = 0;
  function nextStep() {
    var step = steps[idx % steps.length];
    // Fade out the callout, then apply the new state (which kicks off fade-in).
    hideWinLineCallout();
    winShowcaseFadeTimer = setTimeout(function() {
      step.apply();
      winShowcaseTimer = setTimeout(function() {
        idx++;
        nextStep();
      }, step.dwell);
    }, SHOWCASE_FADE_MS);
  }
  nextStep();
}

function cancelWinShowcase() {
  if (winShowcaseTimer) clearTimeout(winShowcaseTimer);
  if (winShowcaseFadeTimer) clearTimeout(winShowcaseFadeTimer);
  winShowcaseTimer = null;
  winShowcaseFadeTimer = null;
  hideWinLineCallout();
  setWinHighlight(null);
}

// Pluralize a symbol name for the callout — strip parentheticals like "(Wild)"
// and append 's' when count !== 1, unless the name already ends in 's'.
function displaySymbolName(symId, count) {
  var name = SYMBOLS[symId].name.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (count === 1) return name;
  if (/s$/i.test(name)) return name;
  return name + 's';
}

// Animate an LED display from `from` to `to` over `durationMs`, formatting
// each tick with `formatter`. Fire-and-forget — does not return a Promise.
function tickUp(elId, from, to, durationMs, formatter) {
  var el = $id(elId);
  if (!el) return;
  var start = performance.now();
  var delta = to - from;
  function step(now) {
    var t = Math.min((now - start) / durationMs, 1);
    var eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    var current = from + delta * eased;
    el.textContent = formatter(current);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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

  // Bill inserter — the spin-row Insert button is the only entry point now.
  var insertBtn = document.getElementById('insertBtn');
  if (insertBtn) insertBtn.addEventListener('click', function() {
    insertBill();
  });
  // Cash out button — UI placeholder; no behaviour yet.
  var cashoutBtn = document.getElementById('cashoutBtn');
  if (cashoutBtn) cashoutBtn.addEventListener('click', function() {
    /* TODO: cash-out flow */
  });

  // Tabs (Paytable / Stats / Settings) — selector matches the new spin-row
  // buttons that carry a data-tab attribute.
  var tabBtns = document.querySelectorAll('[data-tab]');
  for (var ti = 0; ti < tabBtns.length; ti++) {
    (function(tab) {
      tab.addEventListener('click', function() {
        for (var j = 0; j < tabBtns.length; j++) tabBtns[j].classList.remove('active');
        tab.classList.add('active');
        var tabName = tab.dataset.tab;
        if (tabName === 'paytable') openPaytable();
        else if (tabName === 'stats') openStats();
        else if (tabName === 'settings') openSettings();
      });
    })(tabBtns[ti]);
  }

  // Keyboard
  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space' && !spinning) {
      e.preventDefault();
      doSpin();
    }
  });

  // Loyalty card overlay is opt-in — never blocks game startup. Clicking the
  // overlay anywhere skips ahead; clicking the badge in the win panel plays
  // the insert animation.
  $id('cardOverlay').classList.add('hidden');
  state.loyalty.cardInserted = true;
  saveState();

  $id('cardOverlay').addEventListener('click', function() {
    cardInsertSkip = true;
  });

  var badge = $id('loyaltyBadge');
  if (badge) {
    badge.style.cursor = 'pointer';
    badge.title = 'Tap to play the loyalty-card insert animation';
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
    // The user clicks "SPIN THE WHEEL" inside the modal to trigger the spin —
    // no auto-trigger here, otherwise the wheel feels like it's spinning on
    // its own with no input.
    openWheel(function() { updateUI(); saveState(); });
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
  wireDebug('dbgJackpotPicker', function() {
    openJackpotPicker(function() { updateUI(); saveState(); }, 3);
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
