import { QdrantClient } from '@qdrant/js-client-rest';
import { z } from 'zod';

// Updated validation schemas
const SearchFiltersSchema = z.object({
  source_uuid: z.string().uuid().optional(),
  source: z.string().optional(),
  content_type: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional()
});

const PointPayloadSchema = z.object({
  document_uuid: z.string().uuid(),
  source_uuid: z.string(),
  source: z.string(),
  text: z.string(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string()
});

type SearchFilters = z.infer<typeof SearchFiltersSchema>;
type PointPayload = z.infer<typeof PointPayloadSchema>;

interface VectorSearchResult {
  id: string;
  score: number;
  payload: PointPayload;
}

// Initialize Qdrant client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
});

const COLLECTION_NAME = process.env.QDRANT_INDEX || 'alice';
const VECTOR_SIZE = 3072;

const formatSearchFilters = (filters: SearchFilters) => {
  if (!filters) return undefined;
  
  const must = [];

  if (filters.source_uuid) {
    must.push({ key: 'source_uuid', match: { value: filters.source_uuid } });
  }
  if (filters.source) {
    must.push({ key: 'source', match: { value: filters.source } });
  }
  if (filters.content_type) {
    must.push({ key: 'content_type', match: { value: filters.content_type } });
  }
  if (filters.category) {
    must.push({ key: 'category', match: { value: filters.category } });
  }
  if (filters.subcategory) {
    must.push({ key: 'subcategory', match: { value: filters.subcategory } });
  }

  console.log('Formatted Qdrant filters:', JSON.stringify({ must }, null, 2));
  return must.length > 0 ? { must } : undefined;
};

export const vectorService = {
  async initializeCollection(): Promise<void> {
    try {
      const collections = await qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

      if (!exists) {
        await qdrant.createCollection(COLLECTION_NAME, {
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });

        // Create payload indexes for faster filtering
        await qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'source_uuid',
          field_schema: 'keyword',
          wait: true
        });

        await qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'source',
          field_schema: 'keyword',
          wait: true
        });
      }
    } catch (error) {
      console.error('Failed to initialize Qdrant collection:', error);
      throw error;
    }
  },

  async upsertPoint(
    vector: number[],
    payload: PointPayload
  ): Promise<void> {
    try {
      if (vector.length !== VECTOR_SIZE) {
        throw new Error(`Vector must be of size ${VECTOR_SIZE}, got ${vector.length}`);
      }

      const validated_payload = PointPayloadSchema.parse(payload);

      await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points: [{
          id: validated_payload.document_uuid,
          vector,
          payload: {
            ...validated_payload,
            metadata: undefined,
            ...validated_payload.metadata
          }
        }]
      });
    } catch (error) {
      console.error('Failed to upsert point:', error);
      throw error;
    }
  },

  async deletePoints(document_uuids: string[]): Promise<void> {
    try {
      await qdrant.delete(COLLECTION_NAME, {
        wait: true,
        points: document_uuids
      });
    } catch (error) {
      console.error('Failed to delete points:', error);
      throw error;
    }
  },

  async searchSimilar(
    vector: number[],
    filters?: SearchFilters,
    limit = 10
  ): Promise<VectorSearchResult[]> {
    try {
      console.log('Vector service received filters:', filters);
      const filter = filters ? formatSearchFilters(filters) : undefined;

      const results = await qdrant.search(COLLECTION_NAME, {
        vector,
        filter,
        limit,
        with_payload: true
      });

      // Debug log the first result's full payload structure
      if (results.length > 0) {
        console.log('First result payload structure:', JSON.stringify(results[0].payload, null, 2));
      }

      const average_score = results.reduce((acc, r) => acc + r.score, 0) / results.length;
      const threshold = average_score * 0.5;

      return results
        .filter(result => result.score >= threshold)
        .map(result => ({
          id: result.id as string,
          score: result.score,
          payload: result.payload as PointPayload
        }));
    } catch (error) {
      console.error('Failed to search vectors:', error);
      throw error;
    }
  },

  async getPointsBySource(
    source_uuid: string,
    limit = 100
  ): Promise<VectorSearchResult[]> {
    try {
      const results = await qdrant.scroll(COLLECTION_NAME, {
        filter: {
          must: [
            { key: 'source_uuid', match: { value: source_uuid } }
          ]
        },
        limit,
        with_payload: true
      });

      return results.points.map(point => ({
        id: point.id as string,
        score: 1.0,
        payload: point.payload as PointPayload
      }));
    } catch (error) {
      console.error('Failed to get points by source:', error);
      throw error;
    }
  },

  async updatePointPayload(
    document_uuid: string,
    payload_update: Partial<PointPayload>
  ): Promise<void> {
    try {
      await qdrant.setPayload(COLLECTION_NAME, {
        points: [document_uuid],
        payload: payload_update,
        wait: true
      });
    } catch (error) {
      console.error('Failed to update point payload:', error);
      throw error;
    }
  },

  async updatePoint(
    document_uuid: string,
    vector: number[],
    payload: PointPayload
  ): Promise<void> {
    try {
      if (vector.length !== VECTOR_SIZE) {
        throw new Error(`Vector must be of size ${VECTOR_SIZE}, got ${vector.length}`);
      }

      const validated_payload = PointPayloadSchema.parse(payload);

      await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points: [{
          id: document_uuid,
          vector,
          payload: validated_payload
        }]
      });
    } catch (error) {
      console.error('Failed to update point:', error);
      throw error;
    }
  }
};
