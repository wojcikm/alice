import {createByModelName} from '@microsoft/tiktokenizer';
import type {Document, DocumentMetadata} from '../../types/document';
import {z} from 'zod';
import {v4 as uuidv4} from 'uuid';

const SPECIAL_TOKENS = new Map<string, number>([
  ['<|im_start|>', 100264],
  ['<|im_end|>', 100265],
  ['<|im_sep|>', 100266]
]);

const textServiceSchema = z.object({
  model_name: z.string().default('gpt-4o')
});

interface TokenizerState {
  tokenizer: Awaited<ReturnType<typeof createByModelName>> | undefined;
  model_name: string;
}

const formatForTokenization = (text: string): string => `<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant<|im_end|>`;

const countTokens = (tokenizer: TokenizerState['tokenizer'], text: string): number => {
  if (!tokenizer) {
    throw new Error('Tokenizer not initialized');
  }
  return tokenizer.encode(text, Array.from(SPECIAL_TOKENS.keys())).length;
};

const initializeTokenizer = async (state: TokenizerState, model?: string): Promise<TokenizerState> => {
  if (!state.tokenizer || model !== state.model_name) {
    const model_name = model || state.model_name;
    const tokenizer = await createByModelName(model_name, SPECIAL_TOKENS);
    return {tokenizer, model_name};
  }
  return state;
};

const extractHeaders = (text: string): Record<string, string[]> => {
  const headers: Record<string, string[]> = {};
  const header_regex = /(^|\n)(#{1,6})\s+(.*)/g;
  let match;

  while ((match = header_regex.exec(text)) !== null) {
    const level = match[2].length;
    const content = match[3].trim();
    const key = `h${level}`;
    headers[key] = headers[key] || [];
    headers[key].push(content);
  }

  return headers;
};

const updateHeaders = (current: Record<string, string[]>, extracted: Record<string, string[]>): Record<string, string[]> => {
  const updated = {...current};

  for (let level = 1; level <= 6; level++) {
    const key = `h${level}`;
    if (extracted[key]) {
      updated[key] = extracted[key];
      for (let l = level + 1; l <= 6; l++) {
        delete updated[`h${l}`];
      }
    }
  }

  return updated;
};

const extractUrlsAndImages = (text: string) => {
  const urls: string[] = [];
  const images: string[] = [];
  let url_index = 0;
  let image_index = 0;

  const content = text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt_text, url) => {
      images.push(url);
      return `![${alt_text}]({{$img${image_index++}}})`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, link_text, url) => {
      if (!url.startsWith('{{$img')) {
        urls.push(url);
        return `[${link_text}]({{$url${url_index++}}})`;
      }
      return _match;
    });

  return {content, urls, images};
};

const DocumentSchema = z.object({
  uuid: z.string().uuid(),
  source_uuid: z.string(),
  conversation_uuid: z.string(),
  text: z.string(),
  metadata: z.object({
    uuid: z.string().uuid(),
    tokens: z.number(),
    headers: z.record(z.string(), z.array(z.string())),
    urls: z.array(z.string()),
    images: z.array(z.string()),
    type: z.enum(['text', 'audio', 'image', 'document']),
    content_type: z.enum(['chunk', 'full', 'memory'])
  }),
  created_at: z.string(),
  updated_at: z.string()
});

// New getChunk implementation using binary search for efficiency
const getChunk = (tokenizer: TokenizerState['tokenizer'], text: string, start: number, limit: number): {chunk_text: string; chunk_end: number} => {
  // Compute overhead once
  const overhead = countTokens(tokenizer, formatForTokenization('')) - countTokens(tokenizer, '');
  const maxPos = text.length;

  let low = start;
  let high = maxPos;
  let bestFit = start;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateText = text.slice(start, mid);
    const tokens = countTokens(tokenizer, candidateText) + overhead;

    if (tokens <= limit) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const tryAdjustBoundary = (pos: number) => {
    const nextNewline = text.indexOf('\n', pos);
    if (nextNewline !== -1 && nextNewline < maxPos) {
      const candidate = nextNewline + 1;
      const candidateText = text.slice(start, candidate);
      const candidateTokens = countTokens(tokenizer, candidateText) + overhead;
      if (candidateTokens <= limit) return candidate;
    }

    const prevNewline = text.lastIndexOf('\n', pos);
    if (prevNewline > start) {
      const candidate = prevNewline + 1;
      const candidateText = text.slice(start, candidate);
      const candidateTokens = countTokens(tokenizer, candidateText) + overhead;
      if (candidateTokens <= limit) return candidate;
    }

    return pos;
  };

  const finalEnd = tryAdjustBoundary(bestFit);
  const finalText = text.slice(start, finalEnd);

  return { chunk_text: finalText, chunk_end: finalEnd };
};

export const createTextService = async (config: z.infer<typeof textServiceSchema>) => {
  let state: TokenizerState = {
    tokenizer: undefined,
    model_name: textServiceSchema.parse(config).model_name
  };

  const split = async (text: string, limit: number, metadata?: Partial<DocumentMetadata>): Promise<Document[]> => {
    if (!text) {
      throw new Error('Text is required for splitting');
    }

    state = await initializeTokenizer(state);

    const chunks: Document[] = [];
    let position = 0;
    let current_headers: Record<string, string[]> = {};

    while (position < text.length) {
      const {chunk_text, chunk_end} = getChunk(state.tokenizer, text, position, limit);
      const tokens = countTokens(state.tokenizer, chunk_text);

      const headers_in_chunk = extractHeaders(chunk_text);
      current_headers = updateHeaders(current_headers, headers_in_chunk);

      const {content, urls, images} = extractUrlsAndImages(chunk_text);

      chunks.push({
        uuid: uuidv4(),
        source_uuid: metadata?.source_uuid || '',
        conversation_uuid: metadata?.conversation_uuid || '',
        text: content,
        metadata: {
          uuid: uuidv4(),
          tokens,
          headers: current_headers,
          urls,
          images,
          type: (metadata?.type || 'text') as 'text' | 'audio' | 'image' | 'document',
          content_type: (metadata?.content_type || 'chunk') as 'chunk' | 'full' | 'memory',
          ...metadata
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      position = chunk_end;
    }

    return chunks.map(chunk => {
      try {
        return DocumentSchema.parse(chunk);
      } catch (error) {
        console.error('Invalid document structure:', error);
        throw new Error('Failed to create valid document chunk');
      }
    });
  };

  return {
    split: (text: string, limit: number, metadata?: Partial<DocumentMetadata>) => split(text, limit, metadata)
  };
};

export const createTokenizer = async (model_name: string = 'gpt-4o') => {
  const state: TokenizerState = {
    tokenizer: undefined,
    model_name
  };

  const initialized_state = await initializeTokenizer(state);

  return {
    countTokens: (text: string) => countTokens(initialized_state.tokenizer, text),
    formatForTokenization: (text: string) => formatForTokenization(text)
  };
};
