// === ERROR LOG ===
const errorLog = document.getElementById('error-log');
function logError(msg) {
  errorLog.style.display = 'block';
  errorLog.textContent += msg + '\n';
}
window.addEventListener('error', e => logError('ERR: ' + e.message + ' (' + e.lineno + ')'));
window.addEventListener('unhandledrejection', e => logError('REJ: ' + e.reason));

// === CONSTANTS ===
const W = 400, H = 700;
const LANE_L = 80, LANE_R = 320, WALL_W = 6;
const PLAYER_Y = H - 55;
const PLAYER_SPEED = 3.5;
const BULLET_SPEED = 7;
const BASE_FIRE_INTERVAL = 280;
const DIFF_TIMES = [90, 180, 300];
const DIFF_NAMES = ['EASY', 'MEDIUM', 'HARD'];
const DIFF_SPEED_MULT = [0.8, 1.0, 1.2];

// === CANVAS ===
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

function resizeCanvas() {
  const maxW = window.innerWidth - 16;
  const maxH = window.innerHeight - 110;
  const scale = Math.min(maxW / W, maxH / H, 1);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);

// === HUD ELEMENTS ===
const scoreVal = document.getElementById('score-val');
const livesVal = document.getElementById('lives-val');
const shootersVal = document.getElementById('shooters-val');
const bombVal = document.getElementById('bomb-val');
const bombBtn = document.getElementById('bomb-btn');
const messageEl = document.getElementById('message');
function setMessage(msg) { messageEl.textContent = msg; }

// === GAME STATE ===
let gameState = 'title';
let score = 0;
let money = 0;
let lives = 3;
let level = 1;
let difficulty = 1;
let levelTime = 0;
let levelDuration = 180;
let bossesKilledThisLevel = 0;

// Player
let player = { x: W / 2, shooters: 1, hp: 100 };
let fireTimer = 0;

// Persistent upgrades (within a run)
let upgrades = { damage: 0, hp: 0, starters: 0, gateDur: 0, powerRapid: false, powerShield: false };

// Entities
let bullets = [];
let monsters = [];
let targets = [];
let particles = [];
let powerups = [];
let gates = [];

// Spawn timers
let monsterSpawnTimer = 0;
let bossSpawnTimer = 0;
let targetTimerL = 0;
let targetTimerR = 0;
let powerupTimer = 0;

// Active power-up effects
let rapidFireEnd = 0;
let shieldEnd = 0;

// Bombs
let bombs = 0;

// Controls
let keysDown = {};
let touchActive = false;
let touchTargetX = null;

// Shop
let shopCursor = 0;
let shopItems = [];

// Difficulty select
let diffCursor = 1;

// === HELPERS ===
function getLane(x) {
  if (x < LANE_L) return 'left';
  if (x > LANE_R) return 'right';
  return 'center';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function distScore(monY) {
  const dist = PLAYER_Y - monY;
  const maxDist = PLAYER_Y;
  return Math.max(1, Math.floor((dist / maxDist) * 10));
}

function timeRamp() { return Math.floor(levelTime / 10000) * 0.1; }
function diffSpeed() { return DIFF_SPEED_MULT[difficulty]; }
function monsterHp(lvl) { return 1 + Math.floor(lvl * 0.5); }
function monsterSpeed(lvl) { return (0.5 + lvl * 0.05 + timeRamp()) * diffSpeed(); }
function curRowSpawnInterval(lvl) { return Math.max(150, (600 - lvl * 30) / (1 + timeRamp())); }
function monstersPerRow(lvl) { return Math.min(14, 10 + Math.floor(lvl / 3)); }
function rowFillRate(lvl) { return Math.min(0.95, 0.75 + lvl * 0.02); }
function bossHp(lvl) { return 40 + lvl * 40; }
function bossSpeed(lvl) { return (0.2 + lvl * 0.02 + timeRamp() * 0.5) * diffSpeed(); }
function bossInterval(lvl) { return Math.max(8000, 25000 - lvl * 1200); }

function totalMaxHp() { return 100 + upgrades.hp * 25; }
function bulletDamage() { return 1 + upgrades.damage * 0.5; }
function gateMaxHp() { return 50 + upgrades.gateDur * 30; }
function startingShooters() { return 1 + upgrades.starters; }

// === SPRITES ===
function drawSoldier(x, y, scale) {
  const s = scale || 1;
  ctx.fillStyle = '#2d5a1e';
  ctx.fillRect(x - 5 * s, y - 4 * s, 10 * s, 14 * s);
  ctx.fillStyle = '#3a7a28';
  ctx.fillRect(x - 3 * s, y - 10 * s, 6 * s, 6 * s);
  ctx.fillStyle = '#888';
  ctx.fillRect(x - 1 * s, y - 18 * s, 2 * s, 10 * s);
  ctx.fillStyle = '#ffcc88';
  ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 3 * s);
}

function drawMonster(x, y, hp, maxHp) {
  const ratio = hp / maxHp;
  ctx.fillStyle = `rgb(${180 + 40 * ratio}, ${40}, ${40})`;
  ctx.fillRect(x - 7, y - 7, 14, 14);
  ctx.fillStyle = '#ff0';
  ctx.fillRect(x - 4, y - 4, 3, 3);
  ctx.fillRect(x + 1, y - 4, 3, 3);
  ctx.fillStyle = '#400';
  ctx.fillRect(x - 3, y + 1, 6, 2);
  if (ratio < 1) {
    ctx.fillStyle = '#300';
    ctx.fillRect(x - 7, y - 10, 14, 2);
    ctx.fillStyle = '#f00';
    ctx.fillRect(x - 7, y - 10, 14 * ratio, 2);
  }
}

