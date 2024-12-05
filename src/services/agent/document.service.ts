import {z} from 'zod';
import db from '../../database/db';
import {documentHooks, documents, type Document} from '../../schema/document';
import {ValidationError} from '../../utils/errors';
import type {DocumentMetadata} from '../../types/document';
import {actionDocuments, taskDocuments} from '../../schema';
import {v4 as uuidv4} from 'uuid';
import {createTextService} from '../common/text.service';
import {eq} from 'drizzle-orm';

const DocumentMetadataSchema = z.object({
  uuid: z.string(),
  source_uuid: z.string().optional(),
  conversation_uuid: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  tokens: z.number(),
  chunk_index: z.number().optional(),
  total_chunks: z.number().optional(),
  type: z.enum(['audio', 'text', 'image', 'document']),
  content_type: z.enum(['chunk', 'full', 'memory']),
  source: z.string().optional(),
  mimeType: z.string().optional(),
  headers: z.record(z.array(z.string())).optional(),
  urls: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  screenshots: z.array(z.string()).optional(),
  should_index: z.boolean().optional(),
  updated_at: z.string().optional(),
  category: z.string().optional().refine(val => {
    if (val === undefined) return true;
    return val !== undefined || metadata.content_type !== 'memory';
  }, { message: "Category is required when content_type is 'memory'" }),
  subcategory: z.string().optional().refine(val => {
    if (val === undefined) return true;
    return val !== undefined || metadata.content_type !== 'memory';
  }, { message: "Subcategory is required when content_type is 'memory'" })
});

export interface DocumentType extends Omit<Document, 'metadata'> {
  metadata: DocumentMetadata;
}

interface CreateDocumentParams {
  uuid?: string;
  conversation_uuid: string;
  source_uuid: string;
  text: string;
  metadata_override?: Partial<DocumentMetadata>;
  task_uuid?: string;
  action_uuid?: string;
  name?: string;
  description?: string;
  content_type?: 'complete' | 'chunk' | 'full' | 'memory';
  should_index?: boolean;
  category?: string;
  subcategory?: string;
}

interface CreateErrorDocumentParams {
  error: unknown;
  conversation_uuid: string;
  context: string;
  source_uuid?: string;
}

const text_service = await createTextService({model_name: 'gpt-4o'});

