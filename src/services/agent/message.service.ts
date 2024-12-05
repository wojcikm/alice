import db from '../../database/db';
import {messages, type NewMessage} from '../../schema/message';
import {v4 as uuidv4} from 'uuid';
import {CoreMessage} from 'ai';
import {eq} from 'drizzle-orm';

interface CreateMessageParams {
  conversation_uuid: string;
  message: CoreMessage;
  source?: string;
}

export const messageService = {
  create: async ({conversation_uuid, message, source = 'chat'}: CreateMessageParams): Promise<NewMessage> => {
    try {
      const [newMessage] = await db
        .insert(messages)
        .values({
          uuid: uuidv4(),
          conversation_uuid,
          role: message.role,
          content_type: typeof message.content === 'string' ? 'text' : 'multi_part',
          content: typeof message.content === 'string' ? message.content : message.content.map(part => (part.type === 'text' ? part.text : '')).join(''),
          multipart: typeof message.content === 'string' ? null : message.content
        })
        .returning();

      if (!newMessage) {
        throw new Error('Failed to create message');
      }

      return newMessage;
    } catch (error) {
      throw new Error(`Error creating message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  findByConversationId: async (conversation_uuid: string): Promise<CoreMessage[]> => {
    try {
      const conversation_messages = await db.select().from(messages).where(eq(messages.conversation_uuid, conversation_uuid)).orderBy(messages.created_at);

      return conversation_messages.map(msg => ({
        role: msg.role,
        content: msg.content_type === 'multi_part' ? msg.multipart : msg.content
      })) as CoreMessage[];
    } catch (error) {
      throw new Error(`Error fetching messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};
