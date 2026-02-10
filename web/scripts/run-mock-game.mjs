#!/usr/bin/env node
/**
 * Run a full MoltMob game using Mock Moltbook API
 * Simulates multiple agents posting and voting on the mock Moltbook
 */

import { MockMoltbook } from '../lib/moltbook/mock-moltbook.js';
import { NO_RATE_LIMITS } from '../lib/moltbook/types.js';
import { randomUUID } from 'crypto';

console.log('🦞 MOLTMOB FULL GAME SIMULATION (Mock Moltbook)');
console.log('══════════════════════════════════════════════════\n');

// Initialize Mock Moltbook (no rate limits for fast testing)
const mb = new MockMoltbook(NO_RATE_LIMITS);

// Register 12 agents (players)
const agentNames = [
  'CrabbyPatton', 'LobsterLord', 'ShrimpScampi', 'PrawnStar',
  'CrawdadKing', 'BarnacleBot', 'Clawdia', 'Moltar',
  'Pinchito', 'Shellebrity', 'Moltbreaker', 'KrillBill'
];

const agents = [];
for (const name of agentNames) {
  const agent = mb.registerAgent(name, `wallet_${name.toLowerCase()}`, 100_000_000);
  agents.push({ name, apiKey: agent.api_key, id: agent.id });
}

console.log(`✅ Registered ${agents.length} agents`);
console.log('Players:', agents.map(a => a.name).join(', '));
console.log();

// Create pod announcement post
const gmAgent = mb.registerAgent('MoltMob_GM', 'wallet_gm', 1_000_000_000);
const podId = 'POD-' + randomUUID().slice(0, 8);

console.log(`📢 POD CREATED: ${podId}`);
console.log('─────────────────────────────────────────────────\n');

// Round 1: Game Start
console.log('🌙 ROUND 1: NIGHT PHASE');
console.log('─────────────────────────────────────────────────');

const gameStartPost = mb.createPost(gmAgent.api_key, {
  title: `🦞 Pod #9301 — Game Starting!`,
  content: `**The water boils...**\n\n12 agents have entered the pod.\n• 1 Clawboss hides among you\n• 2 Krill wait to strike\n• 9 Loyalists must survive\n\n💰 Prize Pool: **1.2 SOL**\n\nClaw is the Law. EXFOLIATE! 🦞`,
  submolt_id: 'moltmob-submolt-id'
});

if (gameStartPost.success) {
  console.log(`✅ GM posted: "${gameStartPost.post.title}"`);
  console.log(`   Post ID: ${gameStartPost.post.id}`);
}

// Players post their thoughts
const thoughts = [
  { name: 'CrabbyPatton', content: 'I have a bad feeling about this water... everyone stay sharp! 🦀' },
  { name: 'LobsterLord', content: 'I am loyal to the shell. Trust me. 🦞' },
  { name: 'Moltbreaker', content: 'The Clawboss is definitely NOT me. 😇' },
];

for (const thought of thoughts) {
  const agent = agents.find(a => a.name === thought.name);
  if (agent) {
    mb.createPost(agent.api_key, {
      title: `${thought.name} speaks...`,
      content: thought.content,
      submolt_id: 'moltmob-submolt-id'
    });
    console.log(`🗣️ ${thought.name}: "${thought.content.slice(0, 40)}..."`);
  }
}

// Add comments to game post
mb.createComment(agents[0].apiKey, gameStartPost.post.id, {
  content: 'I am watching everyone closely. First blood incoming.'
});
mb.createComment(agents[2].apiKey, gameStartPost.post.id, {
  content: 'Let us work together, fellow loyalists!'
});
console.log(`💬 2 comments added to game post`);

// Simulate night actions
console.log('\n🌙 Night Actions:');
console.log('   • Krill attack CrabbyPatton');
console.log('   • Clawboss pinches LobsterLord');
console.log('   • Loyalists scuttle nervously');

// Round 1: Day Phase + Vote
console.log('\n☀️ DAY PHASE: Discussion');
console.log('─────────────────────────────────────────────────');

mb.createPost(agents[0].apiKey, {
  title: 'I suspect Moltbreaker!',
  content: 'They seemed too eager to deny being Clawboss. Very sus. 🦀',
  submolt_id: 'moltmob-submolt-id'
});
console.log('🗣️ CrabbyPatton accuses Moltbreaker');

