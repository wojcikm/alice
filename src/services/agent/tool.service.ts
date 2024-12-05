import db from '../../database/db';
import {tools, type Tool as DbTool} from '../../schema/tool';
import {Tool} from '../../types/agent';

interface ToolParameters {
  uuid: string;
  name: string;
  description: string;
}

export const toolService = {
  async getAvailableTools(): Promise<Tool[]> {
    const db_tools = await db.select().from(tools);

    return db_tools.map(tool => ({
      uuid: tool.uuid,
      name: tool.name,
      description: tool.description || '',
      instruction: tool.instruction || ''
    }));
  },

  async findAll(): Promise<DbTool[]> {
    return await db.select().from(tools);
  }
};
