/**
 * The in-app alarm sound: three short tones (880 → 1320 → 880 Hz) and a vibration where the device has one.
 * Browsers only play sound after the person has touched the page once; until then it vibrates only.
 */
let ctx = null;

/** Unlock audio on the first tap / click (call once at start-up). */
export function unlockAudioOnFirstTap() {
  const unlock = () => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      void ctx.resume();
    } catch {
      /* no audio */
    }
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
}

/** @param {boolean} sound play tones (else vibrate only) */
export function chime(sound = true) {
  navigator.vibrate?.([180, 90, 180]);
  if (!sound || !ctx || ctx.state !== 'running') return;
  try {
    [880, 1320, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.2;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* ignore */
  }
}
