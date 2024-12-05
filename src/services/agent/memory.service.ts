import { z } from 'zod';
import db from '../../database/db';
import { memories, type Memory, type NewMemory } from '../../schema/memory';
import { conversationMemories } from '../../schema/conversationMemories';
import { eq } from 'drizzle-orm';
import { documentService, type DocumentType } from './document.service';
import { v4 as uuidv4 } from 'uuid';
import { categoryService } from './category.service';
import { searchService } from '../common/search.service';
import { completion } from '../common/llm.service';
import { stateManager } from './state.service';
import { memoryRecallPrompt } from '../../prompts/tools/memory.recall';
import { memory_categories } from '../../config/memory.config';
import { LangfuseSpanClient } from 'langfuse';

// Add this interface definition after the imports and before MemoryActionSchema
interface SearchFilters {
  source_uuid?: string;
  source?: string;
  content_type?: 'chunk' | 'full' | 'memory';
  category?: string;
  subcategory?: string;
}

interface MemoryWithDocument extends Memory {
  document?: DocumentType;
}

// Validation schemas
const MemoryActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('recall'),
    payload: z.object({
      query: z.string(),
      filters: z.object({
        source_uuid: z.string().uuid().optional(),
        source: z.string().optional(),
        content_type: z.enum(['chunk', 'full', 'memory']).optional(),
        category: z.string().optional(),
        subcategory: z.string().optional()
      }).optional(),
      limit: z.number().int().min(1).max(100).default(15),
      conversation_uuid: z.string().optional().default('default')
    })
  }),
  z.object({
    action: z.literal('remember'),
    payload: z.object({
      name: z.string(),
      text: z.string(),
      category: z.string(),
      subcategory: z.string(),
      conversation_uuid: z.string().optional().default('default')
    })
  }),
  z.object({
    action: z.literal('forget'),
    payload: z.object({
      memory_uuid: z.string(),
      conversation_uuid: z.string().optional().default('default')
    })
  }),
  z.object({
    action: z.literal('update'),
    payload: z.object({
      memory_uuid: z.string(),
      name: z.string().optional(),
      category_uuid: z.string().optional(),
      text: z.string().optional(),
      conversation_uuid: z.string().optional().default('default')
    })
  })
]);

interface MemoryQuery {
  _thinking: string;
  queries: Array<{
    category: string;
    subcategory: string;
    question: string;
    query: string;
  }>;
}

