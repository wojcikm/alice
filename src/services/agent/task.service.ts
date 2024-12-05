import db from '../../database/db';
import {tasks} from '../../schema/task';
import {v4 as uuidv4} from 'uuid';
import {z} from 'zod';
import {eq, and} from 'drizzle-orm';
import type {Action, AgentThoughts} from '../../types/agent';
import {actions} from '../../schema/action';
import {actionDocuments} from '../../schema/actionDocuments';
import {documents} from '../../schema/document';

const taskSchema = z.object({
  name: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'completed']),
  uuid: z.string().nullable()
});

// Add this interface to match the database schema
interface TaskRecord {
  uuid: string;
  conversation_uuid: string;
  type: string;
  status: string;
  name: string;
  description: string | null;
  scheduled_for?: string | null;
  completed_at?: string | null;
  result?: string | null;
}

interface ActionRecord {
  id: number;
  uuid: string;
  task_uuid: string;
  tool_uuid: string;
  name: string;
  status: string | null;
  sequence: number | null;
  payload: unknown;
  result: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const mapActionRecordToAction = (record: ActionRecord): Action => ({
  uuid: record.uuid,
  task_uuid: record.task_uuid,
  tool_uuid: record.tool_uuid,
  name: record.name,
  status: record.status as Action['status'],
  sequence: record.sequence ?? 0,
  payload: record.payload ? JSON.parse(record.payload as string) : null,
  result: record.result
});

const mapTaskRecordToTask = (record: TaskRecord) => ({
  uuid: record.uuid,
  name: record.name,
  type: record.type,
  status: record.status,
  description: record.description,
  scheduled_for: record.scheduled_for,
  completed_at: record.completed_at,
  result: record.result,
  actions: [] as Action[]
});

const findByConversationId = async (conversation_uuid: string) => {
  if (!conversation_uuid) {
    throw new Error('Conversation UUID is required');
  }

  const task_records = await db
    .select()
    .from(tasks)
    .leftJoin(actions, eq(tasks.uuid, actions.task_uuid))
    .leftJoin(actionDocuments, eq(actions.uuid, actionDocuments.action_uuid))
    .leftJoin(documents, eq(actionDocuments.document_uuid, documents.uuid))
    .where(eq(tasks.conversation_uuid, conversation_uuid))
    .orderBy(tasks.created_at);

  // Group results by task
  const tasks_map = new Map();

  task_records.forEach(record => {
    const task_uuid = record.tasks.uuid;

    if (!tasks_map.has(task_uuid)) {
      tasks_map.set(task_uuid, {
        ...mapTaskRecordToTask(record.tasks),
        actions: []
      });
    }

    if (record.actions) {
      const task = tasks_map.get(task_uuid);
      const action = mapActionRecordToAction(record.actions);

      // Add documents to action if they exist
      if (record.documents) {
        action.documents = action.documents || [];
        action.documents.push({
          uuid: record.documents.uuid,
          text: record.documents.text,
          metadata: record.documents.metadata
        });
      }

      // Only add action if it's not already in the array
      if (!task.actions.some(a => a.uuid === action.uuid)) {
        task.actions.push(action);
      }
    }
  });

  return Array.from(tasks_map.values());
};

export const taskService = {
  createTasks: async (conversation_uuid: string, tasks_data: AgentThoughts['task']['result']) => {
    if (!tasks_data?.length) {
      return [];
    }

    const validated_tasks = z.array(taskSchema).parse(tasks_data);

    // Separate new and existing tasks
    const new_tasks = validated_tasks.filter(task => !task.uuid);
    const existing_tasks = validated_tasks.filter(task => task.uuid);

    // Get current tasks to prevent updating completed ones
    const current_tasks = await db.select().from(tasks).where(eq(tasks.conversation_uuid, conversation_uuid));

    const completed_uuids = new Set(current_tasks.filter(task => task.status === 'completed').map(task => task.uuid));

    // Insert new tasks
    const tasks_to_insert = new_tasks.map(task => ({
      uuid: uuidv4(),
      conversation_uuid,
      name: task.name,
      type: task.name === 'final_answer' ? 'final' : 'regular',
      status: task.status,
      description: task.description
    }));

    // Update existing pending tasks
    const tasks_to_update = existing_tasks
      .filter(task => task.uuid && !completed_uuids.has(task.uuid))
      .map(task => ({
        uuid: task.uuid!,
        conversation_uuid,
        name: task.name,
        type: task.name === 'final_answer' ? 'final' : 'regular',
        status: task.status,
        description: task.description
      }));

    await Promise.all([
      tasks_to_insert.length > 0 ? db.insert(tasks).values(tasks_to_insert).returning() : Promise.resolve([]),
      ...tasks_to_update.map(task =>
        db
          .update(tasks)
          .set({
            name: task.name,
            type: task.type,
            status: task.status,
            description: task.description,
            updated_at: new Date().toISOString()
          })
          .where(and(eq(tasks.uuid, task.uuid), eq(tasks.status, 'pending')))
          .returning()
      )
    ]);

    // Use findByConversationId to get complete tasks with actions and documents
    return findByConversationId(conversation_uuid);
  },
  updateTaskStatus: async (task_uuid: string, status: 'pending' | 'completed') => {
    if (!task_uuid) {
      throw new Error('Task UUID is required');
    }

    const updated_task = await db
      .update(tasks)
      .set({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .where(eq(tasks.uuid, task_uuid))
      .returning();

    return updated_task[0];
  },
  findByConversationId,
  updateTaskResult: async (task_uuid: string, result: string) => {
    if (!task_uuid) {
      throw new Error('Task UUID is required');
    }

    const updated_task = await db
      .update(tasks)
      .set({
        result,
        updated_at: new Date().toISOString()
      })
      .where(eq(tasks.uuid, task_uuid))
      .returning();

    return updated_task[0];
  }
};
