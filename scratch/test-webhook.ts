import axios from 'axios';

async function test() {
  try {
    const response = await axios.post('http://localhost:3000/api/webhooks/evolution', {
      event: 'messages.upsert',
      instance: 'suporte lucas',
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false
        },
        message: {
          conversation: 'Teste manual webhook via script'
        },
        pushName: 'Teste User Script'
      }
    });
    console.log('Response:', response.data);
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}
test();
