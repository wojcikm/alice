import {type ChatRequest} from '../dto/chat.dto';
import type {CoreMessage} from 'ai';

export interface CompletionConfig {
  messages: CoreMessage[];
  model: string;
  temperature: number;
  max_tokens?: number;
  user: {
    uuid: string;
    name: string;
    context?: string;
    environment?: string;
  };
  conversation_id?: string;
  stream?: boolean;
}

export interface StreamResponse {
  text: string;
  done: boolean;
}
