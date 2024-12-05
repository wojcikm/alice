import type {ChatCompletion} from 'openai/resources/chat/completions';

export interface SetAssistantResponseParams {
  conversation_id: string;
  response: string | ChatCompletion;
  source?: string;
}
