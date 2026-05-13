import 'dotenv/config';
import { runIBOProAutomation } from '../src/services/ibo-pro-support.js';

const MAC = '4d:aa:9e:3f:34:7d';
const KEY = '307204';
const PLAYLIST = 'http://starton.sbs:8880/get.php?username=Holanda2026&password=vuafsr7x&type=m3u_plus&output=m3u8';

console.log('🚀 Disparando runIBOProAutomation...');
console.log('   MAC:', MAC);
console.log('   KEY:', KEY);
console.log('   URL:', PLAYLIST.slice(0, 60) + '...');
console.log('');

runIBOProAutomation(MAC, KEY, PLAYLIST).then(r => {
  console.log('\n=== RESULTADO ===');
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.success ? 0 : 1);
}).catch(e => {
  console.error('\n=== ERRO FATAL ===');
  console.error(e);
  process.exit(2);
});
