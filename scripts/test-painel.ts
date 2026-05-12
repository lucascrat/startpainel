import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true, baseURL: 'https://cms.startpainel.cc' }));

async function test() {
  try {
    const getRes = await client.get('/login');
    const html = getRes.data.toString();
    console.log("Login page fetched. Look for _token or csrf:");
    const matchToken = html.match(/name="_token" value="(.*?)"/);
    const matchCsrf = html.match(/name="csrf_token" value="(.*?)"/);
    const metaCsrf = html.match(/<meta name="csrf-token" content="(.*?)"/);
    
    console.log("Laravel _token:", matchToken ? matchToken[1] : "Not found");
    console.log("CSRF Token:", matchCsrf ? matchCsrf[1] : "Not found");
    console.log("Meta CSRF:", metaCsrf ? metaCsrf[1] : "Not found");
    
    // Look for form fields
    const inputs = html.match(/<input[^>]+>/g);
    if (inputs) {
      console.log("Inputs found on login page:");
      inputs.forEach(i => console.log(i));
    }
  } catch (e: any) {
    console.error("Error fetching login page:", e.message);
  }
}
test();
