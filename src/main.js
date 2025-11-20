import Phaser from 'phaser';

// ---------- GLOBAL STATE ----------
let scenePaused = false;
let readyText;
let pausedText;
let gameOverText;
let currentLevel = 1;

// ---------- CONFIG ----------
const TILE = 48;
const COLS = 28;
const ROWS = 16;
const SCALE_FACTOR = 1.75;
let MAX_SPEED = 210 * SCALE_FACTOR;
let REVERSE_SPEED = 100 * SCALE_FACTOR;
let TURN_SPEED = 240;
let DRIFT_TURN_SPEED = 320;
let DRIFT_GRIP_RECOVERY = 0.027;
let NORMAL_GRIP = 1.0;
let ENEMY_SPEED_BASE = 128 * SCALE_FACTOR;
const ENEMY_SPEED_SCALE = 1.08;
const POWER_DURATION = 6000;
const DOT_SCORE = 10;
const KILL_SCORE = 200;

// ---------- MAZE ----------
const maze = [];
let penTiles = [];
let gateTiles = [];
let playerSpawn = { r: 1, c: 1 };

// ---------- GAME STATE ----------
const width = COLS * TILE;
const height = ROWS * TILE;
let score = 0;
let highScore = 0;
let lives = 3;
let powered = false;
let powerTimer = 0;

let player, cursors, keys, gamepad;
let scoreText, highScoreText, livesText;
let walls, dotsGroup, powerGroup;
let enemies = [];

// ---------- HIGH SCORE HELPERS (TOP-10 WITH INITIALS) ----------
const HIGH_SCORES_KEY = 'lazrdrift_highScores_v1';

// Returns [{ initials: 'IKE', score: 12345 }, ...] sorted desc, max 10
function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(e => e && typeof e.score === 'number' && typeof e.initials === 'string')
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch (e) {
    console.warn('Error loading high scores:', e);
    return [];
  }
}

function saveHighScores(scores) {
  try {
    const cleaned = (scores || [])
      .filter(e => e && typeof e.score === 'number' && typeof e.initials === 'string')
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.warn('Error saving high scores:', e);
  }
}

// Return true if this score belongs somewhere in the top 10
function scoreQualifiesForTable(scoreValue) {
  if (scoreValue <= 0) return false;
  const scores = loadHighScores();
  if (scores.length < 10) return true;
  const lowest = scores[scores.length - 1].score;
  return scoreValue > lowest;
}

// ========================================
// START SCENE
// ========================================
class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
  }

  create() {
    const centerX = width / 2;
    const centerY = height / 2;

    // Title
    this.add.text(centerX, centerY - 150, 'LAZR DRIFT', {
      fontFamily: 'monospace',
      fontSize: '64px',
      color: '#00ffff',
      stroke: '#0088aa',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Menu options
    const menuItems = [
      { text: 'START GAME', action: 'start' },
      { text: 'HOW TO PLAY', action: 'howto' },
      { text: 'HIGH SCORES', action: 'scores' }
    ];

    this.menuTexts = [];
    this.selectedIndex = 0;

    menuItems.forEach((item, index) => {
      const y = centerY + index * 60;
      const txt = this.add.text(centerX, y, item.text, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffffff'
      }).setOrigin(0.5);
      txt.setData('action', item.action);
      this.menuTexts.push(txt);
    });

    this.updateSelection();

    // Keyboard controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,S,ENTER,SPACE');

    // Gamepad
    this.input.gamepad.start();
    this.gamepad = null;

    // Instructions
    this.add.text(centerX, height - 40, 'USE ARROW KEYS/W,S • PRESS ENTER/SPACE TO SELECT', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#888888'
    }).setOrigin(0.5);
  }

  update() {
    // Get gamepad
    if (!this.gamepad && this.input.gamepad.total > 0) {
      this.gamepad = this.input.gamepad.getPad(0);
    }

    // Navigation - up
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || 
        Phaser.Input.Keyboard.JustDown(this.keys.W)) {
      this.selectedIndex = (this.selectedIndex - 1 + this.menuTexts.length) % this.menuTexts.length;
      this.updateSelection();
    }
    
    // Navigation - down
    if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || 
        Phaser.Input.Keyboard.JustDown(this.keys.S)) {
      this.selectedIndex = (this.selectedIndex + 1) % this.menuTexts.length;
      this.updateSelection();
    }

    // Gamepad navigation
    if (this.gamepad) {
      const dpadUp = this.gamepad.buttons[12];
      const dpadDown = this.gamepad.buttons[13];
      
      if (dpadUp && dpadUp.pressed && !this.lastDpadUp) {
        this.selectedIndex = (this.selectedIndex - 1 + this.menuTexts.length) % this.menuTexts.length;
        this.updateSelection();
      }
      if (dpadDown && dpadDown.pressed && !this.lastDpadDown) {
        this.selectedIndex = (this.selectedIndex + 1) % this.menuTexts.length;
        this.updateSelection();
      }
      
      this.lastDpadUp = dpadUp && dpadUp.pressed;
      this.lastDpadDown = dpadDown && dpadDown.pressed;
    }

    // Selection
    const enterPressed = Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || 
                        Phaser.Input.Keyboard.JustDown(this.keys.SPACE);
    
    let gamepadSelect = false;
    if (this.gamepad) {
      const aButton = this.gamepad.buttons[0];
      if (aButton && aButton.pressed && !this.lastAButton) {
        gamepadSelect = true;
      }
      this.lastAButton = aButton && aButton.pressed;
    }

    if (enterPressed || gamepadSelect) {
      const action = this.menuTexts[this.selectedIndex].getData('action');
      
      if (action === 'start') {
        this.scene.start('GameScene');
      } else if (action === 'howto') {
        this.scene.start('HowToScene');
      } else if (action === 'scores') {
        this.scene.start('HighScoresScene');
      }
    }

  }

  updateSelection() {
    this.menuTexts.forEach((txt, index) => {
      if (index === this.selectedIndex) {
        txt.setColor('#ffff00');
        txt.setFontSize('32px');
      } else {
        txt.setColor('#ffffff');
        txt.setFontSize('28px');
      }
    });
  }
}

