import { searchClient, type SearchClient } from '@algolia/client-search';
import type { SearchResponse, QueryType, RemoveWordsIfNoResults } from '@algolia/client-search';
import type { DocumentType } from '../agent/document.service';

interface AlgoliaDocument {
  objectID: string;
  document_uuid: string;
  source_uuid: string;
  source: string;
  text: string;
  name?: string;
  description?: string;
  type: string;
  content_type: string;
  category?: string;
  subcategory?: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

let client: SearchClient;
try {
  client = searchClient(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_API_KEY!);
} catch (error) {
  console.error('Failed to initialize Algolia client. Check ALGOLIA_APP_ID and ALGOLIA_API_KEY in .env. Algolia is required for indexing.');
}

const DOCUMENTS_INDEX = process.env.ALGOLIA_INDEX!;

const DEFAULT_SEARCH_PARAMS = {
  hitsPerPage: 15,
  page: 0,
  attributesToRetrieve: ['*'],
  typoTolerance: true,
  ignorePlurals: true,
  removeStopWords: true,
  queryType: 'prefixNone' as QueryType,
  attributesToHighlight: ['*'],
  highlightPreTag: '<em>',
  highlightPostTag: '</em>',
  analytics: true,
  clickAnalytics: true,
  enablePersonalization: false,
  distinct: 1,
  facets: ['*'],
  minWordSizefor1Typo: 3,
  minWordSizefor2Typos: 7,
  advancedSyntax: true,
  removeWordsIfNoResults: 'none' as RemoveWordsIfNoResults,
};

export const algoliaService = {
  async indexDocument(document: DocumentType): Promise<void> {
    try {
      const metadata = document.metadata;
      
      if (metadata.should_index === false) {
        return;
      }

      const algolia_document: AlgoliaDocument = {
        objectID: document.uuid,
        document_uuid: document.uuid,
        source_uuid: document.source_uuid,
        source: metadata.source || '',
        text: document.text,
        name: metadata.name,
        description: metadata.description,
        created_at: document.created_at || '',
        updated_at: document.updated_at || '',
        ...metadata
      };

      console.log('Indexing document to Algolia:', algolia_document);

      await client.saveObject({ 
        indexName: DOCUMENTS_INDEX, 
        body: algolia_document 
      });
    } catch (error) {
      console.error('Failed to index document in Algolia:', error);
      throw error;
    }
  },

  async updateDocument(document: DocumentType): Promise<void> {
    try {
      const metadata = document.metadata;
      
      if (metadata.should_index === false) {
        await this.deleteDocument(document.uuid);
        return;
      }

      await client.partialUpdateObject({ 
        indexName: DOCUMENTS_INDEX, 
        objectID: document.uuid, 
        attributesToUpdate: {
          text: document.text,
          source: metadata.source,
          name: metadata.name,
          description: metadata.description,
          updated_at: document.updated_at,
          ...metadata
        }
      });
    } catch (error) {
      console.error('Failed to update document in Algolia:', error);
      throw error;
    }
  },

  async deleteDocument(uuid: string): Promise<void> {
    try {
      await client.deleteObject({ 
        indexName: DOCUMENTS_INDEX, 
        objectID: uuid 
      });
    } catch (error) {
      console.error('Failed to delete document from Algolia:', error);
      throw error;
    }
  },

  async search(query: string, options?: {
    filters?: string;
    page?: number;
    hitsPerPage?: number;
    headers?: Record<string, string>;
  }): Promise<SearchResponse<AlgoliaDocument>> {
    try {
      const basicParams = {
        query,
        attributesToRetrieve: ['*'],
        typoTolerance: true,
        queryType: 'prefixAll' as QueryType,
        removeStopWords: true,
        ignorePlurals: true,
        optionalWords: query.split(' '),
        removeWordsIfNoResults: 'allOptional' as RemoveWordsIfNoResults
      };

      return client.search<AlgoliaDocument>([{
        indexName: DOCUMENTS_INDEX,
        params: basicParams
      }]);
    } catch (error) {
      console.error('Failed to search documents in Algolia:', error);
      throw error;
    }
  }
};
