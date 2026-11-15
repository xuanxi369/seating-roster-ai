import { handleApi } from './api';
import type { Env } from './providers';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response('Build the frontend first with npm run build.', { status: 503 });
  },
};
