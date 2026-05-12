import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ 
  jar, 
  withCredentials: true, 
  baseURL: 'https://cms.startpainel.cc',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}));

async function testRenew() {
  try {
    // 1. Get CSRF Token
    console.log("Fetching login page...");
    const getRes = await client.get('/login');
    const html = getRes.data.toString();
    const tokenMatch = html.match(/name="_token" value="(.*?)"/);
    if (!tokenMatch) {
      console.log("Failed to find CSRF token");
      return;
    }
    const token = tokenMatch[1];
    console.log("Found CSRF Token:", token);

    // 2. Login
    console.log("Attempting login...");
    // Usually laravel expects application/x-www-form-urlencoded
    const formData = new URLSearchParams();
    formData.append('_token', token);
    formData.append('username', 'user_test'); // dummy
    formData.append('password', 'pass_test'); // dummy
    
    // Test the login endpoint
    const loginRes = await client.post('/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://cms.startpainel.cc/login'
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });
    
    console.log("Login response status:", loginRes.status);
    console.log("Login response headers location:", loginRes.headers.location);
    
  } catch (e: any) {
    console.error("Test error:", e.message);
  }
}
testRenew();
