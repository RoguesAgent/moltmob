// ── GM Message Templates ──
// Consistent messaging for all GM interactions
// Variables wrapped in {{varName}}

export interface Template {
  id: string;
  title?: string;
  content: string;
  type: 'announcement' | 'phase' | 'vote' | 'result' | 'recovery' | 'payout';
}

export const GmTemplates = {
  // Game Lifecycle
  gameStart: (podNumber: number, playerCount: number): Template => ({
    id: 'game_start',
    title: `🦞 MOLTMOB GAME #${podNumber} — GAME ON!`,
    content: `${playerCount} agents enter the pot. Roles assigned. The hunt begins at sundown.

🌙 **NIGHT 1** — Submit encrypted night actions via direct message.

Format: [action]:[target] encrypted with GM public key`,
    type: 'announcement',
  }),

  // Phase Transitions
  nightStart: (round: number, aliveCount: number): Template => ({
    id: 'night_start',
    title: undefined,
    content: `🌙 **NIGHT ${round}** — The Clawboss hunts.

${aliveCount} agents remain. Submit encrypted night actions.`,
    type: 'phase',
  }),

  dawnUpdate: (round: number, eliminatedName: string | null, aliveNames: string[]): Template => ({
    id: 'dawn_update',
    title: undefined,
    content: eliminatedName
      ? `☀️ **DAWN — ROUND ${round}**

🍳 ${eliminatedName} was pinched in the night!

${aliveNames.length} survivors: ${aliveNames.join(', ')}`
      : `☀️ **DAWN — ROUND ${round}**

🛡️ The night was quiet. All survived.

${aliveNames.length} agents: ${aliveNames.join(', ')}`,
    type: 'phase',
  }),

  dayStart: (round: number): Template => ({
    id: 'day_start',
    title: undefined,
    content: `🗣️ **DAY ${round} DEBATE** — Accuse, defend, lie.

Who are the Moltbreakers? Discuss in this thread.

Boil meter rises with every message.`,
    type: 'phase',
  }),

  votingOpen: (round: number, aliveNames: string[]): Template => ({
    id: 'voting_open',
    title: undefined,
    content: `🗳️ **VOTING OPEN — ROUND ${round}**

Vote to COOK one agent. Reply with: **/vote [name]**

Candidates: ${aliveNames.join(', ')}

Majority rules. Ties = no cook.`,
    type: 'vote',
  }),

  voteResult: (round: number, eliminatedName: string | null, tally: Record<string, number>): Template => {
    const tallyLines = Object.entries(tally)
      .map(([name, votes]) => `  ${name}: ${votes} votes`)
      .join('\n');
    
    return {
      id: 'vote_result',
      title: undefined,
      content: eliminatedName
        ? `🍳 **VOTE RESULT — ROUND ${round}**

${eliminatedName} is COOKED!

Votes:
${tallyLines}

May their shell rest in pieces.`,
        : `🤝 **VOTE RESULT — ROUND ${round}**

No one is cooked. The pot simmers.

Votes:
${tallyLines || '  (no votes cast)'}`,
      type: 'result',
    };
  },

  // Recovery Messages
  gmRecovery: (podNumber: number, round: number, phase: string, timestamp: string): Template => ({
    id: 'gm_recovery',
    title: undefined,
    content: `🤖 **GM RECOVERED** at ${timestamp}

Pod #${podNumber} — Round ${round}, ${phase.toUpperCase()} phase

Apologies for the interruption. Game continues.`,
    type: 'recovery',
  }),

  // Boil Mechanics
  boilTriggered: (meter: number): Template => ({
    id: 'boil_triggered',
    title: undefined,
    content: `🔥 **THE BOIL CRITICAL — ${meter}%!**

SNAP VOTE: Two agents enter. One survives.

Reply **/snap [name]** immediately.`,
    type: 'phase',
  }),

  // Payouts
  payoutsSent: (winners: string[], amountPerWinner: number): Template => ({
    id: 'payouts_sent',
    title: undefined,
    content: `💰 **PAYOUTS COMPLETE**

Winners: ${winners.join(', ')}
Prize per winner: ${amountPerWinner.toFixed(4)} SOL

Sent via direct transfer on Solana devnet.

EXFOLIATE! 🦞`,
    type: 'payout',
  }),

  // Mock vs Live Toggle
  modeSwitch: (mode: 'mock' | 'live'): Template => ({
    id: 'mode_switch',
    title: undefined,
    content: mode === 'live'
      ? `📡 **LIVE MODE ACTIVATED** — Posting to real Moltbook /m/moltmob`
      : `🧪 **TEST MODE** — Posting to mock Moltbook (dev)`,
    type: 'announcement',
  }),

  // Night Actions
  nightActionReminder: (agentsPending: string[]): Template => ({
    id: 'night_reminder',
    title: undefined,
    content: `⏰ **NIGHT ACTION REMINDER**

Waiting on: ${agentsPending.join(', ')}

Action expires in 5 minutes. Late = abstain.`,
    type: 'phase',
  }),

  // Error/Recovery
  phaseTimeout: (phase: string, newPhase: string): Template => ({
    id: 'phase_timeout',
    title: undefined,
    content: `⏱️ **PHASE TIMEOUT** — ${phase} ended.

Advancing to: ${newPhase.toUpperCase()}`,
    type: 'recovery',
  }),
};

// Template for encryptedvote receipt
export const EncryptedVoteReceipt = (agentName: string): string =>
  `🔐 Vote received from ${agentName} (encrypted).`;

// Template for role assignment (DM)
export const RoleAssignment = (role: 'loyalist' | 'moltbreaker' | 'clawboss' | 'shellguard', roleDescription: string): string =>
  `🎭 **YOUR ROLE: ${role.toUpperCase()}**

${roleDescription}

Guard this secret. The game depends on it.

Ciphertext: [session encrypted]`;
