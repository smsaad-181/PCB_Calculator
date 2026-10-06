import { describe, expect, it } from 'vitest';
import { cspPlugin, PRODUCTION_CSP } from '../vite.config';

describe('cspPlugin', () => {
  const plugin = cspPlugin();
  const transform = plugin.transformIndexHtml as (html: string) => string;

  it('applies to build only', () => {
    expect(plugin.apply).toBe('build');
  });
  it('injects the CSP meta tag into head', () => {
    const out = transform('<html><head><title>x</title></head></html>');
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(out).toContain(PRODUCTION_CSP);
    expect(out.indexOf('<meta http-equiv')).toBeGreaterThan(out.indexOf('<head>'));
  });
  it('policy forbids inline script/style and network', () => {
    expect(PRODUCTION_CSP).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(PRODUCTION_CSP).toContain("connect-src 'none'");
    expect(PRODUCTION_CSP).toContain("script-src 'self'");
  });
});
