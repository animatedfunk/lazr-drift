import Phaser from 'phaser';

// ---------- GLOBAL STATE ----------
let scenePaused = false;
let readyText;
let pausedText;
let gameOverText;
let pauseMenuContainer;
let pauseMenuBackground;
let pauseMenuButtons = [];
let selectedButtonIndex = 0; // Track which button is selected

let currentLevel = 1;
let pendingStartLevel = null; // used by Level Select

const BUILD_VERSION = "v0.1.9.2"; // <-- update this anytime you deploy


// ---------- CONFIG ----------
const TILE = 48;
const COLS = 28;
const ROWS = 16;
const HUD_TOP_PADDING = 80;
const HUD_BOTTOM_PADDING = 70;
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

// ---------- TILE SPRITES (LEVEL VISUALS) ----------

// Size of each tile in the sprite sheet (24x24 per tile)
const SPRITE_SIZE = 24; // size of each tile in sprites.png

// Frame index in the spritesheet for each tile ID
// sprites.png is 6x3 frames laid out like this:
// Row 0: empty, diamond (dot), plus (power), dotted square, dotted fill, X box
// Row 1: track pieces (6-11)
// Row 2: new wall pieces (13-16)
const tileFrameMap = {
  0: 0,  // empty
  2: 1,  // dot (no longer used for gameplay, but still a valid frame)
  3: 2,  // power
  4: 3,  // player spawn marker
  5: 4,  // pen
  6: 5,  // gate

  7: 6,  // wall horizontal
  8: 7,  // wall vertical
  9: 8,  // corner NE
 10: 9,  // corner NW
 11: 10, // corner SE
 12: 11, // corner SW

 13: 12, // wall west
 14: 13, // wall south
 15: 14, // wall east
 16: 15  // wall north
};

// Wall helper – includes all wall tiles
function isWall(val) {
  return val >= 7 && val <= 16;
}


// Fallback colors for debug / when sprites are missing
const tileDebugColors = {
  0: 0x000000,
  1: 0x1a3a4a,
  2: 0xffffff,
  3: 0xffff00,
  4: 0x00ff00,
  5: 0xb266ff,
  6: 0xff0000,
  7: 0x66ccff,
  8: 0x66ccff,
  9: 0x66ccff,
  10: 0x66ccff,
  11: 0x66ccff,
  12: 0x66ccff,
  13: 0x66ccff,
  14: 0x66ccff,
  15: 0x66ccff,
  16: 0x66ccff
};


// ---------- MAZE ----------
const maze = [];
let penTiles = [];
let gateTiles = [];
let playerSpawn = { r: 1, c: 1 };

// ---------- GAME STATE ----------
const PLAY_AREA_WIDTH = COLS * TILE;
const PLAY_AREA_HEIGHT = ROWS * TILE;
const width = PLAY_AREA_WIDTH;
const height = PLAY_AREA_HEIGHT + HUD_TOP_PADDING + HUD_BOTTOM_PADDING;
let score = 0;
let highScore = 0;
let lives = 3;
let powered = false;
let powerTimer = 0;

