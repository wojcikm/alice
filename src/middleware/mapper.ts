import {Context, Next} from 'hono';
import {ExternalChatRequestDto} from '../dto/chat.dto';
import {z} from 'zod';
import {v4 as uuidv4} from 'uuid';
import {uploadFile} from '../services/common/upload.service';
import {CoreMessage, TextPart, ImagePart} from 'ai';
import {messageService} from '../services/agent/message.service';
import { FileType } from '../types/upload';

const processImageData = async (imageData: string) => {
  if (imageData.startsWith('http')) return imageData;

  const base64Data = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;

  const upload_result = await uploadFile({
    uuid: uuidv4(),
    file: {base64: base64Data, mime_type: 'image/jpeg'},
    type: FileType.IMAGE,
    original_name: 'image.jpg'
  });

  return `${process.env.APP_URL}/api/files/${upload_result.uuid}`;
};

const normalizeMessage = async (message: any): Promise<CoreMessage> => {
  const hasMultipartContent = Array.isArray(message.content);
  const hasImageContent = hasMultipartContent && message.content.some((part: TextPart | ImagePart) => part.type === 'image' || part.type === 'image_url');

  if (!hasMultipartContent) {
    return {
      ...message,
      content_type: 'text'
    } as CoreMessage;
  }

  const normalizedContent = await Promise.all(
    message.content.map(async (part: TextPart | ImagePart) => {
      if (part.type === 'image_url') {
        const processed_url = await processImageData(part.image_url!.url);
        return {type: 'image', image: processed_url} as ImagePart;
      }

      if (part.type === FileType.IMAGE) {
        const processed_url = await processImageData(part.image!);
        return {type: 'image', image: processed_url} as ImagePart;
      }

      return part;
    })
  );

  return {
    ...message,
    content_type: hasImageContent ? 'multi_part' : 'text',
    content: normalizedContent
  } as CoreMessage;
};

export const mapperMiddleware = async (c: Context, next: Next) => {
  try {
    const request = c.get('request') || {};
    const external = ExternalChatRequestDto.parse(request);
    const other_messages = external.messages.filter(msg => msg.role !== 'system');

    let messages_to_normalize = [...other_messages];

    if (other_messages.length <= 1 && external.conversation_id) {
      const previous_messages = await messageService.findByConversationId(external.conversation_id);
      messages_to_normalize = [...previous_messages, ...other_messages];
    }

    const normalized_messages = await Promise.all(messages_to_normalize.map(normalizeMessage));

    console.log(`Query:`, normalized_messages.at(-1)?.content);

    c.set('request', {
      ...external,
      messages: normalized_messages
    });

    await next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({error: 'Invalid request format', details: error.issues}, 400);
    }
    console.error('Mapper error:', error);
    return c.json({error: 'Invalid request body'}, 400);
  }
};