// ========================================
// HOW TO PLAY SCENE
// ========================================
class HowToScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HowToScene' });
  }

  create() {
    const centerX = width / 2;

    // Title
    this.add.text(centerX, 60, 'HOW TO PLAY', {
      fontFamily: 'monospace',
      fontSize: '42px',
      color: '#00ffff',
      stroke: '#0088aa',
      strokeThickness: 3
    }).setOrigin(0.5);

    // Keyboard controls
    const keyboardText =
      'KEYBOARD CONTROLS\n' +
      '\n' +
      '← / A       : Steer Left\n' +
      '→ / D       : Steer Right\n' +
      '↑ / W       : Accelerate\n' +
      '↓ / S       : Reverse / Brake\n' +
      'SHIFT       : Drift\n' +
      'SPACE       : Pause';

    this.add.text(centerX, 130, keyboardText, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
      align: 'left'
    }).setOrigin(0.5, 0);

    // Gamepad controls
    const gamepadText =
      'GAMEPAD CONTROLS\n' +
      '\n' +
      'D-Pad / Left Stick : Steer\n' +
      'A / Cross          : Accelerate (Button 0)\n' +
      'B / Circle         : Reverse / Brake (Button 1)\n' +
      'LT / RT            : Drift (Triggers 6 / 7)\n' +
      'START              : Pause (Button 9)';

    this.add.text(centerX, 330, gamepadText, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
      align: 'left'
    }).setOrigin(0.5, 0);

    // Navigation hint
    this.add.text(centerX, height - 60,
      'PRESS ESC / BACKSPACE / ENTER / A TO RETURN',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#888888'
      }).setOrigin(0.5);

    // Input setup
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('ESC,BACKSPACE,ENTER,SPACE');

    this.input.gamepad.start();
    this.gamepad = null;
  }

  update() {
    // Get gamepad reference
    if (!this.gamepad && this.input.gamepad.total > 0) {
      this.gamepad = this.input.gamepad.getPad(0);
    }

    const esc = Phaser.Input.Keyboard.JustDown(this.keys.ESC);
    const backspace = Phaser.Input.Keyboard.JustDown(this.keys.BACKSPACE);
    const enter = Phaser.Input.Keyboard.JustDown(this.keys.ENTER);
    const space = Phaser.Input.Keyboard.JustDown(this.keys.SPACE);

    let gamepadBack = false;
    if (this.gamepad) {
      const aButton = this.gamepad.buttons[0];   // A / Cross
      const bButton = this.gamepad.buttons[1];   // B / Circle
      const startButton = this.gamepad.buttons[9]; // Start

      const pressed =
        (aButton && aButton.pressed) ||
        (bButton && bButton.pressed) ||
        (startButton && startButton.pressed);

      if (pressed && !this.lastGamepadPressed) {
        gamepadBack = true;
      }
      this.lastGamepadPressed = pressed;
    }

    if (esc || backspace || enter || space || gamepadBack) {
      this.scene.start('StartScene');
    }
  }
}

