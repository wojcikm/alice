import type {ChatCompletion} from 'openai/resources/chat/completions';

export const isStreamResponse = (response: unknown): response is AsyncIterable<string> | ReadableStream<string> => {
  return response instanceof ReadableStream || Symbol.asyncIterator in Object(response);
};

export const isChatCompletion = (result: any): result is ChatCompletion => result?.object === 'chat.completion';