function drawBoss(x, y, hp, maxHp) {
  const ratio = hp / maxHp;
  ctx.fillStyle = '#8822aa';
  ctx.fillRect(x - 18, y - 18, 36, 36);
  ctx.fillStyle = '#aa44cc';
  ctx.fillRect(x - 14, y - 14, 28, 28);
  ctx.fillStyle = '#ff0';
  ctx.fillRect(x - 10, y - 8, 6, 6);
  ctx.fillRect(x + 4, y - 8, 6, 6);
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x - 8, y + 4, 16, 4);
  ctx.fillStyle = '#300';
  ctx.fillRect(x - 18, y - 24, 36, 4);
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(x - 18, y - 24, 36 * ratio, 4);
}

function drawTarget(t) {
  if (t.type === 'recruit') {
    ctx.fillStyle = '#2266cc';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#44aaff';
    ctx.fillRect(t.x - 3, t.y - 8, 6, 6);
    ctx.fillRect(t.x - 5, t.y - 2, 10, 8);
    const ratio = t.hp / t.maxHp;
    if (ratio < 1) {
      ctx.fillStyle = '#003';
      ctx.fillRect(t.x - 12, t.y - 16, 24, 3);
      ctx.fillStyle = '#44f';
      ctx.fillRect(t.x - 12, t.y - 16, 24 * ratio, 3);
    }
  } else {
    ctx.fillStyle = '#cc6622';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8844';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 8);
    ctx.lineTo(t.x + 6, t.y + 4);
    ctx.lineTo(t.x - 6, t.y + 4);
    ctx.fill();
    const ratio = t.hp / t.maxHp;
    if (ratio < 1) {
      ctx.fillStyle = '#330';
      ctx.fillRect(t.x - 12, t.y - 16, 24, 3);
      ctx.fillStyle = '#f80';
      ctx.fillRect(t.x - 12, t.y - 16, 24 * ratio, 3);
    }
  }
}

// === PARTICLES ===
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      life: 20 + Math.random() * 20,
      color
    });
  }
}

// === INIT ===
function initLevel() {
  player.x = W / 2;
  player.shooters = startingShooters();
  player.hp = totalMaxHp();
  fireTimer = 0;
  bullets = [];
  monsters = [];
  targets = [];
  particles = [];
  powerups = [];
  gates = [];
  monsterSpawnTimer = 0;
  bossSpawnTimer = bossInterval(level);
  targetTimerL = 3000;
  targetTimerR = 3000;
  powerupTimer = 15000;
  rapidFireEnd = 0;
  shieldEnd = 0;
  levelTime = 0;
  bossesKilledThisLevel = 0;
}

function initRun() {
  score = 0;
  money = 0;
  lives = 3;
  level = 1;
  bombs = 0;
  upgrades = { damage: 0, hp: 0, starters: 0, gateDur: 0, powerRapid: false, powerShield: false };
  initLevel();
}

// === SPAWNING ===
function spawnMonsterRow() {
  const laneStart = LANE_L + 8;
  const laneEnd = LANE_R - 8;
  const laneW = laneEnd - laneStart;
  const count = monstersPerRow(level);
  const spacing = laneW / count;
  const speed = monsterSpeed(level) * (0.9 + Math.random() * 0.2);
  const fill = rowFillRate(level);
  const hp = monsterHp(level);

  for (let i = 0; i < count; i++) {
    if (Math.random() > fill) continue;
    monsters.push({
      x: laneStart + spacing * (i + 0.5) + (Math.random() - 0.5) * 3,
      y: -10 + (Math.random() - 0.5) * 4,
      hp,
      maxHp: hp,
      speed,
      boss: false,
      hitGate: false,
      w: 14, h: 14
    });
  }
}

function spawnBoss() {
  const laneCenter = LANE_L + (LANE_R - LANE_L) / 2;
  monsters.push({
    x: laneCenter,
    y: -30,
    hp: bossHp(level),
    maxHp: bossHp(level),
    speed: bossSpeed(level),
    boss: true,
    hitGate: false,
    w: 36, h: 36
  });
}

function spawnTarget(type) {
  const lane = type === 'recruit' ? 'left' : 'right';
  const x = lane === 'left'
    ? LANE_L / 2
    : LANE_R + (W - LANE_R) / 2;
  const y = 150 + Math.random() * 350;
  const hp = type === 'recruit' ? 5 + level : 3 + Math.floor(level / 2);
  targets.push({ type, x, y, hp, maxHp: hp, lane });
}

function spawnPowerup() {
  if (!upgrades.powerRapid && !upgrades.powerShield) return;
  const types = [];
  if (upgrades.powerRapid) types.push('rapid');
  if (upgrades.powerShield) types.push('shield');
  const type = types[Math.floor(Math.random() * types.length)];
  const laneCenter = LANE_L + (LANE_R - LANE_L) / 2;
  const laneW = LANE_R - LANE_L - 40;
  powerups.push({
    x: laneCenter + (Math.random() - 0.5) * laneW,
    y: -10,
    type,
    speed: 0.8
  });
}

function spawnGate(bossY) {
  const y = clamp(bossY, 100, H * 0.6);
  gates.push({
    y,
    hp: gateMaxHp(),
    maxHp: gateMaxHp(),
    active: false,
    multiplier: 1.5 + bossesKilledThisLevel * 0.5
  });
}