// ========================================
// HIGH SCORES SCENE (TOP-10 WITH INITIALS)
// ========================================
class HighScoresScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HighScoresScene' });
  }

  create() {
    const centerX = width / 2;

    this.add.text(centerX, 70, 'HIGH SCORES', {
      fontFamily: 'monospace',
      fontSize: '42px',
      color: '#00ffff',
      stroke: '#0088aa',
      strokeThickness: 3
    }).setOrigin(0.5);

    let scores = loadHighScores();

    // Fallback: if the new table is empty but an old `highScore` exists,
    // show that as a single entry with generic initials.
    if ((!scores || scores.length === 0)) {
      const oldSingle = parseInt(localStorage.getItem('highScore')) || 0;
      if (oldSingle > 0) {
        scores = [{ initials: '---', score: oldSingle }];
      }
    }

    let listText;
    if (!scores || scores.length === 0) {
      listText = 'NO SCORES YET\n\nPLAY A ROUND TO SET ONE!';
    } else {
      listText = 'RANK  SCORE     NAME\n\n';
      scores.forEach((entry, i) => {
        const rank = (i + 1).toString().padStart(2, ' ');
        const scoreStr = entry.score.toString().padStart(7, '0');
        const name = (entry.initials || '???').padEnd(3, ' ');
        listText += `${rank}.  ${scoreStr}   ${name}\n`;
      });
    }

    this.add.text(centerX, 140, listText, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffffff',
      align: 'left'
    }).setOrigin(0.5, 0);

    this.add.text(centerX, height - 60,
      'PRESS ESC / BACKSPACE / ENTER / B / START TO RETURN',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#888888'
      }).setOrigin(0.5);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('ESC,BACKSPACE,ENTER,SPACE');

    this.input.gamepad.start();
    this.gamepad = null;
    this.lastGamepadPressed = false;
  }

  update() {
    if (!this.gamepad && this.input.gamepad.total > 0) {
      this.gamepad = this.input.gamepad.getPad(0);
    }

    const esc = Phaser.Input.Keyboard.JustDown(this.keys.ESC);
    const backspace = Phaser.Input.Keyboard.JustDown(this.keys.BACKSPACE);
    const enter = Phaser.Input.Keyboard.JustDown(this.keys.ENTER);
    const space = Phaser.Input.Keyboard.JustDown(this.keys.SPACE);

    let gamepadBack = false;
    if (this.gamepad) {
      const bButton = this.gamepad.buttons[1];   // B / Circle
      const startButton = this.gamepad.buttons[9]; // Start

      const pressed =
        (bButton && bButton.pressed) ||
        (startButton && startButton.pressed);

      if (pressed && !this.lastGamepadPressed) {
        gamepadBack = true;
      }
      this.lastGamepadPressed = pressed;
    }

    if (esc || backspace || enter || space || gamepadBack) {
      this.scene.start('StartScene');
    }
  }
}