let player, cursors, keys, gamepad;
let scoreText, highScoreText, highScoreLabelText, livesIcons;
let walls, dotsGroup, powerGroup;
let enemies = [];
let sparkParticles;

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
   { text: 'LEVEL SELECT', action: 'levelselect' },
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
    
    // version number
    drawVersionTag(this);
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
   } else if (action === 'levelselect') {
     this.scene.start('LevelSelectScene');
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
// LEVEL SELECT SCENE
// ========================================
class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create() {
    const centerX = width / 2;

    // Adjust this array if you add more levels/maps later
    this.levels = [1, 2, 3, 4, 5];
    this.selectedIndex = 0;

    this.add.text(centerX, 60, 'LEVEL SELECT', {
      fontFamily: 'monospace',
      fontSize: '42px',
      color: '#00ffff',
      stroke: '#0088aa',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.levelTexts = [];

    this.levels.forEach((levelNum, i) => {
      const t = this.add.text(centerX, 140 + i * 40, `LEVEL ${levelNum}`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff'
      }).setOrigin(0.5);
      this.levelTexts.push(t);
    });

    this.updateSelection();

    this.add.text(centerX, height - 80,
      'UP / DOWN OR W / S TO CHOOSE LEVEL',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#888888'
      }).setOrigin(0.5);

    this.add.text(centerX, height - 50,
      'ENTER / A TO PLAY • ESC / B TO GO BACK',
      {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#888888'
      }).setOrigin(0.5);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,S,ESC,ENTER,SPACE');

    this.input.gamepad.start();
    this.gamepad = null;
    this.lastPadState = {
      up: false,
      down: false,
      a: false,
      b: false
    };

    // If you added drawVersionTag(scene) earlier, you can call it here:
    if (typeof drawVersionTag === 'function') {
      drawVersionTag(this);
    }
  }

  updateSelection() {
    this.levelTexts.forEach((txt, i) => {
      if (i === this.selectedIndex) {
        txt.setColor('#ffff00');
        txt.setFontSize(28);
      } else {
        txt.setColor('#ffffff');
        txt.setFontSize(24);
      }
    });
  }

  confirmSelection() {
    const chosenLevel = this.levels[this.selectedIndex];
    pendingStartLevel = chosenLevel;
    this.scene.start('GameScene');
  }

  goBack() {
    this.scene.start('StartScene');
  }

  update() {
    if (!this.gamepad && this.input.gamepad.total > 0) {
      this.gamepad = this.input.gamepad.getPad(0);
    }

    // Keyboard navigation
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
        Phaser.Input.Keyboard.JustDown(this.keys.W)) {
      this.selectedIndex = (this.selectedIndex - 1 + this.levels.length) % this.levels.length;
      this.updateSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.down) ||
        Phaser.Input.Keyboard.JustDown(this.keys.S)) {
      this.selectedIndex = (this.selectedIndex + 1) % this.levels.length;
      this.updateSelection();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) ||
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.confirmSelection();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.goBack();
    }

    // Gamepad navigation
    if (this.gamepad) {
      const up = this.gamepad.buttons[12]?.pressed;
      const down = this.gamepad.buttons[13]?.pressed;
      const a = this.gamepad.buttons[0]?.pressed;
      const b = this.gamepad.buttons[1]?.pressed;

      if (up && !this.lastPadState.up) {
        this.selectedIndex = (this.selectedIndex - 1 + this.levels.length) % this.levels.length;
        this.updateSelection();
      }
      if (down && !this.lastPadState.down) {
        this.selectedIndex = (this.selectedIndex + 1) % this.levels.length;
        this.updateSelection();
      }
      if (a && !this.lastPadState.a) {
        this.confirmSelection();
      }
      if (b && !this.lastPadState.b) {
        this.goBack();
      }

      this.lastPadState = { up, down, a, b };
    }
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
    this.load.tilemapCSV('level4', 'maps/level4.csv');
    this.load.tilemapCSV('level5', 'maps/level5.csv');
    this.load.svg('redCar', 'red-car.svg', { width: 36, height: 20 });
    this.load.svg('enemy', 'enemy.svg', { width: 32, height: 28 });
    this.load.svg('logo', 'LD-logo.svg', { width: 168, height: 168 });
    
    // Use spritesheet so each tile is a 24x24 frame
    this.load.spritesheet('tiles', 'maps/sprites.png', {
      frameWidth: SPRITE_SIZE,
      frameHeight: SPRITE_SIZE
    });
    
    // Dot image (separate file, at /dot.png)
    this.load.image('dot', 'maps/dot.png');
    
    // Power pellet image (separate file)
    this.load.image('power', 'maps/power.png');
    
    // Collectibles positions (exported from editor) - contains both dots and powers
    this.load.json('level1_dots', 'maps/level1-dots.json');
    this.load.json('level2_dots', 'maps/level2-dots.json');
    this.load.json('level3_dots', 'maps/level3-dots.json');
    this.load.json('level4_dots', 'maps/level4-dots.json');
    this.load.json('level5_dots', 'maps/level5-dots.json');


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
  backgroundColor: '#190a27',
  physics: { 
    default: 'arcade', 
    arcade: { 
      debug: false
    } 
  },
  input: {
    gamepad: true
  },
  scene: [StartScene, HowToScene, HighScoresScene, NameEntryScene, LevelSelectScene, GameScene],
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

  if (pendingStartLevel !== null) {
    currentLevel = pendingStartLevel;
    pendingStartLevel = null;
  } else {
    currentLevel = 1;
  }

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

  // --- draw maze with sprites + physics ---
  const tileScale = TILE / SPRITE_SIZE; // 48 / 24 = 2

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = maze[r][c];

      // Top-left of this tile in world space (editor uses 24, we use 48)
      // Add HUD_TOP_PADDING to Y coordinate to offset play area down
      const x = c * TILE;
      const y = r * TILE + HUD_TOP_PADDING;

      // Center (for physics bodies)
      const centerX = x + TILE / 2;
      const centerY = y + TILE / 2;

      const frame = tileFrameMap[val];

      // 1) Background tiles: empty, “track” tiles, walls, pen, gate
      //    NOTE: val === 2 is treated as background only now
      if (frame !== undefined && (val === 0 || val === 2 || isWall(val) || val === 4 || val === 5 || val === 6)) {
        const tileImg = scene.add.image(x, y, 'tiles', frame);
        tileImg.setOrigin(0, 0);      // top-left like the editor
        tileImg.setScale(tileScale);  // 24 -> 48
        tileImg.setDepth(0);           // level tiles on bottom layer
      }

      // 2) Collision walls (physics only; visuals from background tiles)
      if (isWall(val)) {
        const wallSize = TILE * 0.9;
        const wall = walls.create(centerX, centerY, null);
        wall.setOrigin(0.5, 0.5);
        wall.displayWidth = wallSize;
        wall.displayHeight = wallSize;
        wall.body.setSize(wallSize, wallSize);
        wall.body.setOffset(0, 0);
        wall.setVisible(false);
        wall.refreshBody();
      }
    }
  }

  // --- create dots and powers from external JSON layer (AFTER tiles, so they render on top) ---
  const collectiblesKey = `level${levelNum}_dots`;
  const collectiblesData = scene.cache.json.get(collectiblesKey) || {};
  
  // Handle both new format { dots: [...], powers: [...] } and legacy format [...]
  const dotData = collectiblesData.dots || (Array.isArray(collectiblesData) ? collectiblesData : []);
  const powerData = collectiblesData.powers || [];
  const logoData = collectiblesData.logo || null;
  const playerSpawnData = collectiblesData.playerSpawn || null;
  const enemySpawnData = collectiblesData.enemySpawns || [];

  // Editor used TILE_SIZE = 24; game uses TILE = 48
  const editorTileSize = 24;
  const posScale = TILE / editorTileSize; // 2

  // Render logo if present (depth 2 - above tiles, below collectibles)
  if (logoData) {
    const logoX = logoData.x * posScale;
    const logoY = logoData.y * posScale + HUD_TOP_PADDING;
    const logoSprite = scene.add.image(logoX, logoY, 'logo');
    logoSprite.setOrigin(0.5, 0.5);
    logoSprite.setDepth(2); // Logo above tiles but below collectibles
  }

  dotData.forEach(d => {
    // d.x, d.y are editor pixel coords (center of dot)
    const worldX = d.x * posScale;
    const worldY = d.y * posScale + HUD_TOP_PADDING;

    const dot = scene.add.image(worldX, worldY, 'dot');
    dot.setOrigin(0.5, 0.5);
    dot.setDepth(5); // make sure dots are above tiles

    scene.physics.add.existing(dot, true);
    dotsGroup.add(dot);
  });

  // Spawn power pellets from JSON
  powerData.forEach(p => {
    const worldX = p.x * posScale;
    const worldY = p.y * posScale + HUD_TOP_PADDING;

    const power = scene.add.image(worldX, worldY, 'power');
    power.setOrigin(0.5, 0.5);
    power.setScale(1.5); // Increase size by 50%
    power.setDepth(5); // power pellets at same depth as dots

    scene.physics.add.existing(power, true);
    powerGroup.add(power);
  });

  // --- car setup (use playerSpawnData if available, fallback to old system) ---
  let px, py, pRotation = 0;
  if (playerSpawnData) {
    px = playerSpawnData.x * posScale;
    py = playerSpawnData.y * posScale + HUD_TOP_PADDING;
    pRotation = playerSpawnData.rotation || 0;
  } else {
    // Fallback to old grid-based spawn
    px = playerSpawn.c * TILE + TILE / 2;
    py = playerSpawn.r * TILE + TILE / 2 + HUD_TOP_PADDING;
  }
  
  player = scene.add.container(px, py);

  const carSprite = scene.add.image(0, 0, 'redCar');
  // red-car.svg is approximately 36x20, which is 1.8:1 ratio
  const carDisplayWidth = 36 * SCALE_FACTOR;
  const carDisplayHeight = 20 * SCALE_FACTOR;
  carSprite.setDisplaySize(carDisplayWidth, carDisplayHeight);

  const driftIndicator = scene.add.rectangle(-15 * SCALE_FACTOR, 0, 20 * SCALE_FACTOR, 8 * SCALE_FACTOR, 0xff6600, 0.8);
  driftIndicator.setName('driftIndicator');
  driftIndicator.setVisible(false);

  player.add([driftIndicator, carSprite]);
  player.setDepth(10); // player on top of everything
  scene.physics.add.existing(player);
  
  // Create spark particle system for wall collisions
  // Create a small streak texture for particles (2-5px length)
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x9b41c6, 1); // Purple color
  graphics.fillRect(0, 1, 4, 1); // Horizontal streak: 4px wide, 1px tall
  graphics.generateTexture('spark', 4, 2); // 4x2 texture
  graphics.destroy();
  
  // Create particle emitter for sparks
  sparkParticles = scene.add.particles(0, 0, 'spark', {
    speed: { min: 20, max: 40 }, // Slower speed for 6px radius spread
    angle: { min: 0, max: 360 }, // Will be updated per collision
    scaleX: { min: 0.5, max: 1.25 }, // Vary length: 2-5px (0.5×4=2, 1.25×4=5)
    scaleY: 1, // Keep thickness consistent
    alpha: { start: 1, end: 0 }, // Fade from 100% to 0% opacity
    lifespan: 50, // Very short lifespan - quick flash
    gravityY: 0, // No gravity for top-down view - particles fly outward only
    quantity: 1, // 1 particle per emission
    frequency: 50,
    emitting: false
  });
  sparkParticles.setDepth(15); // Above player
  
  // Set world bounds to play area only (excluding HUD padding)
  // Note: setCollideWorldBounds is disabled to allow portal wraparound
  scene.physics.world.setBounds(0, HUD_TOP_PADDING, PLAY_AREA_WIDTH, PLAY_AREA_HEIGHT);
  player.body.setCollideWorldBounds(false); // Allow wraparound portals

  // Collision body should match visual size
  const carWidth = carDisplayWidth * 0.85; // Slightly smaller for better gameplay feel
  const carHeight = carDisplayHeight * 0.8;
  player.body.setSize(carWidth, carHeight);
  player.body.setOffset(-carWidth / 2, -carHeight / 2);

  player.body.setMaxVelocity(MAX_SPEED);
  player.setData('currentSpeed', 0);
  player.setData('isDrifting', false);
  player.setData('spawnX', px); // Store spawn position
  player.setData('spawnY', py);
  player.setData('spawnRotation', pRotation);
  player.setData('lastSparkTime', 0); // Track last spark emission time
  player.angle = pRotation; // Set initial rotation from spawn data

  // spawn enemies (use enemySpawnData if available, fallback to old system)
  if (enemySpawnData && enemySpawnData.length > 0) {
    // Use new precise spawn system
    enemySpawnData.forEach(spawnData => {
      const ex = spawnData.x * posScale;
      const ey = spawnData.y * posScale + HUD_TOP_PADDING;
      const eRotation = spawnData.rotation || 0;
      spawnEnemyAtPosition(scene, ex, ey, eRotation);
    });
  } else {
    // Fallback to old pen-based spawning
    const penSpawns = Phaser.Utils.Array.Shuffle([...penTiles]).slice(0, 4);
    for (let pos of penSpawns) spawnEnemy(scene, pos);
  }

  scene.physics.add.collider(player, walls, (playerObj, wall) => {
    // Only trigger sparks on initial high-speed impact
    const currentTime = scene.time.now;
    const lastSparkTime = playerObj.getData('lastSparkTime') || 0;
    const minSparkInterval = 300; // Minimum 300ms between spark bursts
    
    // Check if moving fast and enough time has passed since last spark
    if (playerObj.body.velocity.length() > 150 && currentTime - lastSparkTime > minSparkInterval) {
      // Calculate movement direction
      const velocityAngle = Math.atan2(playerObj.body.velocity.y, playerObj.body.velocity.x);
      const velocityAngleDeg = Phaser.Math.RadToDeg(velocityAngle);
      
      // Get more accurate contact point using physics bodies
      const playerBounds = playerObj.body;
      const wallBounds = wall.body;
      
      // Calculate overlap center - where the collision is happening
      const overlapLeft = Math.max(playerBounds.left, wallBounds.left);
      const overlapRight = Math.min(playerBounds.right, wallBounds.right);
      const overlapTop = Math.max(playerBounds.top, wallBounds.top);
      const overlapBottom = Math.min(playerBounds.bottom, wallBounds.bottom);
      
      const contactX = (overlapLeft + overlapRight) / 2;
      const contactY = (overlapTop + overlapBottom) / 2;
      
      // Sparks spray away from movement direction (opposite)
      const oppositeAngle = velocityAngleDeg + 180;
      
      sparkParticles.setPosition(contactX, contactY);
      sparkParticles.setConfig({
        angle: { 
          min: oppositeAngle - 5, 
          max: oppositeAngle + 5 
        },
        speed: { min: 20, max: 40 } // Slow speed for tight ~6px spread
      });
      
      // Emit 2 particles (double the previous 1)
      sparkParticles.explode(2);
      
      // Update last spark time
      playerObj.setData('lastSparkTime', currentTime);
    }
  });
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
    // Reset all enemies to be eatable and apply tint
    enemies.forEach(e => {
      e.setData('canBeEaten', true);
      if (e.visible && e.body.enable) {
        e.list[0].setTint(0x00e5ff);
      }
    });
  });

  scene.physics.add.overlap(player, enemies, (_, e) => {
    if (scenePaused) return;
    // Check if powered AND this specific enemy can be eaten
    if (powered && e.getData('canBeEaten')) {
      handleEnemyHit(scene, e);
    } else {
      // Either not powered, or enemy already respawned (can't be eaten)
      handlePlayerHit(scene);
    }
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

  // Score display (top left, no label, 28px font)
  scoreText = scene.add.text(16, 20, '0', { 
    fontFamily: 'monospace', 
    fontSize: '28px', 
    color: '#ffffff' 
  });

  // High score display (top center)
  highScoreLabelText = scene.add.text(width / 2, 16, 'HIGH SCORE', { 
    fontFamily: 'monospace', 
    fontSize: '16px', 
    color: '#9b41c6' 
  }).setOrigin(0.5, 0);
  
  highScoreText = scene.add.text(width / 2, 38, `${highScore}`, { 
    fontFamily: 'monospace', 
    fontSize: '36px', 
    color: '#ffffff' 
  }).setOrigin(0.5, 0);

  // Lives display (bottom left, car icons)
  livesIcons = [];
  updateLivesDisplay(scene);

  showReady(scene, levelNum);
}


function showReady(scene, levelNum) {
  scenePaused = true;
  readyText = scene.add
    .text(width / 2, height / 2 + 40, `READY! (Level ${levelNum})`, {
      fontFamily: 'monospace', fontSize: '32px', color: '#ffff00',
    })
    .setOrigin(0.5)
    .setDepth(1000); // Very high depth to be above everything
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
  
  // Handle pause menu navigation
  if (scenePaused && pauseMenuButtons.length > 0) {
    handlePauseMenuNavigation(this);
    return; // Don't update game while paused
  }
  
  if (scenePaused && pausedText) return;

  if (powered && time >= powerTimer) {
    powered = false;
    enemies.forEach(e => e.list[0].clearTint());
  }

  const input = getInputDirection();
  updateCarPhysics(player, input, delta);

  // Check for portal wraparound (player)
  checkPortalWrap(player);

  // Update enemies and check their portal wraparound
  enemies.forEach(e => {
    updateEnemy(this, e, player);
    checkPortalWrap(e);
  });
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
    // Stop all movement
    enemies.forEach(e => e.body.setVelocity(0, 0));
    player.body.setVelocity(0, 0);
    
    // Create pause menu
    createPauseMenu(scene);
  } else {
    // Destroy pause menu
    destroyPauseMenu();
  }
}

