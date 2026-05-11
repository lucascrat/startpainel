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
      // Evolution v2 espera base64 pura, sem prefixo data URI.
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');

      const response = await axios.post(url, {
        number: jid,
        audio: cleanBase64,
        delay: 1000
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      console.error('[EvolutionAPI] Error sending audio:', error.response?.data || error.message);
      throw error;
    }
  }

  async loadMedia(messageKey: any) {
    // Evolution API v2: /chat/getBase64FromMediaMessage/{instance}
    // (rota antiga /message/loadMedia/{instance} foi removida e retorna 404)
    try {
      const url = `${this.config.apiUrl}/chat/getBase64FromMediaMessage/${this.config.instance}`;
      const response = await axios.post(url, {
        message: { key: messageKey },
        convertToMp4: false
      }, { headers: this.headers });
      return response.data; // { base64: '...', mediaType, mimetype, fileName }
    } catch (error: any) {
      console.error('[EvolutionAPI] Error loading media:', error.response?.data || error.message);
      throw error;
    }
  }
}
