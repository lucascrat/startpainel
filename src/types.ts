export interface Customer {
  id?: string | number;
  username: string;
  whatsapp?: string;
  renewalPrice?: number;
  renewal_price?: number | string; // For Postgres compat
  status: 'active' | 'expired';
  created_at?: any; // For Postgres compat
  createdAt: any;
}

export interface ChatMessage {
  id?: string;
  text: string;
  sender: 'user' | 'ai' | 'admin';
  type: 'text' | 'pix_qr' | 'pix_copy_paste' | 'image';
  metadata?: any;
  imageData?: string; // Base64 image data
  createdAt: any;
}

export interface PixData {
  qrcode_image: string;
  copy_paste: string;
  txid: string;
}
