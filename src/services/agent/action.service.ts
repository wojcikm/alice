import db from '../../database/db';
import {actions} from '../../schema/action';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {documentService} from './document.service';
import {actionDocuments} from '../../schema/actionDocuments';
import {Action} from '../../types/agent';

const actionSchema = z.object({
  uuid: z.string(),
  task_uuid: z.string(),
  tool_uuid: z.string(),
  name: z.string(),
  sequence: z.number(),
  status: z.enum(['pending', 'completed', 'failed']),
  payload: z.record(z.unknown()).nullable()
});

export const actionService = {
  createAction: async (action: Action) => {
    const validated_action = actionSchema.parse(action);

    const [created_action] = await db
      .insert(actions)
      .values({
        uuid: validated_action.uuid,
        task_uuid: validated_action.task_uuid,
        tool_uuid: validated_action.tool_uuid,
        name: validated_action.name,
        type: 'sync',
        sequence: validated_action.sequence,
        status: validated_action.status,
        payload: validated_action.payload ? JSON.stringify(validated_action.payload) : null
      })
      .returning();

    return created_action;
  },

  updateAction: async (uuid: string, updates: Partial<Action>) => {
    const [updated_action] = await db
      .update(actions)
      .set({
        ...updates,
        payload: updates.payload ? JSON.stringify(updates.payload) : undefined,
        updated_at: new Date().toISOString()
      })
      .where(eq(actions.uuid, uuid))
      .returning();

    return updated_action;
  },

  updateActionWithResult: async (uuid: string, result: unknown): Promise<Action> => {
    const updated_data = await db.transaction(async tx => {
      const formatted_text = typeof result === 'string' 
        ? result 
        : typeof result === 'object' && result !== null
          ? Object.entries({
              uuid: (result as any).uuid,
              name: (result as any).name,
              content: (result as any).text,
              description: (result as any).description,
              metadata_description: (result as any).metadata?.description,
              metadata_source: (result as any).metadata?.source,
              original_source: (result as any).source
            })
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')
          : JSON.stringify(result);

      const [action] = await tx
        .update(actions)
        .set({
          status: 'completed',
          result: formatted_text,
          updated_at: new Date().toISOString()
        })
        .where(eq(actions.uuid, uuid))
        .returning();

      if (!action) throw new Error('Action not found');

      const document = await documentService.createDocument({
        conversation_uuid: action.task_uuid,
        text: formatted_text,
        source_uuid: action.task_uuid,
        action_uuid: action.uuid,
        metadata_override: {
          type: 'text',
          content_type: 'full',
          source: 'action_result'
        }
      });

      await tx.insert(actionDocuments).values({
        action_uuid: action.uuid,
        document_uuid: document.uuid
      });

      const [action_with_documents] = await tx.query.actions.findMany({
        where: eq(actions.uuid, uuid),
        with: {
          actionDocuments: {
            with: {
              document: true
            }
          }
        }
      });

      if (!action_with_documents) throw new Error('Failed to retrieve action with document');

      return {
        ...action_with_documents,
        documents: action_with_documents.actionDocuments.map(ad => ad.document)
      } as Action;
    });

    return updated_data;
  }
};
