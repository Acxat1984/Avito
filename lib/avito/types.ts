/** Типы Avito Messenger API (webhook v3 + сообщения). */

export interface WebhookPayload {
  id?: string;
  version?: string;
  timestamp?: number;
  payload?: {
    type?: string; // 'message'
    value?: WebhookMessage;
  };
}

export interface WebhookMessage {
  id: string;
  chat_id: string;
  user_id: number;     // id аккаунта, на который пришло сообщение (наш)
  author_id: number;   // кто написал
  created: number;
  type: string;        // text | image | link | location | voice | system | ...
  chat_type: string;   // u2i | u2u
  content?: {
    text?: string;
    flow_id?: string;  // у system-сообщений
    [k: string]: unknown;
  };
  item_id?: number;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