function createPauseMenu(scene) {
  const menuWidth = 400;
  const menuHeight = 350;
  const menuX = width / 2;
  const menuY = height / 2;
  
  // Create container for all pause menu elements
  pauseMenuContainer = scene.add.container(0, 0);
  pauseMenuContainer.setDepth(1000); // Very high depth to be above everything
  
  // Semi-transparent dark overlay over entire screen
  const overlay = scene.add.rectangle(0, 0, width, height, 0x000000, 0.7);
  overlay.setOrigin(0, 0);
  pauseMenuContainer.add(overlay);
  
  // White background for menu
  pauseMenuBackground = scene.add.rectangle(menuX, menuY, menuWidth, menuHeight, 0xffffff);
  pauseMenuBackground.setStrokeStyle(4, 0x000000);
  pauseMenuContainer.add(pauseMenuBackground);
  
  // "PAUSED" title
  pausedText = scene.add.text(menuX, menuY - 120, 'PAUSED', {
    fontFamily: 'monospace',
    fontSize: '48px',
    color: '#000000',
    fontStyle: 'bold'
  }).setOrigin(0.5);
  pauseMenuContainer.add(pausedText);
  
  // Create menu buttons
  const buttonY = menuY - 40;
  const buttonSpacing = 80;
  
  // Resume button
  const resumeButton = createMenuButton(scene, menuX, buttonY, 'RESUME', () => {
    togglePause(scene);
  });
  pauseMenuContainer.add(resumeButton.background);
  pauseMenuContainer.add(resumeButton.text);
  pauseMenuButtons.push(resumeButton);
  
  // Restart button - restarts current level
  const restartButton = createMenuButton(scene, menuX, buttonY + buttonSpacing, 'RESTART', () => {
    destroyPauseMenu();
    scenePaused = false;
    // Restart the current level (don't reset score/lives/level number)
    startLevel(scene, currentLevel);
  });
  pauseMenuContainer.add(restartButton.background);
  pauseMenuContainer.add(restartButton.text);
  pauseMenuButtons.push(restartButton);
  
  // Quit button
  const quitButton = createMenuButton(scene, menuX, buttonY + buttonSpacing * 2, 'QUIT', () => {
    destroyPauseMenu();
    scenePaused = false;
    scene.scene.start('StartScene');
  });
  pauseMenuContainer.add(quitButton.background);
  pauseMenuContainer.add(quitButton.text);
  pauseMenuButtons.push(quitButton);
  
  // Set initial selection to first button (Resume)
  selectedButtonIndex = 0;
  updateButtonSelection();
}

