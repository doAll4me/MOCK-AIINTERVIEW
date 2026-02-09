import type { Request } from 'express';

export interface JwtUserPayload {
  userId: string;
  username: string;
  email?: string;
}

export type AuthedRequest = Request & { user: JwtUserPayload };