export const documentService = {
  mapToDocumentType(document: Document): DocumentType {
    try {
      const parsed_metadata = typeof document.metadata === 'string' ? JSON.parse(document.metadata) : document.metadata;

      const validated_metadata = DocumentMetadataSchema.parse(parsed_metadata);

      return {
        ...document,
        metadata: validated_metadata
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid document metadata structure', {
          cause: error,
          context: {document_uuid: document.uuid}
        });
      }
      if (error instanceof SyntaxError) {
        throw new ValidationError('Invalid JSON in document metadata', {
          cause: error,
          context: {document_uuid: document.uuid}
        });
      }
      throw new ValidationError('Failed to parse document metadata', {
        cause: error,
        context: {document_uuid: document.uuid}
      });
    }
  },

  createDocument: async ({
    uuid,
    conversation_uuid,
    source_uuid,
    text,
    metadata_override = {},
    task_uuid,
    action_uuid,
    name,
    description,
    content_type = 'full',
    should_index = false,
    category,
    subcategory
  }: CreateDocumentParams): Promise<DocumentType> => {
    const document_uuid = uuid ?? uuidv4();

    if (content_type === 'memory' && (!category || !subcategory)) {
      throw new ValidationError('Category and subcategory are required for memory documents', {
        context: { document_uuid }
      });
    }

    const [tokenized_document] = await text_service.split(text, 3500, {
      type: 'text',
      content_type: content_type === 'complete' ? 'full' : content_type
    });

    const metadata: DocumentMetadata = {
      uuid: document_uuid,
      conversation_uuid,
      source_uuid,
      type: 'text',
      content_type: content_type === 'complete' ? 'full' : content_type,
      tokens: tokenized_document.metadata.tokens,
      name,
      description,
      should_index,
      ...(content_type === 'memory' ? { category, subcategory } : {}),
      ...metadata_override
    };

    const [document] = await db.transaction(async tx => {
      const [doc] = await tx
        .insert(documents)
        .values({
          uuid: document_uuid,
          source_uuid,
          conversation_uuid,
          text,
          metadata: JSON.stringify(metadata)
        })
        .returning();

      if (task_uuid) {
        await tx.insert(taskDocuments).values({
          task_uuid,
          document_uuid: document_uuid
        });
      }

      if (action_uuid) {
        await tx.insert(actionDocuments).values({
          action_uuid,
          document_uuid: document_uuid
        });
      }

      return [doc];
    });

    await documentHooks.afterCreate(document);

    return documentService.mapToDocumentType(document);
  },

  restorePlaceholders(idoc: DocumentType): DocumentType {
    const { text, metadata } = idoc;
    let restoredText = text;

    // Replace image placeholders with actual URLs
    if (metadata?.images) {
      metadata.images.forEach((url, index) => {
        const regex = new RegExp(`\\!\\[([^\\]]*)\\]\\(\\{\\{\\$img${index}\\}\\}\\)`, 'g');
        restoredText = restoredText.replace(regex, `![$1](${url})`);
      });
    }

    // Replace URL placeholders with actual URLs
    if (metadata?.urls) {
      metadata.urls.forEach((url, index) => {
        const regex = new RegExp(`\\[([^\\]]*)\\]\\(\\{\\{\\$url${index}\\}\\}\\)`, 'g');
        restoredText = restoredText.replace(regex, (match, p1) => {
          // Escape underscores in the link text
          const escapedText = p1.replace(/_/g, '\\_');
          return `[${escapedText}](${url})`;
        });
      });
    }

    return {
      ...idoc,
      text: restoredText,
      metadata: { ...metadata }
    };
  },

  createErrorDocument: async ({
    error,
    conversation_uuid,
    context,
    source_uuid
  }: CreateErrorDocumentParams): Promise<DocumentType> => {
    const error_message = error instanceof Error ? error.message : 'Unknown error';
    const error_text = `Error: ${error_message}\nContext: ${context}`;
    const [tokenized_content] = await text_service.split(error_text, Infinity);

    return documentService.createDocument({
      conversation_uuid,
      source_uuid: source_uuid ?? conversation_uuid,
      text: error_text,
      metadata_override: {
        type: 'document',
        name: 'error_report',
        source: 'system',
        mimeType: 'text/plain',
        description: `Failed to process operation: ${error_message}`
      }
    });
  },

  getDocumentByUuid: async (uuid: string): Promise<DocumentType | null> => {
    try {
      const raw_document = await db
        .select()
        .from(documents)
        .where(eq(documents.uuid, uuid))
        .get();

      if (!raw_document) {
        return null;
      }

      return documentService.mapToDocumentType(raw_document);
    } catch (error) {
      console.error(`Failed to fetch document with UUID ${uuid}:`, error);
      return null;
    }
  },

  updateDocument: async (
    uuid: string,
    updates: {
      text?: string;
      metadata_override?: Partial<DocumentMetadata>;
      updated_at?: string;
    }
  ): Promise<DocumentType> => {
    const existing_document = await documentService.getDocumentByUuid(uuid);
    
    if (!existing_document) {
      throw new Error(`Document with UUID ${uuid} not found`);
    }

    let updated_metadata = existing_document.metadata;
    
    if (updates.text) {
      const [tokenized_document] = await text_service.split(updates.text, 3500, {
        type: 'text',
        content_type: existing_document.metadata.content_type
      });

      updated_metadata = {
        ...existing_document.metadata,
        tokens: tokenized_document.metadata.tokens,
        ...updates.metadata_override
      };
    } else if (updates.metadata_override) {
      updated_metadata = {
        ...existing_document.metadata,
        ...updates.metadata_override
      };
    }

    const [updated_document] = await db
      .update(documents)
      .set({
        text: updates.text ?? existing_document.text,
        metadata: JSON.stringify(updated_metadata),
        updated_at: updates.updated_at ?? new Date().toISOString()
      })
      .where(eq(documents.uuid, uuid))
      .returning();

    await documentHooks.afterUpdate(updated_document);

    return documentService.mapToDocumentType(updated_document);
  },

  async deleteDocument(uuid: string): Promise<void> {
    const document = await documentService.getDocumentByUuid(uuid);
    if (!document) {
      throw new Error(`Document with UUID ${uuid} not found`);
    }

    await db.delete(documents).where(eq(documents.uuid, uuid));

    await documentHooks.afterDelete(document);
  }
};
