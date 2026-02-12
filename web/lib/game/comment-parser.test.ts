/**
 * Comment Parser Tests
 * Validates parsing of Moltbook comments into game actions
 */

import { describe, it, expect } from 'vitest';
import { parseComment, parseComments, MoltbookComment, PlayerInfo } from './comment-parser';

const mockPlayers: PlayerInfo[] = [
  { id: 'p1', agent_name: 'CrabbyPatton', encryption_pubkey: '' },
  { id: 'p2', agent_name: 'LobsterLord', encryption_pubkey: '' },
  { id: 'p3', agent_name: 'ShrimpScampi', encryption_pubkey: '' },
];

describe('Comment Parser', () => {
  describe('parseComment', () => {
    it('parses regular discussion as discussion type', () => {
      const comment: MoltbookComment = {
        id: 'c1',
        content: 'I think LobsterLord is suspicious...',
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, mockPlayers, 1, 'day', null);

      expect(result.type).toBe('discussion');
      expect(result.raw).toBe('I think LobsterLord is suspicious...');
    });

    it('detects encrypted night action format', () => {
      const comment: MoltbookComment = {
        id: 'c2',
        content: 'My action: [R1GN:abc123:def456]',
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      // Without GM private key, should return invalid with error
      const result = parseComment(comment, mockPlayers, 1, 'night', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('GM private key');
    });

    it('detects encrypted vote format', () => {
      const comment: MoltbookComment = {
        id: 'c3',
        content: 'I vote: [R1GM:xyz789:uvw012]',
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, mockPlayers, 1, 'vote', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('GM private key');
    });

    it('rejects wrong round number', () => {
      const comment: MoltbookComment = {
        id: 'c4',
        content: '[R2GN:abc:def]', // Round 2 but current is 1
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, mockPlayers, 1, 'night', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('Wrong round');
    });

    it('rejects wrong phase', () => {
      const comment: MoltbookComment = {
        id: 'c5',
        content: '[R1GN:abc:def]', // Night action during day
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, mockPlayers, 1, 'day', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('Wrong phase');
    });

    it('rejects unknown player', () => {
      const comment: MoltbookComment = {
        id: 'c6',
        content: '[R1GN:abc:def]',
        author: { id: 'unknown', name: 'UnknownAgent' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, mockPlayers, 1, 'night', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('Unknown player');
    });
  });

  describe('parseComments', () => {
    it('separates discussion from encrypted comments', () => {
      const comments: MoltbookComment[] = [
        {
          id: 'c1',
          content: 'Just chatting here',
          author: { id: 'a1', name: 'CrabbyPatton' },
          created_at: new Date().toISOString(),
        },
        {
          id: 'c2',
          content: 'Another discussion',
          author: { id: 'a2', name: 'LobsterLord' },
          created_at: new Date().toISOString(),
        },
        {
          id: 'c3',
          content: '[R1GN:abc:def]', // Encrypted, will fail without key
          author: { id: 'a1', name: 'CrabbyPatton' },
          created_at: new Date().toISOString(),
        },
      ];

      const result = parseComments(comments, mockPlayers, 1, 'night', null);

      expect(result.discussions).toHaveLength(2);
      expect(result.discussions[0]).toBe('Just chatting here');
      expect(result.errors).toHaveLength(1); // The encrypted one fails
      expect(result.nightActions).toHaveLength(0);
      expect(result.votes).toHaveLength(0);
    });

    it('handles empty comment list', () => {
      const result = parseComments([], mockPlayers, 1, 'night', null);

      expect(result.discussions).toHaveLength(0);
      expect(result.nightActions).toHaveLength(0);
      expect(result.votes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
