/* =========================================================
 * effects.js - 結果発表の演出エフェクト集
 *  jackpot : 大当たり（超絶豪華レア宝箱）
 *  win     : あたり（紙吹雪）
 *  normal  : 普通（ふわっと控えめ）
 *  lose    : ハズレ（がっかり・雨）
 *  biglose : 大外れ（爆発オチ）
 * ========================================================= */

const Effects = (() => {
  let audioCtx = null;
  let soundOn = true;

  function setSound(on) { soundOn = on; }

  function ctx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  /* ---------- 簡易シンセ効果音 ---------- */
  function tone(freq, start, dur, type = "sine", vol = 0.2, slideTo = null) {
    if (!soundOn) return;
    const ac = ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime + start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + start + dur);
    g.gain.setValueAtTime(vol, ac.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + dur);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + start);
    o.stop(ac.currentTime + start + dur + 0.05);
  }

  function noise(start, dur, vol = 0.3, lowpass = 800) {
    if (!soundOn) return;
    const ac = ctx();
    const len = ac.sampleRate * dur;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(ac.currentTime + start);
  }

  /* 進行中のカチカチ音 */
  function tick() { tone(880, 0, 0.05, "square", 0.06); }
  /* ドラムロール */
  function drumroll(durSec) {
    if (!soundOn) return;
    const n = Math.floor(durSec / 0.07);
    for (let i = 0; i < n; i++) noise(i * 0.07, 0.05, 0.12, 500);
  }

  const sounds = {
    jackpot() {
      // 豪華ファンファーレ
      const seq = [523, 659, 784, 1047, 784, 1047, 1319];
      seq.forEach((f, i) => tone(f, i * 0.16, 0.3, "triangle", 0.25));
      tone(1568, 1.15, 0.9, "triangle", 0.28);
      seq.forEach((f, i) => tone(f * 2, i * 0.16, 0.2, "sine", 0.1));
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, "triangle", 0.22));
    },
    normal() {
      tone(660, 0, 0.18, "sine", 0.18);
      tone(880, 0.2, 0.3, "sine", 0.18);
    },
    lose() {
      // 下降トロンボーン風
      tone(392, 0, 0.35, "sawtooth", 0.13, 330);
      tone(330, 0.4, 0.35, "sawtooth", 0.13, 262);
      tone(262, 0.8, 0.7, "sawtooth", 0.13, 180);
    },
    biglose() {
      noise(0, 1.2, 0.5, 300);       // 爆発音
      tone(80, 0, 0.8, "sine", 0.4, 30);
      tone(120, 0.05, 0.5, "square", 0.15, 40);
    },
  };

  /* ---------- ビジュアルエフェクト ---------- */
  function el(tag, cls, styles = {}, text = "") {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.assign(e.style, styles);
    if (text) e.textContent = text;
    return e;
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  const visuals = {
    /* 🏆 大当たり：黄金の光線 + 宝箱ドーン + キラキラ */
    jackpot(layer) {
      // 回転する金の光線
      for (let i = 0; i < 10; i++) {
        const ray = el("div", "gold-ray", {
          transform: `rotate(${i * 36}deg)`,
          animationDelay: `${-i * 0.6}s`,
        });
        layer.appendChild(ray);
      }
      // 宝箱
      const wrap = el("div", "treasure-wrap");
      wrap.appendChild(el("div", "treasure", {}, "🪙👑💎"));
      const chest = el("div", "treasure", { position: "absolute", fontSize: "11rem", animationDelay: "0s" }, "🎁");
      wrap.appendChild(chest);
      layer.appendChild(wrap);
      // キラキラを断続的に
      const spawnSparkle = () => {
        const s = el("div", "sparkle", {
          left: rand(5, 92) + "%", top: rand(5, 90) + "%",
        }, ["✨", "⭐", "💫"][Math.floor(rand(0, 3))]);
        layer.appendChild(s);
        setTimeout(() => s.remove(), 1000);
      };
      const iv = setInterval(spawnSparkle, 90);
      // 金色の紙吹雪も
      for (let i = 0; i < 80; i++) {
        const c = el("div", "confetti", {
          left: rand(0, 100) + "%",
          background: ["#ffd700", "#ffec8b", "#ffa500", "#fff8dc"][i % 4],
          width: rand(8, 16) + "px", height: rand(8, 16) + "px",
          borderRadius: i % 2 ? "50%" : "2px",
          animationDuration: rand(2, 4) + "s",
          animationDelay: rand(0, 1.5) + "s",
        });
        layer.appendChild(c);
      }
      return () => clearInterval(iv);
    },

    /* 🎉 あたり：カラフル紙吹雪 */
    win(layer) {
      const colors = ["#ff5252", "#ffb300", "#66bb6a", "#42a5f5", "#ab47bc", "#ff7043"];
      for (let i = 0; i < 120; i++) {
        const c = el("div", "confetti", {
          left: rand(0, 100) + "%",
          background: colors[i % colors.length],
          width: rand(7, 14) + "px", height: rand(10, 18) + "px",
          borderRadius: i % 3 === 0 ? "50%" : "2px",
          animationDuration: rand(2, 4.5) + "s",
          animationDelay: rand(0, 2) + "s",
        });
        layer.appendChild(c);
      }
      return () => {};
    },

    /* 😊 普通：ふわっと桜と葉っぱ */
    normal(layer) {
      const items = ["🌸", "🍃", "🌼"];
      for (let i = 0; i < 16; i++) {
        const f = el("div", "float-item", {
          left: rand(0, 95) + "%",
          animationDuration: rand(4, 7) + "s",
          animationDelay: rand(0, 2.5) + "s",
          fontSize: rand(1.2, 2.2) + "rem",
        }, items[i % items.length]);
        layer.appendChild(f);
      }
      return () => {};
    },

    /* 😞 ハズレ：暗雲 + 雨 + しょんぼり */
    lose(layer) {
      layer.appendChild(el("div", "gloom-cloud", { left: "18%", top: "6%" }, "🌧️"));
      layer.appendChild(el("div", "gloom-cloud", { left: "62%", top: "10%", animationDelay: "-2s" }, "☁️"));
      layer.appendChild(el("div", "sad-face", {}, "😞"));
      for (let i = 0; i < 60; i++) {
        const d = el("div", "rain-drop", {
          left: rand(0, 100) + "%",
          animationDuration: rand(0.7, 1.4) + "s",
          animationDelay: rand(0, 2.5) + "s",
        });
        layer.appendChild(d);
      }
      return () => {};
    },

    /* 💣 大外れ：フラッシュ + 爆発 + 破片 + 煙 + 画面シェイク */
    biglose(layer) {
      layer.appendChild(el("div", "flash"));
      const modal = layer.closest(".modal");
      const content = modal ? modal.querySelector(".modal-content") : null;
      if (content) {
        content.classList.add("shake");
        setTimeout(() => content.classList.remove("shake"), 600);
      }
      setTimeout(() => layer.appendChild(el("div", "explosion-core", {}, "💥")), 80);
      // 破片
      const debrisChars = ["🔥", "💢", "🪨", "💨", "⚡"];
      for (let i = 0; i < 26; i++) {
        const ang = rand(0, Math.PI * 2);
        const dist = rand(120, 420);
        const d = el("div", "debris", {
          "--dx": Math.cos(ang) * dist + "px",
          "--dy": Math.sin(ang) * dist + "px",
          animationDuration: rand(0.6, 1.3) + "s",
          animationDelay: rand(0.05, 0.25) + "s",
        }, debrisChars[i % debrisChars.length]);
        layer.appendChild(d);
      }
      // 煙
      for (let i = 0; i < 6; i++) {
        const s = el("div", "smoke", {
          "--sx": rand(-140, 140) + "px",
          animationDelay: rand(0.3, 1) + "s",
        }, "💨");
        layer.appendChild(s);
      }
      return () => {};
    },
  };

  /**
   * 演出を再生。後片付け用の関数を返す。
   * @param {string} type jackpot|win|normal|lose|biglose
   * @param {HTMLElement} layer エフェクト描画レイヤー
   */
  function play(type, layer) {
    layer.innerHTML = "";
    (sounds[type] || sounds.normal)();
    const cleanup = (visuals[type] || visuals.normal)(layer);
    return () => { cleanup && cleanup(); layer.innerHTML = ""; };
  }

  return { play, setSound, tick, drumroll };
})();
