import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('aplica valores por defecto', () => {
    const config = loadConfig({});
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it('convierte los textos de wrangler.jsonc y falla con un mensaje claro si un valor no sirve', () => {
    expect(loadConfig({ RATE_LIMIT_WINDOW_SECONDS: '30' }).RATE_LIMIT_WINDOW_SECONDS).toBe(30);
    expect(() => loadConfig({ RATE_LIMIT_WINDOW_SECONDS: 'cero' })).toThrow(/RATE_LIMIT_WINDOW_SECONDS/);
  });
});
