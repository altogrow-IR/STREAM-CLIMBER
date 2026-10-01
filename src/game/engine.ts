import RAPIER from "@dimforge/rapier2d-compat";
import { AudioSystem } from "./audio";
import {
  clamp,
  initialStats,
  PHYSICS as P,
  progress,
  updateFall,
  WORLD_HEIGHT,
  type BodyState,
  type Hud,
  type Mode,
  type SaveData,
  type Settings,
  type Vec,
} from "./model";
import { Renderer } from "./renderer";
import { writeSave } from "./save";
import { CHECKPOINTS, checkpointPosition, STAGE, zoneAt, ZONES } from "./stage";
let initialization: Promise<void> | null = null;
export class Engine {
  world!: RAPIER.World;
  player!: RAPIER.RigidBody;
  mic!: RAPIER.RigidBody;
  ground!: RAPIER.RigidBody;
  micCollider!: RAPIER.Collider;
  playerCollider!: RAPIER.Collider;
  private platformColliders = new Map<number, RAPIER.Collider>();
  anchorJoint: RAPIER.ImpulseJoint | null = null;
  renderer: Renderer;
  audio = new AudioSystem();
  mode: Mode = "title";
  stats = initialStats();
  cableLength: number = P.cableMax;
  anchor: Vec | null = null;
  camera: Vec = { x: 0, y: 1.1 };
  bestTime: number | null = null;
  bestCheckpointTime: number | null = null;
  checkpointZone: number | null = null;
  respawns = 0;
  tutorialStep = 0;
  pointer: Vec | null = null;
  pointerId: number | null = null;
  settings: Settings;
  debug: boolean;
  debugDraw = false;
  slow = false;
  showFps = true;
  assisted = false;
  fps = 60;
  message = "";
  saveError = false;
  target: Vec | null = null;
  cleared = false;
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private hudClock = 0;
  private saveClock = 0;
  private visualTime = 0;
  private disposed = false;
  private commentIndex = 0;
  private messageUntil = 0;
  private grabCooldown = 0;
  private dirty = false;
  private lastGrip: Vec | null = null;
  private hookHeight = 0;
  constructor(
    public canvas: HTMLCanvasElement,
    settings: Settings,
    public onHud: (h: Hud) => void,
    public onClear: () => void,
    public onPause: () => void,
  ) {
    this.renderer = new Renderer(canvas);
    this.settings = settings;
    this.debug = new URLSearchParams(location.search).get("debug") === "true";
    this.assisted = this.debug;
  }
  async init(save: SaveData | null) {
    initialization ??= RAPIER.init();
    await initialization;
    if (this.disposed) return;
    this.world = new RAPIER.World({ x: 0, y: P.gravity });
    this.world.timestep = P.step;
    this.world.integrationParameters.maxCcdSubsteps = 3;
    this.ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const p of STAGE) {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2)
          .setTranslation(p.x, p.y)
          .setRotation(p.angle)
          .setFriction(p.slippery ? 0.13 : 1.5),
        this.ground,
      );
      this.platformColliders.set(p.id, collider);
    }
    // Boundary rails are outside the normal view; prevent accidental loss beyond the authored world.
    for (const x of [-13, 13])
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.3, 140).setTranslation(x, 120),
        this.ground,
      );
    this.player = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-1.5, 0.65)
        .setLinearDamping(P.airDrag)
        .setAngularDamping(4)
        .setCcdEnabled(true),
    );
    this.playerCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(P.playerRadius)
        .setMass(P.playerMass)
        .setFriction(P.playerFriction)
        .setRestitution(P.restitution),
      this.player,
    );
    this.mic = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-2.3, 0.8)
        .setLinearDamping(0.8)
        .setCcdEnabled(true),
    );
    this.micCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(P.micRadius)
        .setMass(P.micMass)
        .setFriction(P.micFriction)
        .setRestitution(P.restitution),
      this.mic,
    );
    this.world.createImpulseJoint(
      RAPIER.JointData.rope(P.cableMax + 0.2, { x: 0, y: 0 }, { x: 0, y: 0 }),
      this.player,
      this.mic,
      true,
    );
    if (save) this.restore(save);
    this.camera = {
      x: this.player.translation().x * 0.65,
      y: this.player.translation().y + 0.5,
    };
    this.canvas.addEventListener("pointerdown", this.down);
    this.canvas.addEventListener("pointermove", this.move);
    this.canvas.addEventListener("pointerup", this.up);
    this.canvas.addEventListener("pointercancel", this.cancel);
    this.canvas.addEventListener("lostpointercapture", this.cancel);
    window.addEventListener("resize", this.resize);
    window.addEventListener("blur", this.interruption);
    window.addEventListener("keydown", this.key);
    window.addEventListener("beforeunload", this.persist);
    document.addEventListener("visibilitychange", this.visibility);
    if (this.debug) Object.assign(window, { climberDebug: this });
    this.emit();
    this.raf = requestAnimationFrame(this.frame);
  }
  private bodyState(b: RAPIER.RigidBody): BodyState {
    return {
      position: { ...b.translation() },
      velocity: { ...b.linvel() },
      rotation: b.rotation(),
      angularVelocity: b.angvel(),
    };
  }
  snapshot(): SaveData {
    return {
      version: 2,
      updatedAt: Date.now(),
      player: this.bodyState(this.player),
      mic: this.bodyState(this.mic),
      cableLength: this.cableLength,
      anchor: this.anchor ? { ...this.anchor } : null,
      stats: { ...this.stats },
      cleared: this.cleared,
      bestTime: this.bestTime,
      bestCheckpointTime: this.bestCheckpointTime,
      checkpointZone: this.checkpointZone,
      respawns: this.respawns,
      tutorialStep: this.tutorialStep,
    };
  }
  restore(s: SaveData) {
    this.release();
    for (const [b, state] of [
      [this.player, s.player],
      [this.mic, s.mic],
    ] as const) {
      b.setTranslation(state.position, true);
      b.setLinvel(state.velocity, true);
      b.setRotation(state.rotation, true);
      b.setAngvel(state.angularVelocity, true);
    }
    this.stats = { ...s.stats };
    this.cableLength = s.cableLength;
    this.bestTime = s.bestTime;
    this.bestCheckpointTime = s.bestCheckpointTime;
    this.checkpointZone = s.checkpointZone;
    this.respawns = s.respawns;
    this.tutorialStep = s.tutorialStep;
    this.cleared = s.cleared;
    if (s.anchor) this.grab(s.anchor);
  }
  start(fresh = false) {
    this.renderer.loadAssets();
    if (fresh) {
      this.checkpointZone = null;
      this.respawns = 0;
      this.tutorialStep = 0;
      this.lastGrip = null;
      this.cleared = false;
      this.release();
      this.stats = initialStats();
      this.player.setTranslation({ x: -1.5, y: 0.65 }, true);
      this.player.setLinvel({ x: 0, y: 0 }, true);
      this.player.setRotation(0, true);
      this.player.setAngvel(0, true);
      this.mic.setTranslation({ x: -2.3, y: 0.8 }, true);
      this.mic.setLinvel({ x: 0, y: 0 }, true);
      this.mic.setRotation(0, true);
      this.mic.setAngvel(0, true);
      this.cableLength = P.cableMax;
      this.camera = { x: -1, y: 1.1 };
      this.assisted = this.debug;
    }
    if (this.cleared && !fresh) {
      this.mode = "clear";
      this.emit();
      this.onClear();
      return;
    }
    this.mode = "playing";
    this.clearInput();
    this.accumulator = 0;
    this.last = 0;
    this.dirty = true;
    void this.audio.unlock();
    this.persist();
    this.emit();
  }
  pause() {
    if (this.mode !== "playing") return;
    this.persist();
    this.mode = "paused";
    this.clearInput();
    this.emit();
  }
  resume() {
    this.mode = "playing";
    this.last = 0;
    this.accumulator = 0;
    void this.audio.unlock();
  }
  private resize = () => {
    if (this.pointerId !== null) this.interruption();
    this.renderer.resize();
  };
  private clearInput() {
    const id = this.pointerId;
    this.pointer = null;
    this.pointerId = null;
    this.target = null;
    if (id !== null && this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
  }
  private interruption = () => {
    if (this.mode !== "playing") return;
    this.pause();
    this.onPause();
  };
  private down = (e: PointerEvent) => {
    if (this.mode !== "playing" || this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointer = { x: e.offsetX, y: e.offsetY };
    void this.audio.unlock();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId === this.pointerId)
      this.pointer = { x: e.offsetX, y: e.offsetY };
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.clearInput();
    this.lastGrip = this.anchor ? { ...this.anchor } : null;
    this.release();
    this.grabCooldown = 0.18;
  };
  private cancel = (e: PointerEvent) => {
    if (this.pointerId === null || e.pointerId !== this.pointerId) return;
    this.interruption();
  };
  private visibility = () => {
    if (document.hidden && this.mode === "playing") {
      this.pause();
      this.onPause();
    }
  };
  private key = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.mode === "playing") {
      this.pause();
      this.onPause();
    }
    if (!this.debug) return;
    if (/^F[1-6]$/.test(e.key)) e.preventDefault();
    if (e.key === "F1" || e.key === "F5") this.debugDraw = !this.debugDraw;
    if (e.key === "F2")
      this.teleport((zoneAt(progress(this.player.translation().y)) + 1) % 8);
    if (e.key === "F3")
      this.teleport(zoneAt(progress(this.player.translation().y)));
    if (e.key === "F4") this.slow = !this.slow;
    if (e.key === "F6") this.showFps = !this.showFps;
  };
  teleport(zone: number) {
    if (!this.debug) return;
    this.assisted = true;
    this.release();
    const p = STAGE.find((p) => p.zone === zone && p.id !== 0)!;
    this.player.setTranslation({ x: p.x, y: p.y + p.h / 2 + 0.65 }, true);
    this.player.setLinvel({ x: 0, y: 0 }, true);
    this.mic.setTranslation({ x: p.x + 0.5, y: p.y + 1.5 }, true);
    this.mic.setLinvel({ x: 0, y: 0 }, true);
    this.stats.peak = p.y;
    this.stats.falling = false;
    this.camera = { x: p.x * 0.8, y: p.y + 1 };
    this.emit();
  }
  debugGoal() {
    if (!this.debug) return;
    this.assisted = true;
    this.release();
    const p = STAGE[STAGE.length - 1];
    this.player.setTranslation({ x: p.x, y: WORLD_HEIGHT + 1 }, true);
    this.player.setLinvel({ x: 0, y: 0 }, true);
    this.mic.setTranslation({ x: p.x, y: WORLD_HEIGHT + 2 }, true);
    this.mic.setLinvel({ x: 0, y: 0 }, true);
  }
  persist = () => {
    if (this.world && this.dirty && !this.assisted) {
      this.saveError = !writeSave(this.snapshot());
    }
  };
  restartTutorial() {
    this.tutorialStep = 0;
    this.persist();
    this.emit();
  }
  returnToCheckpoint() {
    if (
      this.checkpointZone === null ||
      this.cleared ||
      (this.mode !== "playing" && this.mode !== "paused")
    )
      return false;
    if (this.stats.falling)
      updateFall(this.stats, this.player.translation().y, 0);
    this.clearInput();
    this.release();
    const at = checkpointPosition(this.checkpointZone);
    for (const [body, position] of [
      [this.player, at],
      [this.mic, { x: at.x + 0.65, y: at.y + 0.15 }],
    ] as const) {
      body.setTranslation(position, true);
      body.setLinvel({ x: 0, y: 0 }, true);
      body.setRotation(0, true);
      body.setAngvel(0, true);
    }
    this.lastGrip = null;
    this.grabCooldown = 0.18;
    this.cableLength = P.cableMax;
    this.stats.peak = at.y;
    this.stats.falling = false;
    this.stats.fallStart = at.y;
    this.camera = { x: at.x * 0.8, y: at.y + 0.3 };
    this.respawns++;
    this.message = "チェックポイントから、もう一度！";
    this.messageUntil = this.visualTime + 4;
    this.persist();
    this.emit();
    return true;
  }
  private grab(at: Vec) {
    this.anchor = { ...at };
    this.hookHeight = this.player.translation().y;
    this.anchorJoint = this.world.createImpulseJoint(
      RAPIER.JointData.fixed(at, 0, { x: 0, y: 0 }, this.mic.rotation()),
      this.ground,
      this.mic,
      true,
    );
    this.audio.hook(this.settings.se);
  }
  private release() {
    if (this.anchorJoint) {
      this.world.removeImpulseJoint(this.anchorJoint, true);
      this.anchorJoint = null;
    }
    this.anchor = null;
  }
  step(dt: number) {
    const p = this.player.translation(),
      m = this.mic.translation();
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    if (this.pointer) {
      const worldTarget = this.renderer.world(this.pointer, this.camera);
      const dx = worldTarget.x - p.x,
        dy = worldTarget.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const length = clamp(d, P.cableMin, P.cableMax);
      this.cableLength += clamp(
        length - this.cableLength,
        -P.reelSpeed * dt,
        P.reelSpeed * dt,
      );
      this.target = { x: p.x + (dx / d) * length, y: p.y + (dy / d) * length };
      if (this.anchor) {
        if (this.tutorialStep === 1 && p.y > this.hookHeight + 0.4)
          this.tutorialStep = 2;
        const ax = m.x - p.x,
          ay = m.y - p.y,
          ad = Math.hypot(ax, ay) || 1;
        const tx = -ay / ad,
          ty = ax / ad;
        const input = clamp(-dx / 1.2, -1, 1);
        if (this.tutorialStep === 2 && Math.abs(dx) > 0.6)
          this.tutorialStep = 3;
        this.player.applyImpulse(
          {
            x: tx * input * P.swingForce * dt,
            y: ty * input * P.swingForce * dt,
          },
          true,
        );
      }
      if (!this.anchor) {
        const v = this.mic.linvel();
        let fx = (this.target.x - m.x) * P.aimSpring - v.x * P.aimDamping,
          fy =
            (this.target.y - m.y) * P.aimSpring -
            v.y * P.aimDamping -
            P.gravity * P.micMass;
        const f = Math.hypot(fx, fy);
        if (f > P.maxAimForce) {
          fx *= P.maxAimForce / f;
          fy *= P.maxAimForce / f;
        }
        this.mic.applyImpulse({ x: fx * dt, y: fy * dt }, true);
      }
    }
    const dx = m.x - p.x,
      dy = m.y - p.y,
      d = Math.hypot(dx, dy);
    if (d > this.cableLength) {
      const pv = this.player.linvel(),
        mv = this.mic.linvel();
      const speed = ((mv.x - pv.x) * dx + (mv.y - pv.y) * dy) / d;
      const force = clamp(
        (d - this.cableLength) * P.tension + speed * P.damping,
        0,
        P.maxTension,
      );
      const impulse = { x: (dx / d) * force * dt, y: (dy / d) * force * dt };
      this.player.applyImpulse(impulse, true);
      this.mic.applyImpulse({ x: -impulse.x, y: -impulse.y }, true);
    }
    this.world.step();
    // Joint mutation is deferred until after the physics step/contact iteration.
    const micPosition = this.mic.translation();
    if (
      this.lastGrip &&
      Math.hypot(
        micPosition.x - this.lastGrip.x,
        micPosition.y - this.lastGrip.y,
      ) > 0.7
    )
      this.lastGrip = null;
    if (
      this.pointer &&
      !this.anchor &&
      !this.lastGrip &&
      this.grabCooldown <= 0
    ) {
      let contact = false;
      this.world.contactPairsWith(this.micCollider, (other) => {
        if (other.parent()?.handle !== this.ground.handle) return;
        const center = other.translation();
        const rotation = other.rotation();
        const mic = this.mic.translation();
        const localY =
          -(mic.x - center.x) * Math.sin(rotation) +
          (mic.y - center.y) * Math.cos(rotation);
        const halfHeight = other.halfExtents()?.y ?? 0;
        if (center.y + halfHeight < 0.1 || localY < halfHeight - 0.05) return;
        this.world.contactPair(this.micCollider, other, (manifold) => {
          if (manifold.numSolverContacts() > 0) contact = true;
        });
      });
      if (contact) {
        this.grab({ ...this.mic.translation() });
        if (this.tutorialStep === 0) this.tutorialStep = 1;
      }
    }
    const pos = this.player.translation(),
      v = this.player.linvel();
    this.stats.elapsed += dt;
    const wasFalling = this.stats.falling;
    const fall = updateFall(this.stats, pos.y, v.y);
    if (!wasFalling && this.stats.falling) {
      this.message = ["あっ", "え？？？", "まだいける！"][
        this.commentIndex++ % 3
      ];
      this.messageUntil = this.visualTime + 4;
    }
    if (fall > 0) {
      this.audio.fall(fall, this.settings.se);
      const comments =
        fall > 25
          ? [
              "ここまで戻ってきた…",
              "おかえり！ずっと待ってた",
              "まだ、終わらない。",
            ]
          : fall > 10
            ? ["え？？？", "ここ見たことある", "これはつらい…"]
            : ["あっ", "まだいける！", "だいじょうぶ！"];
      this.message = comments[this.commentIndex++ % comments.length];
      this.messageUntil = this.visualTime + 4;
    }
    const zone = zoneAt(progress(pos.y));
    for (const cp of CHECKPOINTS) {
      const top = cp.y + cp.h / 2;
      if (cp.zone <= (this.checkpointZone ?? -1)) continue;
      // A checkpoint is earned by standing on its safe platform, never by a passing microphone.
      if (
        Math.abs(pos.x - cp.x) < cp.w / 2 &&
        Math.abs(pos.y - top - P.playerRadius) < 0.12 &&
        Math.abs(v.y) < 1.5
      ) {
        let supported = false;
        this.world.contactPair(
          this.playerCollider,
          this.platformColliders.get(cp.id)!,
          (manifold) => {
            if (manifold.numSolverContacts() > 0) supported = true;
          },
        );
        if (!supported) continue;
        this.checkpointZone = cp.zone;
        this.message = `${ZONES[cp.zone].name} · チェックポイント保存`;
        this.messageUntil = this.visualTime + 4;
        this.audio.hook(this.settings.se);
        this.persist();
        this.emit();
      }
    }
    if (
      this.tutorialStep === 3 &&
      !this.anchor &&
      pos.y > 2.3 &&
      Math.abs(v.y) < 1
    )
      this.tutorialStep = 4;
    if (
      this.checkpointZone !== null &&
      pos.y < CHECKPOINTS[this.checkpointZone].y - P.checkpointFallMargin
    ) {
      this.returnToCheckpoint();
      return;
    }
    this.audio.update(zone, v.y, dt, this.settings);
    const finish = STAGE[STAGE.length - 1];
    if (
      pos.y >= WORLD_HEIGHT + 0.6 &&
      Math.abs(pos.x - finish.x) < finish.w / 2 &&
      v.y < 2
    ) {
      this.mode = "clear";
      this.cleared = true;
      this.clearInput();
      this.stats.maxHeight = WORLD_HEIGHT + 0.65;
      if (!this.assisted) {
        if (this.respawns > 0)
          this.bestCheckpointTime = Math.min(
            this.bestCheckpointTime ?? Infinity,
            this.stats.elapsed,
          );
        else
          this.bestTime = Math.min(
            this.bestTime ?? Infinity,
            this.stats.elapsed,
          );
      }
      this.audio.win(this.settings.se);
      this.persist();
      this.emit();
      this.onClear();
    }
  }
  private frame = (timestamp: number) => {
    if (this.disposed) return;
    if (this.mode === "title") {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const raw = this.last
      ? Math.max(0, (timestamp - this.last) / 1000)
      : 1 / 60;
    this.last = timestamp;
    const dt = Math.min(raw, 0.1);
    this.visualTime += dt;
    this.fps += (1 / Math.max(raw, 0.001) - this.fps) * 0.05;
    if (this.mode === "playing") {
      this.accumulator += dt * (this.slow ? 0.25 : 1);
      let steps = 0;
      while (
        this.accumulator >= P.step &&
        steps < P.catchUp &&
        this.mode === "playing"
      ) {
        this.step(P.step);
        this.accumulator -= P.step;
        steps++;
      }
      if (steps === P.catchUp) this.accumulator = 0;
      this.saveClock += dt;
      if (this.saveClock >= P.saveInterval) {
        this.saveClock = 0;
        this.persist();
      }
    }
    const p = this.player.translation();
    const factor = 1 - Math.exp(-dt * 5);
    this.camera.x += (p.x * 0.8 - this.camera.x) * factor;
    this.camera.y += (p.y + 0.3 - this.camera.y) * factor;
    const visible = (this.renderer.height * 0.24) / this.renderer.scale;
    this.camera.y = clamp(this.camera.y, p.y - visible, p.y + visible);
    this.renderer.draw({
      player: p,
      mic: this.mic.translation(),
      rotation: this.player.rotation(),
      camera: this.camera,
      zone: zoneAt(progress(p.y)),
      cable: this.cableLength,
      hooked: !!this.anchor,
      time: this.visualTime,
      falling: this.stats.falling,
      shake: this.settings.shake,
      target: this.target,
      clear: this.mode === "clear",
      checkpointZone: this.checkpointZone,
      tutorialStep: this.tutorialStep,
    });
    if (this.debug && this.debugDraw) {
      const { vertices } = this.world.debugRender();
      const c = this.renderer.ctx;
      for (let i = 0; i < vertices.length; i += 4) {
        const a = this.renderer.screen(
            { x: vertices[i], y: vertices[i + 1] },
            this.camera,
          ),
          b = this.renderer.screen(
            { x: vertices[i + 2], y: vertices[i + 3] },
            this.camera,
          );
        c.strokeStyle = "#3fff7b";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
    this.hudClock += dt;
    if (this.hudClock > 0.1) {
      this.hudClock = 0;
      this.emit();
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  emit() {
    if (!this.player) return;
    const position = { ...this.player.translation() };
    this.onHud({
      ...this.stats,
      progress: progress(position.y),
      zone: zoneAt(progress(position.y)),
      cableLength: this.cableLength,
      hooked: !!this.anchor,
      fps: this.fps,
      position,
      velocity: { ...this.player.linvel() },
      bestTime: this.bestTime,
      message: this.visualTime < this.messageUntil ? this.message : "",
      saveError: this.saveError,
      checkpointZone: this.checkpointZone,
      respawns: this.respawns,
      tutorialStep: this.tutorialStep,
      bestCheckpointTime: this.bestCheckpointTime,
    });
  }
  zoneLabel() {
    return ZONES[zoneAt(progress(this.player.translation().y))].name;
  }
  destroy() {
    this.persist();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("lostpointercapture", this.cancel);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("blur", this.interruption);
    window.removeEventListener("keydown", this.key);
    window.removeEventListener("beforeunload", this.persist);
    document.removeEventListener("visibilitychange", this.visibility);
    this.world?.free();
    this.audio.destroy();
  }
}
