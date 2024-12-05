import {z} from 'zod';
import {LangfuseSpanClient} from 'langfuse';
import {stateManager} from '../agent/state.service';
import {documentService} from '../agent/document.service';
import type {DocumentType} from '../agent/document.service';

const API_KEY = process.env.COIN_MARKET_CAP_API_KEY;
const API_BASE_URL = 'https://pro-api.coinmarketcap.com/v2';

interface Quote {
  price: number;
  last_updated: string;
}

interface CryptoQuote {
  id: number;
  name: string;
  symbol: string;
  amount: number;
  last_updated: string;
  quote: Record<string, Quote>;
}

interface ApiResponse {
  data: CryptoQuote[];
  status: {
    timestamp: string;
    error_code: number;
    error_message: string | null;
    elapsed: number;
    credit_count: number;
  };
}

const cryptoPayloadSchema = z.object({
  symbols: z.string(),
  amount: z.number().optional().default(1),
  conversation_uuid: z.string().optional().default('default')
});

const fetchSingleCryptoPrice = async (
  symbol: string,
  amount: number = 1,
  span?: LangfuseSpanClient
): Promise<ApiResponse> => {
  if (!API_KEY) {
    throw new Error('COIN_MARKET_CAP_API_KEY is not configured');
  }

  const url = new URL(`${API_BASE_URL}/tools/price-conversion`);
  url.searchParams.append('amount', amount.toString());
  url.searchParams.append('symbol', symbol);
  url.searchParams.append('convert', 'USD');

  span?.event({
    name: 'crypto_price_fetch_start',
    input: { url: url.toString(), symbol, amount }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'X-CMC_PRO_API_KEY': API_KEY,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error_text = await response.text();
    span?.event({
      name: 'crypto_price_fetch_error',
      input: { symbol, amount },
      output: { status: response.status, statusText: response.statusText, error: error_text },
      level: 'ERROR'
    });
    throw new Error(`Failed to fetch crypto prices: ${response.statusText} - ${error_text}`);
  }

  const data = await response.json();
  span?.event({
    name: 'crypto_price_fetch_success',
    input: { symbol, amount },
    output: { data }
  });

  return data;
};

const fetchCryptoPrices = async (
  symbolsStr: string,
  amount: number = 1,
  span?: LangfuseSpanClient
): Promise<{ text: string; description: string }> => {
  const symbols = symbolsStr.trim().split(/\s+/);
  
  const results = await Promise.all(
    symbols.map(symbol => fetchSingleCryptoPrice(symbol, amount, span))
  );
  
  const prices = results.map(data => {
    const quote = data.data[0];
    const usd_price = quote.quote.USD.price;
    return `${quote.amount} ${quote.symbol} = $${usd_price.toFixed(2)}`;
  });

  return {
    text: prices.join('\n'),
    description: `Price conversion for ${amount} unit(s)`
  };
};

const cryptoService = {
  execute: async (action: string, payload: unknown, span?: LangfuseSpanClient): Promise<DocumentType> => {
    try {
      const {symbols, amount, conversation_uuid} = cryptoPayloadSchema.parse(payload);
      const symbol_list = symbols.trim().split(/\s+/).filter(Boolean);

      if (symbol_list.length === 0) {
        return documentService.createErrorDocument({
          error: new Error('No symbols provided'),
          conversation_uuid,
          context: 'Failed to convert crypto prices - no symbols'
        });
      }

      const {text, description} = await fetchCryptoPrices(symbols, amount, span);

      return documentService.createDocument({
        conversation_uuid,
        source_uuid: conversation_uuid,
        text: `Crypto price details:\n${text}.\n\n Feel free to use this information in responses to the user.`,
        metadata_override: {
          type: 'text',
          content_type: 'full',
          tokens: text.length,
          name: 'Crypto Price Conversion',
          source: 'coinmarketcap',
          mimeType: 'text/plain',
          description
        }
      });
    } catch (error) {
      return documentService.createErrorDocument({
        error,
        conversation_uuid: payload && typeof payload === 'object' && 'conversation_uuid' in payload 
          ? String(payload.conversation_uuid) 
          : 'unknown',
        context: 'Failed to execute crypto operation'
      });
    }
  }
};

export {cryptoService};
