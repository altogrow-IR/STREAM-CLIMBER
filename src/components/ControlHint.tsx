import type { Hud } from "../game/model";

const steps = [
  ["足場の光る上端を狙おう", "黄色の輪を押したまま、マイクを掛ける"],
  ["そのまま身体へ近づけよう", "指を身体へ近づけて、ケーブルを巻き取る"],
  ["左右へ動かして振り子", "押したまま左右へ動かし、足場の縁を越える"],
  ["足場の上で指を離そう", "身体が縁を越えたら離し、次の足場へ"],
] as const;

export function ControlHint({ hud }: { hud: Hud }) {
  const learning = hud.tutorialStep < steps.length;
  const [title, detail] = learning
    ? steps[hud.tutorialStep]
    : hud.hooked
      ? ["マイクが掛かった！", "身体へ近づけて巻き取り · 左右で振り子"]
      : ["次の足場の上端へ", "押したまま狙う · 離すとマイクを解除"];
  return (
    <div className={`control-hint ${hud.hooked ? "hooked" : ""}`}>
      <span aria-hidden="true">{hud.hooked ? "◉" : "↗"}</span>
      <div>
        {learning && (
          <span className="lesson-count">
            はじめの練習 {hud.tutorialStep + 1} / 4
          </span>
        )}
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <span className="cable-meter">{hud.cableLength.toFixed(1)}m</span>
    </div>
  );
}