// ========================================
// NAME ENTRY SCENE (3-LETTER INITIALS)
// ========================================
class NameEntryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'NameEntryScene' });
  }

  init(data) {
    this.finalScore = data.score || 0;
  }

  create() {
    const centerX = width / 2;

    this.letters = ['A', 'A', 'A'];
    this.currentIndex = 0;

    this.add.text(centerX, 70, 'NEW HIGH SCORE!', {
      fontFamily: 'monospace',
      fontSize: '36px',
      color: '#00ffff',
      stroke: '#0088aa',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.add.text(centerX, 120, `SCORE: ${this.finalScore}`, {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.initialsText = this.add.text(centerX, 200, this.getInitialsDisplay(), {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#ffff00'
    }).setOrigin(0.5);

    this.add.text(centerX, 260,
      'USE LEFT / RIGHT TO MOVE\nUSE UP / DOWN TO CHANGE LETTER\nPRESS ENTER OR A TO CONFIRM',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#888888',
        align: 'center'
      }).setOrigin(0.5);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('ENTER,SPACE');

    this.input.gamepad.start();
    this.gamepad = null;
    this.lastPadState = {
      up: false,
      down: false,
      left: false,
      right: false,
      a: false
    };
  }

  getInitialsDisplay() {
    return this.letters
      .map((ch, idx) => (idx === this.currentIndex ? `[${ch}]` : ` ${ch} `))
      .join(' ');
  }

  confirmInitials() {
    const initials = this.letters.join('');

    let scores = loadHighScores();
    scores.push({ initials, score: this.finalScore });
    saveHighScores(scores);

    const updated = loadHighScores();
    highScore = updated.length > 0 ? updated[0].score : 0;

    // keep legacy single best in sync for any old code
    localStorage.setItem('highScore', String(highScore));

    this.scene.start('HighScoresScene');
  }

  update() {
    if (!this.gamepad && this.input.gamepad.total > 0) {
      this.gamepad = this.input.gamepad.getPad(0);
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.currentIndex = (this.currentIndex + 2) % 3;
      this.initialsText.setText(this.getInitialsDisplay());
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.currentIndex = (this.currentIndex + 1) % 3;
      this.initialsText.setText(this.getInitialsDisplay());
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.incrementLetter(1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.incrementLetter(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) ||
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.confirmInitials();
    }

    if (this.gamepad) {
      const up = this.gamepad.buttons[12]?.pressed;
      const down = this.gamepad.buttons[13]?.pressed;
      const left = this.gamepad.buttons[14]?.pressed;
      const right = this.gamepad.buttons[15]?.pressed;
      const a = this.gamepad.buttons[0]?.pressed;

      if (left && !this.lastPadState.left) {
        this.currentIndex = (this.currentIndex + 2) % 3;
        this.initialsText.setText(this.getInitialsDisplay());
      }
      if (right && !this.lastPadState.right) {
        this.currentIndex = (this.currentIndex + 1) % 3;
        this.initialsText.setText(this.getInitialsDisplay());
      }
      if (up && !this.lastPadState.up) {
        this.incrementLetter(1);
      }
      if (down && !this.lastPadState.down) {
        this.incrementLetter(-1);
      }
      if (a && !this.lastPadState.a) {
        this.confirmInitials();
      }

      this.lastPadState = { up, down, left, right, a };
    }
  }

  incrementLetter(dir) {
    const code = this.letters[this.currentIndex].charCodeAt(0);
    let newCode = code + dir;
    if (newCode > 90) newCode = 65;
    if (newCode < 65) newCode = 90;
    this.letters[this.currentIndex] = String.fromCharCode(newCode);
    this.initialsText.setText(this.getInitialsDisplay());
  }
}

// ========================================
// GAME SCENE
// ========================================
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.tilemapCSV('level1', 'maps/level1.csv');
    this.load.tilemapCSV('level2', 'maps/level2.csv');
    this.load.tilemapCSV('level3', 'maps/level3.csv');
    this.load.svg('redCar', 'red-car.svg', { width: 32, height: 24 });

    // Initialize highScore from the #1 entry in the table (fallback to old single value)
    const table = loadHighScores();
    if (table.length > 0) {
      highScore = table[0].score;
    } else {
      highScore = parseInt(localStorage.getItem('highScore')) || 0;
    }
  }

  create() {
    newGame(this);
  }

  update(time, delta) {
    updateGame.call(this, time, delta);
  }
}

// ---------- PHASER CONFIG ----------
const config = {
  type: Phaser.AUTO,
  width,
  height,
  backgroundColor: '#0a0a0a',
  physics: { 
    default: 'arcade', 
    arcade: { 
      debug: false
    } 
  },
  input: {
    gamepad: true
  },
  scene: [StartScene, HowToScene, HighScoresScene, NameEntryScene, GameScene],
};

new Phaser.Game(config);

// ========================================
// GAME FUNCTIONS
// ========================================

function buildMaze(scene, levelKey) {
  const map = scene.make.tilemap({ key: levelKey, tileWidth: TILE, tileHeight: TILE });
  const layer = map.layers[0];
  maze.length = 0;
  penTiles = [];
  gateTiles = [];
  playerSpawn = { r: 1, c: 1 };

  for (let r = 0; r < layer.data.length; r++) {
    const row = [];
    for (let c = 0; c < layer.data[r].length; c++) {
      const val = layer.data[r][c].index;
      row.push(val);
      if (val === 4) playerSpawn = { r, c };
      else if (val === 5) penTiles.push({ r, c });
      else if (val === 6) gateTiles.push({ r, c });
    }
    maze.push(row);
  }
}

function newGame(scene) {
  score = 0;
  lives = 3;
  currentLevel = 1;
  startLevel(scene, currentLevel);
}

function startLevel(scene, levelNum) {
  powered = false;
  powerTimer = 0;
  enemies = [];
  scene.children.removeAll();

  buildMaze(scene, `level${levelNum}`);

  walls = scene.physics.add.staticGroup();
  dotsGroup = scene.physics.add.staticGroup();
  powerGroup = scene.physics.add.staticGroup();

  // --- draw maze with walls ---
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = maze[r][c];
      const centerX = c * TILE + TILE / 2;
      const centerY = r * TILE + TILE / 2;

      if (val === 1) {
        const wallSize = TILE * 0.9;
        
        const wallVisual = scene.add.rectangle(
          centerX,
          centerY,
          wallSize,
          wallSize,
          0x1a3a4a,
          1
        ).setStrokeStyle(3, 0x2a5a7a);
        
        const wall = walls.create(centerX, centerY, null);
        wall.setOrigin(0.5, 0.5);
        wall.displayWidth = wallSize;
        wall.displayHeight = wallSize;
        wall.body.setSize(wallSize, wallSize);
        wall.body.setOffset(0, 0);
        wall.setVisible(false);
        wall.refreshBody();
      } else if (val === 2) {
        const dot = scene.add.circle(centerX, centerY, 4 * SCALE_FACTOR, 0xffeb3b);
        scene.physics.add.existing(dot, true);
        dotsGroup.add(dot);
      } else if (val === 3) {
        const p = scene.add.star(centerX, centerY, 5, 6 * SCALE_FACTOR, 10 * SCALE_FACTOR, 0xff5722);
        scene.physics.add.existing(p, true);
        powerGroup.add(p);
      }
    }
  }

  // --- car setup ---
  const px = playerSpawn.c * TILE + TILE / 2;
  const py = playerSpawn.r * TILE + TILE / 2;
  player = scene.add.container(px, py);
  
  const carSprite = scene.add.image(0, 0, 'redCar');
  carSprite.setDisplaySize(32 * SCALE_FACTOR, 24 * SCALE_FACTOR);
  
  const driftIndicator = scene.add.rectangle(-15 * SCALE_FACTOR, 0, 20 * SCALE_FACTOR, 8 * SCALE_FACTOR, 0xff6600, 0.8);
  driftIndicator.setName('driftIndicator');
  driftIndicator.setVisible(false);
  
  player.add([driftIndicator, carSprite]);
  scene.physics.add.existing(player);
  player.body.setCollideWorldBounds(true);

  const carWidth = 28 * SCALE_FACTOR;
  const carHeight = 20 * SCALE_FACTOR;
  player.body.setSize(carWidth, carHeight);
  player.body.setOffset(-carWidth / 2, -carHeight / 2);
  
  player.body.setMaxVelocity(MAX_SPEED);
  player.setData('currentSpeed', 0);
  player.setData('isDrifting', false);
  player.angle = 0;

  // spawn enemies
  const penSpawns = Phaser.Utils.Array.Shuffle([...penTiles]).slice(0, 4);
  for (let pos of penSpawns) spawnEnemy(scene, pos);

  scene.physics.add.collider(player, walls);
  enemies.forEach(e => scene.physics.add.collider(e, walls));

  scene.physics.add.overlap(player, dotsGroup, (_, dot) => {
    dot.destroy();
    score += DOT_SCORE;
    updateScore();
    if (dotsGroup.countActive() === 0) nextLevel(scene);
  });

  scene.physics.add.overlap(player, powerGroup, (_, p) => {
    p.destroy();
    powered = true;
    powerTimer = scene.time.now + POWER_DURATION;
    enemies.forEach(e => e.list[0].setFillStyle(0x00e5ff));
  });

  scene.physics.add.overlap(player, enemies, (_, e) => {
    if (scenePaused) return;
    if (powered) handleEnemyHit(scene, e);
    else handlePlayerHit(scene);
  });

  cursors = scene.input.keyboard.createCursorKeys();
  keys = scene.input.keyboard.addKeys('W,A,S,D,SHIFT,SPACE');

  scene.input.gamepad.start();
  
  const pads = scene.input.gamepad.gamepads;
  if (pads.length > 0) {
    gamepad = pads[0];
    console.log('Gamepad already connected:', gamepad.id);
  }
  
  scene.input.gamepad.on('connected', (pad) => {
    gamepad = pad;
    console.log('Gamepad connected:', pad.id);
  });
  
  scene.input.gamepad.on('disconnected', (pad) => {
    console.log('Gamepad disconnected');
    gamepad = null;
  });

  scoreText = scene.add.text(12, height - 24, 'SCORE: 0', { fontFamily: 'monospace', fontSize: '16px', color: '#fff' });
  highScoreText = scene.add.text(width - 160, height - 24, `HIGH: ${highScore}`, { fontFamily: 'monospace', fontSize: '16px', color: '#ffd54f' });
  livesText = scene.add.text(12, 6, `LIVES: ${lives}`, { fontFamily: 'monospace', fontSize: '16px', color: '#ff8080' });

  showReady(scene, levelNum);
}

