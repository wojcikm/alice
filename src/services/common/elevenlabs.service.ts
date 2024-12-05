import {z} from 'zod';
import {LangfuseSpanClient} from 'langfuse';
import {ElevenLabsClient} from 'elevenlabs';

const elevenlabsConfigSchema = z.object({
  api_key: z.string()
});

const speechConfigSchema = z.object({
  text: z.string(),
  voice: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  model_id: z.string().default('eleven_turbo_v2_5')
});

let client: ElevenLabsClient;
try {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY environment variable is required');
  }
  client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
  });
} catch (error) {
  console.error('Failed to initialize ElevenLabs client. Check ELEVENLABS_API_KEY in .env. ElevenLabs is required for text-to-speech.');
  throw error;
}

const elevenlabsService = {
  speak: async (
    text: string, 
    voice?: string, 
    model_id?: string, 
    span?: LangfuseSpanClient
  ): Promise<AsyncIterable<Uint8Array>> => {
    try {
      const config = speechConfigSchema.parse({
        text,
        voice,
        model_id
      });

      span?.event({
        name: 'elevenlabs_generate_start',
        input: {
          text: config.text,
          voice: config.voice,
          model_id: config.model_id
        }
      });

      const audio_stream = await client.generate({
        text: config.text,
        voice: config.voice,
        model_id: config.model_id,
        stream: true
      });

      span?.event({
        name: 'elevenlabs_generate_success',
        input: {
          text: config.text,
          voice: config.voice,
          model_id: config.model_id
        }
      });

      return audio_stream;
    } catch (error) {
      span?.event({
        name: 'elevenlabs_generate_error',
        input: { text, voice, model_id },
        output: { error: error instanceof Error ? error.message : 'Unknown error' },
        level: 'ERROR'
      });
      
      throw error;
    }
  }
};

export {elevenlabsService};
