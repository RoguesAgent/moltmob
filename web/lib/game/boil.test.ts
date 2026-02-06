import { describe, it, expect } from 'vitest';
import { calculateBoilIncrease, applyBoil, shouldTriggerBoilPhase } from './boil';

describe('Boil Meter Calculation', () => {
  // ── PRD §8: Boil Meter ──

  it('T-BOIL-001: normal elimination = 0% increase', () => {
    const increase = calculateBoilIncrease({
      round: 1,
      totalAlive: 8,
      totalVotes: 6,
      eliminated: true,
    });
    expect(increase).toBe(0);
  });

  it('T-BOIL-002: 0 votes = +50%', () => {
    const increase = calculateBoilIncrease({
      round: 1,
      totalAlive: 8,
      totalVotes: 0,
      eliminated: false,
    });
    expect(increase).toBe(50);
  });

  it('T-BOIL-003: no-cook round 1 = +15%', () => {
    const increase = calculateBoilIncrease({
      round: 1,
      totalAlive: 8,
      totalVotes: 6, // >50% participation
      eliminated: false,
    });
    expect(increase).toBe(15);
  });

  it('T-BOIL-004: no-cook round 2 = +15%', () => {
    const increase = calculateBoilIncrease({
      round: 2,
      totalAlive: 8,
      totalVotes: 6,
      eliminated: false,
    });
    expect(increase).toBe(15);
  });

  it('T-BOIL-005: no-cook round 3 = +25%', () => {
    const increase = calculateBoilIncrease({
      round: 3,
      totalAlive: 8,
      totalVotes: 6,
      eliminated: false,
    });
    expect(increase).toBe(25);
  });

  it('T-BOIL-006: no-cook round 5 = +25%', () => {
    const increase = calculateBoilIncrease({
      round: 5,
      totalAlive: 8,
      totalVotes: 5,
      eliminated: false,
    });
    expect(increase).toBe(25);
  });

  it('T-BOIL-007: no-cook round 6+ = +40%', () => {
    const increase = calculateBoilIncrease({
      round: 6,
      totalAlive: 4,
      totalVotes: 3,
      eliminated: false,
    });
    expect(increase).toBe(40);
  });

  it('T-BOIL-008: low participation (<50%) adds +10% on top of no-cook', () => {
    const increase = calculateBoilIncrease({
      round: 1,
      totalAlive: 8,
      totalVotes: 3, // 37.5% participation
      eliminated: false,
    });
    expect(increase).toBe(25); // 15 (no-cook round 1) + 10 (low participation)
  });

  it('T-BOIL-009: low participation round 3 = +35%', () => {
    const increase = calculateBoilIncrease({
      round: 3,
      totalAlive: 10,
      totalVotes: 4, // 40% participation
      eliminated: false,
    });
    expect(increase).toBe(35); // 25 + 10
  });

  it('T-BOIL-010: elimination always 0% regardless of participation', () => {
    const increase = calculateBoilIncrease({
      round: 8,
      totalAlive: 4,
      totalVotes: 1,
      eliminated: true,
    });
    expect(increase).toBe(0);
  });
});

describe('Boil Application', () => {
  it('T-BOIL-020: applies increase to current meter', () => {
    expect(applyBoil(0, 15)).toBe(15);
    expect(applyBoil(25, 25)).toBe(50);
    expect(applyBoil(60, 40)).toBe(100);
  });

  it('T-BOIL-021: caps at 100', () => {
    expect(applyBoil(80, 50)).toBe(100);
    expect(applyBoil(99, 50)).toBe(100);
    expect(applyBoil(100, 10)).toBe(100);
  });

  it('T-BOIL-022: 0 increase keeps meter unchanged', () => {
    expect(applyBoil(42, 0)).toBe(42);
  });
});

describe('Boil Phase Trigger', () => {
  it('T-BOIL-030: triggers at exactly 100%', () => {
    expect(shouldTriggerBoilPhase(100, 5)).toBe(true);
  });

  it('T-BOIL-031: triggers above 100% (edge case)', () => {
    expect(shouldTriggerBoilPhase(150, 5)).toBe(true);
  });

  it('T-BOIL-032: does not trigger below 100%', () => {
    expect(shouldTriggerBoilPhase(99, 5)).toBe(false);
    expect(shouldTriggerBoilPhase(0, 1)).toBe(false);
  });

  it('T-BOIL-033: triggers at round 10 (hard cap)', () => {
    expect(shouldTriggerBoilPhase(0, 10)).toBe(true);
    expect(shouldTriggerBoilPhase(50, 10)).toBe(true);
  });

  it('T-BOIL-034: does not trigger at round 9 with low boil', () => {
    expect(shouldTriggerBoilPhase(50, 9)).toBe(false);
  });
});
