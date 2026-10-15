const API = 'https://api.infomaniak.com/1/ai';
// About 11 s with 1 s sleeps; a later result is older than the windows sent since.
const POLL_LIMIT = 8;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/transcribe') {
      return reply(404, 'Not found');
    }
    if (request.headers.get('X-Password') !== env.SING_PASSWORD) return reply(401, 'Wrong password');

    const form = await request.formData();
    const body = new FormData();
    body.set('file', form.get('file'));
    body.set('model', 'whisper');
    body.set('response_format', 'verbose_json');
    body.set('timestamp_granularities[]', 'word');
    for (const name of ['language', 'prompt']) {
      if (form.get(name)) body.set(name, form.get(name));
    }

    const base = `${API}/${env.INFOMANIAK_PRODUCT_ID}`;
    const headers = { Authorization: `Bearer ${env.INFOMANIAK_TOKEN}` };
    const created = await fetch(`${base}/openai/audio/transcriptions`, { method: 'POST', headers, body });
    if (!created.ok) return reply(502, 'Infomaniak rejected the audio');
    const batchId = unwrap(await created.json()).batch_id;
    if (!batchId) return reply(502, 'Infomaniak gave no batch id');

    const pollMs = Number(env.POLL_MS ?? 1000);
    for (let i = 0; i < POLL_LIMIT; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      const res = await fetch(`${base}/results/${batchId}`, { headers });
      const job = unwrap(await res.json());
      if (job.status === 'success') return reply(200, resultOf(job.data));
      if (job.status === 'failed' || job.status === 'cancelled') return reply(502, 'Transcription failed');
    }
    return reply(504, 'Transcription timed out');
  },
};

// Infomaniak v1 wraps responses as { result, data }; the docs show bare payloads. Accept both.
function unwrap(json) {
  return json.result && json.data !== undefined ? json.data : json;
}

function resultOf(data) {
  const payload = typeof data === 'string' ? JSON.parse(data) : data;
  return { text: payload.text ?? '', words: payload.words ?? [] };
}

function reply(status, payload) {
  const body = typeof payload === 'string' ? { error: payload } : payload;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
