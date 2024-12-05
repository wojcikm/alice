import FirecrawlApp from '@mendable/firecrawl-js';
import {z} from 'zod';
import {v4 as uuidv4} from 'uuid';
import {LangfuseSpanClient} from 'langfuse';
import {documentService} from '../agent/document.service';
import {createTokenizer} from '../common/text.service';
import type {DocumentType} from '../agent/document.service';
import {whitelistedDomains} from '../../config/websearch.config';
import {prompt as useSearchPrompt} from '../../prompts/tools/search.use';
import {prompt as askSearchPrompt} from '../../prompts/tools/search.ask';
import {prompt as pickResourcesPrompt} from '../../prompts/tools/search.pick';
import {completion} from '../common/llm.service';
import {stateManager} from '../agent/state.service';

const envSchema = z.object({
  FIRECRAWL_API_KEY: z.string()
});

const webService = {
  createClient: () => {
    const env = envSchema.parse(process.env);
    return new FirecrawlApp({apiKey: env.FIRECRAWL_API_KEY});
  },

  getContents: async (url: string, conversation_uuid: string, span?: LangfuseSpanClient): Promise<DocumentType> => {
    try {
      const firecrawl = webService.createClient();
      const tokenizer = await createTokenizer();

      span?.event({
        name: 'web_scrape_attempt',
        input: {url}
      });

      const scrape_result = await firecrawl.scrapeUrl(url, {formats: ['markdown']});

      const content = scrape_result?.markdown?.trim() || '';
      
      if (!content) {
        return documentService.createDocument({
          conversation_uuid,
          source_uuid: conversation_uuid,
          text: `No content could be loaded from ${url}. The page might be empty or inaccessible.`,
          content_type: 'full',
          name: `Empty content from ${url}`,
          description: `Failed to load content from ${url}`,
          metadata_override: {
            type: 'text',
            content_type: 'full',
            source: url,
            urls: [url],
            tokens: 0,
            conversation_uuid,
            source_uuid: conversation_uuid
          }
        });
      }

      const tokens = tokenizer.countTokens(content);

      span?.event({
        name: 'web_scrape_success',
        input: {url},
        output: {
          content_length: content.length,
          tokens
        }
      });

      return documentService.createDocument({
        conversation_uuid,
        source_uuid: conversation_uuid,
        text: content || 'No content could be loaded from this URL',
        content_type: 'full',
        name: `Web content from ${url}`,
        description: `Scraped content from ${url}`,
        metadata_override: {
          type: 'text',
          content_type: 'full',
          source: url,
          urls: [url],
          tokens,
          conversation_uuid,
          source_uuid: conversation_uuid
        }
      });
    } catch (error) {
      const tokenizer = await createTokenizer();
      const error_text = `Failed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`;
      const tokens = tokenizer.countTokens(error_text);

      span?.event({
        name: 'web_scrape_error',
        input: {url},
        output: {error: error instanceof Error ? error.message : 'Unknown error'},
        level: 'ERROR'
      });

      return documentService.createDocument({
        conversation_uuid,
        source_uuid: conversation_uuid,
        text: error_text,
        content_type: 'full',
        name: 'Web Scraping Error',
        description: `Failed to scrape content from ${url}`,
        metadata_override: {
          type: 'text',
          content_type: 'full',
          source: url,
          urls: [url],
          uuid: uuidv4(),
          tokens,
          conversation_uuid,
          source_uuid: conversation_uuid
        }
      });
    }
  },

  async execute(action: string, payload: {url?: string, query?: string}, span?: LangfuseSpanClient) {
    if (action === 'search') {
      if (!payload.query) {
        throw new Error('Query is required for search action');
      }

      const state = stateManager.getState();
      const conversation_uuid = state.config.conversation_uuid ?? 'unknown';

      span?.event({
        name: 'web_search_start',
        input: {query: payload.query}
      });

      // 1. Check if search is needed
      const searchNecessity = await completion.object<{shouldSearch: boolean, _thoughts: string}>({
        messages: [{role: 'system', content: useSearchPrompt()}, {role: 'user', content: payload.query}],
        model: state.config.model ?? 'gpt-4o',
        temperature: 0,
        user: {
          uuid: state.config.user_uuid ?? '',
          name: state.profile.user_name
        }
      });

      if (!searchNecessity.shouldSearch) {
        span?.event({
          name: 'web_search_skipped',
          input: {query: payload.query},
          output: {reason: searchNecessity._thoughts}
        });
        return [];
      }

      // 2. Generate queries
      const queryGeneration = await completion.object<{queries: Array<{q: string, url: string}>, _thoughts: string}>({
        messages: [{role: 'system', content: askSearchPrompt(whitelistedDomains)}, {role: 'user', content: payload.query}],
        model: state.config.model ?? 'gpt-4o',
        temperature: 0,
        user: {
          uuid: state.config.user_uuid ?? '',
          name: state.profile.user_name
        }
      });

      if (!queryGeneration.queries.length) {
        span?.event({
          name: 'web_search_no_queries',
          input: {query: payload.query}
        });
        return [];
      }

      // 3. Execute searches with direct API calls
      const searchResults = await Promise.all(
        queryGeneration.queries.map(async ({q, url}) => {
          try {
            const domain = new URL(url.startsWith('http') ? url : `https://${url}`);
            const siteQuery = `site:${domain.hostname} ${q}`;
            
            const response = await fetch('https://api.firecrawl.dev/v0/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
              },
              body: JSON.stringify({
                query: siteQuery,
                searchOptions: {
                  limit: 6
                },
                pageOptions: {
                  fetchPageContent: false
                }
              })
            });

            const result = await response.json();

            if (!result.success) {
              throw new Error(result.error || 'Search failed');
            }

            return {
              query: q,
              domain: domain.href,
              results: result.data?.map(item => ({
                url: item.url,
                title: item.title,
                description: item.description
              })) || []
            };
          } catch (error) {
            span?.event({
              name: 'web_search_error',
              input: {query: q, url},
              output: {error: error instanceof Error ? error.message : 'Unknown error'}
            });
            return {query: q, domain: url, results: []};
          }
        })
      );

      // 4. Select resources to load
      const resourceSelection = await completion.object<{urls: string[]}>({
        messages: [{
          role: 'system',
          content: pickResourcesPrompt({resources: searchResults})
        }, {
          role: 'user',
          content: payload.query
        }],
        model: state.config.model ?? 'gpt-4o',
        temperature: 0,
        user: {
          uuid: state.config.user_uuid ?? '',
          name: state.profile.user_name
        }
      });

      // 5. Scrape and create documents
      const documents = await Promise.all(
        resourceSelection.urls.map(async (url) => {
          try {
            const firecrawl = webService.createClient();
            const scrapeResult = await firecrawl.scrapeUrl(url, {formats: ['markdown']});

            if (!scrapeResult?.markdown) {
              throw new Error('No content found');
            }

            const content = scrapeResult.markdown.trim();
            const tokenizer = await createTokenizer();
            const tokens = tokenizer.countTokens(content);

            return documentService.createDocument({
              conversation_uuid,
              source_uuid: uuidv4(),
              text: content || 'No content could be loaded from this URL',
              content_type: 'full',
              name: `Web content from ${url}`,
              description: `Loaded content from ${url}`,
              metadata_override: {
                type: 'text',
                content_type: 'full',
                source: url,
                urls: [url],
                tokens,
                conversation_uuid,
                source_uuid: uuidv4()
              }
            });
          } catch (error) {
            const error_text = `Failed to fetch content from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            const tokenizer = await createTokenizer();
            const tokens = tokenizer.countTokens(error_text);

            return documentService.createDocument({
              conversation_uuid,
              source_uuid: uuidv4(),
              text: error_text,
              content_type: 'full',
              name: 'Web Scraping Error',
              description: `Failed to scrape content from ${url}`,
              metadata_override: {
                type: 'text',
                content_type: 'full',
                source: url,
                urls: [url],
                tokens,
                conversation_uuid,
                source_uuid: uuidv4()
              }
            });
          }
        })
      );

      span?.event({
        name: 'web_search_complete',
        input: {query: payload.query},
        output: {documents_count: documents.length}
      });

      return documents[0];
    }

    if (!payload.url) {
      throw new Error('URL is required');
    }

    if (action === 'get_contents') {
      span?.event({
      name: 'web_tool',
      input: {
        action,
        url: payload.url
        }
      });

      return webService.getContents(payload.url, 'unknown', span);
    }

    throw new Error(`Unknown action: ${action}`);
  }
};

export {webService};