// === UPDATE ===
function update(dt) {
  levelTime += dt;
  const elapsed = levelTime;
  const duration = levelDuration * 1000;

  // Check level complete
  if (elapsed >= duration) {
    gameState = 'levelclear';
    setMessage('LEVEL ' + level + ' CLEAR!');
    return;
  }

  // Player movement
  let moveDir = 0;
  if (keysDown['ArrowLeft'] || keysDown['KeyA']) moveDir = -1;
  if (keysDown['ArrowRight'] || keysDown['KeyD']) moveDir = 1;

  if (touchActive && touchTargetX !== null) {
    const diff = touchTargetX - player.x;
    if (Math.abs(diff) > 2) moveDir = Math.sign(diff);
    else moveDir = 0;
  }

  if (controlMode === 'tilt' && tiltGamma !== null) {
    if (Math.abs(tiltGamma) > 8) moveDir = Math.sign(tiltGamma);
  }

  player.x = clamp(player.x + moveDir * PLAYER_SPEED, 10, W - 10);

  // Auto-fire from each shooter's position
  const fireInterval = (rapidFireEnd > elapsed) ? BASE_FIRE_INTERVAL / 2 : BASE_FIRE_INTERVAL;
  fireTimer -= dt;
  if (fireTimer <= 0) {
    fireTimer = fireInterval;
    const lane = getLane(player.x);
    const positions = getShooterPositions(player.x, PLAYER_Y, player.shooters);
    for (const sp of positions) {
      bullets.push({
        x: sp.x + (Math.random() - 0.5) * 2,
        y: sp.y - 18,
        lane
      });
    }
  }

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].y -= BULLET_SPEED;
    if (bullets[i].y < -10) bullets.splice(i, 1);
  }

  // Spawn monster rows
  monsterSpawnTimer -= dt;
  if (monsterSpawnTimer <= 0) {
    monsterSpawnTimer = curRowSpawnInterval(level);
    spawnMonsterRow();
  }

  // Spawn boss
  bossSpawnTimer -= dt;
  if (bossSpawnTimer <= 0) {
    bossSpawnTimer = bossInterval(level);
    spawnBoss();
  }

  // Spawn targets
  const hasLeftTarget = targets.some(t => t.type === 'recruit');
  const hasRightTarget = targets.some(t => t.type === 'pushback');
  targetTimerL -= dt;
  targetTimerR -= dt;
  if (!hasLeftTarget && targetTimerL <= 0) {
    spawnTarget('recruit');
    targetTimerL = 6000 + Math.random() * 4000;
  }
  if (!hasRightTarget && targetTimerR <= 0) {
    spawnTarget('pushback');
    targetTimerR = 5000 + Math.random() * 3000;
  }

  // Spawn powerups
  if (upgrades.powerRapid || upgrades.powerShield) {
    powerupTimer -= dt;
    if (powerupTimer <= 0) {
      spawnPowerup();
      powerupTimer = 12000 + Math.random() * 8000;
    }
  }

  // Update monsters
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    const prevY = m.y;
    m.y += m.speed;

    // Gate collision — trigger once per gate when monster crosses its line
    for (const g of gates) {
      if (g.hp <= 0) continue;
      const gateKey = 'hitGate_' + g.y;
      if (!m[gateKey] && prevY < g.y && m.y >= g.y) {
        m[gateKey] = true;
        g.hp -= m.boss ? 10 : 1;
        if (g.hp <= 0) {
          g.hp = 0;
          g.active = false;
          spawnParticles(m.x, g.y, '#00aaaa', 10);
        }
      }
    }

    // Monster reaches player line — trigger once when crossing
    if (prevY < PLAYER_Y + 10 && m.y >= PLAYER_Y + 10) {
      if (shieldEnd <= elapsed) {
        const dmg = m.boss ? 40 : 10;
        takeDamage(dmg);
      }
      spawnParticles(m.x, PLAYER_Y, '#ff4444', 3);
      monsters.splice(i, 1);
      continue;
    }

    // Remove if off screen
    if (m.y > H + 20) {
      monsters.splice(i, 1);
      continue;
    }
  }

  // Gate activation + self-repair — active when no monsters past it
  for (const g of gates) {
    const clear = !monsters.some(mon => mon.y > g.y);
    g.active = clear && g.hp > 0;
    if (clear && g.hp < g.maxHp) {
      g.hp = Math.min(g.maxHp, g.hp + 0.05);
      if (g.hp > 0) g.active = true;
    }
  }

  // Update powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    powerups[i].y += powerups[i].speed;
    if (powerups[i].y > H + 10) powerups.splice(i, 1);
  }

  // Bullet vs monster collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (b.lane !== 'center') continue;
    let hit = false;
    for (let mi = monsters.length - 1; mi >= 0; mi--) {
      const m = monsters[mi];
      if (Math.abs(b.x - m.x) < m.w / 2 + 3 && Math.abs(b.y - m.y) < m.h / 2 + 3) {
        let dmg = bulletDamage();
        for (const g of gates) {
          if (g.active && m.y < g.y) dmg *= g.multiplier;
        }
        m.hp -= dmg;
        hit = true;
        if (m.hp <= 0) {
          const pts = distScore(m.y) * (m.boss ? 10 : 1);
          score += pts;
          money += pts;
          spawnParticles(m.x, m.y, m.boss ? '#ff00ff' : '#ff4444', m.boss ? 20 : 8);
          if (m.boss) {
            bossesKilledThisLevel++;
            spawnGate(m.y);
          }
          monsters.splice(mi, 1);
        }
        break;
      }
    }
    if (hit) bullets.splice(bi, 1);
  }

  // Bullet vs powerup collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (b.lane !== 'center') continue;
    for (let pi = powerups.length - 1; pi >= 0; pi--) {
      const p = powerups[pi];
      if (Math.abs(b.x - p.x) < 12 && Math.abs(b.y - p.y) < 12) {
        if (p.type === 'rapid') rapidFireEnd = elapsed + 5000;
        if (p.type === 'shield') shieldEnd = elapsed + 3000;
        spawnParticles(p.x, p.y, p.type === 'rapid' ? '#ffff00' : '#00ffff', 12);
        powerups.splice(pi, 1);
        bullets.splice(bi, 1);
        break;
      }
    }
  }

  // Bullet vs target collision
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    if (b.lane === 'center') continue;
    let hit = false;
    for (let ti = targets.length - 1; ti >= 0; ti--) {
      const t = targets[ti];
      if (b.lane === 'left' && t.type !== 'recruit') continue;
      if (b.lane === 'right' && t.type !== 'pushback') continue;
      if (Math.abs(b.x - t.x) < 14 && Math.abs(b.y - t.y) < 14) {
        t.hp -= bulletDamage();
        hit = true;
        if (t.hp <= 0) {
          if (t.type === 'recruit') {
            player.shooters++;
            player.hp += totalMaxHp();
            spawnParticles(t.x, t.y, '#4488ff', 15);
          } else {
            pushHordeBack(80 + level * 5);
            spawnParticles(t.x, t.y, '#ff8844', 15);
          }
          targets.splice(ti, 1);
        }
        break;
      }
    }
    if (hit) bullets.splice(bi, 1);
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Update HUD
  scoreVal.textContent = score;
  livesVal.textContent = lives;
  shootersVal.textContent = player.shooters;
  bombVal.textContent = bombs;
}

