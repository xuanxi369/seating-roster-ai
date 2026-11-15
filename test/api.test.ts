import { describe, it, expect, vi } from 'vitest';
import { handleApi, readLimitedJSON, validateImage } from '../worker/api';
import { analyzeWithProvider, getProvider, parseModelJSON, type Env } from '../worker/providers';
import { type ProviderId } from '../src/lib/schema';
import { forumFixture, tinyImage } from './fixtures';

const token = 'test-access-token-long-enough';
const env: Env = {
  APP_ACCESS_TOKEN: token,
  QWEN_API_KEY: 'test-qwen',
  DEEPSEEK_API_KEY: 'test-deepseek',
  ZHIPU_API_KEY: 'test-zhipu',
  OPENAI_API_KEY: 'test-openai',
  ANTHROPIC_API_KEY: 'test-claude',
};
function request(path: string, body?: unknown, extra: HeadersInit = {}) {
  return new Request(`https://test.example${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function upstream(id: ProviderId) {
  const { plan } = forumFixture();
  if (id === 'openai')
    return {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(plan) }] }],
    };
  if (id === 'anthropic')
    return {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'submit_seating_plan', input: plan }],
    };
  return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] };
}
describe('受保护的 Worker API', () => {
  it('未配置口令时关闭付费接口，未认证时拒绝调用', async () => {
    expect((await handleApi(request('/api/config'), {})).status).toBe(503);
    const fetcher = vi.fn();
    const response = await handleApi(
      new Request('https://test.example/api/analyze', { method: 'POST' }),
      env,
      fetcher,
    );
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('配置接口只返回供应商状态与模型，不泄露密钥', async () => {
    const response = await handleApi(request('/api/config'), env);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('deepseek-flash');
    expect(text).not.toContain('test-qwen');
    expect(text).not.toContain(token);
  });
  it('拒绝跨站调用、无效图片、无效请求和过大的流', async () => {
    expect(
      (await handleApi(request('/api/config', undefined, { Origin: 'https://evil.example' }), env))
        .status,
    ).toBe(403);
    expect(() => validateImage('data:image/png;base64,R0lGODlh')).toThrow('格式');
    const { sheets } = forumFixture();
    expect(
      (
        await handleApi(
          request('/api/analyze', {
            provider: 'qwen',
            image: 'https://evil.example/a.png',
            sheets,
            notes: '',
          }),
          env,
        )
      ).status,
    ).toBe(400);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(5 * 1024 * 1024 + 1));
        c.close();
      },
    });
    const large = new Request('https://test.example', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readLimitedJSON(large)).rejects.toThrow('5MB');
  });
  it('限流拒绝后不调用供应商', async () => {
    const fetcher = vi.fn();
    const { sheets } = forumFixture();
    const response = await handleApi(
      request('/api/analyze', { provider: 'qwen', image: tinyImage, sheets, notes: '' }),
      { ...env, AI_RATE_LIMITER: { limit: async () => ({ success: false }) } },
      fetcher,
    );
    expect(response.status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('完成真实路由、JSON 验证、来源范围核对', async () => {
    const { sheets } = forumFixture();
    const fetcher = vi.fn(async () => Response.json(upstream('qwen')));
    const response = await handleApi(
      request('/api/analyze', { provider: 'qwen', image: tinyImage, sheets, notes: '' }),
      env,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).plan.zones).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
describe('五家供应商适配', () => {
  for (const id of ['qwen', 'deepseek', 'zhipu', 'openai', 'anthropic'] as const)
    it(`${id} 使用正确协议发送图片并解析计划`, async () => {
      const { sheets } = forumFixture();
      const fetcher = vi.fn(async () => Response.json(upstream(id)));
      const result = await analyzeWithProvider(
        { provider: id, image: tinyImage, sheets, notes: '' },
        env,
        fetcher,
      );
      expect(result.plan.zones).toHaveLength(4);
      const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(url).toContain(
        id === 'openai' ? '/responses' : id === 'anthropic' ? '/messages' : '/chat/completions',
      );
      if (id === 'openai') {
        expect(body.store).toBe(false);
        expect(body.text.format.strict).toBe(true);
        expect(body.input[0].content[1].type).toBe('input_image');
      } else if (id === 'anthropic') {
        expect(body.messages[0].content[0].source.type).toBe('base64');
        expect(body.tool_choice.name).toBe('submit_seating_plan');
      } else expect(body.messages[1].content[1].image_url.url).toBe(tinyImage);
    });
  it('拒绝模型截断、幻造格式和不可信地址；上游错误不泄露正文', async () => {
    const { sheets } = forumFixture();
    await expect(
      analyzeWithProvider(
        { provider: 'openai', image: tinyImage, sheets, notes: '' },
        env,
        async () => Response.json({ status: 'incomplete' }),
      ),
    ).rejects.toThrow('未完成');
    expect(() => parseModelJSON('{"people":[{"name":"虚构"}]}')).toThrow('分区结构');
    expect(() => getProvider('qwen', { QWEN_BASE_URL: 'http://localhost' })).toThrow('地址');
    await expect(
      analyzeWithProvider(
        { provider: 'qwen', image: tinyImage, sheets, notes: '' },
        env,
        async () => new Response('sensitive-upstream-content', { status: 401 }),
      ),
    ).rejects.toThrow('API 密钥无效');
  });
});
