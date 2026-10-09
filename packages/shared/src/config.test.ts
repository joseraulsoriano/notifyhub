import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('aplica valores por defecto', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(config.PORT).toBe(3000);
    expect(config.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it('falla con un mensaje claro si falta una variable', () => {
    expect(() => loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow(/DATABASE_URL/);
  });
});
