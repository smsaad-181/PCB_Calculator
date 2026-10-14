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
  it('pins the exact policy string: worker-src self is the only worker allowance', () => {
    expect(PRODUCTION_CSP).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self'; base-uri 'none'; form-action 'none'",
    );
    expect(PRODUCTION_CSP).toContain("worker-src 'self';");
    expect(PRODUCTION_CSP).not.toMatch(/blob:|unsafe-|[*]|https?:/);
  });
  it('policy forbids inline script/style and network', () => {
    expect(PRODUCTION_CSP).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(PRODUCTION_CSP).toContain("connect-src 'none'");
    expect(PRODUCTION_CSP).toContain("script-src 'self'");
  });
});
