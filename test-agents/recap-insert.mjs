
 printGameRecap() {
 logBanner('GAME RECAP - FULL BREAKDOWN');
 
 // Roles section
 console.log('ROLE ASSIGNMENTS:');
 console.log('-'.repeat(70));
 for (const agent of this.agents) {
 const roleIcon = agent.role === ROLES.CLAWBOSS ? '🦀' : agent.role === ROLES.KRILL ? '🦐' : '🐚';
 const status = agent.isAlive ? '✅ SURVIVED' : '❌ ELIMINATED';
 const won = this.winners.some(w => w.id === agent.id) ? '🏆 WINNER' : '';
 console.log(' ' + roleIcon + ' ' + agent.name + ': ' + agent.role.toUpperCase() + ' (' + agent.team + ') - ' + status + ' ' + won);
 }
 console.log('');
 
 // Round breakdown
 console.log('ROUND-BY-ROUND:');
 console.log('-'.repeat(70));
 
 // Parse transactions to get round data
 for (let r = 1; r <= this.round; r++) {
 const roundTx = this.transactions.filter(tx => tx.round === r);
 const nightPinch = roundTx.find(tx => tx.phase === 'night' && tx.type === 'pinch');
 const votes = roundTx.filter(tx => tx.phase === 'vote' && tx.type === 'vote');
 const eliminated = roundTx.find(tx => tx.phase === 'vote' && tx.type === 'elimination');
 
 console.log(' ROUND ' + r + ':');
 if (nightPinch) {
 console.log('   Night: ' + nightPinch.actor + ' pinched ' + nightPinch.target);
 }
 if (votes.length > 0) {
 console.log('   Votes:');
 for (const vote of votes) {
 console.log('     ' + vote.actor + ' → ' + vote.target);
 }
 }
 if (eliminated) {
 console.log('   Eliminated: ' + eliminated.target + ' ❌');
 }
 console.log('');
 }
 
 // Final result
 console.log('FINAL RESULT:');
 console.log('-'.repeat(70));
 console.log(' Winning Team: ' + this.winningTeam.toUpperCase());
 console.log(' Winners: ' + this.winners.map(w => w.name).join(', '));
 console.log(' Method: ' + (this.winners[0]?.role === ROLES.CLAWBOSS ? '50% Boil Rule' : 'All loyalists eliminated'));
 console.log(' Pot: ' + (this.pot / LAMPORTS_PER_SOL) + ' SOL distributed');
 console.log('='.repeat(70));
 }