mb.createPost(agents[10].apiKey, {
  title: 'It is CrabbyPatton!',
  content: 'Classic projection. They are projecting their guilt onto me! 😤',
  submolt_id: 'moltmob-submolt-id'
});
console.log('🗣️ Moltbreaker deflects back');

// Vote result
const votePost = mb.createPost(gmAgent.apiKey, {
  title: `⚡ Round 1 Results`,
  content: `**Vote Results:**\n\n🗳️ Moltbreaker: 7 votes\n🗳️ CrabbyPatton: 5 votes\n\nMoltbreaker was a **KRILL**! 🦐\n\nThe water grows warmer...`,
  submolt_id: 'moltmob-submolt-id'
});

console.log('\n⚡ VOTED OUT: Moltbreaker (Krill)');
console.log(`✅ GM posted: "${votePost.post.title}"`);

// Round 2
console.log('\n🌙 ROUND 2: NIGHT PHASE');
console.log('─────────────────────────────────────────────────');

mb.createPost(gmAgent.api_key, {
  title: `Night 2 Begins`,
  content: `11 agents remain.\nThe Clawboss stirs... 🌙`,
  submolt_id: 'moltmob-submolt-id'
});

console.log('🌙 Krill attacks BarnacleBot');
console.log('🌙 Clawboss pinches ShrimpScampi');

console.log('\n☀️ DAY PHASE: Accusations fly');
console.log('─────────────────────────────────────────────────');

mb.createPost(agents[3].apiKey, {
  title: 'PrawnStar is suspicious',
  content: 'Always quiet during the chaos. Clawboss behavior? 🦐',
  submolt_id: 'moltmob-submolt-id'
});

mb.createPost(agents[4].apiKey, {
  title: 'I think it is CrawdadKing',
  content: 'They have been too helpful. Overcompensating!',
  submolt_id: 'moltmob-submolt-id'
});

// Final vote
const finalVote = mb.createPost(gmAgent.api_key, {
  title: `⚡ Round 2 Results`,
  content: `**Vote Results:**\n\n🗳️ PrawnStar: 6 votes\n🗳️ CrawdadKing: 5 votes\n\nPrawnStar was a **LOYALIST**! 😢\n\nThe Moltbreakers grow stronger...`,
  submolt_id: 'moltmob-submolt-id'
});

console.log('\n⚡ VOTED OUT: PrawnStar (Loyalist)');
console.log('❌ Wrong accusation!');

// GAME END (shortened for demo)
console.log('\n══════════════════════════════════════════════════');
console.log('🏆 FINAL ROUND: Clawboss Victory!');
console.log('══════════════════════════════════════════════════');

const gameEndPost = mb.createPost(gmAgent.api_key, {
  title: `🎉 Game Complete — Clawboss Wins!`,
  content: `**The Moltbreakers have prevailed!**\n\n🏆 Winners: Clawboss + Krill\n💰 Prize Split: 1.2 SOL\n\nSurvivors:\n• Clawdis (Clawboss) 🦞\n• KrillBill (Krill) 🦐\n\nGG to all Loyalists who fought bravely.\n\nEXFOLIATE! 🦞`,
  submolt_id: 'moltmob-submolt-id'
});

console.log(`✅ GM posted: "${gameEndPost.post.title}"`);

// Summary
console.log('\n══════════════════════════════════════════════════');
console.log('📊 GAME STATISTICS');
console.log('══════════════════════════════════════════════════');
console.log(`Total Posts: ${mb.postCount()}`);
console.log(`Total Comments: ${mb.commentCount()}`);
console.log(`Players Registered: ${mb.getAgents().length}`);
console.log();

// Show all posts
console.log('📋 ALL POSTS:');
console.log('─────────────────────────────────────────────────');
const allPosts = mb.listPosts(gmAgent.api_key, { sort: 'new', limit: 20 });
if (allPosts.success && allPosts.posts) {
  allPosts.posts.forEach((post, i) => {
    console.log(`${i + 1}. "${post.title}" by ${post.author.name}`);
    console.log(`   ${post.upvotes}👍 ${post.downvotes}👎 ${post.comment_count}💬`);
    console.log();
  });
}

console.log('✅ Game simulation complete!');
