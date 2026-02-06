import { describe, it, expect } from 'vitest';
import { tallyVotes } from './votes';
import { pid } from './test-helpers';

describe('Vote Tallying (6 players)', () => {
  // Standard: 6 alive players voting

  it('T-VOTE-001: clear majority eliminates target', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(5) },
        { voter_id: pid(2), target_id: pid(5) },
        { voter_id: pid(3), target_id: pid(4) },
        { voter_id: pid(4), target_id: pid(3) },
      ],
      6,
      1
    );
    expect(result.eliminated).toBe(pid(5));
    expect(result.no_cook).toBe(false);
    expect(result.boil_increase).toBe(0);
    expect(result.tally[pid(5)]).toHaveLength(3);
  });

  it('T-VOTE-002: tie = no-cook', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(5) },
        { voter_id: pid(2), target_id: pid(4) },
        { voter_id: pid(3), target_id: pid(4) },
        { voter_id: pid(4), target_id: pid(0) },
        { voter_id: pid(5), target_id: pid(0) },
      ],
      6,
      1
    );
    expect(result.eliminated).toBeNull();
    expect(result.no_cook).toBe(true);
    expect(result.boil_increase).toBe(15); // round 1
  });

  it('T-VOTE-003: single vote below threshold = no-cook', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: null }, // abstain
        { voter_id: pid(2), target_id: null },
        { voter_id: pid(3), target_id: null },
        { voter_id: pid(4), target_id: null },
      ],
      6,
      1
    );
    expect(result.eliminated).toBeNull();
    expect(result.no_cook).toBe(true);
  });

  it('T-VOTE-004: 0 votes = no-cook + 50% boil', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: null },
        { voter_id: pid(1), target_id: null },
        { voter_id: pid(2), target_id: null },
        { voter_id: pid(3), target_id: null },
        { voter_id: pid(4), target_id: null },
        { voter_id: pid(5), target_id: null },
      ],
      6,
      1
    );
    expect(result.eliminated).toBeNull();
    expect(result.no_cook).toBe(true);
    expect(result.boil_increase).toBe(50);
  });

  it('T-VOTE-005: no votes submitted at all = 50% boil', () => {
    const result = tallyVotes([], 6, 1);
    expect(result.eliminated).toBeNull();
    expect(result.boil_increase).toBe(50);
  });

  it('T-VOTE-006: boil scales by round (round 3 = +25%)', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(5) },
        { voter_id: pid(2), target_id: pid(4) },
        { voter_id: pid(3), target_id: pid(4) },
      ],
      6,
      3
    );
    expect(result.no_cook).toBe(true);
    expect(result.boil_increase).toBe(25);
  });

  it('T-VOTE-007: boil scales by round (round 7 = +40%)', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(4) },
      ],
      6,
      7
    );
    expect(result.no_cook).toBe(true);
    expect(result.boil_increase).toBeGreaterThanOrEqual(40); // 40 + possible low participation
  });

  it('T-VOTE-008: low participation (<50%) adds +10% penalty', () => {
    // 2 out of 6 vote (33%), tie → no-cook
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(4) },
      ],
      6,
      1
    );
    expect(result.no_cook).toBe(true);
    expect(result.boil_increase).toBe(25); // 15 (round 1) + 10 (low participation)
  });

  it('T-VOTE-009: exactly 2 votes on same target = eliminates', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(5) },
      ],
      6,
      1
    );
    expect(result.eliminated).toBe(pid(5));
    expect(result.no_cook).toBe(false);
    expect(result.boil_increase).toBe(0);
  });

  it('T-VOTE-010: abstains not counted in tally', () => {
    const result = tallyVotes(
      [
        { voter_id: pid(0), target_id: pid(5) },
        { voter_id: pid(1), target_id: pid(5) },
        { voter_id: pid(2), target_id: pid(5) },
        { voter_id: pid(3), target_id: null }, // abstain
        { voter_id: pid(4), target_id: null }, // abstain
      ],
      6,
      1
    );
    expect(result.eliminated).toBe(pid(5));
    expect(Object.keys(result.tally)).toEqual([pid(5)]);
  });
});
