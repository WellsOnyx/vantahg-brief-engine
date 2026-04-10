// Tests for the eFax OCR adapter layer (selectOcrProvider + runOcr).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectOcrProvider, runOcr } from '@/lib/intake/efax/ocr';

describe('selectOcrProvider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return explicit override regardless of other inputs', () => {
    vi.stubEnv('EFAX_OCR_PROVIDER', 'google_vision');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
    expect(
      selectOcrProvider({ provider_ocr_text: 'x'.repeat(500) }),
    ).toBe('google_vision');
  });

  it('should return demo when in demo mode with no override', () => {
    // No supabase env => isDemoMode() === true
    expect(selectOcrProvider({})).toBe('demo');
  });

  it('should return provider when provider_ocr_text is long and not demo', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
    expect(
      selectOcrProvider({ provider_ocr_text: 'a'.repeat(200) }),
    ).toBe('provider');
  });

  it('should auto-select google_vision when API key is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
    vi.stubEnv('GOOGLE_VISION_API_KEY', 'key');
    expect(selectOcrProvider({})).toBe('google_vision');
  });

  it('should fall back to none with no env and not demo', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
    expect(selectOcrProvider({})).toBe('none');
  });
});

describe('runOcr', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should return deterministic demo stub containing Sarah Johnson and 27447', async () => {
    const result = await runOcr({});
    expect(result.provider).toBe('demo');
    expect(result.text).toContain('Sarah Johnson');
    expect(result.text).toContain('27447');
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.pages?.length).toBe(1);
  });

  it('should pass through provider_ocr_text in demo adapter', async () => {
    const text = 'supplied ocr text body';
    const result = await runOcr({
      provider_ocr_text: text,
      provider_ocr_confidence: 77,
    });
    expect(result.provider).toBe('demo');
    expect(result.text).toBe(text);
    expect(result.confidence).toBe(77);
  });

  it('should return provider adapter output unchanged', async () => {
    vi.stubEnv('EFAX_OCR_PROVIDER', 'provider');
    const text = 'x'.repeat(300);
    const result = await runOcr({
      provider_ocr_text: text,
      provider_ocr_confidence: 65,
    });
    expect(result.provider).toBe('provider');
    expect(result.text).toBe(text);
    expect(result.confidence).toBe(65);
  });

  it('should return none adapter with warnings and confidence 0', async () => {
    vi.stubEnv('EFAX_OCR_PROVIDER', 'none');
    const result = await runOcr({ provider_ocr_text: 'some text' });
    expect(result.provider).toBe('none');
    expect(result.confidence).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should return confidence 0 with a warning when google_vision has no API key', async () => {
    vi.stubEnv('EFAX_OCR_PROVIDER', 'google_vision');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await runOcr({ document: Buffer.from('pdfbytes') });
    expect(result.provider).toBe('google_vision');
    expect(result.confidence).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
