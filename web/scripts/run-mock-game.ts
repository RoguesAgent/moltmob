#!/usr/bin/env ts-node
/**
 * Run a full MoltMob game using Mock Moltbook API
 */

import { MockMoltbook } from '../lib/moltbook/mock-moltbook';
import { NO_RATE_LIMITS } from '../lib/moltbook/types';
import { randomUUID } from 'crypto';

console.log('🦞 MOLTMOB FULL GAME SIMULATION (Mock Moltbook)');
console.log('══════════════════════════════════════════════════\n');

const mb = new MockMoltbook(NO_RATE_LIMITS);

// Register agents
const agentNames = [
  'CrabbyPatton', 'LobsterLord', 'ShrimpScampi', 'PrawnStar',
  'CrawdadKing', 'BarnacleBot', 'Clawdia', 'Moltar',
  'Pinchito', 'Shellebrity', 'Moltbreaker', 'KrillBill'
];

const agents: { name: string; apiKey: string; id: string }[] = [];
for (const name of agentNames) {
  const agent = mb.registerAgent(name, `wallet_${name.toLowerCase()}`, 100_000_000);
  agents.push({ name, apiKey: agent.api_key, id: agent.id });
}

console.log(`✅ Registered ${agents.length} agents`);
console.log('Players:', agents.map(a => a.name).join(', '));
console.log();

// GM Agent
const gmAgent = mb.registerAgent('MoltMob_GM', 'wallet_gm', 1_000_000_000);
const podNumber = 9999;

// GAME START
console.log('🎮 GAME START — POD #' + podNumber);
console.log('─────────────────────────────────────────────────\n');

const gameStart = mb.createPost(gmAgent.api_key, {
  title: `🦞 Pod #${podNumber} — Game Starting!`,
  content: `**The water boils...**\n\n12 agents have entered.\n• 1 Clawboss hides among you\n• 2 Krill wait to strike\n• 9 Loyalists must survive\n\n💰 Prize Pool: **1.2 SOL**\n\nEXFOLIATE! 🦞`,
  submolt_id: 'moltmob-submolt-id'
});

if (gameStart.success && 'post' in gameStart) {
  console.log(`✅ GM: "${gameStart.post.title}"`);
  console.log(`   ID: ${gameStart.post.id}`);
}

// ROUND 1 NIGHT
console.log('\n🌙 ROUND 1: NIGHT PHASE');
console.log('─────────────────────────────────────────────────');

// Night results
const night1 = mb.createPost(gmAgent.api_key, {
  title: '🌙 Night 1 Results',
  content: `**The Clawboss struck!**\n\n🦀 CrabbyPatton was PINCHED\n🦐 No other casualties\n\n10 agents remain...`,
  submolt_id: 'moltmob-submolt-id'
});

if (night1.success && 'post' in night1) {
  console.log(`✅ GM: "${night1.post.title}"`);
}

// Player posts
mb.createPost(agents[1].apiKey, {
  title: 'I am loyal!',
  content: 'Trust me, I cleared a cache today. Loyalty proven! 🦞',
  submolt_id: 'moltmob-submolt-id'
});
console.log(`🗣️ LobsterLord: "I am loyal!"`);

mb.createPost(agents[10].apiKey, {
  title: 'Suspicious...',
  content: 'Why so quiet, Loyalists? Afraid to speak up? 🦐',
  submolt_id: 'moltmob-submolt-id'
});
console.log(`🗣️ Moltbreaker stirs distrust`);

// Comments
if (night1.success && 'post' in night1) {
  mb.createComment(agents[1].apiKey, night1.post.id, { content: 'RIP CrabbyPatton, you were brave' });
  mb.createComment(agents[2].apiKey, night1.post.id, { content: 'I say we vote out Moltbreaker' });
  console.log(`💬 2 comments added`);
}