function takeDamage(amount) {
  player.hp -= amount;
  while (player.hp <= 0 && player.shooters > 1) {
    player.shooters--;
    player.hp += totalMaxHp();
  }
  if (player.hp <= 0) {
    player.hp = 0;
    lives--;
    if (lives <= 0) {
      gameState = 'gameover';
      setMessage('GAME OVER');
    } else {
      gameState = 'dying';
      setMessage('YOU FELL! ' + lives + ' LIVES LEFT');
    }
  }
}

function useBomb() {
  if (bombs <= 0 || gameState !== 'playing') return;
  bombs--;
  for (const m of monsters) {
    const pts = distScore(m.y) * (m.boss ? 10 : 1);
    score += pts;
    money += pts;
    spawnParticles(m.x, m.y, m.boss ? '#ff00ff' : '#ff8844', m.boss ? 15 : 4);
  }
  monsters = [];
  spawnParticles(W / 2, H / 2, '#ffff00', 40);
  spawnParticles(W / 2, H / 2, '#ff4400', 40);
}

function pushHordeBack(amount) {
  for (const m of monsters) {
    m.y -= amount;
    if (m.y < -m.h) m.y = -m.h;
    for (const g of gates) {
      if (m.y < g.y) m['hitGate_' + g.y] = false;
    }
  }
}

// === RENDER ===
function render() {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);

  if (gameState === 'title') { renderTitle(); return; }
  if (gameState === 'highscore') { renderHighScores(); return; }
  if (gameState === 'nameentry') { renderNameEntry(); return; }
  if (gameState === 'shop') { renderShop(); return; }
  if (gameState === 'diffselect') { renderDiffSelect(); return; }

  renderGame();

  if (gameState === 'levelclear') renderOverlayText('LEVEL ' + level + ' CLEAR!', '#00ff44', 'PRESS SPACE');
  if (gameState === 'dying') renderOverlayText('LOST A LIFE!', '#ff4444', 'PRESS SPACE TO RETRY');
  if (gameState === 'gameover') renderOverlayText('GAME OVER', '#ff2200', 'SCORE: ' + score + '  PRESS SPACE');
}