function showReady(scene, levelNum) {
  scenePaused = true;
  readyText = scene.add
    .text(width / 2, height / 2 + 40, `READY! (Level ${levelNum})`, {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffff00',
    })
    .setOrigin(0.5);
  scene.time.delayedCall(1400, () => {
    scenePaused = false;
    readyText.destroy();
  });
}

function updateGame(time, delta) {
  let gamepadPause = false;
  try {
    if (gamepad && gamepad.buttons[9] && gamepad.buttons[9].pressed) {
      if (!player.getData('pauseButtonWasPressed')) {
        gamepadPause = true;
        player.setData('pauseButtonWasPressed', true);
      }
    } else {
      player.setData('pauseButtonWasPressed', false);
    }
  } catch (e) {
    console.error('Gamepad pause error:', e);
  }
  
  const pausePressed = Phaser.Input.Keyboard.JustDown(keys.SPACE) || gamepadPause;
  
  if (pausePressed) togglePause(this);
  if (scenePaused && pausedText) return;

  if (powered && time >= powerTimer) {
    powered = false;
    enemies.forEach(e => e.list[0].setFillStyle(0x7c4dff));
  }

  const input = getInputDirection();
  updateCarPhysics(player, input, delta);

  enemies.forEach(e => updateEnemy(this, e, player));
}

