import { handleApi } from '../../worker/api';
import type { Env } from '../../worker/providers';
export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleApi(request, env);
