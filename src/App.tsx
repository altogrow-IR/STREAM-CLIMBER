import { useEffect, useRef, useState } from "react";
import type { Engine } from "./game/engine";
import { ControlHint } from "./components/ControlHint";
import { useDialogFocus } from "./hooks/useDialogFocus";
import {
  formatTime,
  progress,
  type Hud,
  type Mode,
  type Settings,
} from "./game/model";
import { loadSave, loadSettings, writeSettings } from "./game/save";
import { ZONES, ZONE_TIPS } from "./game/stage";
type Modal = "help" | "settings" | "new" | null;
const labels: Record<keyof Settings, string> = {
  bgm: "BGM",
  se: "効果音",
  comments: "配信コメント",
  shake: "画面揺れ",
};
function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [saved] = useState(loadSave);
  const [hasSave, setHasSave] = useState(!!saved.data);
  const [mode, setMode] = useState<Mode>("title");
  const [modal, setModal] = useState<Modal>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [hud, setHud] = useState<Hud | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const stream = new URLSearchParams(location.search).get("stream") === "true";
  const debug = new URLSearchParams(location.search).get("debug") === "true";
  const overlayKey = error
    ? "error"
    : (modal ?? (mode === "paused" || mode === "clear" ? mode : null));
  const dialog = useDialogFocus(overlayKey);
  useEffect(() => {
    if (!canvas.current) return;
    const surface = canvas.current;
    let cancelled = false;
    let instance: Engine | null = null;
    void import("./game/engine")
      .then(async ({ Engine }) => {
        if (cancelled) return;
        instance = new Engine(
          surface,
          loadSettings(),
          setHud,
          () => setMode("clear"),
          () => setMode("paused"),
        );
        engine.current = instance;
        await instance.init(saved.data);
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "ゲームを読み込めませんでした。ページを再読み込みしてください。",
          );
      });
    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [saved]);
  useEffect(() => {
    if (engine.current) engine.current.settings = settings;
    writeSettings(settings);
  }, [settings]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal) setModal(null);
      else if (mode === "paused") {
        engine.current?.resume();
        setMode("playing");
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [modal, mode]);
  function start(fresh: boolean) {
    if (!ready) return;
    engine.current?.start(fresh);
    setHasSave(true);
    setMode(engine.current?.mode ?? "playing");
    setModal(null);
  }
  function resume() {
    engine.current?.resume();
    setMode("playing");
  }
  function pause() {
    engine.current?.pause();
    setMode("paused");
  }
  const currentZone = ZONES[hud?.zone ?? 0];
  return (
    <main className={`app ${mode} ${stream ? "stream-mode" : ""}`}>
      <div className="game-surface" inert={!!overlayKey}>
        <canvas
          ref={canvas}
          aria-label="配信塔クライミングゲーム。押したままマイクを狙い、身体へ近づけて巻き取ります。"
        />
        {mode === "title" && (
          <section className="title-screen" aria-label="スタート画面">
            <div className="title-art" />
            <div className="title-shade" />
            <header className="brand-bar">
              <span className="brand-mark">✦</span>
              <span>
                STREAM CLIMBER <small>PROJECT</small>
              </span>
              <span className="edition">PHYSICS CLIMBING / 01</span>
            </header>
            <div className="title-content">
              <div className="eyebrow">
                <span /> CONNECT TO A HIGHER TOMORROW
              </div>
              <p className="title-pre">つながる想いで、もっと高く。</p>
              <h1>
                STREAM
                <br />
                <span>CLIMBER</span>
                <i>✧</i>
              </h1>
              <p className="subtitle">配信で、どこまでも。</p>
              <p className="intro">
                マイクひとつで、まだ見ぬ景色へ。
                <br />
                あなたの挑戦が、誰かの光になる。
              </p>
              <div className="menu">
                <button
                  className="primary"
                  disabled={!ready}
                  onClick={() => (hasSave ? start(false) : start(true))}
                >
                  <span className="play-icon">▷</span>
                  <span>
                    {!ready
                      ? "LOADING…"
                      : hasSave
                        ? "CONTINUE"
                        : "START STREAM"}
                    <small>
                      {hasSave ? "前回のつづきから" : "配信をはじめる"}
                    </small>
                  </span>
                  <span className="arrow">↗</span>
                </button>
                <div className="sub-menu">
                  <button
                    disabled={!ready}
                    onClick={() => (hasSave ? setModal("new") : start(true))}
                  >
                    ＋ NEW GAME
                  </button>
                  <button onClick={() => setModal("help")}>
                    ？ HOW TO PLAY
                  </button>
                  <button
                    aria-label="設定"
                    onClick={() => setModal("settings")}
                  >
                    ⚙
                  </button>
                </div>
              </div>
              {saved.warning && <p className="warning">{saved.warning}</p>}
              {hasSave && hud && (
                <p className="continue-summary">
                  {currentZone.name} · {hud.progress.toFixed(1)}%<br />⚑{" "}
                  {hud.checkpointZone === null
                    ? "最初の足場でチェックポイント保存"
                    : `${ZONES[hud.checkpointZone].name}で保存済み`}
                </p>
              )}
              <div className="best-record">
                <span>♛</span>
                <div>
                  PERSONAL BEST
                  <small>
                    {hud?.bestTime != null
                      ? formatTime(hud.bestTime)
                      : "まだ見ぬ、最高の景色へ。"}
                  </small>
                  {hud?.bestCheckpointTime != null && (
                    <small>復帰あり {formatTime(hud.bestCheckpointTime)}</small>
                  )}
                </div>
                <span className="record-line" />
              </div>
            </div>
            <div className="vertical-copy">まだ見ぬ景色を、みんなと。</div>
            <div className="art-caption">
              <span>YOUR VOICE. YOUR JOURNEY.</span>
              <p>
                あの場所で、
                <br />
                最高の配信を。
              </p>
            </div>
            <footer className="title-footer">
              <span className="live-dot" />
              <span>8つのエリア。ひとつの頂上。</span>
              <span className="footer-right">
                非公式ファン作品 · オリジナルアセット
              </span>
            </footer>
          </section>
        )}
        {mode !== "title" && hud && (
          <>
            <div className="hud top-left">
              <div className="live-badge">
                <span /> LIVE <b>STREAM CLIMBER</b>
              </div>
              <div className="percent">
                {hud.progress.toFixed(1)}
                <span>%</span>
              </div>
              <div className="hud-stats">
                <span>
                  BEST <b>{progress(hud.maxHeight).toFixed(1)}%</b>
                </span>
                <span>
                  TIME <b>{formatTime(hud.elapsed)}</b>
                </span>
              </div>
            </div>
            <div className="zone-name">
              <span>
                ZONE {String(hud.zone + 1).padStart(2, "0")} <i />
              </span>
              <strong>{currentZone.name}</strong>
              <small className="zone-tip">{ZONE_TIPS[hud.zone]}</small>
            </div>
            <div className="checkpoint-status" aria-live="polite">
              <span>
                ⚑{" "}
                {hud.checkpointZone === null
                  ? "最初の足場へ"
                  : `保存地点 ${String(hud.checkpointZone + 1).padStart(2, "0")} / 08`}
              </span>
              <small>
                {hud.checkpointZone === null
                  ? "足場に乗ると保存"
                  : `${ZONES[hud.checkpointZone].name} · 復帰 ${hud.respawns}回`}
              </small>
            </div>
            {mode === "playing" && (
              <button
                className="pause-button"
                aria-label="一時停止"
                onClick={pause}
              >
                Ⅱ <span>PAUSE</span>
              </button>
            )}
            <div
              className="progress-rail"
              aria-label={`現在 ${hud.progress.toFixed(1)}%、最高 ${progress(hud.maxHeight).toFixed(1)}%`}
            >
              <span className="crown">♛</span>
              <div className="rail">
                <div style={{ height: `${hud.progress}%` }} />
                <span
                  className="best-star"
                  style={{ bottom: `${progress(hud.maxHeight)}%` }}
                >
                  ★
                </span>
                <span
                  className="current-dot"
                  style={{ bottom: `${hud.progress}%` }}
                />
              </div>
              <small>0</small>
            </div>
            {settings.comments && (
              <div className="comments">
                <span className="comments-label">
                  LIVE CHAT <i>•••</i>
                </span>
                {hud.message ? (
                  <p
                    key={`${hud.message}-${hud.fallCount}`}
                    className="fall-comment"
                  >
                    {hud.message}
                  </p>
                ) : (
                  <>
                    <p>がんばれ！ ✧</p>
                    <p>まだいける！</p>
                  </>
                )}
              </div>
            )}
            <ControlHint hud={hud} />
            <div className="altitude">
              <span>{Math.max(0, hud.position.y - 0.65).toFixed(1)} m</span>
              <small>ABOVE THE FIRST STREAM</small>
            </div>
            {hud.saveError && (
              <p className="save-warning">
                このブラウザでは進行状況を保存できません。
              </p>
            )}
            {debug && (
              <aside className="debug">
                <b>DEVELOPMENT · 記録対象外</b>
                <div>
                  {engine.current?.showFps ? hud.fps.toFixed(0) : "—"} FPS / 120
                  Hz {engine.current?.slow ? "SLOW" : ""}
                </div>
                <div>
                  XY {hud.position.x.toFixed(2)}, {hud.position.y.toFixed(2)}
                </div>
                <div>
                  V {hud.velocity.x.toFixed(2)}, {hud.velocity.y.toFixed(2)} /
                  cable {hud.cableLength.toFixed(2)}
                </div>
                <select
                  aria-label="デバッグエリア"
                  value={hud.zone}
                  onChange={(e) =>
                    engine.current?.teleport(Number(e.target.value))
                  }
                >
                  {ZONES.map((z, i) => (
                    <option key={z.name} value={i}>
                      {i + 1} {z.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => engine.current?.debugGoal()}>
                  ゴール検証
                </button>
                <small>F1/F5 衝突 · F2 次 · F3 移動 · F4 低速 · F6 FPS</small>
              </aside>
            )}
          </>
        )}
      </div>
      {mode === "paused" && !modal && (
        <div className="overlay" ref={dialog}>
          <section
            className="dialog pause-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="一時停止"
          >
            <div className="eyebrow">TAKE A LITTLE BREATH</div>
            <h2>ひとやすみ。</h2>
            <p>想いは、ここで待っている。</p>
            <button className="primary" autoFocus onClick={resume}>
              ▷ 配信をつづける
            </button>
            <div className="checkpoint-recovery">
              <p>
                {hud?.checkpointZone != null
                  ? `⚑ ${ZONES[hud.checkpointZone].name}`
                  : "最初の足場に乗るとチェックポイントが保存されます。"}
              </p>
              {hud?.checkpointZone != null && (
                <button
                  onClick={() => {
                    engine.current?.returnToCheckpoint();
                    resume();
                  }}
                >
                  チェックポイントへ戻る
                </button>
              )}
              <small>
                大きく落下すると自動復帰。時間と最高到達は引き継ぎます。
              </small>
            </div>
            <div className="dialog-actions">
              <button onClick={() => setModal("help")}>遊び方</button>
              <button onClick={() => setModal("settings")}>設定</button>
              <button onClick={() => setModal("new")}>最初から</button>
            </div>
            <button
              className="text-button"
              onClick={() => {
                engine.current!.mode = "title";
                setMode("title");
              }}
            >
              タイトルへ戻る
            </button>
          </section>
        </div>
      )}
      {mode === "clear" && !modal && (
        <div className="overlay result-overlay" ref={dialog}>
          <section
            className="result"
            role="dialog"
            aria-modal="true"
            aria-label="クリア結果"
          >
            <div className="result-crown">♛</div>
            <div className="eyebrow">THE WORLD IS LISTENING</div>
            <h2>
              STREAM
              <br />
              <em>COMPLETE!</em>
            </h2>
            <p>
              ここまで、来られたよ。
              <br />
              ありがとう。
            </p>
            <div className="result-stats">
              <div>
                <small>TIME</small>
                <b>{formatTime(hud?.elapsed ?? 0)}</b>
              </div>
              <div>
                <small>FALL</small>
                <b>{hud?.fallCount ?? 0}</b>
              </div>
              <div>
                <small>MAX FALL</small>
                <b>{hud?.maxFallDistance.toFixed(1)} m</b>
              </div>
              <div>
                <small>
                  {hud && hud.respawns > 0
                    ? "BEST / 復帰あり"
                    : "BEST / 復帰なし"}
                </small>
                <b>
                  {engine.current?.assisted
                    ? "DEBUG"
                    : formatTime(
                        (hud && hud.respawns > 0
                          ? hud.bestCheckpointTime
                          : hud?.bestTime) ??
                          hud?.elapsed ??
                          0,
                      )}
                </b>
              </div>
            </div>
            <p className="recovery-record">
              チェックポイント復帰 {hud?.respawns ?? 0}回
            </p>
            <span className="result-sign">Good Stream, Good Life.</span>
            <button className="primary" onClick={() => setModal("new")}>
              もう一度、空の向こうへ ↗
            </button>
            <button
              className="text-button"
              onClick={() => {
                engine.current!.mode = "title";
                setMode("title");
              }}
            >
              タイトルへ
            </button>
          </section>
        </div>
      )}
      {modal && !error && (
        <div className="overlay" ref={dialog}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="close"
              aria-label="閉じる"
              autoFocus
              onClick={() => setModal(null)}
            >
              ×
            </button>
            {modal === "help" && (
              <>
                <div className="eyebrow">HOW TO PLAY</div>
                <h2 id="modal-title">マイクで、空へ。</h2>
                <div className="help-visual">
                  <img
                    src={`${import.meta.env.BASE_URL}assets/player.png`}
                    alt="白い配信カプセルに乗るライバー"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="help-cable" />
                  <span className="help-mic">♩</span>
                  <span className="help-arrow">↗</span>
                </div>
                <ol className="instructions">
                  <li>
                    <b>01</b>
                    <div>
                      <strong>遠くを狙って、投げる。</strong>
                      <small>マウス / 指を押したまま、足場へ移動。</small>
                    </div>
                  </li>
                  <li>
                    <b>02</b>
                    <div>
                      <strong>掛かったら、巻き取る。</strong>
                      <small>押したまま身体へ近づけると上昇。</small>
                    </div>
                  </li>
                  <li>
                    <b>03</b>
                    <div>
                      <strong>離して、次の足場へ。</strong>
                      <small>掛けたまま左右で振り子。縁を越えて離す！</small>
                    </div>
                  </li>
                </ol>
                <p className="help-note">
                  各エリアの旗の足場に乗るとチェックポイントを保存。
                  <br />
                  大きな落下で自動復帰。一時停止からも戻れます。
                </p>
                {mode === "paused" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      engine.current?.restartTutorial();
                      setModal(null);
                      resume();
                    }}
                  >
                    操作ガイドをもう一度
                  </button>
                )}
                <button className="primary" onClick={() => setModal(null)}>
                  わかった、やってみよう ↗
                </button>
              </>
            )}
            {modal === "settings" && (
              <>
                <div className="eyebrow">YOUR STREAM, YOUR STYLE</div>
                <h2 id="modal-title">設定</h2>
                <div className="settings-list">
                  {(Object.keys(labels) as (keyof Settings)[]).map((k) => (
                    <label key={k}>
                      <span>{labels[k]}</span>
                      <input
                        type="checkbox"
                        checked={settings[k]}
                        onChange={(e) => {
                          setSettings({ ...settings, [k]: e.target.checked });
                          void engine.current?.audio.unlock();
                        }}
                      />
                      <span className="toggle" />
                    </label>
                  ))}
                </div>
                <p className="help-note">設定はこのブラウザに保存されます。</p>
                <button className="primary" onClick={() => setModal(null)}>
                  完了
                </button>
              </>
            )}
            {modal === "new" && (
              <>
                <div className="eyebrow">A NEW BEGINNING</div>
                <h2 id="modal-title">最初から、もう一度？</h2>
                <p>現在の挑戦を最初からやり直しますか？</p>
                <div className="reset-stats">
                  <span>
                    現在進行度 <b>{hud?.progress.toFixed(1)}%</b>
                  </span>
                  <span>
                    最高到達度{" "}
                    <b>{progress(hud?.maxHeight ?? 0.65).toFixed(1)}%</b>
                  </span>
                  <span>
                    プレイ時間 <b>{formatTime(hud?.elapsed ?? 0)}</b>
                  </span>
                </div>
                <p className="help-note">
                  現在の挑戦とチェックポイントは上書きされます。ベストタイムは残ります。
                </p>
                <div className="dialog-actions">
                  <button onClick={() => setModal(null)}>キャンセル</button>
                  <button className="primary" onClick={() => start(true)}>
                    最初から
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {error && (
        <div className="overlay" ref={dialog}>
          <section className="dialog" role="alert">
            <h2>接続を準備しています</h2>
            <p>{error}</p>
            <button className="primary" onClick={() => location.reload()}>
              再読み込み
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
export default App;
