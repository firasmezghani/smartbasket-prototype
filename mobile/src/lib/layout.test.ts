import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contentMaxWidth,
  isNarrowPhone,
  NARROW_PHONE_WIDTH,
  screenHorizontalPadding,
} from './layout';

test('contentMaxWidth returns the full width on phone-sized viewports', () => {
  assert.equal(contentMaxWidth(320), 320);
  assert.equal(contentMaxWidth(390), 390);
  assert.equal(contentMaxWidth(599), 599);
});

test('contentMaxWidth caps the column on tablet and desktop viewports', () => {
  assert.equal(contentMaxWidth(600), 560);
  assert.equal(contentMaxWidth(834), 560);
  assert.equal(contentMaxWidth(900), 720);
  assert.equal(contentMaxWidth(1400), 720);
});

test('contentMaxWidth falls back to a safe default for invalid input', () => {
  assert.equal(contentMaxWidth(0), 480);
  assert.equal(contentMaxWidth(-100), 480);
  assert.equal(contentMaxWidth(Number.NaN), 480);
});

test('isNarrowPhone is true only below the narrow-phone threshold', () => {
  assert.equal(isNarrowPhone(NARROW_PHONE_WIDTH - 1), true);
  assert.equal(isNarrowPhone(320), true);
  assert.equal(isNarrowPhone(NARROW_PHONE_WIDTH), false);
  assert.equal(isNarrowPhone(414), false);
});

test('isNarrowPhone rejects invalid input', () => {
  assert.equal(isNarrowPhone(0), false);
  assert.equal(isNarrowPhone(-1), false);
  assert.equal(isNarrowPhone(Number.NaN), false);
});

test('screenHorizontalPadding steps up with viewport width', () => {
  assert.equal(screenHorizontalPadding(320), 14);
  assert.equal(screenHorizontalPadding(375), 18);
  assert.equal(screenHorizontalPadding(430), 18);
  assert.equal(screenHorizontalPadding(700), 26);
  assert.equal(screenHorizontalPadding(1024), 32);
});

test('screenHorizontalPadding falls back for invalid input', () => {
  assert.equal(screenHorizontalPadding(0), 16);
  assert.equal(screenHorizontalPadding(-50), 16);
  assert.equal(screenHorizontalPadding(Number.NaN), 16);
});
