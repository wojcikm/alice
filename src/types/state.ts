import {CoreMessage, Message} from 'ai';
import {Memory, Task, Tool} from './agent';
import { DocumentType } from '../services/agent/document.service';

export interface State {
  config: {
    fast_track: boolean;
    step: number;
    max_steps: number;
    current_phase: string | null;
    current_task: {uuid: string; name: string} | null;
    current_action: {uuid: string; name: string} | null;
    current_tool: {uuid: string; name: string} | null;
    user_uuid: string | null;
    conversation_uuid: string | null;
    model: string;
    alt_model: string | null;
    temperature: number;
    max_tokens: number;
    time: string;
  };
  thoughts: {
    environment: string;
    context: string;
    memory: Array<{
      query: string;
      category: string;
      subcategory: string;
    }>;
    tools: Array<{
      query: string;
      tool: string;
    }>;
  };
  profile: {
    environment: Record<string, unknown>;
    context: string | null;
    ai_name: string;
    user_name: string;
  };
  interaction: {
    tasks: Task[];
    messages: Message[];
    tool_context: DocumentType[];
  };
  session: {
    memories: Memory[];
    tools: Tool[];
    categories: {
      category: string;
      subcategory: string;
      description: string;
    }[];
    documents: unknown[];
  };
}