function createMenuButton(scene, x, y, text, callback) {
  const buttonWidth = 300;
  const buttonHeight = 60;
  
  // Button background
  const bg = scene.add.rectangle(x, y, buttonWidth, buttonHeight, 0x9b41c6);
  bg.setStrokeStyle(3, 0x000000);
  bg.setInteractive({ useHandCursor: true });
  
  // Button text
  const txt = scene.add.text(x, y, text, {
    fontFamily: 'monospace',
    fontSize: '32px',
    color: '#ffffff',
    fontStyle: 'bold'
  }).setOrigin(0.5);
  
  // Mouse hover - update selection index
  bg.on('pointerover', () => {
    const buttonIndex = pauseMenuButtons.findIndex(btn => btn.background === bg);
    if (buttonIndex !== -1) {
      selectedButtonIndex = buttonIndex;
      updateButtonSelection();
    }
  });
  
  // Click handler
  bg.on('pointerdown', callback);
  
  return { background: bg, text: txt, callback: callback };
}

function destroyPauseMenu() {
  if (pauseMenuContainer) {
    pauseMenuContainer.destroy();
    pauseMenuContainer = null;
  }
  pausedText = null;
  pauseMenuBackground = null;
  pauseMenuButtons = [];
  selectedButtonIndex = 0;
}

