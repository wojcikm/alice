import { z } from 'zod';
import { documentService, type DocumentType } from '../agent/document.service';
import { memoryService } from '../agent/memory.service';
import { vectorService } from './vector.service';
import { algoliaService } from './algolia.service';
import { embedding } from './llm.service';
import type { Memory } from '../../schema/memory';

const SearchFiltersSchema = z.object({
  source_uuid: z.string().uuid().optional(),
  source: z.string().optional(),
  content_type: z.enum(['chunk', 'full', 'memory']).optional(),
  category: z.string().optional(),
  subcategory: z.string().optional()
});

type SearchFilters = z.infer<typeof SearchFiltersSchema>;

interface SearchResult {
  document: DocumentType;
  score: number;
  memory?: Memory;
}

const calculateRRFScore = (vectorRank?: number, algoliaRank?: number): number => {
  const k = 60;
  const vector_score = vectorRank ? 1 / (k + vectorRank) : 0;
  const algolia_score = algoliaRank ? 1 / (k + algoliaRank) : 0;
  return vector_score + algolia_score;
};

interface SearchQueries {
  vector_query: string;
  text_query: string;
  filters?: SearchFilters;
}

export const searchService = {
  async search(
    queries: SearchQueries,
    filters?: SearchFilters,
    limit?: number
  ): Promise<SearchResult[]> {
    try {
      const normalized_limit = typeof limit === 'number' ? limit : 15;
      const validated_filters = filters ? SearchFiltersSchema.parse(filters) : {};
      
      const search_filters = {
        ...validated_filters,
        ...(filters?.content_type ? { content_type: filters.content_type } : {})
      };
      
      const query_embedding = await embedding(queries.vector_query);

      const [vector_results, algolia_response] = await Promise.all([
        vectorService.searchSimilar(
          query_embedding, 
          search_filters,
          normalized_limit
        ),
        algoliaService.search(queries.text_query, {
          filters: buildAlgoliaFilters(search_filters),
          hitsPerPage: normalized_limit
        })
      ]);

      // Log the results for debugging
      console.log('Search results before filtering:', {
        vector_count: vector_results.length,
        algolia_count: algolia_response?.results?.[0]?.hits?.length || 0
      });

      // Filter results manually if needed
      const scored_documents = new Map<string, { score: number; document_uuid: string }>();

      // Process vector results
      vector_results.forEach((result, index) => {
        if (matchesFilters(result.payload, search_filters)) {
          scored_documents.set(result.payload.document_uuid, {
            score: result.score,
            document_uuid: result.payload.document_uuid
          });
        } else {
          console.log(`Vector result excluded: document_uuid='${result.payload.document_uuid}'`);
        }
      });

      // Process Algolia hits
      const hits = algolia_response?.results?.[0]?.hits || [];

      hits.forEach((hit: any, index: number) => {
        if (matchesFilters(hit, search_filters)) {
          const existing = scored_documents.get(hit.document_uuid);
          if (existing) {
            existing.score = calculateRRFScore(index + 1, index + 1);
          } else {
            scored_documents.set(hit.document_uuid, {
              score: calculateRRFScore(undefined, index + 1),
              document_uuid: hit.document_uuid
            });
          }
        } else {
          console.log(`Algolia hit excluded: document_uuid='${hit.document_uuid}'`);
        }
      });

      // Enhance the final results processing
      const final_results: SearchResult[] = [];
      
      for (const [document_uuid, score_data] of scored_documents.entries()) {
        const [document, memory] = await Promise.all([
          documentService.getDocumentByUuid(document_uuid),
          memoryService.getMemoryByDocumentUuid(document_uuid)
        ]);
        
        if (document) {
          // Only include results that have both document and memory when content_type is 'memory'
          if (filters?.content_type === 'memory') {
            if (!memory) {
              console.log(`Memory not found for document_uuid='${document_uuid}'`);
              continue;
            }
            console.log(`Including memory: uuid='${memory.uuid}', name='${memory.name}'`);
          }

          final_results.push({
            document,
            score: score_data.score,
            memory
          });
        } else {
          console.log(`Document not found: document_uuid='${document_uuid}'`);
        }
      }

      // Sort results by score in descending order
      return final_results.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('Failed to search:', error);
      throw error;
    }
  }
};

function buildAlgoliaFilters(filters: SearchFilters): string {
  const conditions: string[] = [];
  
  if (filters.source_uuid) {
    conditions.push(`source_uuid:'${filters.source_uuid}'`);
  }
  if (filters.source) {
    conditions.push(`source:'${filters.source}'`);
  }
  if (filters.content_type) {
    conditions.push(`content_type:'${filters.content_type}'`);
  }
  if (filters.category) {
    conditions.push(`category:'${filters.category}'`);
  }
  if (filters.subcategory) {
    conditions.push(`subcategory:'${filters.subcategory}'`);
  }

  return conditions.join(' AND ');
}

// Helper function to check if a document matches the filters
function matchesFilters(doc: any, filters: SearchFilters): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue; // Skip undefined/null filters
    
    const actual_value = doc[key];
    
    if (actual_value !== value) {
      console.log(`Filter mismatch: key='${key}', filter_value='${value}', doc_value='${actual_value}'`);
      return false;
    }
  }
  return true;
}
