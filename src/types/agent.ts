import {Document} from './document';

interface EnvironmentResponse {
  _thinking: string;
  result: string | null;
}

interface ToolsResponse {
  _thinking: string;
  result: ToolQuery[];
}

interface MemoryResponse {
  _thinking: string;
  result: MemoryQuery[];
}

interface ContextResponse {
  _thinking: string;
  result: string;
}

interface TaskItem {
  uuid: string | null;
  name: string;
  description: string;
  status: 'completed' | 'pending';
}

interface TaskResponse {
  _thinking: string;
  result: TaskItem[];
}

export type Action = {
  uuid: string;
  task_uuid: string;
  tool_uuid: string;
  name: string;
  payload: unknown;
  sequence: number | null;
  status: string | null; // 'pending' | 'completed' | 'failed'
  result?: string | null;
  documents?: Document[];
};

export type Task = {
  uuid: string;
  conversation_uuid: string;
  type: string;
  status: string;
  name: string;
  description: string | null;
  scheduled_for?: string | null;
  completed_at?: string | null;
  result?: string | null;
  actions: Action[];
};

export interface Tool {
  uuid: string;
  name: string;
  description: string | null;
  instruction: string | null;
  payload?: unknown;
}

export interface Memory {
  id: number;
  uuid: string;
  name: string;
  category_uuid: string;
  document_uuid: string;
  created_at: string;
  updated_at: string;
}

export interface ToolQuery {
  query: string;
  tool: string;
}

export interface MemoryQuery {
  query: string;
  category: string;
  subcategory: string;
}

export interface AgentThoughts {
  environment: EnvironmentResponse;
  context: ContextResponse;
  tools: ToolsResponse;
  memory: MemoryResponse;
  task: TaskResponse;
}

export interface ToolUsePayload {
  action: string;
  payload: Record<string, unknown>;
}

export interface ToolUseResponse {
  _thinking: string;
  result: ToolUsePayload;
}
