import { analyzeSchema } from '../src/lib/schema';
import { buildRoster, validateSheets } from '../src/lib/roster';
import { analyzeWithProvider, providerInfo, type Env } from './providers';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}
export async function equalToken(provided: string, expected: string) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(provided)),
    crypto.subtle.digest('SHA-256', encode.encode(expected)),
  ]);
  const av = new Uint8Array(a),
    bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
export async function readLimitedJSON(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES)
    throw new Error('上传内容超过 5MB，请裁剪图片或缩小表格。');
  if (!request.body) throw new Error('请求内容为空。');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('上传内容超过 5MB，请裁剪图片或缩小表格。');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('请求不是有效的 JSON。');
  }
}
export function validateImage(image: string) {
  const [prefix, base64] = image.split(',');
  let bytes: string;
  try {
    bytes = atob(base64);
  } catch {
    throw new Error('图片编码无效。');
  }
  const png = bytes.startsWith('\x89PNG\r\n\x1a\n'),
    jpeg = bytes.startsWith('\xff\xd8\xff'),
    webp = bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (
    !(
      (prefix === 'data:image/png;base64' && png) ||
      (prefix === 'data:image/jpeg;base64' && jpeg) ||
      (prefix === 'data:image/webp;base64' && webp)
    )
  )
    throw new Error('图片格式与内容不一致，请重新上传 PNG、JPG 或 WebP。');
}
export async function handleApi(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/health' && request.method === 'GET')
    return json({ ok: true, service: 'seating-roster-ai' });
  if (path !== '/api/config' && path !== '/api/analyze')
    return json({ error: '接口不存在。' }, 404);
  if (
    (path === '/api/config' && request.method !== 'GET') ||
    (path === '/api/analyze' && request.method !== 'POST')
  )
    return json({ error: '请求方法不支持。' }, 405);
  const token = env.APP_ACCESS_TOKEN?.trim();
  if (!token || token.length < 16)
    return json({ error: '管理员尚未设置至少 16 位的访问口令。演示与手动整理仍可使用。' }, 503);
  const bearer = request.headers.get('authorization') || '';
  if (
    bearer.length > 512 ||
    !bearer.startsWith('Bearer ') ||
    !(await equalToken(bearer.slice(7), token))
  )
    return json({ error: '请填写正确的网站访问口令。' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: '不允许跨站调用。' }, 403);
  try {
    if (path === '/api/config')
      return json({ providers: providerInfo(env), limits: { cells: 4000, fileMB: 10 } });
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: '请使用 JSON 上传。' }, 415);
    if (env.AI_RATE_LIMITER) {
      const key = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (!(await env.AI_RATE_LIMITER.limit({ key })).success)
        return json({ error: '团队一分钟内的识别次数过多，请稍后再试。' }, 429);
    }
    const checked = analyzeSchema.safeParse(await readLimitedJSON(request));
    if (!checked.success)
      return json({ error: '上传内容格式无效或超过限制，请检查图片与表格。' }, 400);
    validateImage(checked.data.image);
    validateSheets(checked.data.sheets);
    const result = await analyzeWithProvider(checked.data, env, fetcher);
    const review = buildRoster(result.plan, checked.data.sheets);
    if (review.errors.length) throw new Error('AI 分区存在范围重叠：' + review.errors[0]);
    return json(result);
  } catch (error) {
    // Do not log requests, spreadsheets, images, raw upstream errors, or API keys.
    return json({ error: error instanceof Error ? error.message : '识别失败，请重试。' }, 422);
  }
}
