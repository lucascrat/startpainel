import axios from 'axios';

export interface EvolutionConfig {
  apiUrl: string;
  instance: string;
  token: string;
}

// Normaliza o destinatario pro formato que Evolution v2 espera no campo `number`:
// - `5511999@s.whatsapp.net` -> `5511999` (so digitos — Evolution valida como numero)
// - `180882665136281@lid`    -> `180882665136281@lid` (LID = identidade mascarada
//                                                      do WhatsApp; nao e numero,
//                                                      Evolution resolve internamente)
// - `123@g.us`               -> `123@g.us` (grupo, mantem intacto)
// - sem @                     -> so digitos (assume telefone)
function normalizeRecipient(number: string): string {
  if (!number) return '';
  // LID / grupo / broadcast: manter intacto, Evolution v2 sabe rotear.
  if (number.includes('@lid') || number.includes('@g.us') || number.includes('@broadcast')) {
    return number;
  }
  // s.whatsapp.net ou sem sufixo: extrair so digitos.
  return number.split('@')[0].replace(/\D/g, '');
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

// Timeouts (ms) — Evolution as vezes trava em loadMedia (ex: midia muito grande
// ou WhatsApp lento descriptografando). Sem timeout, axios espera infinitamente
// e o webhook handler fica pendurado, perdendo todas as mensagens seguintes.
const TIMEOUT_SEND = 30_000;       // 30s pra sendMessage/Media/Audio
const TIMEOUT_LOAD_MEDIA = 25_000; // 25s pra baixar midia

export class EvolutionService {
  private config: EvolutionConfig;

  constructor(config: EvolutionConfig) {
    this.config = config;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.config.token,
      'instance': this.config.instance,  // Evolution Go requires instance in header
    };
  }


  async sendMessage(number: string, text: string) {
    try {
      const url = `${this.config.apiUrl}/send/text`;
      const response = await axios.post(url, {
        number: normalizeRecipient(number),
        text: text,
        delay: 1200
      }, { headers: this.headers, timeout: TIMEOUT_SEND });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendMessage falhou', error);
      throw error;
    }
  }

  async sendMedia(number: string, base64: string, caption: string, fileName: string, mediaType: 'image' | 'video' | 'document' | 'audio' = 'image') {
    try {
      const url = `${this.config.apiUrl}/send/media`;
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      const response = await axios.post(url, {
        number: normalizeRecipient(number),
        type: mediaType,
        caption: caption,
        url: cleanBase64,
        filename: fileName,
      }, { headers: this.headers, timeout: TIMEOUT_SEND });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendMedia falhou', error);
      throw error;
    }
  }

  /**
   * Envia uma WhatsApp List Message (menu clicável). Até 10 itens.
   * Útil pra ofertar atalhos no início do atendimento.
   *
   * sections: cada section tem { title, rows: [{ rowId, title, description? }] }
   */
  async sendList(
    number: string,
    payload: {
      title: string;
      description: string;
      buttonText: string;
      footerText?: string;
      sections: Array<{ title: string; rows: Array<{ rowId: string; title: string; description?: string }> }>;
    }
  ) {
    try {
      const url = `${this.config.apiUrl}/send/list`;
      const response = await axios.post(url, {
        number: normalizeRecipient(number),
        title: payload.title,
        description: payload.description,
        buttonText: payload.buttonText,
        footerText: payload.footerText || '',
        sections: payload.sections,
      }, { headers: this.headers, timeout: TIMEOUT_SEND });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendList falhou', error);
      throw error;
    }
  }

  async sendAudio(number: string, base64: string) {
    try {
      const url = `${this.config.apiUrl}/send/media`;
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      const response = await axios.post(url, {
        number: normalizeRecipient(number),
        type: 'audio',
        url: cleanBase64,
        filename: 'audio.ogg',
        delay: 1000
      }, { headers: this.headers, timeout: TIMEOUT_SEND });
      return response.data;
    } catch (error: any) {
      logEvolutionError('sendAudio falhou', error);
      throw error;
    }
  }

  async loadMedia(message: any) {
    try {
      const url = `${this.config.apiUrl}/message/downloadimage`;
      const response = await axios.post(url, {
        message: message
      }, { headers: this.headers, timeout: TIMEOUT_LOAD_MEDIA });
      return response.data;
    } catch (error: any) {
      // Inclui codigo do timeout pra debug
      const isTimeout = error?.code === 'ECONNABORTED' || error?.message?.includes('timeout');
      console.error('[EvolutionAPI] loadMedia falhou:', {
        timeout: isTimeout,
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
      });
      throw error;
    }
  }
}
