import axios from 'axios';

export interface EvolutionConfig {
  apiUrl: string;
  instance: string;
  token: string;
}

// Evolution v2 espera SO DIGITOS no campo `number` do body (sem @s.whatsapp.net).
// Mandar o JID completo causa 400 Bad Request ("number" failed validation).
// Strip o sufixo se vier, depois normaliza pra so digitos.
function toDigits(number: string): string {
  return (number || '').split('@')[0].replace(/\D/g, '');
}

// Loga o erro detalhado do Evolution — `response.message` e um array de validacoes
// que mostra exatamente qual campo bate qual regra. Sem isso, "Bad Request" e cego.
function logEvolutionError(label: string, error: any) {
  const data = error?.response?.data;
  console.error(`[EvolutionAPI] ${label}:`, {
    status: data?.status || error?.response?.status,
    error: data?.error,
    // O 'message' do Evolution e tipicamente Array<{ property, constraints, ... }>
    validation: data?.response?.message || data?.message || error?.message,
  });
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
      const url = `${this.config.apiUrl}/message/sendText/${this.config.instance}`;
      const response = await axios.post(url, {
        number: toDigits(number),
        text: text,
        delay: 1200,
        linkPreview: true
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendMessage falhou', error);
      throw error;
    }
  }

  async sendMedia(number: string, base64: string, caption: string, fileName: string, mediaType: 'image' | 'video' | 'document' | 'audio' = 'image') {
    try {
      const url = `${this.config.apiUrl}/message/sendMedia/${this.config.instance}`;
      // Evolution v2 espera base64 puro sem prefixo data URI no campo media.
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      // v2 aceita campos flat OU dentro de mediaMessage; flat e mais confiavel.
      const response = await axios.post(url, {
        number: toDigits(number),
        mediatype: mediaType,
        caption: caption,
        media: cleanBase64,
        fileName: fileName,
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendMedia falhou', error);
      throw error;
    }
  }

  async sendAudio(number: string, base64: string) {
    try {
      const url = `${this.config.apiUrl}/message/sendWhatsAppAudio/${this.config.instance}`;
      // Evolution v2 espera base64 pura, sem prefixo data URI.
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');

      const response = await axios.post(url, {
        number: toDigits(number),
        audio: cleanBase64,
        delay: 1000
      }, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendAudio falhou', error);
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
