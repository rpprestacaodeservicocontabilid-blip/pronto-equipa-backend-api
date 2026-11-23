import { CookieOptions, Request, Response } from 'express';

export const browserSessionHeader = 'X-Pronto-Session';
export const isBrowserSession = (req: Request): boolean => req.get(browserSessionHeader) === 'browser';
export const permitsBrowserSession = (req: Request): boolean =>
  isBrowserSession(req) && req.get('Sec-Fetch-Site') !== 'cross-site';

function cookie(req: Request): { name: string; options: CookieOptions } {
  const secure = req.secure || process.env.NODE_ENV === 'production';
  const configuredSuffix = process.env.AUTH_BROWSER_SESSION_COOKIE_SUFFIX ?? '';
  // Browsers share cookies across ports on a hostname. Local demos can opt into a separate cookie.
  const suffix = process.env.NODE_ENV === 'development' && /^\d{1,5}$/.test(configuredSuffix)
    ? '_' + configuredSuffix : '';
  return {
    name: (secure ? '__Secure-' : '') + 'pronto_refresh' + suffix,
    options: { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1/auth/browser' },
  };
}

export function browserRefreshToken(req: Request): string | undefined {
  const prefix = cookie(req).name + '=';
  const matches = req.get('cookie')?.split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  if (matches?.length !== 1) return undefined;
  const value = matches[0].slice(prefix.length);
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length <= 4096 ? value : undefined;
}

export function clearBrowserSession(req: Request, res: Response): void {
  const { name, options } = cookie(req);
  res.clearCookie(name, options);
}

export function sendSession<T extends { refreshToken: string; refreshTokenExpiresAt: Date }>(
  req: Request, res: Response, result: T,
): Response {
  res.set('Cache-Control', 'no-store');
  if (!isBrowserSession(req)) return res.json(result);
  const { refreshToken, ...publicResult } = result;
  const { name, options } = cookie(req);
  return res.cookie(name, refreshToken, { ...options, expires: result.refreshTokenExpiresAt }).json(publicResult);
}