function handlePauseMenuNavigation(scene) {
  // Track if input was just pressed this frame
  if (!scene.pauseMenuInputCooldown) {
    scene.pauseMenuInputCooldown = 0;
  }
  
  // Add cooldown to prevent rapid firing
  if (scene.time.now < scene.pauseMenuInputCooldown) {
    return;
  }
  
  let directionPressed = false;
  let selectPressed = false;
  
  // Keyboard navigation - arrow keys
  if (Phaser.Input.Keyboard.JustDown(cursors.up)) {
    selectedButtonIndex--;
    if (selectedButtonIndex < 0) selectedButtonIndex = pauseMenuButtons.length - 1;
    directionPressed = true;
  } else if (Phaser.Input.Keyboard.JustDown(cursors.down)) {
    selectedButtonIndex++;
    if (selectedButtonIndex >= pauseMenuButtons.length) selectedButtonIndex = 0;
    directionPressed = true;
  }
  
  // Keyboard selection - Enter key
  if (Phaser.Input.Keyboard.JustDown(scene.input.keyboard.addKey('ENTER'))) {
    selectPressed = true;
  }
  
  // Gamepad navigation
  if (gamepad) {
    // D-pad or left stick up/down
    const dpadUp = gamepad.buttons[12] && gamepad.buttons[12].pressed;
    const dpadDown = gamepad.buttons[13] && gamepad.buttons[13].pressed;
    const stickY = gamepad.axes[1] ? gamepad.axes[1].getValue() : 0;
    
    if (dpadUp || stickY < -0.5) {
      if (!scene.gamepadUpPressed) {
        selectedButtonIndex--;
        if (selectedButtonIndex < 0) selectedButtonIndex = pauseMenuButtons.length - 1;
        directionPressed = true;
        scene.gamepadUpPressed = true;
      }
    } else {
      scene.gamepadUpPressed = false;
    }
    
    if (dpadDown || stickY > 0.5) {
      if (!scene.gamepadDownPressed) {
        selectedButtonIndex++;
        if (selectedButtonIndex >= pauseMenuButtons.length) selectedButtonIndex = 0;
        directionPressed = true;
        scene.gamepadDownPressed = true;
      }
    } else {
      scene.gamepadDownPressed = false;
    }
    
    // A button (button 0) to select
    if (gamepad.buttons[0] && gamepad.buttons[0].pressed) {
      if (!scene.gamepadSelectPressed) {
        selectPressed = true;
        scene.gamepadSelectPressed = true;
      }
    } else {
      scene.gamepadSelectPressed = false;
    }
  }
  
  // Update visual selection if direction was pressed
  if (directionPressed) {
    updateButtonSelection();
    scene.pauseMenuInputCooldown = scene.time.now + 150; // 150ms cooldown
  }
  
  // Execute selected button's callback if select was pressed
  if (selectPressed) {
    const selectedButton = pauseMenuButtons[selectedButtonIndex];
    if (selectedButton && selectedButton.callback) {
      selectedButton.callback();
    }
  }
}

