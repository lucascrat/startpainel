export interface CustomerApp {
  id?: number;
  customer_id: number;
  app_name: string;
  app_model?: string;
  access_type: 'mac_key' | 'user_pass' | 'xtream' | 'xtream_full';
  mac_address?: string;
  device_key?: string;
  username?: string;
  password?: string;
  provider_url?: string;
  host?: string;
  android_link?: string;
  ios_link?: string;
  icon_url?: string;
  app_site_url?: string;
  is_tv: boolean;
}

export interface Customer {
  id?: string | number;
  username: string;
  name?: string;
  whatsapp?: string;
  renewalPrice?: number;
  renewal_price?: number | string; // For Postgres compat
  cost_per_credit?: number;
  lines_count?: number;
  amount_paid?: number;
  status: 'active' | 'expired';
  expiration_date?: string;
  last_renewal?: string;
  playlist_url?: string;
  provider?: string; // 'startpainel' | 'wareztv' | 'outro'
  created_at?: any; // For Postgres compat
  createdAt?: any;
  apps?: CustomerApp[];
}

export interface ChatMessage {
  id?: string;
  text: string;
  sender: 'user' | 'ai' | 'admin' | 'attendant' | 'customer';
  type: 'text' | 'pix_qr' | 'pix_copy_paste' | 'image' | 'audio';
  metadata?: any;
  imageData?: string; // Base64 image data
  createdAt?: any;
}

export interface PixData {
  qrcode_image: string;
  copy_paste: string;
  txid: string;
}
