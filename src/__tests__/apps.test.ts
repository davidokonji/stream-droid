import { describe, expect, test } from 'bun:test';
import { parseForeground, parsePackages } from '../apps.ts';

describe('parsePackages', () => {
  test('strips the package: prefix, trims, drops blanks, and sorts', () => {
    const out = 'package:com.b.app\npackage:com.a.app\n\n  package:com.c.app  \n';
    expect(parsePackages(out)).toEqual(['com.a.app', 'com.b.app', 'com.c.app']);
  });

  test('empty output → empty list', () => {
    expect(parsePackages('')).toEqual([]);
  });
});

describe('parseForeground', () => {
  test('reads topResumedActivity (Android 10+)', () => {
    const out = '  topResumedActivity=ActivityRecord{a1b2c3 u0 com.android.settings/.Settings t42}\n';
    expect(parseForeground(out)).toBe('com.android.settings');
  });

  test('reads mResumedActivity', () => {
    const out =
      'mResumedActivity: ActivityRecord{deadbeef u0 com.example.app/com.example.app.MainActivity t7}';
    expect(parseForeground(out)).toBe('com.example.app');
  });

  test('reads mFocusedApp', () => {
    const out = 'mFocusedApp=AppWindowToken{f00 token=Token{1 ActivityRecord{2 u0 com.chrome/.Main t3}}}';
    expect(parseForeground(out)).toBe('com.chrome');
  });

  test('null when no activity is present', () => {
    expect(parseForeground('nothing to see here')).toBeNull();
  });
});