function updateCarPhysics(car, input, delta) {
  const deltaSeconds = delta / 1000;
  
  const isDrifting = input.drift;
  const currentSpeed = car.getData('currentSpeed') || 0;
  
  const driftIndicator = car.getByName('driftIndicator');
  if (driftIndicator) {
    const showDrift = isDrifting && Math.abs(currentSpeed) > 80;
    driftIndicator.setVisible(showDrift);
  }
  
  const activeTurnSpeed = isDrifting ? DRIFT_TURN_SPEED : TURN_SPEED;
  
  if (input.x !== 0) {
    car.angle += input.x * activeTurnSpeed * deltaSeconds;
  }

  let newSpeed = currentSpeed;
  
  if (input.accelerate) {
    newSpeed = Phaser.Math.Linear(currentSpeed, MAX_SPEED, 0.15);
  } 
  else if (input.reverse) {
    newSpeed = Phaser.Math.Linear(currentSpeed, -REVERSE_SPEED, 0.12);
  } 
  else {
    newSpeed = Phaser.Math.Linear(currentSpeed, 0, 0.08);
  }
  
  car.setData('currentSpeed', newSpeed);
  
  const angleRad = Phaser.Math.DegToRad(car.angle);
  const targetVx = Math.cos(angleRad) * newSpeed;
  const targetVy = Math.sin(angleRad) * newSpeed;
  
  const currentVx = car.body.velocity.x;
  const currentVy = car.body.velocity.y;
  
  if (isDrifting && Math.abs(newSpeed) > 50) {
    const gripFactor = DRIFT_GRIP_RECOVERY;
    const vx = Phaser.Math.Linear(currentVx, targetVx, gripFactor);
    const vy = Phaser.Math.Linear(currentVy, targetVy, gripFactor);
    
    car.body.setVelocity(vx, vy);
  } else {
    const gripFactor = NORMAL_GRIP;
    const vx = Phaser.Math.Linear(currentVx, targetVx, gripFactor);
    const vy = Phaser.Math.Linear(currentVy, targetVy, gripFactor);
    
    car.body.setVelocity(vx, vy);
  }
}

