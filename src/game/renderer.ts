import { clamp, type Vec } from "./model";
import { CHECKPOINTS, STAGE, ZONES, type Platform } from "./stage";
export interface RenderState {
  player: Vec;
  mic: Vec;
  rotation: number;
  camera: Vec;
  zone: number;
  cable: number;
  hooked: boolean;
  time: number;
  falling: boolean;
  shake: boolean;
  target: Vec | null;
  clear: boolean;
  checkpointZone: number | null;
  tutorialStep: number;
}
const ASSETS = { player: `${import.meta.env.BASE_URL}assets/player.png` };
export class Renderer {
  ctx: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  scale = 50;
  sprite = new Image();
  backdrop = new Image();
  private assetsRequested = false;
  constructor(public canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("このブラウザではゲーム画面を表示できません。");
    this.ctx = ctx;
    this.resize();
  }
  loadAssets() {
    if (this.assetsRequested) return;
    this.assetsRequested = true;
    this.sprite.decoding = "async";
    this.backdrop.decoding = "async";
    this.sprite.src = ASSETS.player;
    this.backdrop.src = `${import.meta.env.BASE_URL}assets/studio-sky.png`;
  }
  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.8);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.scale = Math.min(
      this.height / 11.8,
      this.width / (this.width < this.height ? 8.8 : 11.8),
    );
  }
  screen(p: Vec, cam: Vec): Vec {
    return {
      x: (p.x - cam.x) * this.scale + this.width / 2,
      y: this.height * 0.7 - (p.y - cam.y) * this.scale,
    };
  }
  world(p: Vec, cam: Vec): Vec {
    return {
      x: (p.x - this.width / 2) / this.scale + cam.x,
      y: (this.height * 0.7 - p.y) / this.scale + cam.y,
    };
  }
  round(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string | CanvasGradient,
    stroke?: string,
  ) {
    const c = this.ctx;
    c.beginPath();
    c.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1.5;
      c.stroke();
    }
  }
  line(x: number, y: number, x2: number, y2: number, color: string, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  text(
    text: string,
    x: number,
    y: number,
    size: number,
    color = "#fff",
    align: CanvasTextAlign = "center",
  ) {
    const c = this.ctx;
    c.fillStyle = color;
    c.font = `600 ${size}px "Segoe UI", sans-serif`;
    c.textAlign = align;
    c.fillText(text, x, y);
  }
  background(s: RenderState) {
    const c = this.ctx,
      w = this.width,
      h = this.height,
      z = ZONES[s.zone];
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, z.sky);
    sky.addColorStop(1, s.zone < 5 ? "#9fbeef" : "#495681");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(
      w * 0.65,
      h * 0.22,
      0,
      w * 0.65,
      h * 0.22,
      w * 0.8,
    );
    glow.addColorStop(0, s.zone < 5 ? "#c5eaff55" : "#c59dff30");
    glow.addColorStop(1, "#698aff00");
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    // Distant broadcast towers scroll slowly to establish altitude without visual collision ambiguity.
    for (let i = 0; i < 9; i++) {
      const tw = 50 + (i % 3) * 30,
        tx =
          ((((i * 183 - s.camera.x * 7) % (w + 220)) + w + 220) % (w + 220)) -
          110;
      const top =
        h * 0.17 + (i % 4) * h * 0.13 + ((s.camera.y * 2.3) % 180) - 180;
      c.fillStyle = i % 2 ? "#29467539" : "#354a8950";
      c.fillRect(tx, top, tw, h + 180);
      this.line(tx + tw / 2, top - 50, tx + tw / 2, top, "#cbeaff70", 1);
      for (let j = 0; j < 15; j++) {
        const yy = top + 20 + j * 44;
        this.round(
          tx + 9,
          yy,
          tw - 18,
          24,
          3,
          j % 3 === 0 ? "#b8a8ff32" : "#85d9ff22",
        );
        this.line(tx, yy + 35, tx + tw, yy + 35, "#a9d8ff35");
      }
    }
    for (let i = 0; i < 38; i++) {
      const x = (i * 149.73) % w,
        y = (i * 91.37 + s.camera.y * 1.5) % (h + 30);
      c.globalAlpha = 0.25 + Math.sin(s.time * 0.5 + i) * 0.2;
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(x, y, i % 4 === 0 ? 2 : 1, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    if (s.zone < 5)
      for (let i = 0; i < 7; i++) {
        const x = ((i * 253.6 - s.camera.x * 4 + w * 3) % (w + 300)) - 150,
          y = ((i * 153.2 + s.camera.y * 3) % (h + 200)) - 100;
        c.fillStyle = "#e5f0ff25";
        c.beginPath();
        c.ellipse(x, y, 120, 30, 0, 0, Math.PI * 2);
        c.ellipse(x + 45, y - 15, 70, 35, 0, 0, Math.PI * 2);
        c.fill();
      }
    if (this.backdrop.complete && this.backdrop.naturalWidth) {
      const ratio =
        Math.max(w / this.backdrop.width, h / this.backdrop.height) * 1.08;
      const bw = this.backdrop.width * ratio,
        bh = this.backdrop.height * ratio;
      c.globalAlpha = s.zone < 5 ? 0.78 : 0.32;
      c.drawImage(
        this.backdrop,
        (w - bw) / 2 - Math.sin(s.camera.x * 0.1) * 10,
        (h - bh) / 2 + Math.sin(s.camera.y * 0.018) * 18,
        bw,
        bh,
      );
      c.globalAlpha = 1;
      c.fillStyle = s.zone < 5 ? "#12386b1c" : `${z.sky}66`;
      c.fillRect(0, 0, w, h);
    }
    if (s.zone === 0) {
      const floor = this.screen({ x: 0, y: 0 }, s.camera).y;
      const floorGradient = c.createLinearGradient(0, floor, 0, h);
      floorGradient.addColorStop(0, "#415479");
      floorGradient.addColorStop(1, "#192c4d");
      c.fillStyle = floorGradient;
      c.fillRect(0, floor, w, h - floor);
      this.line(0, floor, w, floor, "#95ecff", 3);
      for (let i = 0; i < 20; i++)
        this.line(i * 90, floor, i * 130 - 200, h, "#74a8c025");
      const p = this.screen({ x: -5.6, y: 2.1 }, s.camera);
      const k = this.scale;
      this.round(
        p.x - 1.6 * k,
        p.y - 1.5 * k,
        2.9 * k,
        1.8 * k,
        10,
        "#263f63",
        "#8ba4c8",
      );
      this.round(
        p.x - 1.45 * k,
        p.y - 1.35 * k,
        2.6 * k,
        1.45 * k,
        5,
        "#255591",
        "#6bdfff",
      );
      this.text("ON AIR", p.x - 0.15 * k, p.y - 0.65 * k, k * 0.3, "#c9f8ff");
      this.line(
        p.x - 0.2 * k,
        p.y + 0.3 * k,
        p.x - 0.2 * k,
        p.y + 1.3 * k,
        "#576e96",
        9,
      );
      this.line(
        p.x - k,
        p.y + 1.3 * k,
        p.x + 0.6 * k,
        p.y + 1.3 * k,
        "#6787b1",
        8,
      );
    }
  }
  platform(p: Platform, s: RenderState) {
    if (p.id === 0) return;
    const at = this.screen(p, s.camera),
      k = this.scale;
    if (
      at.y < -160 ||
      at.y > this.height + 160 ||
      at.x < -250 ||
      at.x > this.width + 250
    )
      return;
    const c = this.ctx,
      w = p.w * k,
      h = p.h * k,
      color = ZONES[p.zone].color;
    c.save();
    c.translate(at.x, at.y);
    c.rotate(-p.angle);
    c.shadowColor = "#05152f88";
    c.shadowBlur = 15;
    c.shadowOffsetY = 8;
    this.round(
      -w / 2,
      -h / 2,
      w,
      h,
      Math.min(8, h / 3),
      p.slippery
        ? "#b6afee"
        : p.kind === "comment"
          ? "#d8eaff"
          : p.kind === "gift"
            ? "#9b72cc"
            : "#253c61",
      color,
    );
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    this.line(
      -w / 2 + 3,
      -h / 2,
      w / 2 - 3,
      -h / 2,
      p.slippery ? "#ffadfa" : "#a7f6ff",
      3,
    );
    if (p.kind === "comment") {
      this.text(
        ["初見です！", "がんばれ！", "ないす！", "まだいける！"][p.id % 4],
        0,
        Math.min(h * 0.2, 8),
        Math.min(w / 8, 13),
        "#42609c",
      );
    } else if (p.kind === "gift") {
      c.fillStyle = "#f8d497";
      c.fillRect(-w * 0.06, -h / 2, w * 0.12, h);
      this.line(-w * 0.2, -h / 2, 0, -h / 2 - 12, "#ffdca3", 4);
      this.line(w * 0.2, -h / 2, 0, -h / 2 - 12, "#ffdca3", 4);
    } else if (p.kind === "rank") {
      this.text(
        p.id === 999 ? "♛ STREAM STAGE" : ["✦ A", "♛ S", "✦ S+"][p.id % 3],
        0,
        5,
        Math.min(w / 6, 16),
        "#ffdda2",
      );
    } else if (p.kind === "speaker") {
      for (const x of [-w * 0.28, w * 0.28]) {
        c.beginPath();
        c.arc(x, 0, h * 0.3, 0, Math.PI * 2);
        c.fillStyle = "#13233e";
        c.fill();
        c.strokeStyle = "#a898e0";
        c.stroke();
      }
    } else if (p.kind === "truss" || p.kind === "antenna") {
      for (let x = -w / 2; x < w / 2 - 8; x += 14) {
        this.line(x, -h / 2, x + 14, h / 2, color);
        this.line(x, h / 2, x + 14, -h / 2, color);
      }
    } else if (p.kind === "star") {
      this.text("✦", 0, 6, 18, "#ffe8a5");
    } else if (p.kind === "monitor") {
      this.round(-w * 0.35, -h * 0.28, w * 0.7, h * 0.56, 3, "#6689cd");
      this.text("LIVE", 0, 4, Math.min(h * 0.33, 11), "#defaff");
    } else if (p.kind === "desk") {
      this.line(-w * 0.38, h / 2, -w * 0.38, h / 2 + k * 0.65, "#334f76", 5);
      this.line(w * 0.38, h / 2, w * 0.38, h / 2 + k * 0.65, "#334f76", 5);
    }
    // Small cyan contacts mark the grippable top edge, including on touch screens.
    for (const x of [-w * 0.38, w * 0.38]) {
      c.beginPath();
      c.arc(x, -h / 2, 2.5, 0, Math.PI * 2);
      c.fillStyle = "#d4ffff";
      c.fill();
    }
    c.restore();
    if (CHECKPOINTS[p.zone].id === p.id) {
      const unlocked = p.zone <= (s.checkpointZone ?? -1);
      this.round(
        at.x - 43,
        at.y - h / 2 - 33,
        86,
        24,
        6,
        unlocked ? "#133c46" : "#27364b",
        unlocked ? "#8cefd4" : "#ffe3a0",
      );
      this.text(
        unlocked ? "✓ 保存済み" : "⚑ CHECK",
        at.x,
        at.y - h / 2 - 16,
        12,
        unlocked ? "#b1ffe6" : "#ffe3a0",
      );
    }
    if (p.id === 999) {
      c.save();
      c.globalCompositeOperation = "screen";
      for (let i = 0; i < 6; i++) {
        const bx = at.x + (i - 2.5) * k * 0.95;
        const beam = c.createLinearGradient(bx, at.y, bx, at.y - k * 6);
        beam.addColorStop(0, "#91e8ff80");
        beam.addColorStop(1, "#bba2ff00");
        c.fillStyle = beam;
        c.beginPath();
        c.moveTo(bx - 4, at.y);
        c.lineTo(bx - k * 1.3, at.y - k * 6);
        c.lineTo(bx + k * 1.3, at.y - k * 6);
        c.lineTo(bx + 4, at.y);
        c.fill();
      }
      c.restore();
      this.text("♛", at.x, at.y - k * 3.3, k * 1.6, "#ffe3a3");
      this.text(
        "OUR HIGHEST STREAM",
        at.x,
        at.y - k * 2.65,
        k * 0.23,
        "#e4f7ff",
      );
    }
  }
  draw(s: RenderState) {
    const c = this.ctx;
    const dpr = this.canvas.width / this.width;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    this.background(s);
    c.save();
    if (s.falling && s.shake) c.translate(Math.sin(s.time * 33) * 1.4, 0);
    for (const p of STAGE) this.platform(p, s);
    if (s.tutorialStep < 4 && !s.clear) this.guide(s);
    const p = this.screen(s.player, s.camera),
      m = this.screen(s.mic, s.camera),
      k = this.scale;
    const distance = Math.hypot(m.x - p.x, m.y - p.y),
      slack = Math.max(0, s.cable * k - distance);
    c.beginPath();
    c.moveTo(p.x + 7, p.y - 10);
    c.quadraticCurveTo(
      (p.x + m.x) / 2,
      (p.y + m.y) / 2 + slack * 0.5,
      m.x,
      m.y,
    );
    c.strokeStyle = "#172941";
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = s.hooked ? "#7befff" : "#b1ceec";
    c.lineWidth = 1.7;
    c.stroke();
    if (s.target) {
      const t = this.screen(s.target, s.camera);
      c.setLineDash([3, 6]);
      this.line(m.x, m.y, t.x, t.y, "#e4f9ff66");
      c.setLineDash([]);
      c.beginPath();
      c.arc(t.x, t.y, 8, 0, Math.PI * 2);
      c.strokeStyle = "#d4f8ff88";
      c.stroke();
    }
    c.save();
    c.translate(p.x, p.y);
    c.rotate(-clamp(s.rotation, -0.5, 0.5) * 0.35);
    if (this.sprite.complete && this.sprite.naturalWidth) {
      // A silhouette clip keeps the supplied raster's surrounding matte outside gameplay.
      const outline = [
        [0.37, 0.03],
        [0.47, 0.08],
        [0.59, 0.02],
        [0.66, 0.05],
        [0.69, 0.02],
        [0.7, 0.17],
        [0.75, 0.25],
        [0.73, 0.36],
        [0.82, 0.38],
        [0.93, 0.34],
        [0.995, 0.35],
        [0.995, 0.39],
        [0.9, 0.44],
        [0.81, 0.49],
        [0.83, 0.62],
        [0.79, 0.75],
        [0.72, 0.86],
        [0.61, 0.96],
        [0.51, 0.975],
        [0.38, 0.93],
        [0.27, 0.85],
        [0.18, 0.74],
        [0.115, 0.61],
        [0.14, 0.52],
        [0.06, 0.5],
        [0.19, 0.41],
        [0.25, 0.38],
        [0.31, 0.28],
        [0.33, 0.16],
      ];
      c.save();
      c.beginPath();
      outline.forEach(([x, y], i) => {
        const px = -k * 0.83 + x * k * 1.66,
          py = -k * 1.45 + y * k * 1.8;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.closePath();
      c.clip();
      c.drawImage(this.sprite, -k * 0.83, -k * 1.45, k * 1.66, k * 1.8);
      c.restore();
    } else {
      c.beginPath();
      c.ellipse(0, -k * 0.1, k * 0.46, k * 0.48, 0, 0, Math.PI * 2);
      c.fillStyle = "#edf2ff";
      c.fill();
      this.text("◕ᴗ◕", 0, 0, k * 0.25, "#247eae");
      c.beginPath();
      c.arc(0, -k * 0.66, k * 0.24, 0, Math.PI * 2);
      c.fillStyle = "#ded7ff";
      c.fill();
    }
    c.restore();
    c.save();
    c.translate(m.x, m.y);
    c.rotate(Math.atan2(m.y - p.y, m.x - p.x) + Math.PI / 2);
    const mg = c.createLinearGradient(-7, 0, 7, 0);
    mg.addColorStop(0, "#0c1526");
    mg.addColorStop(0.5, "#566b8b");
    mg.addColorStop(1, "#14253e");
    this.round(-k * 0.085, -k * 0.03, k * 0.17, k * 0.5, 3, mg, "#89cde1");
    c.beginPath();
    c.ellipse(0, -k * 0.1, k * 0.19, k * 0.23, 0, 0, Math.PI * 2);
    c.fillStyle = "#101b30";
    c.fill();
    c.strokeStyle = "#a1aacc";
    c.lineWidth = 1.5;
    c.stroke();
    for (let i = -2; i <= 2; i++)
      this.line(
        -k * 0.14,
        -k * 0.1 + i * 3,
        k * 0.14,
        -k * 0.1 + i * 3,
        "#727e9b",
        0.7,
      );
    this.line(-k * 0.095, k * 0.15, k * 0.095, k * 0.15, "#67e7ff", 3);
    c.restore();
    if (s.hooked) {
      c.beginPath();
      c.arc(m.x, m.y, k * 0.29, 0, Math.PI * 2);
      c.strokeStyle = "#a2ffed";
      c.lineWidth = 2;
      c.stroke();
      this.text("LOCK", m.x, m.y - k * 0.4, 12, "#c6fff3");
    }
    if (s.clear) {
      for (let i = 0; i < 100; i++) {
        const x = (i * 127.7 + Math.sin(s.time + i) * 40) % this.width,
          y = (i * 81 + s.time * 75) % (this.height + 50);
        c.fillStyle = ["#83efff", "#ffdf8b", "#d9a7ff", "#fff"][i % 4];
        c.save();
        c.translate(x, y);
        c.rotate(s.time + i);
        c.fillRect(-2, -5, 4, 10);
        c.restore();
      }
    }
    c.restore();
  }
  private guide(s: RenderState) {
    const next = STAGE.find(
      (p) => p.id !== 0 && p.y + p.h / 2 > s.player.y + 0.25,
    );
    let target = { ...s.player };
    if (s.tutorialStep === 0 && next) {
      target = {
        x: next.x + (s.player.x < next.x ? -1 : 1) * (next.w / 2 - 0.12),
        y: next.y + next.h / 2 + 0.15,
      };
    } else if (s.tutorialStep === 2)
      target.x += (s.player.x < s.mic.x ? -1 : 1) * 0.9;
    const t = this.screen(target, s.camera);
    const c = this.ctx;
    c.save();
    c.strokeStyle = "#ffdf91";
    c.lineWidth = 3;
    c.setLineDash([5, 5]);
    c.beginPath();
    c.arc(t.x, t.y, 19 + Math.sin(s.time * 4) * 2, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    this.text(
      ["ここを押したまま", "指をここへ", "左右へ動かす", "縁を越えたら離す"][
        s.tutorialStep
      ],
      clamp(t.x, 76, this.width - 76),
      t.y - 28,
      13,
      "#fff1c7",
    );
    c.restore();
  }
}
