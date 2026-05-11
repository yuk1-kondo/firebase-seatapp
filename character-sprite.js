// character-sprite.js - Canvas sprite animation for the seat list page.
const CHARACTER_ASSET_PATHS = {
  image: './assets/character.png',
  config: './assets/character.json'
};

class CharacterSprite {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.scale = options.scale || 1;
    this.animation = options.animation || 'idle';
    this.facing = options.facing || 'right';
    this.config = null;
    this.image = null;
    this.frameIndex = 0;
    this.frameElapsed = 0;
    this.lastTime = 0;
    this.isReady = false;
    this.isRunning = false;
    this.rafId = null;
  }

  async load(paths = CHARACTER_ASSET_PATHS) {
    const [config, image] = await Promise.all([
      fetch(paths.config).then(response => {
        if (!response.ok) throw new Error(`Failed to load ${paths.config}`);
        return response.json();
      }),
      this.loadImage(paths.image)
    ]);

    this.config = config;
    this.image = image;
    this.isReady = true;
    return this;
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load ${src}`));
      image.src = src;
    });
  }

  start() {
    if (!this.isReady || this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  tick = (time) => {
    if (!this.isRunning) return;

    const delta = Math.min(time - this.lastTime, 100);
    this.lastTime = time;
    this.update(delta);
    this.draw();
    this.rafId = requestAnimationFrame(this.tick);
  };

  update(delta) {
    const definition = this.getAnimationDefinition();
    if (!definition) return;

    this.frameElapsed += delta;
    const frameDuration = 1000 / definition.fps;

    while (this.frameElapsed >= frameDuration) {
      this.frameElapsed -= frameDuration;

      if (definition.loop) {
        this.frameIndex = (this.frameIndex + 1) % definition.frames;
      } else {
        this.frameIndex = Math.min(this.frameIndex + 1, definition.frames - 1);
      }
    }
  }

  draw() {
    if (!this.ctx || !this.config || !this.image) return;

    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, cssWidth, cssHeight);

    const definition = this.getAnimationDefinition();
    if (!definition) return;

    const frameWidth = this.config.frameWidth;
    const frameHeight = this.config.frameHeight;
    const displayWidth = this.config.displayWidth * this.scale;
    const displayHeight = this.config.displayHeight * this.scale;
    const anchorScaleX = displayWidth / frameWidth;
    const anchorScaleY = displayHeight / frameHeight;
    const drawX = Math.round(this.x - this.config.anchor.x * anchorScaleX);
    const drawY = Math.round(this.y - this.config.anchor.y * anchorScaleY);
    const sourceX = this.frameIndex * frameWidth;
    const sourceY = definition.row * frameHeight;

    this.ctx.save();
    this.ctx.imageSmoothingEnabled = false;

    if (this.facing === 'left') {
      this.ctx.translate(drawX + displayWidth, drawY);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.image, sourceX, sourceY, frameWidth, frameHeight, 0, 0, displayWidth, displayHeight);
    } else {
      this.ctx.drawImage(this.image, sourceX, sourceY, frameWidth, frameHeight, drawX, drawY, displayWidth, displayHeight);
    }

    this.ctx.restore();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  setAnimation(animation) {
    if (!this.config?.animations?.[animation] || this.animation === animation) return;

    this.animation = animation;
    this.frameIndex = 0;
    this.frameElapsed = 0;
  }

  setFacing(facing) {
    if (facing === 'left' || facing === 'right') {
      this.facing = facing;
    }
  }

  getAnimationDefinition() {
    return this.config?.animations?.[this.animation] || null;
  }

  isAnimationComplete() {
    const definition = this.getAnimationDefinition();
    return Boolean(definition && !definition.loop && this.frameIndex >= definition.frames - 1);
  }
}

class SeatCharacterController {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.sprite = new CharacterSprite(canvas, options);
    this.keys = new Set();
    this.speed = options.speed || 180;
    this.roamSpeed = options.roamSpeed || 78;
    this.margin = options.margin || 16;
    this.roamTarget = null;
    this.roamPauseUntil = 0;
    this.manualResumeAt = 0;
    this.lastMoveTime = 0;
    this.moveRafId = null;
    this.isStarted = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
  }

  async start() {
    await this.sprite.load();
    this.handleResize();

    if (!this.sprite.x || !this.sprite.y) {
      this.sprite.setPosition(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
    }

    this.pickRoamTarget();
    this.sprite.start();
    this.isStarted = true;
    this.lastMoveTime = performance.now();
    this.moveRafId = requestAnimationFrame(this.updateMovement);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('blur', this.handleBlur);
  }

  destroy() {
    this.isStarted = false;
    this.sprite.stop();
    if (this.moveRafId) cancelAnimationFrame(this.moveRafId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('blur', this.handleBlur);
  }

  updateMovement = (time) => {
    if (!this.isStarted) return;

    const deltaSeconds = Math.min((time - this.lastMoveTime) / 1000, 0.08);
    this.lastMoveTime = time;

    const manualDirection = this.getManualDirection();
    const hasManualInput = manualDirection.x !== 0 || manualDirection.y !== 0;
    const direction = hasManualInput ? manualDirection : this.getRoamDirection(time);
    const isMoving = direction.x !== 0 || direction.y !== 0;

    if (isMoving) {
      const length = Math.hypot(direction.x, direction.y) || 1;
      const speed = hasManualInput ? this.speed : this.roamSpeed;
      const nextX = this.sprite.x + (direction.x / length) * speed * deltaSeconds;
      const nextY = this.sprite.y + (direction.y / length) * speed * deltaSeconds;
      this.sprite.setPosition(...this.clampPosition(nextX, nextY));

      if (direction.x < 0) this.sprite.setFacing('left');
      if (direction.x > 0) this.sprite.setFacing('right');
      this.sprite.setAnimation(direction.y < 0 && direction.x === 0 ? 'back' : 'walk');
    } else if (this.sprite.animation !== 'turn' || this.sprite.isAnimationComplete()) {
      this.sprite.setAnimation('idle');
    }

    this.moveRafId = requestAnimationFrame(this.updateMovement);
  };

  getManualDirection() {
    const left = this.keys.has('arrowleft') || this.keys.has('a');
    const right = this.keys.has('arrowright') || this.keys.has('d');
    const up = this.keys.has('arrowup') || this.keys.has('w');
    const down = this.keys.has('arrowdown') || this.keys.has('s');

    return {
      x: (right ? 1 : 0) - (left ? 1 : 0),
      y: (down ? 1 : 0) - (up ? 1 : 0)
    };
  }

  getRoamDirection(time) {
    if (time < this.manualResumeAt || time < this.roamPauseUntil) {
      return { x: 0, y: 0 };
    }

    if (!this.roamTarget || this.getDistanceToRoamTarget() < 8) {
      this.pickRoamTarget();
      this.roamPauseUntil = time + this.getRandomNumber(350, 1100);
      return { x: 0, y: 0 };
    }

    return {
      x: this.roamTarget.x - this.sprite.x,
      y: this.roamTarget.y - this.sprite.y
    };
  }

  pickRoamTarget() {
    const bounds = this.getMovementBounds();

    this.roamTarget = {
      x: this.getRandomNumber(bounds.minX, bounds.maxX),
      y: this.getRandomNumber(bounds.minY, bounds.maxY)
    };
  }

  getDistanceToRoamTarget() {
    if (!this.roamTarget) return 0;
    return Math.hypot(this.roamTarget.x - this.sprite.x, this.roamTarget.y - this.sprite.y);
  }

  getRandomNumber(min, max) {
    return min + Math.random() * Math.max(max - min, 0);
  }

  clampPosition(x, y) {
    const bounds = this.getMovementBounds();

    return [
      Math.min(Math.max(x, bounds.minX), bounds.maxX),
      Math.min(Math.max(y, bounds.minY), bounds.maxY)
    ];
  }

  getMovementBounds() {
    const displayWidth = this.sprite.config.displayWidth * this.sprite.scale;
    const displayHeight = this.sprite.config.displayHeight * this.sprite.scale;
    const minX = this.margin + displayWidth / 2;
    const maxX = this.canvas.clientWidth - this.margin - displayWidth / 2;
    const minY = this.margin + displayHeight;
    const maxY = this.canvas.clientHeight - this.margin;

    return {
      minX,
      maxX: Math.max(minX, maxX),
      minY,
      maxY: Math.max(minY, maxY)
    };
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (!this.isMovementKey(key) || this.isTextInput(event.target)) return;

    event.preventDefault();
    this.keys.add(key);
    this.manualResumeAt = performance.now() + 1500;
  }

  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    if (!this.isMovementKey(key)) return;

    event.preventDefault();
    this.keys.delete(key);
    this.manualResumeAt = performance.now() + 700;
  }

  handleResize() {
    this.sprite.resize();
    if (this.sprite.config) {
      this.sprite.setPosition(...this.clampPosition(this.sprite.x, this.sprite.y));
      this.pickRoamTarget();
    }
  }

  handleBlur() {
    this.keys.clear();
    this.manualResumeAt = performance.now() + 700;
  }

  isMovementKey(key) {
    return ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(key);
  }

  isTextInput(target) {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
  }
}

window.CHARACTER_ASSET_PATHS = CHARACTER_ASSET_PATHS;
window.CharacterSprite = CharacterSprite;
window.SeatCharacterController = SeatCharacterController;
