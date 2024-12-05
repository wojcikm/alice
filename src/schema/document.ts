import { sql, relations } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { conversations } from './conversation';
import { messageDocuments } from './messageDocuments';
import { actionDocuments } from './actionDocuments';
import { taskDocuments } from './taskDocuments';
import { embedding } from "../services/common/llm.service";
import { vectorService } from "../services/common/vector.service";
import { algoliaService } from '../services/common/algolia.service';

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  source_uuid: text('source_uuid').notNull(),
  conversation_uuid: text('conversation_uuid').references(() => conversations.uuid),
  text: text('text').notNull(),
  metadata: text('metadata', { mode: 'json' }).notNull(),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const documentsRelations = relations(documents, ({ one, many }) => ({
  conversation: one(conversations),
  messageDocuments: many(messageDocuments),
  actionDocuments: many(actionDocuments),
  taskDocuments: many(taskDocuments)
}));

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
/*
const exampleJsonData = {
  docs: [
    {
      content: "This is the main content of the document.",
      metadata: {
        title: "Main Document Title",
        description: "A brief description of the main document",
        headers: [
          { h1: "Main Title", h2: "Subtitle", h3: "Section 1", h4: "Subsection 1.1", h5: "Topic 1.1.1", h6: "Subtopic 1.1.1.1" }
        ],
        images: [
          "https://example.com/image1.jpg",
          "https://example.com/image2.png"
        ],
        links: [
          "https://example.com/link1",
          "https://example.com/link2"
        ]
      }
    },
    {
      content: "Another document's content goes here.",
      metadata: {
        title: "Document 2 Title",
        description: "A brief description of Document 2",
        headers: [
          { h1: "Document 2", h2: "Chapter 1", h3: "Part A", h4: "", h5: "", h6: "" }
        ],
        images: [
          "https://example.com/doc2-image.jpg"
        ],
        links: [
          "https://example.com/doc2-reference"
        ]
      }
    }
  ]
};

*/

export const documentHooks = {
  async afterCreate(document: Document) {
    try {
      const metadata = typeof document.metadata === 'string' 
        ? JSON.parse(document.metadata) 
        : document.metadata;
      
      if (metadata.should_index) {
        const embeddings = await embedding(document.text);
        
        await vectorService.upsertPoint(embeddings, {
          document_uuid: document.uuid,
          source_uuid: document.source_uuid,
          source: 'document',
          text: document.text,
          metadata,
          created_at: document.created_at || new Date().toISOString(),
          updated_at: document.updated_at || new Date().toISOString()
        });

        await algoliaService.indexDocument({
          ...document,
          metadata: metadata
        });
      }

  
    } catch (error) {
      console.error('Failed to sync document:', error);
      throw error;
    }
  },

  async afterUpdate(document: Document) {
    try {
      const metadata = typeof document.metadata === 'string' 
        ? JSON.parse(document.metadata) 
        : document.metadata;

      if (metadata.should_index) {
        await vectorService.updatePointPayload(document.uuid, {
          document_uuid: document.uuid,
          source_uuid: document.source_uuid,
          source: 'document',
          text: document.text,
          metadata,
          updated_at: document.updated_at || new Date().toISOString()
        });
      }

      await algoliaService.updateDocument({
        ...document,
        metadata: metadata
      });
    } catch (error) {
      console.error('Failed to update document in search services:', error);
      throw error;
    }
  },

  async afterDelete(document: Document) {
    try {
      await Promise.all([
        vectorService.deletePoints([document.uuid]),
        algoliaService.deleteDocument(document.uuid)
      ]);
    } catch (error) {
      console.error('Failed to delete document from search services:', error);
      throw error;
    }
  }
};
