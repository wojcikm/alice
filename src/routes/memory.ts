import { Hono } from 'hono';
import { AppEnv } from '../types/hono';
import { z } from 'zod';
import { memoryService } from '../services/agent/memory.service';

const SearchRequestSchema = z.object({
  query: z.string(),
  filters: z.object({
    source_uuid: z.string().uuid().optional(),
    source: z.string().optional(),
    content_type: z.enum(['chunk', 'full', 'memory']).optional(),
    category: z.string().optional(),
    subcategory: z.string().optional()
  }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  conversation_uuid: z.string().optional().default('default')
});

const memory = new Hono<AppEnv>()
  .post('/', async c => {
    try {
      const { text, name, category, subcategory, conversation_uuid } = await c.req.json();

      if (!text) {
        return c.json({ success: false, error: 'Text is required' }, 400);
      }

      const result = await memoryService.execute('remember', {
        name, text, category, subcategory,
        conversation_uuid: conversation_uuid || 'default'
      });

      return c.json({ success: true, data: result });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  })
  .patch('/:memory_uuid', async c => {
    try {
        const memory_uuid = c.req.param('memory_uuid');
        const { name, category_uuid, conversation_uuid, text } = await c.req.json();
  
        if (!memory_uuid) {
          return c.json(
            {
              success: false,
              error: 'Memory UUID is required'
            },
            400
          );
        }
  
        const result = await memoryService.execute('update', {
          memory_uuid,
          name,
          category_uuid,
          text,
          conversation_uuid: conversation_uuid || 'default'
        });
  
        return c.json({
          success: true,
          data: result
        });
      } catch (error) {
        return c.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          500
        );
      }
  })
  .post('/search', async c => {
    try {
      const body = await c.req.json();
      const parsed = SearchRequestSchema.parse({
        query: body.query,
        filters: body.filters,
        limit: body.limit || 15,
        conversation_uuid: body.conversation_uuid
      });

      const result = await memoryService.execute('recall', parsed);
      return c.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        }, 400);
      }

      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

export default memory; 