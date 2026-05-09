import axios from 'axios';

export interface EvolutionConfig {
  apiUrl: string;
  instance: string;
  token: string;
}

export class EvolutionService {
  private config: EvolutionConfig;

  constructor(config: EvolutionConfig) {
    this.config = config;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.config.token
    };
  }

  async sendMessage(number: string, text: string) {
    try {
      const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
      const url = `${this.config.apiUrl}/message/sendText/${this.config.instance}`;
      const response = await axios.post(url, {
        number: jid,
        text: text,
        delay: 1200,
        linkPreview: true
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      console.error('[EvolutionAPI] Error sending message:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendMedia(number: string, base64: string, caption: string, fileName: string) {
    try {
      const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
      const url = `${this.config.apiUrl}/message/sendMedia/${this.config.instance}`;
      
      // Evolution API expects base64 without prefix usually, or we can send as URL
      // But let's send as base64
      const response = await axios.post(url, {
        number: jid,
        mediaMessage: {
          mediatype: 'image',
          caption: caption,
          media: base64 // base64 string
        }
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      console.error('[EvolutionAPI] Error sending media:', error.response?.data || error.message);
      throw error;
    }
  }
}
