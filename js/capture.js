export const RATE = 16000;
const WINDOW_MS = 6000;
const HOP_MS = 3000;
const STALL_WINDOWS = 2;

export function resampler(inRate) {
  const step = inRate / RATE;
  let prev = 0;
  let pos = 1;
  return (input) => {
    const at = (k) => (k === 0 ? prev : input[k - 1]);
    const out = [];
    for (; pos < input.length; pos += step) {
      const k = Math.floor(pos);
      const f = pos - k;
      out.push(at(k) * (1 - f) + at(k + 1) * f);
    }
    pos -= input.length;
    prev = input[input.length - 1];
    return Float32Array.from(out);
  };
}

export function ring(size) {
  const data = new Float32Array(size);
  let head = 0;
  let filled = 0;
  let fresh = false;
  return {
    push(samples) {
      for (const x of samples) {
        data[head] = x;
        head = (head + 1) % size;
      }
      filled = Math.min(size, filled + samples.length);
      if (samples.length) fresh = true;
    },
    latest() {
      const samples = new Float32Array(filled);
      for (let k = 0; k < filled; k++) samples[k] = data[(head - filled + k + size) % size];
      const out = { samples, fresh };
      fresh = false;
      return out;
    },
  };
}

export function wav(samples) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 0x7fff), true));
  return new Blob([view.buffer], { type: 'audio/wav' });
}

export function wavSeconds(blob) {
  return (blob.size - 44) / (2 * RATE);
}

export function windower(buffer, onWindow, onStall) {
  let stale = 0;
  return () => {
    const { samples, fresh } = buffer.latest();
    if (fresh) {
      stale = 0;
      onWindow(wav(samples));
    } else if (++stale === STALL_WINDOWS) onStall();
  };
}

export async function startCapture(context, stream, onWindow, onStall) {
  await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url).href);
  const node = new AudioWorkletNode(context, 'capture');
  const source = context.createMediaStreamSource(stream);
  const toRate = resampler(context.sampleRate);
  const buffer = ring((RATE * WINDOW_MS) / 1000);
  node.port.onmessage = (e) => buffer.push(toRate(e.data));
  source.connect(node);
  // A worklet with no output connection may not run.
  node.connect(context.destination);
  const timer = setInterval(windower(buffer, onWindow, onStall), HOP_MS);
  return () => {
    clearInterval(timer);
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
  };
}
