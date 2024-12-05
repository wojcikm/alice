import {z} from 'zod';
import {CoreMessage} from 'ai';

// Common schemas
const BaseMessageContent = z.union([
  z.string(),
  z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      image_url: z.object({url: z.string()}).optional(),
      image: z.string().optional(),
      source: z
        .object({
          type: z.literal('base64'),
          media_type: z.string(),
          data: z.string()
        })
        .optional()
    })
  )
]);

// External DTO for raw input
export const ExternalChatRequestDto = z.object({
  conversation_id: z.string().optional(),
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: BaseMessageContent
    })
  ),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  user: z.object({
    uuid: z.string(),
    name: z.string(),
    context: z.string().optional(),
    environment: z.string().optional()
  })
});

// Internal DTO using CoreMessage
export const ChatRequestDto = z.object({
  conversation_id: z.string().optional(),
  model: z.string(),
  messages: z.array(z.custom<CoreMessage>()),
  stream: z.boolean().optional(),
  temperature: z.number().optional().default(0.7),
  max_tokens: z.number().optional().default(16384),
  user: z.object({
    uuid: z.string(),
    name: z.string(),
    context: z.string().optional(),
    environment: z.string().optional()
  })
});

export type ExternalChatRequest = z.infer<typeof ExternalChatRequestDto>;
export type ChatRequest = z.infer<typeof ChatRequestDto>;
