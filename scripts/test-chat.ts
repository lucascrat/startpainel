import axios from 'axios';

async function run() {
  try {
    const res = await axios.post('http://localhost:3000/api/chat', {
      messages: [{ role: 'user', parts: [{ text: 'oi' }] }],
      userInfo: { name: 'Lucas' }
    });
    console.log("Success:", res.data);
  } catch (err: any) {
    console.error("Failed:", JSON.stringify(err.response?.data, null, 2) || err.message);
  }
}

run();