function renderGame() {
  // Lane backgrounds
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(LANE_L, 0, LANE_R - LANE_L, H);

  const playerLane = getLane(player.x);
  if (playerLane === 'left') {
    ctx.fillStyle = 'rgba(40, 60, 120, 0.15)';
    ctx.fillRect(0, 0, LANE_L, H);
  } else if (playerLane === 'right') {
    ctx.fillStyle = 'rgba(120, 60, 30, 0.15)';
    ctx.fillRect(LANE_R, 0, W - LANE_R, H);
  }

  // Lane labels
  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#223';
  ctx.fillText('RECRUIT', LANE_L / 2, 20);
  ctx.fillText('PUSH', LANE_R + (W - LANE_R) / 2, 15);
  ctx.fillText('BACK', LANE_R + (W - LANE_R) / 2, 25);

  // Walls
  ctx.fillStyle = '#334';
  ctx.fillRect(LANE_L - WALL_W / 2, 0, WALL_W, H);
  ctx.fillRect(LANE_R - WALL_W / 2, 0, WALL_W, H);

  // Gates
  for (const g of gates) {
    const gateCol = g.active ? '#00ffff' : (g.hp > 0 ? '#446' : '#221');
    ctx.fillStyle = gateCol;
    ctx.fillRect(LANE_L, g.y, LANE_R - LANE_L, 6);
    if (g.active) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.06)';
      ctx.fillRect(LANE_L, g.y + 6, LANE_R - LANE_L, PLAYER_Y - g.y);
      ctx.font = '7px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0ff';
      ctx.fillText('x' + g.multiplier.toFixed(1), LANE_L + 30, g.y - 4);
    }
    if (g.hp > 0) {
      const r = g.hp / g.maxHp;
      ctx.fillStyle = '#003';
      ctx.fillRect(LANE_L, g.y - 3, LANE_R - LANE_L, 2);
      ctx.fillStyle = g.active ? '#0ff' : '#446';
      ctx.fillRect(LANE_L, g.y - 3, (LANE_R - LANE_L) * r, 2);
    }
  }

  // Targets
  for (const t of targets) drawTarget(t);

  // Monsters
  for (const m of monsters) {
    if (m.boss) drawBoss(m.x, m.y, m.hp, m.maxHp);
    else drawMonster(m.x, m.y, m.hp, m.maxHp);
  }

  // Powerups
  for (const p of powerups) {
    ctx.fillStyle = p.type === 'rapid' ? '#ffdd00' : '#00ddff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '7px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(p.type === 'rapid' ? 'R' : 'S', p.x, p.y + 3);
  }

  // Bullets
  ctx.fillStyle = '#ffff44';
  for (const b of bullets) {
    ctx.fillRect(b.x - 1, b.y - 3, 2, 6);
  }

  // Player squad
  const positions = getShooterPositions(player.x, PLAYER_Y, player.shooters);
  for (let i = positions.length - 1; i >= 0; i--) {
    drawSoldier(positions[i].x, positions[i].y, i === 0 ? 1 : 0.8);
  }

  // Shield effect
  if (shieldEnd > levelTime) {
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, PLAYER_Y, 25, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Rapid fire indicator
  if (rapidFireEnd > levelTime) {
    ctx.fillStyle = '#ff0';
    ctx.font = '6px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('RAPID!', player.x, PLAYER_Y + 24);
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life / 40;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Health bar at bottom
  const barW = W - 20;
  const barH = 8;
  const barY = H - 12;
  const fullHp = player.shooters * totalMaxHp();
  const currentHp = (player.shooters - 1) * totalMaxHp() + player.hp;
  ctx.fillStyle = '#200';
  ctx.fillRect(10, barY, barW, barH);
  const hpRatio = currentHp / Math.max(1, fullHp);
  ctx.fillStyle = hpRatio > 0.5 ? '#0a0' : hpRatio > 0.25 ? '#aa0' : '#a00';
  ctx.fillRect(10, barY, barW * hpRatio, barH);
  for (let i = 1; i < player.shooters; i++) {
    const segX = 10 + (barW / player.shooters) * i;
    ctx.fillStyle = '#000';
    ctx.fillRect(segX - 1, barY, 2, barH);
  }

  // Timer
  const remaining = Math.max(0, levelDuration - levelTime / 1000);
  const min = Math.floor(remaining / 60);
  const sec = Math.floor(remaining % 60);
  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = remaining < 10 ? '#f00' : '#aaa';
  ctx.fillText(min + ':' + sec.toString().padStart(2, '0'), W / 2, 16);

  // Level indicator
  ctx.fillStyle = '#555';
  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText('LVL ' + level, 4, 16);

  // Money
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('$' + money, W - 4, 16);
}

function getShooterPositions(x, y, count) {
  const pos = [{ x, y }];
  if (count <= 1) return pos;
  const ROW_H = 7;
  const COL_W = 9;
  const cols = Math.round((W * 0.2) / COL_W);
  let placed = 1;
  let row = 0;
  while (placed < count) {
    row++;
    const offset = (row % 2 === 0) ? COL_W / 2 : 0;
    const rowY = y + row * ROW_H;
    // Fill from center outward: center, left, right, left, right...
    const centerX = x + offset;
    const order = [0];
    for (let s = 1; s <= Math.floor(cols / 2); s++) {
      order.push(-s);
      order.push(s);
    }
    for (const o of order) {
      if (placed >= count) break;
      pos.push({ x: centerX + o * COL_W, y: rowY });
      placed++;
    }
  }
  return pos;
}

function renderOverlayText(title, color, sub) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '16px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(title, W / 2, H / 2 - 20);
  ctx.font = '8px "Press Start 2P"';
  ctx.fillStyle = '#aaa';
  ctx.fillText(sub, W / 2, H / 2 + 20);
}

// === TITLE SCREEN ===
function renderTitle() {
  ctx.font = '32px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FF2200';
  ctx.shadowColor = '#FF2200';
  ctx.shadowBlur = 30;
  ctx.fillText('HORDE', W / 2, 120);
  ctx.shadowBlur = 0;

  ctx.font = '8px "Press Start 2P"';
  ctx.fillStyle = '#888';
  ctx.fillText('SURVIVE THE SWARM', W / 2, 160);

  ctx.fillStyle = '#FFD700';
  ctx.fillText('PRESS SPACE TO START', W / 2, H / 2);
  ctx.fillStyle = '#666';
  ctx.fillText('OR TAP SCREEN', W / 2, H / 2 + 20);

  // Show high scores if any
  if (leaderboard.length > 0) {
    ctx.fillStyle = '#0ff';
    ctx.fillText('HIGH SCORES', W / 2, H / 2 + 60);
    ctx.font = '7px "Press Start 2P"';
    for (let i = 0; i < Math.min(5, leaderboard.length); i++) {
      const e = leaderboard[i];
      ctx.fillStyle = i === 0 ? '#FFD700' : '#888';
      ctx.fillText((i + 1) + '. ' + e.name + ' ' + e.score, W / 2, H / 2 + 85 + i * 16);
    }
  }
}

