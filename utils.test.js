import { expect, test, describe } from 'vitest';
import { sanitizeHTML, generateIncidentId, getElement, formatTime } from './utils.js';

describe('sanitizeHTML', () => {
  test('escapes special characters', () => {
    expect(sanitizeHTML('<script>alert("xss & fun")</script>')).toBe('&lt;script&gt;alert(&quot;xss &amp; fun&quot;)&lt;&#x2F;script&gt;');
  });

  test('returns empty string for non-string input', () => {
    expect(sanitizeHTML(null)).toBe('');
    expect(sanitizeHTML(123)).toBe('');
    expect(sanitizeHTML(undefined)).toBe('');
  });

  test('handles empty string', () => {
    expect(sanitizeHTML('')).toBe('');
  });

  test('preserves safe text without special characters', () => {
    expect(sanitizeHTML('Hello World')).toBe('Hello World');
  });

  test('escapes single quotes and forward slashes', () => {
    expect(sanitizeHTML("it's a /path")).toBe("it&#x27;s a &#x2F;path");
  });
});

describe('generateIncidentId', () => {
  test('generates an ID with INC- prefix and 6 hex chars', () => {
    const id = generateIncidentId();
    expect(id).toMatch(/^INC-[0-9A-F]{6}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateIncidentId());
    }
    // With 16M possibilities, 100 IDs should all be unique
    expect(ids.size).toBe(100);
  });
});

describe('getElement', () => {
  test('returns null if document is undefined (test environment without dom)', () => {
    // In vitest with jsdom, document IS defined, so we test the actual behavior
    expect(getElement('nonexistent-element-id')).toBeNull();
  });

  test('returns element when it exists in DOM', () => {
    const div = document.createElement('div');
    div.id = 'test-element';
    document.body.appendChild(div);
    expect(getElement('test-element')).toBe(div);
    document.body.removeChild(div);
  });
});

describe('formatTime', () => {
  test('formats a valid ISO string to HH:MM', () => {
    // Use a fixed date to avoid timezone issues
    const date = new Date(2026, 6, 19, 14, 30, 0); // July 19, 2026, 14:30
    const result = formatTime(date.toISOString());
    expect(result).toBe('14:30');
  });

  test('pads single-digit hours and minutes', () => {
    const date = new Date(2026, 0, 1, 3, 5, 0); // 03:05
    const result = formatTime(date.toISOString());
    expect(result).toBe('03:05');
  });

  test('returns --:-- for invalid date string', () => {
    expect(formatTime('not-a-date')).toBe('--:--');
  });

  test('returns --:-- for empty string', () => {
    expect(formatTime('')).toBe('--:--');
  });

  test('handles midnight correctly', () => {
    const date = new Date(2026, 6, 19, 0, 0, 0); // 00:00
    const result = formatTime(date.toISOString());
    expect(result).toBe('00:00');
  });
});
