import { createTestClientAndActivatePlayer } from './src/services/startpainel-puppeteer.js';

(async () => {
  console.log('Running test for Ultra Player...');
  try {
    const result = await createTestClientAndActivatePlayer('test_ultra_999', '00:11:22:33:44:55', 'Ultra Player');
    console.log('Result:', result);
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
})();