// === DIFFICULTY SELECT ===
function renderDiffSelect() {
  ctx.font = '14px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FF2200';
  ctx.fillText('SELECT DIFFICULTY', W / 2, 100);

  for (let i = 0; i < 3; i++) {
    const y = 200 + i * 60;
    const selected = i === diffCursor;
    ctx.fillStyle = selected ? '#FFD700' : '#444';
    ctx.font = (selected ? '12' : '10') + 'px "Press Start 2P"';
    ctx.fillText(DIFF_NAMES[i], W / 2, y);
    ctx.font = '7px "Press Start 2P"';
    ctx.fillStyle = selected ? '#aaa' : '#333';
    ctx.fillText(DIFF_TIMES[i] + ' SECONDS PER LEVEL', W / 2, y + 18);
  }

  ctx.font = '7px "Press Start 2P"';
  ctx.fillStyle = '#666';
  ctx.fillText('↑↓ SELECT   SPACE CONFIRM', W / 2, H - 50);
  ctx.fillText('SWIPE ↑↓   TAP CONFIRM', W / 2, H - 36);
}

// === SHOP ===
function buildShopItems() {
  shopItems = [
    { name: 'DAMAGE UP', desc: 'x' + (1 + (upgrades.damage + 1) * 0.5).toFixed(1) + ' DMG', cost: 3000 + upgrades.damage * 3000, key: 'damage' },
    { name: 'MAX HP UP', desc: '+25 HP/SHOOTER', cost: 2000 + upgrades.hp * 2000, key: 'hp' },
    { name: 'EXTRA STARTER', desc: '+1 START SHOOTER', cost: 5000 + upgrades.starters * 5000, key: 'starters' },
    { name: 'GATE ARMOR', desc: '+30 GATE HP', cost: 2500 + upgrades.gateDur * 2500, key: 'gateDur' },
  ];
  if (!upgrades.powerRapid) {
    shopItems.push({ name: 'UNLOCK RAPID', desc: 'RAPID FIRE DROPS', cost: 4000, key: 'powerRapid' });
  }
  if (!upgrades.powerShield) {
    shopItems.push({ name: 'UNLOCK SHIELD', desc: 'SHIELD DROPS', cost: 4000, key: 'powerShield' });
  }
  shopItems.push({ name: 'BOMB', desc: '+1 BOMB (B KEY / 💣 BTN)', cost: 2000 + bombs * 2000, key: 'bomb' });
  shopItems.push({ name: 'EXTRA LIFE', desc: '+1 LIFE', cost: 50000 + lives * 25000, key: 'extraLife' });
  shopItems.push({ name: '>>> CONTINUE >>>', desc: '', cost: 0, key: 'continue' });
}

function buyItem(item) {
  if (item.key === 'continue') {
    level++;
    initLevel();
    gameState = 'playing';
    setMessage('LEVEL ' + level);
    return;
  }
  if (item.cost > money) return;
  money -= item.cost;
  if (item.key === 'damage') upgrades.damage++;
  else if (item.key === 'hp') upgrades.hp++;
  else if (item.key === 'starters') upgrades.starters++;
  else if (item.key === 'gateDur') upgrades.gateDur++;
  else if (item.key === 'powerRapid') upgrades.powerRapid = true;
  else if (item.key === 'powerShield') upgrades.powerShield = true;
  else if (item.key === 'bomb') bombs++;
  else if (item.key === 'extraLife') lives++;
  buildShopItems();
}

function renderShop() {
  ctx.font = '12px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('SHOP', W / 2, 40);

  ctx.font = '8px "Press Start 2P"';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('$' + money, W / 2, 62);

  for (let i = 0; i < shopItems.length; i++) {
    const item = shopItems[i];
    const y = 100 + i * 42;
    const selected = i === shopCursor;
    const canAfford = item.cost <= money || item.cost === 0;

    ctx.fillStyle = selected ? (canAfford ? '#FFD700' : '#884400') : '#444';
    ctx.font = (selected ? '9' : '8') + 'px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillText(item.name, 30, y);

    if (item.cost > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = canAfford ? '#0f0' : '#a00';
      ctx.fillText('$' + item.cost, W - 30, y);
    }

    ctx.font = '6px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#666';
    ctx.fillText(item.desc, 30, y + 14);
  }

  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#555';
  ctx.fillText('↑↓ SELECT   SPACE BUY', W / 2, H - 42);
  ctx.fillText('SWIPE ↑↓   SWIPE → BUY', W / 2, H - 28);
}

// === LEADERBOARD ===
let leaderboard = JSON.parse(localStorage.getItem('horde-leaderboard') || '[]');
let lastScore = 0;
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
let nameChars = ['A', 'A', 'A'], nameCursor = 0;

