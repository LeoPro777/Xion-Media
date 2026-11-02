import { parse } from 'tldts';

export function getCookieUrlFromDomain(domain: string) {
  const url = parse(domain);
  if (!url.hostname) return undefined;
  if (url.hostname.endsWith('.ts.net') || url.hostname === 'localhost' || url.isIp) {
    return undefined;
  }
  return url.domain ? '.' + url.domain : url.hostname;
}
