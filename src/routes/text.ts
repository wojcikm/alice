import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createTextService } from '../services/common/text.service';
import type { AppEnv } from '../types/hono';

const text = new Hono<AppEnv>();

const splitTextSchema = z.object({
  text: z.string().min(1, "Text cannot be empty"),
  chunk_size: z.number().int().min(100).max(32000).default(2000),
  metadata: z.object({
    type: z.enum(['text', 'audio', 'image', 'document']).default('text'),
    content_type: z.enum(['chunk', 'full', 'memory']).default('chunk'),
    source_uuid: z.string().optional(),
    conversation_uuid: z.string().optional()
  }).optional()
});

text.post('/split', zValidator('json', splitTextSchema), async (c) => {
  try {
    const { text: input_text, chunk_size, metadata } = c.req.valid('json');
    
    const text_service = await createTextService({ model_name: 'gpt-4o' });
    const chunks = await text_service.split(input_text, chunk_size, metadata);
    
    return c.json({ chunks });
  } catch (error) {
    console.error('Error splitting text:', error);
    return c.json({ error: 'Failed to split text' }, 500);
  }
});

export default text; 