function updateButtonSelection() {
  // Reset all buttons to default state
  pauseMenuButtons.forEach((button, index) => {
    if (index === selectedButtonIndex) {
      // Selected state
      button.background.setFillStyle(0xb855e6); // Lighter purple
      button.text.setScale(1.1);
      button.background.setStrokeStyle(4, 0xffd700); // Gold border for selected
    } else {
      // Default state
      button.background.setFillStyle(0x9b41c6); // Original purple
      button.text.setScale(1.0);
      button.background.setStrokeStyle(3, 0x000000); // Black border
    }
  });
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
  const y = gridPos.r * TILE + TILE / 2 + HUD_TOP_PADDING;
  const e = scene.add.container(x, y);
  
  const sprite = scene.add.image(0, 0, 'enemy');
  sprite.setScale(SCALE_FACTOR);
  e.add(sprite);
  e.setDepth(10); // enemies on top of everything
  
  scene.physics.add.existing(e);
  const enemyWidth = 26 * SCALE_FACTOR;
  const enemyHeight = 20 * SCALE_FACTOR;
  e.body.setSize(enemyWidth, enemyHeight);
  e.body.setOffset(-enemyWidth / 2, -enemyHeight / 2);
  
  e.setData('mode', 'leaving');
  e.setData('nextMoveTime', 0);
  e.setData('spawnX', x);
  e.setData('spawnY', y);
  e.setData('spawnRotation', 0);
  e.setData('canBeEaten', true); // Track if enemy can be eaten during power mode
  enemies.push(e);
  scene.physics.add.collider(e, walls);
}

// New function for spawning with precise position and rotation
function spawnEnemyAtPosition(scene, x, y, rotation) {
  const e = scene.add.container(x, y);
  
  const sprite = scene.add.image(0, 0, 'enemy');
  sprite.setScale(SCALE_FACTOR);
  e.add(sprite);
  e.setDepth(10); // enemies on top of everything
  e.angle = rotation; // Set initial rotation
  
  scene.physics.add.existing(e);
  const enemyWidth = 26 * SCALE_FACTOR;
  const enemyHeight = 20 * SCALE_FACTOR;
  e.body.setSize(enemyWidth, enemyHeight);
  e.body.setOffset(-enemyWidth / 2, -enemyHeight / 2);
  
  e.setData('mode', 'leaving');
  e.setData('nextMoveTime', 0);
  e.setData('spawnX', x);
  e.setData('spawnY', y);
  e.setData('spawnRotation', rotation);
  e.setData('canBeEaten', true); // Track if enemy can be eaten during power mode
  enemies.push(e);
  scene.physics.add.collider(e, walls);
}

