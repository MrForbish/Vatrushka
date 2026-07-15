import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import type { AppConfig } from './config.js';

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function randomOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomOtp(): string {
  const value = randomBytes(4).readUInt32BE() % 1_000_000;
  return value.toString().padStart(6, '0');
}

export function hashOtp(email: string, code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${email}:${code}`, 'utf8').digest('hex');
}

export function safeHashEqual(leftHex: string, rightHex: string): boolean {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export async function issueAccessToken(claims: AccessClaims, config: AppConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: claims.sessionId, kind: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(config.APP_NAME)
    .setAudience('vatrushka-desktop')
    .setIssuedAt(now)
    .setExpirationTime(now + config.ACCESS_TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(config.ACCESS_TOKEN_SECRET));
}

export async function verifyAccessToken(token: string, config: AppConfig): Promise<AccessClaims> {
  const result = await jwtVerify(token, new TextEncoder().encode(config.ACCESS_TOKEN_SECRET), {
    issuer: config.APP_NAME,
    audience: 'vatrushka-desktop',
  });
  if (!result.payload.sub || typeof result.payload.sid !== 'string' || result.payload.kind !== 'access') {
    throw new Error('Invalid access token claims');
  }
  return { userId: result.payload.sub, sessionId: result.payload.sid };
}
