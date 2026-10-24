import { afterEach, describe, expect, it, vi } from 'vitest';
import voiceSessionHandler from '../../server/routes/api/voice/session.post';

type VoiceHandler = (event: { req: Request }) => Promise<Response>;
const handler = voiceSessionHandler as unknown as VoiceHandler;
const originalKey = process.env.OPENAI_API_KEY;

function request(gameId: string) {
  return new Request('http://localhost:3000/api/voice/session', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', 'x-forwarded-for': `test-${gameId}` },
    body: JSON.stringify({ sdp: 'v=0\r\n', gameId }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

describe('voice session game isolation', () => {
  it('rejects unknown game IDs instead of falling back to Chess', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await handler({ req: request('unknown') });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unknown game ID' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('gives The Intercept only story tools', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ transport: { sdp: 'answer' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await handler({ req: request('intercept') });
    expect(response.status).toBe(200);
    const init = upstream.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    const names = payload.session.delegation.responses.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('choose_story_option');
    expect(names).toContain('get_story_state');
    expect(names).not.toContain('propose_move');
    expect(names).not.toContain('roll_dice');
  });

  it('gives Tic-Tac-Toe only its authoritative board tools', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ transport: { sdp: 'answer' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await handler({ req: request('tic-tac-toe') });
    expect(response.status).toBe(200);
    const init = upstream.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    const names = payload.session.delegation.responses.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('get_tic_tac_toe_state');
    expect(names).toContain('place_tic_tac_toe_mark');
    expect(names).toContain('suggest_tic_tac_toe_move');
    expect(names).not.toContain('propose_move');
    expect(names).not.toContain('roll_dice');
    expect(names).not.toContain('choose_story_option');
  });
});
