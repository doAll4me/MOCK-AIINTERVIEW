// authed-request.interface.ts
import type { Request } from 'express';
import type { JwtUserPayload } from '../jwt-payload.interface';

export type AuthedRequest = Request & {
  user: JwtUserPayload;
};