export const memoryService = {
  // Core CRUD operations
  async createMemory(data: NewMemory): Promise<Memory> {
    const [memory] = await db.insert(memories).values(data).returning();
    return memory;
  },

  async getMemoryByUuid(uuid: string): Promise<Memory | undefined> {
    const [memory] = await db.select().from(memories).where(eq(memories.uuid, uuid));
    return memory;
  },

  async updateMemory(uuid: string, data: Partial<NewMemory>): Promise<Memory> {
    const [memory] = await db
      .update(memories)
      .set({ ...data, updated_at: new Date().toISOString() })
      .where(eq(memories.uuid, uuid))
      .returning();
    return memory;
  },

  async deleteMemory(uuid: string): Promise<void> {
    await db.delete(memories).where(eq(memories.uuid, uuid));
  },

  async findByConversationId(conversation_uuid: string): Promise<Memory[]> {
    const result = await db
      .select({
        memories: memories,
        conversation_memories: conversationMemories
      })
      .from(memories)
      .innerJoin(
        conversationMemories,
        eq(conversationMemories.memory_uuid, memories.uuid)
      )
      .where(eq(conversationMemories.conversation_uuid, conversation_uuid));

    return result.map(row => row.memories);
  },

  // Mock search implementation (to be improved later)
  async searchMemories(query: string, filters?: SearchFilters, limit = 5): Promise<MemoryWithDocument[]> {
    try {
      const search_results = await searchService.search(
        query,
        { 
          ...filters, 
          content_type: 'memory' as const 
        },
        limit
      );

      // Get all memory documents in parallel and handle null cases
      const memories_with_documents = await Promise.all(
        search_results
          .filter(result => result.memory)
          .map(async result => {
            const document = await documentService.getDocumentByUuid(result.memory!.document_uuid);
            return {
              ...result.memory!,
              document: document || undefined
            };
          })
      );

      return memories_with_documents;
    } catch (error) {
      console.error('Memory search failed:', error);
      return [];
    }
  },

  async recallMemories(query: string, limit: number, conversation_uuid: string, filters?: SearchFilters): Promise<DocumentType> {
    try {
      const queries = await this.selfQuery(query);
      const search_promises = queries.queries.map(async query_item => {
        const combined_filters = {
          ...filters,
          category: query_item.category,
          subcategory: query_item.subcategory
        };

        return searchService.search(
          {
            vector_query: query_item.question,
            text_query: query_item.query
          },
          combined_filters,
          Math.ceil(limit / queries.queries.length)
        );
      });

      const all_results = await Promise.all(search_promises);

      console.log(all_results)
      
      // Deduplicate results by memory_uuid
      const unique_memories = new Map<string, MemoryWithDocument>();
      all_results.flat().forEach(result => {
        if (result.memory && !unique_memories.has(result.memory.uuid)) {
          unique_memories.set(result.memory.uuid, {
            ...result.memory,
            document: result.document
          });
        }
      });

      const final_memories = Array.from(unique_memories.values())
        .slice(0, limit);

      const response_text = final_memories.length > 0
        ? `Found ${final_memories.length} relevant memories:\n\n${
            final_memories.map(memory => 
              `<memory name="${memory.name}" memory-uuid="${memory.uuid}">${memory.document?.text || 'No content available'}</memory>`
            ).join('\n')
          }`
        : 'No relevant memories found.';

      return documentService.createDocument({
        conversation_uuid,
        source_uuid: 'memory_service',
        text: response_text,
        metadata_override: {
          type: 'text',
          content_type: 'full',
          source: 'memory_service'
        }
      });
    } catch (error) {
      console.error('Memory recall failed:', error);
      throw error;
    }
  },

  async createNewMemory(name: string, text: string, category: string, subcategory: string, conversation_uuid: string): Promise<DocumentType> {
    const document_uuid = uuidv4();
    const memory_uuid = uuidv4();
    
    const document = await documentService.createDocument({
      uuid: document_uuid,
      conversation_uuid,
      source_uuid: 'memory_service',
      text,
      name,
      should_index: true,
      content_type: 'memory',
      category,
      subcategory,
      metadata_override: {
        type: 'text',
        content_type: 'memory',
        source: 'memory',
        name,
        description: `Memory: ${name}`,
        category,
        subcategory
      }
    });

    const category_record = await categoryService.findByNameAndSubcategory(category, subcategory);
    if (!category_record) {
      throw new Error(`Category ${category}/${subcategory} not found`);
    }

    const memory = await memoryService.createMemory({
      uuid: memory_uuid,
      name,
      category_uuid: category_record.uuid,
      document_uuid: document.uuid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await db.insert(conversationMemories).values({
      conversation_uuid,
      memory_uuid: memory.uuid,
      created_at: new Date().toISOString()
    });

    return documentService.createDocument({
      conversation_uuid,
      source_uuid: 'memory_service',
      text: `<memory name="${memory.name}" memory-uuid="${memory.uuid}">${document.text}</memory>`,
      metadata_override: {
        type: 'text',
        content_type: 'full',
        source: 'memory_service'
      }
    });
  },

  async updateExistingMemory(memory_uuid: string, name: string | undefined, category_uuid: string | undefined, text: string | undefined, conversation_uuid: string): Promise<DocumentType> {
    const memory = await memoryService.getMemoryByUuid(memory_uuid);
    if (!memory) {
      throw new Error(`Memory with UUID ${memory_uuid} not found`);
    }

    const current_time = new Date().toISOString();
    let category_details;
    
    if (category_uuid) {
      category_details = await categoryService.findByUuid(category_uuid);
      if (!category_details) {
        throw new Error(`Category with UUID ${category_uuid} not found`);
      }
    }

    if (text) {
      await documentService.updateDocument(memory.document_uuid, {
        text,
        metadata_override: {
          name: name || undefined,
          should_index: true,
          updated_at: current_time,
          ...(category_details && {
            category: category_details.name,
            subcategory: category_details.subcategory || undefined
          })
        },
        updated_at: current_time
      });
    }

    const updated_memory = await memoryService.updateMemory(memory_uuid, {
      name: name || memory.name,
      category_uuid: category_uuid || memory.category_uuid,
      updated_at: current_time
    });

    return documentService.createDocument({
      conversation_uuid,
      source_uuid: 'memory_service',
      text: `Successfully updated memory: ${updated_memory.name}`,
      metadata_override: {
        type: 'text',
        content_type: 'full',
        source: 'memory_service'
      }
    });
  },

  async deleteExistingMemory(memory_uuid: string, conversation_uuid: string): Promise<DocumentType> {
    const memory = await memoryService.getMemoryByUuid(memory_uuid);
    if (!memory) {
      throw new Error(`Memory with UUID ${memory_uuid} not found`);
    }

    await Promise.all([
      memoryService.deleteMemory(memory_uuid),
      documentService.deleteDocument(memory.document_uuid)
    ]);

    return documentService.createDocument({
      conversation_uuid,
      source_uuid: 'memory_service',
      text: `Successfully deleted memory: ${memory.name}`,
      metadata_override: {
        type: 'text',
        content_type: 'full',
        source: 'memory_service'
      }
    });
  },

  async selfQuery(query: string): Promise<MemoryQuery> {
    const state = stateManager.getState();
    
    const queries = await completion.object<MemoryQuery>({
      model: state.config.model ?? 'gpt-4o',
      messages: [
        {role: 'system', content: memoryRecallPrompt()},
        {role: 'user', content: query}
      ],
      temperature: 0,
      user: {
        uuid: state.config.user_uuid ?? '',
        name: state.profile.user_name
      }
    });

    return queries;
  },

  async execute(action: string, payload: unknown): Promise<DocumentType> {
    const parsed = MemoryActionSchema.parse({ action, payload });
    const conversation_uuid = parsed.payload.conversation_uuid || 'default';

    console.log(parsed)
    switch (parsed.action) {
      case 'recall': {
        const { query, filters, limit, conversation_uuid } = parsed.payload;
        return this.recallMemories(query, limit, conversation_uuid, filters);
      }
      case 'remember':
        return memoryService.createNewMemory(
          parsed.payload.name,
          parsed.payload.text,
          parsed.payload.category,
          parsed.payload.subcategory,
          parsed.payload.conversation_uuid
        );
      case 'update':
        return memoryService.updateExistingMemory(
          parsed.payload.memory_uuid,
          parsed.payload.name,
          parsed.payload.category_uuid,
          parsed.payload.text,
          parsed.payload.conversation_uuid
        );
      case 'forget':
        return memoryService.deleteExistingMemory(parsed.payload.memory_uuid, parsed.payload.conversation_uuid);
      default:
        return documentService.createErrorDocument({
          error: new Error(`Unknown memory action: ${action}`),
          conversation_uuid,
          context: 'Memory service execution',
          source_uuid: 'memory_service'
        });
    }
  },

  async getMemoryByDocumentUuid(document_uuid: string): Promise<Memory | undefined> {
    console.log(`Fetching memory for document_uuid='${document_uuid}'`);
    
    const [memory] = await db
      .select()
      .from(memories)
      .where(eq(memories.document_uuid, document_uuid));

    if (memory) {
      console.log(`Memory found: uuid='${memory.uuid}', name='${memory.name}'`);
    } else {
      console.log(`No memory found for document_uuid='${document_uuid}'`);
    }

    return memory;
  },

  async getRecentMemoriesContext(span?: LangfuseSpanClient): Promise<DocumentType> {
    const state = stateManager.getState();
    const today = new Date();

    try {
        // Get all categories from memory config
        const category_queries = memory_categories.map(category => ({
            category: category.name,
            subcategory: category.subcategory
        }));

        // Format the categories into a readable text
        const formatted_content = category_queries
            .map(query => `<category name="${query.category}" subcategory="${query.subcategory}"/>`)
            .join('\n');

        const final_content = formatted_content.trim() || 'No recent memory categories found.';

        return documentService.createDocument({
            conversation_uuid: state.config.conversation_uuid ?? 'unknown',
            source_uuid: 'memory_service',
            text: final_content,
            metadata_override: {
                type: 'document',
                content_type: 'full',
                name: 'RecentMemoryCategories',
                source: 'memory_service',
                description: 'Recent memory categories and subcategories from the last 7 days'
            }
        });
    } catch (error) {
        return documentService.createErrorDocument({
            error: error instanceof Error ? error : new Error('Failed to fetch recent memory categories'),
            conversation_uuid: state.config.conversation_uuid ?? 'unknown',
            context: 'Memory service - getRecentMemoriesContext',
            source_uuid: 'memory_service'
        });
    }
  }
};