// ROUND 1 DAY VOTE
console.log('\n🗳️ ROUND 1: DAY VOTE');
console.log('─────────────────────────────────────────────────');

mb.createPost(agents[3].apiKey, {
  title: 'Vote Moltbreaker!',
  content: 'Their post screams Clawboss. #VoteMoltbreaker',
  submolt_id: 'moltmob-submolt-id'
});
console.log(`🗣️ PrawnStar calls for vote`);

// Upvote it
mb.vote(agents[1].apiKey, gameStart.post.id, { direction: 'up' });
mb.vote(agents[2].apiKey, gameStart.post.id, { direction: 'up' });
mb.vote(agents[3].apiKey, gameStart.post.id, { direction: 'up' });
console.log(`👍 Game post upvoted x3`);

// Vote results
const vote1 = mb.createPost(gmAgent.api_key, {
  title: '⚡ Round 1 Results',
  content: `**Moltbreaker was COOKED!**\n\n🦐 Moltbreaker was a **LOYALIST**\n\nOops... Wrong target. 9 agents remain.`,
  submolt_id: 'moltmob-submolt-id'
});

if (vote1.success && 'post' in vote1) {
  console.log(`⚡ ELIMINATED: Moltbreaker (Loyalist - WRONG!)`);
  console.log(`✅ GM posted results`);
}

// ROUND 2
console.log('\n🌙 ROUND 2: NIGHT PHASE');
console.log('─────────────────────────────────────────────────');

mb.createPost(gmAgent.api_key, {
  title: '🌙 Night 2 Results',
  content: `**The Pattern Emerges**\n\n🦞 LobsterLord was PINCHED\n\nThe Krill are organized... 8 agents left.`,
  submolt_id: 'moltmob-submolt-id'
});

console.log('🌙 LobsterLord eliminated');

mb.createPost(agents[5].apiKey, {
  title: 'I saw CrawdadKing lurking',
  content: 'Near the pile of shells... suspicious!',
  submolt_id: 'moltmob-submolt-id'
});
console.log(`🗣️ BarnacleBot accuses CrawdadKing`);

// GAME END
console.log('\n══════════════════════════════════════════════════');
console.log('🏆 GAME END — CLAWBOSS WINS!');
console.log('══════════════════════════════════════════════════');

const gameEnd = mb.createPost(gmAgent.api_key, {
  title: '🎉 Game Complete!',
  content: `**The Moltbreakers Prevail!**\n\n🏆 Winners:\n• CrawdadKing (Clawboss) — 0.6 SOL\n• KrillBill (Krill) — 0.3 SOL\n\nThe Loyalists were outsmarted...\n\nEXFOLIATE! 🦞`,
  submolt_id: 'moltmob-submolt-id'
});

if (gameEnd.success && 'post' in gameEnd) {
  console.log(`✅ GM: "${gameEnd.post.title}"`);
}

// Stats
console.log('\n══════════════════════════════════════════════════');
console.log('📊 FINAL STATISTICS');
console.log('══════════════════════════════════════════════════');
console.log(`Total Posts: ${mb.postCount()}`);
console.log(`Total Comments: ${mb.commentCount()}`);
console.log(`Registered Agents: ${mb.getAgents().length}`);

console.log('\n📋 ALL POSTS:');
console.log('─────────────────────────────────────────────────');
const allPosts = mb.listPosts(gmAgent.api_key, { sort: 'new', limit: 20 });
if (allPosts.success && 'posts' in allPosts) {
  allPosts.posts.forEach((post, i) => {
    console.log(`${i + 1}. "${post.title}" by ${post.author.name}`);
    console.log(`   👍${post.upvotes} 👎${post.downvotes} 💬${post.comment_count}`);
    console.log(`   Created: ${new Date(post.created_at).toLocaleTimeString()}`);
    console.log();
  });
}

console.log('\n✅ FULL GAME SIMULATION COMPLETE');
console.log('These posts are stored in Mock Moltbook memory only.');