function togglePause(scene) {
  scenePaused = !scenePaused;
  if (scenePaused) {
    pausedText = scene.add.text(width / 2, height / 2, 'PAUSED', {
      fontFamily: 'monospace',
      fontSize: '42px',
      color: '#ffff00',
    }).setOrigin(0.5);
    enemies.forEach(e => e.body.setVelocity(0, 0));
    player.body.setVelocity(0, 0);
  } else {
    if (pausedText) pausedText.destroy();
  }
}

function getInputDirection() {
  let x = 0;
  let accelerate = false;
  let reverse = false;
  let drift = false;
  
  if (cursors.left.isDown || keys.A.isDown) x = -1;
  else if (cursors.right.isDown || keys.D.isDown) x = 1;
  
  if (cursors.up.isDown || keys.W.isDown) accelerate = true;
  if (cursors.down.isDown || keys.S.isDown) reverse = true;
  
  if (keys.SHIFT && keys.SHIFT.isDown) drift = true;
  
  if (gamepad) {
    try {
      if (gamepad.buttons[0] && gamepad.buttons[0].pressed) {
        accelerate = true;
      }
      
      if (gamepad.buttons[1] && gamepad.buttons[1].pressed) {
        reverse = true;
      }
      
      const leftTrigger = gamepad.buttons[6] && gamepad.buttons[6].pressed;
      const rightTrigger = gamepad.buttons[7] && gamepad.buttons[7].pressed;
      if (leftTrigger || rightTrigger) {
        drift = true;
      }
      
      const dpadLeft = gamepad.buttons[14] && gamepad.buttons[14].pressed;
      const dpadRight = gamepad.buttons[15] && gamepad.buttons[15].pressed;
      
      if (dpadLeft) x = -1;
      else if (dpadRight) x = 1;
      
      const deadzone = 0.15;
      const axisX = gamepad.axes.length > 0 ? gamepad.axes[0].getValue() : 0;
      
      if (Math.abs(axisX) > deadzone) {
        x = axisX;
      }
    } catch (e) {
      console.error('Gamepad input error:', e);
    }
  }
  
  return { x, accelerate, reverse, drift };
}

function spawnEnemy(scene, gridPos) {
  const x = gridPos.c * TILE + TILE / 2;
  const y = gridPos.r * TILE + TILE / 2;
  const e = scene.add.container(x, y);
  
  const body = scene.add.rectangle(0, 0, TILE * 0.45 * SCALE_FACTOR, TILE * 0.3 * SCALE_FACTOR, 0x7c4dff);
  e.add(body);
  
  scene.physics.add.existing(e);
  const enemyWidth = 20 * SCALE_FACTOR;
  const enemyHeight = 16 * SCALE_FACTOR;
  e.body.setSize(enemyWidth, enemyHeight);
  e.body.setOffset(-enemyWidth / 2, -enemyHeight / 2);
  
  e.setData('mode', 'leaving');
  e.setData('nextMoveTime', 0);
  enemies.push(e);
  scene.physics.add.collider(e, walls);
}

function handleEnemyHit(scene, enemy) {
  enemy.setVisible(false);
  enemy.body.enable = false;
  score += KILL_SCORE;
  updateScore();
  scene.time.delayedCall(900, () => {
    const pos = Phaser.Utils.Array.GetRandom(penTiles);
    enemy.x = pos.c * TILE + TILE / 2;
    enemy.y = pos.r * TILE + TILE / 2;
    enemy.setData('mode', 'leaving');
    enemy.setVisible(true);
    enemy.body.enable = true;
  });
}

function handlePlayerHit(scene) {
  lives = Math.max(0, lives - 1);
  livesText.setText(`LIVES: ${lives}`);
  if (lives > 0) resetAfterDeath(scene);
  else doGameOver(scene);
}

function resetAfterDeath(scene) {
  scenePaused = true;
  player.body.setVelocity(0, 0);
  player.setData('currentSpeed', 0);
  player.angle = 0;
  player.x = playerSpawn.c * TILE + TILE / 2;
  player.y = playerSpawn.r * TILE + TILE / 2;

  enemies.forEach(e => {
    const pos = Phaser.Utils.Array.GetRandom(penTiles);
    e.x = pos.c * TILE + TILE / 2;
    e.y = pos.r * TILE + TILE / 2;
    e.body.setVelocity(0, 0);
    e.setData('mode', 'leaving');
  });

  readyText = scene.add.text(width / 2, height / 2 + 40, 'READY!', {
    fontFamily: 'monospace', fontSize: '32px', color: '#ffff00',
  }).setOrigin(0.5);

  scene.time.delayedCall(1400, () => {
    scenePaused = false;
    readyText.destroy();
  });
}

