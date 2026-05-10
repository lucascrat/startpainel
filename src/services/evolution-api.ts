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

  async sendMedia(number: string, base64: string, caption: string, fileName: string, mediaType: 'image' | 'video' | 'document' | 'audio' = 'image') {
    try {
      const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
      const url = `${this.config.apiUrl}/message/sendMedia/${this.config.instance}`;
      
      const response = await axios.post(url, {
        number: jid,
        mediaMessage: {
          mediatype: mediaType,
          caption: caption,
          media: base64,
          fileName: fileName
        }
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      console.error('[EvolutionAPI] Error sending media:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendAudio(number: string, base64: string) {
    try {
      const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
      const url = `${this.config.apiUrl}/message/sendWhatsAppAudio/${this.config.instance}`;
      
      const response = await axios.post(url, {
        number: jid,
        audio: base64,
        delay: 1000
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      console.error('[EvolutionAPI] Error sending audio:', error.response?.data || error.message);
      throw error;
    }
  }

  async loadMedia(messageKey: any) {
    try {
      const url = `${this.config.apiUrl}/message/loadMedia/${this.config.instance}`;
      const response = await axios.post(url, {
        key: messageKey
      }, { headers: this.headers });
      return response.data; // Usually contains { base64: '...' }
    } catch (error: any) {
      console.error('[EvolutionAPI] Error loading media:', error.response?.data || error.message);
      throw error;
    }
  }
}