function saveLeaderboard() { localStorage.setItem('horde-leaderboard', JSON.stringify(leaderboard)); }
function qualifiesForLeaderboard(s) {
  return s > 0 && (leaderboard.length < 10 || s > leaderboard[leaderboard.length - 1].score);
}
function addToLeaderboard(name, s) {
  leaderboard.push({ name, score: s });
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 10) leaderboard.length = 10;
  saveLeaderboard();
}
function cycleNameChar(dir) {
  const i = NAME_CHARS.indexOf(nameChars[nameCursor]);
  nameChars[nameCursor] = NAME_CHARS[(i + dir + NAME_CHARS.length) % NAME_CHARS.length];
}
function advanceNameCursor(dir) {
  if (dir > 0 && nameCursor === 2) { confirmName(); return; }
  nameCursor = Math.max(0, Math.min(2, nameCursor + dir));
}
function confirmName() {
  const name = nameChars.join('').trimEnd() || '???';
  localStorage.setItem('horde-last-name', name);
  addToLeaderboard(name, lastScore);
  gameState = 'highscore';
}

function renderNameEntry() {
  ctx.font = '12px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('NEW HIGH SCORE!', W / 2, 100);

  ctx.font = '16px "Press Start 2P"';
  ctx.fillStyle = '#fff';
  ctx.fillText('' + lastScore, W / 2, 140);

  ctx.font = '10px "Press Start 2P"';
  ctx.fillStyle = '#aaa';
  ctx.fillText('ENTER YOUR NAME', W / 2, 200);

  for (let i = 0; i < 3; i++) {
    const x = W / 2 - 30 + i * 30;
    ctx.fillStyle = i === nameCursor ? '#FFD700' : '#888';
    ctx.font = '20px "Press Start 2P"';
    ctx.fillText(nameChars[i], x, 260);
    if (i === nameCursor) {
      ctx.fillRect(x - 10, 268, 20, 3);
    }
  }

  ctx.font = '7px "Press Start 2P"';
  ctx.fillStyle = '#555';
  ctx.fillText('↑↓ CHANGE   ←→ MOVE   ENTER CONFIRM', W / 2, 320);
}

function renderHighScores() {
  ctx.font = '14px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0ff';
  ctx.fillText('HIGH SCORES', W / 2, 80);

  ctx.font = '8px "Press Start 2P"';
  for (let i = 0; i < leaderboard.length; i++) {
    const e = leaderboard[i];
    const y = 120 + i * 22;
    ctx.fillStyle = i === 0 ? '#FFD700' : i < 3 ? '#ccc' : '#666';
    ctx.textAlign = 'left';
    ctx.fillText((i + 1) + '.', 80, y);
    ctx.fillText(e.name, 120, y);
    ctx.textAlign = 'right';
    ctx.fillText('' + e.score, W - 80, y);
  }

  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('PRESS SPACE', W / 2, H - 40);
}

// === CONTROLS ===
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let controlMode = isMobile ? 'swipe' : 'keys';
let tiltGamma = null;

const modeBtn = document.getElementById('mode-btn');
const helpBtn = document.getElementById('help-btn');
const helpOverlay = document.getElementById('help-overlay');
const helpModeHintBtn = document.getElementById('mode-hint-btn');

// Touch — swipe tracking
let swipeStart = null;

document.addEventListener('touchstart', e => {
  if (helpOverlay.contains(e.target)) return;
  if (e.target.closest('button')) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  swipeStart = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY,
    cx: (e.touches[0].clientX - rect.left) * scaleX,
    cy: (e.touches[0].clientY - rect.top) * scaleY
  };
  if (gameState === 'playing') {
    touchActive = true;
    touchTargetX = swipeStart.cx;
  }
}, { passive: false });

document.addEventListener('touchmove', e => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  if (gameState === 'playing' && touchActive) {
    const rect = canvas.getBoundingClientRect();
    touchTargetX = (e.touches[0].clientX - rect.left) * (W / rect.width);
  }
}, { passive: false });

document.addEventListener('touchend', e => {
  if (helpOverlay.contains(e.target)) return;
  if (e.target.closest('button')) return;
  e.preventDefault();
  if (helpOpen) { touchActive = false; swipeStart = null; return; }

  const SWIPE_THRESH = 30;
  let dx = 0, dy = 0;
  if (swipeStart) {
    dx = e.changedTouches[0].clientX - swipeStart.x;
    dy = e.changedTouches[0].clientY - swipeStart.y;
  }
  const isTap = Math.abs(dx) < SWIPE_THRESH && Math.abs(dy) < SWIPE_THRESH;
  const isVertical = Math.abs(dy) > Math.abs(dx);
  const isHorizontal = Math.abs(dx) > Math.abs(dy);

  if (gameState === 'nameentry') {
    if (isTap) {
      advanceNameCursor(1);
    } else if (isVertical) {
      cycleNameChar(dy > 0 ? 1 : -1);
    } else if (isHorizontal) {
      advanceNameCursor(dx > 0 ? 1 : -1);
    }
  } else if (gameState === 'diffselect') {
    if (isTap) {
      handleStart();
    } else if (isVertical) {
      if (dy > 0) diffCursor = Math.min(2, diffCursor + 1);
      else diffCursor = Math.max(0, diffCursor - 1);
    }
  } else if (gameState === 'shop') {
    if (isHorizontal && dx > SWIPE_THRESH) {
      handleStart();
    } else if (isVertical) {
      if (dy > 0) shopCursor = Math.min(shopItems.length - 1, shopCursor + 1);
      else shopCursor = Math.max(0, shopCursor - 1);
    } else if (isTap) {
      handleStart();
    }
  } else if (gameState !== 'playing') {
    if (isTap) handleStart();
  }

  touchActive = false;
  touchTargetX = null;
  swipeStart = null;
}, { passive: false });

