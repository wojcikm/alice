import {
  CoreMessage,
  CoreSystemMessage,
  CoreUserMessage,
  CoreAssistantMessage,
  CoreToolMessage,
  TextPart,
  ImagePart
} from 'ai';

interface ExternalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: {url: string};
        source?: {
          type: 'base64';
          media_type: string;
          data: string;
        };
      }>;
}

export const normalizeMessage = async (message: ExternalMessage): Promise<CoreMessage> => {
  if (typeof message.content === 'string') {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: message.content
        } as CoreSystemMessage;

      case 'user':
        return {
          role: 'user',
          content: message.content
        } as CoreUserMessage;

      case 'assistant':
        return {
          role: 'assistant',
          content: message.content
        } as CoreAssistantMessage;

      case 'tool':
        return {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'default',
              toolName: 'default',
              result: message.content
            }
          ]
        } as CoreToolMessage;

      default:
        throw new Error(`Unsupported message role: ${message.role}`);
    }
  }

  const parts: Array<TextPart | ImagePart> = await Promise.all(
    message.content.map(async part => {
      if (part.type === 'text' && part.text) {
        return {
          type: 'text',
          text: part.text
        };
      }

      if (part.type === 'image_url' && part.image_url) {
        return {
          type: 'image',
          image: new URL(part.image_url.url)
        };
      }

      if (part.type === 'image') {
        return {
          type: 'image',
          image: part.source.data,
          mimeType: part.source.media_type
        };
      }

      throw new Error(`Unsupported message part type: ${part.type}`);
    })
  );

  // For array content, only user and assistant messages are supported
  switch (message.role) {
    case 'user':
      return {
        role: 'user',
        content: parts
      } as CoreUserMessage;

    case 'assistant':
      return {
        role: 'assistant',
        content: parts
      } as CoreAssistantMessage;

    default:
      throw new Error(`Array content not supported for role: ${message.role}`);
  }
};
