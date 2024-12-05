import {z} from 'zod';
import {LangfuseSpanClient} from 'langfuse';
import {parse} from 'node-html-parser';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36';

interface TranscriptChunk {
  start: number;
  dur: number;
  text: string;
}

const extractVideoId = (url: string): string | null => {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

const parseTranscriptEndpoint = (html: string, lang_code: string): string | null => {
  try {
    const root = parse(html);
    const scripts = root.getElementsByTagName('script');
    const player_script = scripts.find((script) =>
      script.textContent?.includes('var ytInitialPlayerResponse = {')
    );

    const data_string = player_script?.textContent
      ?.split('var ytInitialPlayerResponse = ')?.[1]
      ?.split('};')?.[0] + '}';

    if (!data_string) {
      throw new Error('Could not find ytInitialPlayerResponse');
    }

    const data = JSON.parse(data_string.trim());
    const available_captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    let caption_track = available_captions?.[0];
    if (lang_code) {
      caption_track = available_captions.find((track: any) => 
        track.languageCode.includes(lang_code)
      ) ?? available_captions?.[0];
    }

    return caption_track?.baseUrl || null;
  } catch (error) {
    console.error(`Failed to parse transcript endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
};

const youtubeService = {
  isYoutubeUrl: (url: string): boolean => {
    return /(?:youtube\.com|youtu\.be)/i.test(url);
  },

  getTranscript: async (url: string, lang: string = 'en', span?: LangfuseSpanClient): Promise<string> => {
    const video_id = extractVideoId(url);
    if (!video_id) {
      throw new Error('Invalid YouTube URL');
    }

    try {
      span?.event({
        name: 'youtube_transcript_fetch_start',
        input: { url, video_id, lang }
      });

      const response = await fetch(`https://www.youtube.com/watch?v=${video_id}`, {
        headers: { 'User-Agent': USER_AGENT }
      });

      const page_content = await response.text();
      const transcript_url = parseTranscriptEndpoint(page_content, lang);

      if (!transcript_url) {
        throw new Error('Failed to locate a transcript for this video');
      }

      const transcript_response = await fetch(transcript_url);
      const transcript_xml = parse(await transcript_response.text());

      const chunks = transcript_xml.getElementsByTagName('text');
      const transcript: TranscriptChunk[] = chunks
        .map(chunk => ({
          start: parseFloat(chunk.getAttribute('start') || '0'),
          dur: parseFloat(chunk.getAttribute('dur') || '0'),
          text: chunk.textContent.trim()
        }))
        .filter(item => item.start !== null && item.dur !== null);

      const full_text = transcript.map(chunk => chunk.text).join(' ');

      span?.event({
        name: 'youtube_transcript_fetch_success',
        output: { 
          transcript_length: full_text.length,
          chunks_count: transcript.length
        }
      });

      return full_text;
    } catch (error) {
      span?.event({
        name: 'youtube_transcript_fetch_error',
        input: { url, video_id },
        output: { error: error instanceof Error ? error.message : 'Unknown error' },
        level: 'ERROR'
      });
      throw error;
    }
  }
};

export {youtubeService};