// Keys
document.addEventListener('keydown', e => {
  keysDown[e.code] = true;
  if (helpOpen) {
    if (e.code === 'Escape') { closeHelp(); e.preventDefault(); }
    return;
  }
  if (e.code === 'KeyB' && gameState === 'playing') {
    useBomb();
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    handleStart();
    return;
  }
  if (gameState === 'nameentry') {
    e.preventDefault();
    if (e.code === 'ArrowUp' || e.code === 'KeyW') cycleNameChar(-1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') cycleNameChar(1);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') advanceNameCursor(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') advanceNameCursor(1);
    return;
  }
  if (gameState === 'diffselect') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') diffCursor = Math.max(0, diffCursor - 1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') diffCursor = Math.min(2, diffCursor + 1);
    return;
  }
  if (gameState === 'shop') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') shopCursor = Math.max(0, shopCursor - 1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') shopCursor = Math.min(shopItems.length - 1, shopCursor + 1);
    return;
  }
});

document.addEventListener('keyup', e => {
  keysDown[e.code] = false;
});

// Tilt
let tiltPermissionGranted = false;
let tiltEventReceived = false, tiltCheckTimer = null;
const tiltIndicator = document.getElementById('tilt-indicator');

async function requestTiltPermission() {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { return (await DeviceOrientationEvent.requestPermission()) === 'granted'; }
    catch { return false; }
  }
  return true;
}

function handleOrientation(e) {
  tiltEventReceived = true;
  tiltGamma = e.gamma ?? 0;
  if (controlMode === 'tilt') {
    tiltIndicator.textContent = `g${tiltGamma.toFixed(0)}`;
  }
}
window.addEventListener('deviceorientation', handleOrientation, true);
window.addEventListener('deviceorientationabsolute', handleOrientation, true);

// Mode button
const MODES = ['keys', 'swipe', 'tilt'];
const MODE_LABELS = { keys: '⌨ KEYS', swipe: '👆 TOUCH', tilt: '📱 TILT' };
modeBtn.textContent = MODE_LABELS[controlMode];

modeBtn.addEventListener('click', async () => {
  const next = MODES[(MODES.indexOf(controlMode) + 1) % MODES.length];
  if (next === 'tilt' && !tiltPermissionGranted) {
    tiltPermissionGranted = await requestTiltPermission();
    if (!tiltPermissionGranted) { setMessage('TILT NOT AVAILABLE'); return; }
  }
  controlMode = next;
  modeBtn.textContent = MODE_LABELS[controlMode];
  modeBtn.classList.toggle('tilt-active', controlMode === 'tilt');
  tiltIndicator.textContent = controlMode === 'tilt' ? 'TILT ACTIVE' : '';
  clearTimeout(tiltCheckTimer);
  if (controlMode === 'tilt') {
    tiltEventReceived = false;
    tiltCheckTimer = setTimeout(() => {
      if (controlMode === 'tilt' && !tiltEventReceived)
        tiltIndicator.textContent = 'TILT BLOCKED';
    }, 2000);
  }
});

// Help modal
let helpOpen = false;
function openHelp() {
  helpOpen = true;
  helpModeHintBtn.textContent = modeBtn.textContent;
  modeBtn.classList.add('help-highlight');
  helpOverlay.classList.add('open');
}
function closeHelp() {
  helpOpen = false;
  modeBtn.classList.remove('help-highlight');
  helpOverlay.classList.remove('open');
}
helpBtn.addEventListener('click', openHelp);
document.getElementById('help-close').addEventListener('click', closeHelp);
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) closeHelp(); });
bombBtn.addEventListener('click', () => useBomb());

// === STATE TRANSITIONS ===
function handleStart() {
  if (gameState === 'title' || gameState === 'highscore') {
    gameState = 'diffselect';
    setMessage('');
    return;
  }
  if (gameState === 'diffselect') {
    difficulty = diffCursor;
    levelDuration = DIFF_TIMES[difficulty];
    initRun();
    gameState = 'playing';
    setMessage('LEVEL 1 - ' + DIFF_NAMES[difficulty]);
    return;
  }
  if (gameState === 'levelclear') {
    shopCursor = 0;
    buildShopItems();
    gameState = 'shop';
    setMessage('');
    return;
  }
  if (gameState === 'shop') {
    buyItem(shopItems[shopCursor]);
    return;
  }
  if (gameState === 'dying') {
    initLevel();
    gameState = 'playing';
    setMessage('LEVEL ' + level + ' - RETRY');
    return;
  }
  if (gameState === 'gameover') {
    lastScore = score;
    if (qualifiesForLeaderboard(score)) {
      nameChars = ['A', 'A', 'A'];
      nameCursor = 0;
      const saved = localStorage.getItem('horde-last-name');
      if (saved && saved.length === 3) nameChars = saved.split('');
      gameState = 'nameentry';
    } else {
      gameState = 'highscore';
    }
    return;
  }
  if (gameState === 'nameentry') {
    return;
  }
}

// === GAME LOOP ===
let lastTime = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = ts - lastTime;
  if (dt < 14) return;
  lastTime = ts;
  if (gameState === 'playing' && !helpOpen) update(dt);
  render();
}

function initGame() {
  const saved = localStorage.getItem('horde-last-name');
  if (saved && saved.length === 3) nameChars = saved.split('');
  gameState = leaderboard.length > 0 ? 'highscore' : 'title';
}

document.fonts.ready.then(() => {
  try { resizeCanvas(); initGame(); requestAnimationFrame(loop); }
  catch (e) { logError('BOOT: ' + e.message); }
}).catch(e => logError('FONTS: ' + e.message));