// TRON-style grid-based de-resolution effect
function createDerezEffect(scene, entity, color, duration = 1200) {
  // Hide the entity immediately
  entity.setVisible(false);
  
  // Get entity bounds
  const bounds = entity.getBounds();
  const centerX = bounds.centerX;
  const centerY = bounds.centerY;
  const width = bounds.width;
  const height = bounds.height;
  
  // Create 6x6 pixel grid
  const pixelSize = 6;
  const cols = Math.ceil(width / pixelSize);
  const rows = Math.ceil(height / pixelSize);
  const pixels = [];
  
  // Create grid of pixels covering the entity
  const startX = centerX - (cols * pixelSize) / 2;
  const startY = centerY - (rows * pixelSize) / 2;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = startX + col * pixelSize + pixelSize / 2;
      const py = startY + row * pixelSize + pixelSize / 2;
      
      const pixel = scene.add.rectangle(px, py, pixelSize, pixelSize, color);
      pixel.setDepth(20); // Above everything
      
      // Store pixel with random delay for staggered disintegration
      const delay = Phaser.Math.Between(0, duration * 0.5);
      const angle = Math.atan2(py - centerY, px - centerX);
      const distFromCenter = Phaser.Math.Distance.Between(px, py, centerX, centerY);
      
      pixels.push({ 
        rect: pixel, 
        delay: delay,
        startTime: null,
        angle: angle,
        distFromCenter: distFromCenter,
        originalX: px,
        originalY: py
      });
    }
  }
  
  // Animate pixels disintegrating
  const startTime = scene.time.now;
  
  const updatePixels = () => {
    const elapsed = scene.time.now - startTime;
    
    if (elapsed >= duration) {
      // Clean up all pixels
      pixels.forEach(p => p.rect.destroy());
      return;
    }
    
    let allGone = true;
    pixels.forEach(p => {
      if (elapsed < p.delay) {
        // Pixel hasn't started disintegrating yet
        allGone = false;
        return;
      }
      
      if (p.startTime === null) {
        p.startTime = elapsed;
      }
      
      const pixelElapsed = elapsed - p.startTime;
      const pixelDuration = duration - p.delay;
      const progress = Math.min(pixelElapsed / pixelDuration, 1.0);
      
      if (progress < 1.0) {
        allGone = false;
        
        // Move pixel outward from center
        const moveDistance = progress * 30; // 30px max movement
        const newX = p.originalX + Math.cos(p.angle) * moveDistance;
        const newY = p.originalY + Math.sin(p.angle) * moveDistance;
        p.rect.setPosition(newX, newY);
        
        // Fade out
        p.rect.setAlpha(1.0 - progress);
        
        // Shrink slightly
        p.rect.setScale(1.0 - progress * 0.5);
      } else if (p.rect.visible) {
        p.rect.setVisible(false);
      }
    });
    
    if (allGone) {
      pixels.forEach(p => p.rect.destroy());
      return;
    }
    
    // Continue animation
    scene.time.delayedCall(16, updatePixels);
  };
  
  updatePixels();
}

function handleEnemyHit(scene, enemy) {
  // Only allow eating if enemy is marked as eatable
  if (!enemy.getData('canBeEaten')) return;
  
  // Create TRON grid de-rez effect (cyan color for eatable enemy)
  createDerezEffect(scene, enemy, 0x00e5ff, 800);
  
  enemy.body.enable = false;
  score += KILL_SCORE;
  updateScore();
  
  scene.time.delayedCall(900, () => {
    // Respawn at original spawn position
    const spawnX = enemy.getData('spawnX');
    const spawnY = enemy.getData('spawnY');
    const spawnRotation = enemy.getData('spawnRotation') || 0;
    
    enemy.x = spawnX;
    enemy.y = spawnY;
    enemy.angle = spawnRotation;
    enemy.setData('mode', 'leaving');
    enemy.setVisible(true);
    enemy.body.enable = true;
    
    // Enemy respawns dangerous - can't be eaten again during same power mode
    enemy.setData('canBeEaten', false);
    enemy.list[0].clearTint(); // Clear tint immediately to show it's dangerous
  });
}

function handlePlayerHit(scene) {
  // Pause game immediately
  scenePaused = true;
  
  // Stop all movement
  player.body.setVelocity(0, 0);
  enemies.forEach(e => e.body.setVelocity(0, 0));
  
  // Create TRON grid de-rez effect (white color)
  createDerezEffect(scene, player, 0xffffff, 1200);
  
  lives = Math.max(0, lives - 1);
  updateLivesDisplay(scene);
  
  if (lives > 0) {
    // Wait for derez to finish, then reset
    scene.time.delayedCall(1300, () => {
      resetAfterDeath(scene);
    });
  } else {
    doGameOver(scene);
  }
}

