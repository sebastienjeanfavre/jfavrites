import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const env = { SING_PASSWORD: 'pw', INFOMANIAK_TOKEN: 't', INFOMANIAK_PRODUCT_ID: '7', POLL_MS: 0 };
const BASE = 'https://api.infomaniak.com/1/ai/7';

function request(password = 'pw') {
  const form = new FormData();
  form.set('file', new File(['audio'], 'chunk.mp4', { type: 'audio/mp4' }));
  form.set('language', 'en');
  form.set('prompt', 'Amazing grace');
  return new Request('https://w/transcribe', {
    method: 'POST',
    headers: { 'X-Password': password },
    body: form,
  });
}

function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return calls;
}

test('a wrong password is refused before Infomaniak is called', async () => {
  const calls = mockFetch([]);
  const res = await worker.fetch(request('nope'), env);
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('returns the text once the job succeeds', async () => {
  const calls = mockFetch([
    { body: { batch_id: 'b1' } },
    { body: { status: 'pending', data: null } },
    { body: { status: 'processing', data: null } },
    { body: { status: 'success', data: { text: 'amazing grace' } } },
  ]);
  const res = await worker.fetch(request(), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: 'amazing grace' });
  assert.equal(calls[0].url, `${BASE}/openai/audio/transcriptions`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t');
  assert.equal(calls[1].url, `${BASE}/results/b1`);
  assert.equal(calls.length, 4);
});

test('forwards the audio, language and prompt with the whisper model', async () => {
  const calls = mockFetch([
    { body: { batch_id: 'b1' } },
    { body: { status: 'success', data: { text: '' } } },
  ]);
  await worker.fetch(request(), env);
  const sent = calls[0].init.body;
  assert.equal(sent.get('model'), 'whisper');
  assert.equal(sent.get('response_format'), 'json');
  assert.equal(sent.get('language'), 'en');
  assert.equal(sent.get('prompt'), 'Amazing grace');
  assert.equal(sent.get('file').name, 'chunk.mp4');
});

test('accepts responses wrapped in result and data, and text as a JSON string', async () => {
  mockFetch([
    { body: { result: 'success', data: { batch_id: 'b2' } } },
    { body: { result: 'success', data: { status: 'success', data: '{"text":"how sweet"}' } } },
  ]);
  const res = await worker.fetch(request(), env);
  assert.deepEqual(await res.json(), { text: 'how sweet' });
});

test('a failed job gives 502', async () => {
  mockFetch([{ body: { batch_id: 'b1' } }, { body: { status: 'failed', data: null } }]);
  const res = await worker.fetch(request(), env);
  assert.equal(res.status, 502);
});

test('a job still pending after the poll limit gives 502', async () => {
  mockFetch([
    { body: { batch_id: 'b1' } },
    ...Array.from({ length: 30 }, () => ({ body: { status: 'pending', data: null } })),
  ]);
  const res = await worker.fetch(request(), env);
  assert.equal(res.status, 502);
});

test('a rejected upload gives 502', async () => {
  mockFetch([{ status: 422, body: { result: 'error' } }]);
  const res = await worker.fetch(request(), env);
  assert.equal(res.status, 502);
});

test('a reply without a batch id gives 502 without polling', async () => {
  const calls = mockFetch([{ body: { result: 'success', data: {} } }]);
  const res = await worker.fetch(request(), env);
  assert.equal(res.status, 502);
  assert.equal(calls.length, 1);
});
