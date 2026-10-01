import { WORLD_HEIGHT } from "./model";
export interface ZoneDefinition {
  name: string;
  english: string;
  start: number;
  end: number;
  color: string;
  sky: string;
  caption: string;
}
export const ZONE_TIPS = [
  "まずは上端へ掛けて、身体へ指を近づけよう。",
  "左右の縁を交互に使って、振り子で渡ろう。",
  "斜めのギフトは高い側の縁を狙おう。",
  "広い足場で落ち着いて、次の縁へ。",
  "横へ続くステージは大きく振って越えよう。",
  "薄いアンテナの上端に、ゆっくり合わせよう。",
  "細い足場は短く巻き取り、丁寧に乗ろう。",
  "星の間を渡って、最後のステージへ。",
] as const;
export interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  kind:
    | "desk"
    | "monitor"
    | "comment"
    | "gift"
    | "rank"
    | "speaker"
    | "antenna"
    | "truss"
    | "star";
  zone: number;
  slippery: boolean;
}
export const ZONES: ZoneDefinition[] = [
  {
    name: "配信準備室",
    english: "THE FIRST STREAM",
    start: 0,
    end: 10,
    color: "#8ce9ff",
    sky: "#426caa",
    caption: "すべては、ここから。",
  },
  {
    name: "コメント渓谷",
    english: "VOICES IN THE SKY",
    start: 10,
    end: 23,
    color: "#76e8ff",
    sky: "#2479c1",
    caption: "みんなの言葉が、足場になる。",
  },
  {
    name: "ギフトタワー",
    english: "GIFTS OF LIGHT",
    start: 23,
    end: 36,
    color: "#f7a7ff",
    sky: "#7561b9",
    caption: "想いが形になった、ギフトの塔。",
  },
  {
    name: "ランクウォール",
    english: "A LITTLE HIGHER",
    start: 36,
    end: 50,
    color: "#ffda85",
    sky: "#465e9b",
    caption: "もっと高く。次のランクへ。",
  },
  {
    name: "イベントステージ",
    english: "IN THE SPOTLIGHT",
    start: 50,
    end: 63,
    color: "#dc98ff",
    sky: "#49316c",
    caption: "みんなの熱が集まる場所。",
  },
  {
    name: "深夜配信エリア",
    english: "AFTER MIDNIGHT",
    start: 63,
    end: 76,
    color: "#85a8ff",
    sky: "#101f49",
    caption: "夜はまだ、終わらない。",
  },
  {
    name: "配信塔",
    english: "BEYOND THE SIGNAL",
    start: 76,
    end: 90,
    color: "#8be6ff",
    sky: "#10294c",
    caption: "世界の向こうへ。",
  },
  {
    name: "星空配信ステージ",
    english: "OUR HIGHEST STREAM",
    start: 90,
    end: 100,
    color: "#ffc9ff",
    sky: "#25164b",
    caption: "たどり着いたら、きっと最高の景色。",
  },
];
export const zoneAt = (pct: number) =>
  Math.max(
    0,
    ZONES.findIndex((z) => pct >= z.start && pct < z.end) === -1
      ? 7
      : ZONES.findIndex((z) => pct >= z.start && pct < z.end),
  );
const kinds: Platform["kind"][] = [
  "monitor",
  "comment",
  "gift",
  "rank",
  "speaker",
  "antenna",
  "truss",
  "star",
];
export function createStage(): Platform[] {
  const result: Platform[] = [
    {
      id: 0,
      x: 0,
      y: -0.5,
      w: 26,
      h: 1,
      angle: 0,
      kind: "desk",
      zone: 0,
      slippery: false,
    },
  ];
  // Deterministic switchbacks: maximum adjacent gap stays within microphone reach.
  let y = 1.6;
  let i = 0;
  while (y < WORLD_HEIGHT - 1.7) {
    const zone = zoneAt((y / WORLD_HEIGHT) * 100);
    const narrow = zone >= 5;
    const lane =
      y > 120 && y < 158
        ? Math.min(1, (y - 120) / 10, (158 - y) / 10) * 4.5
        : y > 210
          ? -Math.min(1, (y - 210) / 10) * 3.5
          : 0;
    const x = lane + Math.sin(i * 1.12) * (zone > 2 ? 2.5 : 2);
    const firstInZone = !result.some((p) => p.zone === zone && p.id !== 0);
    // Keep the original route coordinates so existing in-flight saves remain usable.
    const baseWidth = narrow
      ? 1.25 - (zone === 7 ? 0.25 : 0)
      : 2.9 - zone * 0.22;
    const rhythm =
      zone === 1
        ? i % 3 === 0
          ? 0.6
          : 0
        : zone === 3
          ? i % 3 === 0
            ? 1
            : 0
          : zone === 4
            ? i % 4 === 0
              ? 0.8
              : 0
            : zone >= 6
              ? i % 4 === 0
                ? 0.4
                : 0
              : 0;
    result.push({
      id: i + 1,
      x,
      y,
      w: firstInZone
        ? Math.max(zone === 0 ? 2.9 : 3.2, baseWidth)
        : baseWidth + rhythm,
      h: zone === 5 ? 0.23 : 0.65,
      angle: firstInZone ? 0 : zone === 2 ? Math.sin(i) * 0.12 : 0,
      kind: i === 0 ? "desk" : kinds[zone],
      zone,
      slippery: !firstInZone && zone === 2 && i % 3 === 0,
    });
    y += zone === 0 ? 1.65 : zone === 7 ? 2.65 : 2.25;
    i++;
  }
  result.push({
    id: 999,
    x: result[result.length - 1].x + 0.7,
    y: WORLD_HEIGHT,
    w: 5.6,
    h: 0.6,
    angle: 0,
    kind: "rank",
    zone: 7,
    slippery: false,
  });
  return result;
}
export const STAGE = createStage();
export const CHECKPOINTS = ZONES.map((_, zone) =>
  STAGE.find((p) => p.zone === zone && p.id !== 0)!,
);
export const checkpointPosition = (zone: number) => {
  const p = CHECKPOINTS[zone];
  return { x: p.x, y: p.y + p.h / 2 + 0.46 };
};
