import { describe, it, expect } from 'vitest';
import { tallyVotes } from './votes';

describe('Vote Tallying', () => {
  // ── PRD §5 Phase 5: Vote ──

  it('T-VOTE-001: clear majority eliminates target', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: 'p5' },
        { voter_id: 'p3', target_id: 'p5' },
        { voter_id: 'p4', target_id: 'p6' },
      ],
      6,
      1
    );
    expect(result.eliminated).toBe('p5');
    expect(result.no_lynch).toBe(false);
    expect(result.boil_increase).toBe(0);
    expect(result.tally['p5']).toEqual(['p1', 'p2', 'p3']);
    expect(result.tally['p6']).toEqual(['p4']);
  });

  it('T-VOTE-002: tie = no-lynch', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: 'p5' },
        { voter_id: 'p3', target_id: 'p6' },
        { voter_id: 'p4', target_id: 'p6' },
      ],
      6,
      1
    );
    expect(result.eliminated).toBeNull();
    expect(result.no_lynch).toBe(true);
    expect(result.boil_increase).toBe(15); // round 1
  });

  it('T-VOTE-003: single vote below threshold = no-lynch', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: null }, // abstain
        { voter_id: 'p3', target_id: null },
      ],
      6,
      1
    );
    expect(result.eliminated).toBeNull();
    expect(result.no_lynch).toBe(true);
  });

  it('T-VOTE-004: 0 votes = no-lynch + 50% boil', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: null },
        { voter_id: 'p2', target_id: null },
      ],
      6,
      1
    );
    expect(result.eliminated).toBeNull();
    expect(result.no_lynch).toBe(true);
    expect(result.boil_increase).toBe(50);
  });

  it('T-VOTE-005: no votes at all = no-lynch + 50% boil', () => {
    const result = tallyVotes([], 6, 1);
    expect(result.eliminated).toBeNull();
    expect(result.no_lynch).toBe(true);
    expect(result.boil_increase).toBe(50);
  });

  it('T-VOTE-006: boil scales by round (round 3 = +25%)', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: 'p5' },
        { voter_id: 'p3', target_id: 'p6' },
        { voter_id: 'p4', target_id: 'p6' },
      ],
      6,
      3
    );
    expect(result.no_lynch).toBe(true);
    expect(result.boil_increase).toBe(25);
  });

  it('T-VOTE-007: boil scales by round (round 7 = +40%)', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: 'p6' },
      ],
      4,
      7
    );
    expect(result.no_lynch).toBe(true);
    expect(result.boil_increase).toBe(40);
  });

  it('T-VOTE-008: low participation adds +10% penalty', () => {
    // 2 out of 8 alive vote (25% participation), tie
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: 'p6' },
      ],
      8,
      1
    );
    expect(result.no_lynch).toBe(true);
    expect(result.boil_increase).toBe(25); // 15 (round 1) + 10 (low participation)
  });

  it('T-VOTE-009: exactly 2 votes on same target = eliminates', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p5' },
        { voter_id: 'p2', target_id: 'p5' },
      ],
      6,
      1
    );
    expect(result.eliminated).toBe('p5');
    expect(result.no_lynch).toBe(false);
    expect(result.boil_increase).toBe(0);
  });

  it('T-VOTE-010: tally records all voters per target', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p3' },
        { voter_id: 'p2', target_id: 'p3' },
        { voter_id: 'p4', target_id: 'p3' },
        { voter_id: 'p5', target_id: 'p6' },
      ],
      6,
      1
    );
    expect(result.tally['p3']).toHaveLength(3);
    expect(result.tally['p6']).toHaveLength(1);
  });

  it('T-VOTE-011: abstains are not counted in tally', () => {
    const result = tallyVotes(
      [
        { voter_id: 'p1', target_id: 'p3' },
        { voter_id: 'p2', target_id: 'p3' },
        { voter_id: 'p4', target_id: null }, // abstain
        { voter_id: 'p5', target_id: null }, // abstain
      ],
      6,
      1
    );
    expect(result.eliminated).toBe('p3');
    expect(Object.keys(result.tally)).toEqual(['p3']);
  });
});