function doGameOver(scene) {
  scenePaused = true;
  gameOverText = scene.add.text(width / 2, height / 2, 'GAME OVER', {
    fontFamily: 'monospace',
    fontSize: '48px',
    color: '#ff4f5e',
  }).setOrigin(0.5);

  scene.time.delayedCall(1500, () => {
    gameOverText.destroy();

    if (scoreQualifiesForTable(score)) {
      // Go to initials entry screen, pass in the score
      scene.scene.start('NameEntryScene', { score });
    } else {
      // Non–high score, just return to start menu
      scene.scene.start('StartScene');
    }
  });
}

function updateEnemy(scene, enemy, playerObj) {
  const tileR = Math.floor(enemy.y / TILE);
  const tileC = Math.floor(enemy.x / TILE);

  if (!enemy.getData('nextMoveTime') || scene.time.now > enemy.getData('nextMoveTime')) {
    enemy.setData('nextMoveTime', scene.time.now + 350);
    const mode = enemy.getData('mode');
    let target;

    if (mode === 'leaving') {
      target = nearestGateByPath(tileR, tileC);
      if (target && tileR === target.r && tileC === target.c) {
        enemy.setData('mode', 'patrolling');
      }
    } else {
      target = decideEnemyTarget(playerObj, tileR, tileC);
    }

    if (target) {
      const path = findPath(tileR, tileC, target.r, target.c);
      if (path && path.length > 1) {
        const next = path[1];
        goToward(enemy, next.c * TILE + TILE / 2, next.r * TILE + TILE / 2, scene);
      }
    }
  }
}

function goToward(enemy, nx, ny, scene) {
  const dx = nx - enemy.x;
  const dy = ny - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const speed = (powered ? ENEMY_SPEED_BASE * 0.6 : ENEMY_SPEED_BASE) * Math.pow(ENEMY_SPEED_SCALE, currentLevel - 1);
  enemy.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  
  enemy.angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx)) + 90;
}

function nearestGateByPath(sr, sc) {
  let best = null;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const g of gateTiles) {
    const p = findPath(sr, sc, g.r, g.c);
    if (p && p.length < bestLen) {
      best = g;
      bestLen = p.length;
    }
  }
  return best;
}

function decideEnemyTarget(playerObj, r, c) {
  const playerR = Math.floor(playerObj.y / TILE);
  const playerC = Math.floor(playerObj.x / TILE);
  const dist = Phaser.Math.Distance.Between(c, r, playerC, playerR);
  if (dist < 8) return { r: playerR, c: playerC };
  return randomOpenTile();
}

function randomOpenTile() {
  for (let tries = 0; tries < 10; tries++) {
    const r = Phaser.Math.Between(1, ROWS - 2);
    const c = Phaser.Math.Between(1, COLS - 2);
    if (maze[r][c] !== 1) return { r, c };
  }
  return { r: 1, c: 1 };
}

function findPath(sr, sc, tr, tc) {
  const q = [{ r: sr, c: sc, path: [] }];
  const visited = new Set([sr + ',' + sc]);
  const dirs = [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ];

  while (q.length) {
    const cur = q.shift();
    const r = cur.r, c = cur.c, path = cur.path;
    if (r === tr && c === tc) return path.concat([{ r, c }]);

    for (let d of dirs) {
      const nr = r + d.r;
      const nc = c + d.c;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (maze[nr][nc] === 1) continue;
      const key = nr + ',' + nc;
      if (visited.has(key)) continue;
      visited.add(key);
      q.push({ r: nr, c: nc, path: path.concat([{ r, c }]) });
    }
  }
  return null;
}

function nextLevel(scene) {
  currentLevel = (currentLevel % 3) + 1;
  startLevel(scene, currentLevel);
}

function updateScore() {
  scoreText.setText(`SCORE: ${score}`);

  // Live HUD high score based on current run
  if (score > highScore) {
    highScore = score;
  }

  highScoreText.setText(`HIGH: ${highScore}`);
}