function resetAfterDeath(scene) {
  // Ensure game stays paused during countdown (already set in handlePlayerHit)
  scenePaused = true;
  
  // Reset player to spawn position and rotation
  const spawnX = player.getData('spawnX');
  const spawnY = player.getData('spawnY');
  const spawnRotation = player.getData('spawnRotation');
  
  if (spawnX !== undefined && spawnY !== undefined) {
    player.x = spawnX;
    player.y = spawnY;
    player.angle = spawnRotation || 0;
  } else {
    // Fallback to old system
    player.angle = 0;
    player.x = playerSpawn.c * TILE + TILE / 2;
    player.y = playerSpawn.r * TILE + TILE / 2 + HUD_TOP_PADDING;
  }
  
  // Reset player movement completely
  player.body.setVelocity(0, 0);
  player.setData('currentSpeed', 0);
  player.setData('isDrifting', false);
  player.setVisible(true); // Make player visible again

  // Reset enemies to their spawn positions
  enemies.forEach(e => {
    const ex = e.getData('spawnX');
    const ey = e.getData('spawnY');
    const eRotation = e.getData('spawnRotation') || 0;
    
    if (ex !== undefined && ey !== undefined) {
      e.x = ex;
      e.y = ey;
      e.angle = eRotation;
    } else {
      // Fallback to random pen tile
      const pos = Phaser.Utils.Array.GetRandom(penTiles);
      e.x = pos.c * TILE + TILE / 2;
      e.y = pos.r * TILE + TILE / 2 + HUD_TOP_PADDING;
    }
    
    e.body.setVelocity(0, 0);
    e.setData('mode', 'leaving');
    e.setData('canBeEaten', true); // Reset after death
  });

  // Countdown sequence: 3, 2, 1, GO!
  let countdownText = scene.add.text(width / 2, height / 2, '3', {
    fontFamily: 'monospace', fontSize: '72px', color: '#ffff00', fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(1000);

  scene.time.delayedCall(1000, () => {
    countdownText.setText('2');
  });

  scene.time.delayedCall(2000, () => {
    countdownText.setText('1');
  });

  scene.time.delayedCall(3000, () => {
    countdownText.setText('GO!');
  });

  scene.time.delayedCall(3500, () => {
    scenePaused = false;
    countdownText.destroy();
  });
}

function doGameOver(scene) {
  scenePaused = true;
  gameOverText = scene.add.text(width / 2, height / 2, 'GAME OVER', {
    fontFamily: 'monospace',
    fontSize: '48px',
    color: '#ff4f5e',
  }).setOrigin(0.5).setDepth(1000); // Very high depth to be above everything

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
  // Account for HUD offset when calculating tile position
  const tileR = Math.floor((enemy.y - HUD_TOP_PADDING) / TILE);
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
        // Convert grid coordinates to world coordinates with HUD offset
        goToward(enemy, next.c * TILE + TILE / 2, next.r * TILE + TILE / 2 + HUD_TOP_PADDING, scene);
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
  
  // SVG faces east (right), so no rotation adjustment needed
  enemy.angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
}

function checkPortalWrap(entity) {
  const margin = TILE; // One tile margin for smooth transition
  const playAreaLeft = 0;
  const playAreaRight = PLAY_AREA_WIDTH;
  const playAreaTop = HUD_TOP_PADDING;
  const playAreaBottom = HUD_TOP_PADDING + PLAY_AREA_HEIGHT;
  
  // Horizontal wrap (left/right)
  if (entity.x < playAreaLeft - margin) {
    // Exited left, appear on right
    entity.x = playAreaRight + margin;
  } else if (entity.x > playAreaRight + margin) {
    // Exited right, appear on left
    entity.x = playAreaLeft - margin;
  }
  
  // Vertical wrap (top/bottom)
  if (entity.y < playAreaTop - margin) {
    // Exited top, appear on bottom
    entity.y = playAreaBottom + margin;
  } else if (entity.y > playAreaBottom + margin) {
    // Exited bottom, appear on top
    entity.y = playAreaTop - margin;
  }
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
  // Account for HUD offset when calculating player's tile position
  const playerR = Math.floor((playerObj.y - HUD_TOP_PADDING) / TILE);
  const playerC = Math.floor(playerObj.x / TILE);
  const dist = Phaser.Math.Distance.Between(c, r, playerC, playerR);
  if (dist < 8) return { r: playerR, c: playerC };
  return randomOpenTile();
}

function randomOpenTile() {
  const rows = maze.length;
  const cols = rows > 0 ? maze[0].length : 0;

  if (rows < 3 || cols < 3) {
    return { r: 1, c: 1 };
  }

  for (let tries = 0; tries < 10; tries++) {
    const r = Phaser.Math.Between(1, rows - 2);
    const c = Phaser.Math.Between(1, cols - 2);
    if (!isWall(maze[r][c])) return { r, c };
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
      if (isWall(maze[nr][nc])) continue;
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
  scoreText.setText(`${score}`);

  // Live HUD high score based on current run
  if (score > highScore) {
    highScore = score;
  }

  highScoreText.setText(`${highScore}`);
}

function updateLivesDisplay(scene) {
  // Clear old icons
  livesIcons.forEach(icon => icon.destroy());
  livesIcons = [];
  
  // Create car icons for each life (bottom left)
  const iconWidth = 16; // This will be the height after rotation
  const iconSpacing = 8;
  const startX = 16;
  const startY = height - 40; // 40px from bottom (was 30px)
  
  for (let i = 0; i < lives; i++) {
    const carIcon = scene.add.image(startX + (i * (iconWidth + iconSpacing)), startY, 'redCar');
    
    // Car SVG is wider than tall (aspect ratio ~1.8:1)
    // After 90° rotation, width becomes height
    // So if we want final width of 16px, we need to set the height to 16px before rotation
    const carAspectRatio = 1.8; // red-car.svg is approximately 36x20, so 1.8:1
    carIcon.setDisplaySize(iconWidth * carAspectRatio, iconWidth); // width=28.8, height=16
    
    carIcon.setOrigin(0, 0.5);
    carIcon.setAngle(-90); // Rotate 90° counter-clockwise
    carIcon.setDepth(100); // Make sure icons are always on top
    livesIcons.push(carIcon);
  }
}

function drawVersionTag(scene) {
  scene.add.text(
    width - 10,
    height - 10,
    BUILD_VERSION,
    {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#666666"
    }
  ).setOrigin(1, 1); // bottom-right corner
}