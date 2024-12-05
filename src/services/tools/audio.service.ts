import ffmpeg from 'fluent-ffmpeg';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const execPromise = util.promisify(exec);

interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  bitRate: number;
  codec: string;
  format: string;
}

interface AudioLoudnessData {
  time: number;
  loudness: number;
}

interface SilenceInterval {
  start: number;
  end: number;
  duration: number;
}

interface AudioChunk {
  start: number;
  end: number;
}

interface NonSilentInterval {
  start: number;
  end: number;
  duration: number;
}

const probeFile = (file_path: string): Promise<ffmpeg.FfprobeData> => 
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file_path, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });

const extractMetadata = (data: ffmpeg.FfprobeData): AudioMetadata => {
  const stream = data.streams.find(s => s.codec_type === 'audio');
  if (!stream) throw new Error('No audio stream found');

  const format = data.format;
  return {
    duration: Number(format.duration) || 0,
    sampleRate: Number(stream.sample_rate) || 0,
    channels: stream.channels || 0,
    bitRate: Number(stream.bit_rate) || 0,
    codec: stream.codec_name || 'unknown',
    format: format.format_name || 'unknown'
  };
};

export const getMetadata = async (file_path: string): Promise<AudioMetadata> => {
  try {
    const data = await probeFile(file_path);
    return extractMetadata(data);
  } catch (error) {
    console.error('Error getting audio metadata:', error);
    throw error;
  }
};

export const analyzeLoudness = (file_path: string, interval = 0.1): Promise<AudioLoudnessData[]> => {
  const loudness_data: AudioLoudnessData[] = [];

  return new Promise((resolve, reject) => {
    ffmpeg(file_path)
      .audioFilters(`astats=metadata=1:reset=${interval}`)
      .audioFilters('aresample=8000')
      .format('null')
      .output('/dev/null')
      .on('error', reject)
      .on('stderr', stderr_line => {
        const rms_match = stderr_line.match(/lavfi\.astats\.Overall\.RMS_level=(-?\d+(\.\d+)?)/);
        const time_match = stderr_line.match(/pts_time:(\d+(\.\d+)?)/);
        if (rms_match && time_match) {
          loudness_data.push({
            time: parseFloat(time_match[1]),
            loudness: parseFloat(rms_match[1])
          });
        }
      })
      .on('end', () => resolve(loudness_data))
      .run();
  });
};

// I'll continue with the rest of the functions, but let me know if you want to see more specific parts or have any questions about the transformation so far.

export const detectSilence = (file_path: string, threshold = -50, min_duration = 2): Promise<SilenceInterval[]> => {
  const silence_intervals: SilenceInterval[] = [];
  let current_interval: Partial<SilenceInterval> = {};

  return new Promise((resolve, reject) => {
    ffmpeg(file_path)
      .audioFilters(`silencedetect=noise=${threshold}dB:d=${min_duration}`)
      .format('null')
      .output('/dev/null')
      .on('error', reject)
      .on('stderr', stderr_line => {
        const silence_start_match = stderr_line.match(/silence_start: ([\d\.]+)/);
        const silence_end_match = stderr_line.match(/silence_end: ([\d\.]+) \| silence_duration: ([\d\.]+)/);

        if (silence_start_match) {
          current_interval.start = parseFloat(silence_start_match[1]);
        } else if (silence_end_match) {
          current_interval.end = parseFloat(silence_end_match[1]);
          current_interval.duration = parseFloat(silence_end_match[2]);
          silence_intervals.push(current_interval as SilenceInterval);
          current_interval = {};
        }
      })
      .on('end', () => resolve(silence_intervals))
      .run();
  });
};

export const detectNonSilence = async (
  file_path: string, 
  threshold = -50, 
  min_duration = 2
): Promise<NonSilentInterval[]> => {
  const silence_intervals: SilenceInterval[] = [];
  const non_silent_intervals: NonSilentInterval[] = [];
  let total_duration: number | null = null;

  return new Promise((resolve, reject) => {
    ffmpeg(file_path)
      .audioFilters(`silencedetect=noise=${threshold}dB:d=${min_duration}`)
      .format('null')
      .output('/dev/null')
      .on('error', reject)
      .on('stderr', stderr_line => {
        const silence_start_match = stderr_line.match(/silence_start: ([\d\.]+)/);
        const silence_end_match = stderr_line.match(/silence_end: ([\d\.]+) \| silence_duration: ([\d\.]+)/);
        const duration_match = stderr_line.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);

        if (silence_start_match) {
          silence_intervals.push({ 
            start: parseFloat(silence_start_match[1]), 
            end: 0, 
            duration: 0 
          });
        } else if (silence_end_match) {
          const last_interval = silence_intervals[silence_intervals.length - 1];
          last_interval.end = parseFloat(silence_end_match[1]);
          last_interval.duration = parseFloat(silence_end_match[2]);
        } else if (duration_match) {
          const [_, hours, minutes, seconds] = duration_match;
          total_duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        }
      })
      .on('end', () => {
        if (total_duration === null) {
          reject(new Error('Could not determine audio duration'));
          return;
        }

        let last_end = 0;
        for (const silence of silence_intervals) {
          if (silence.start > last_end) {
            non_silent_intervals.push({
              start: last_end,
              end: silence.start,
              duration: silence.start - last_end
            });
          }
          last_end = silence.end;
        }

        if (last_end < total_duration) {
          non_silent_intervals.push({
            start: last_end,
            end: total_duration,
            duration: total_duration - last_end
          });
        }

        resolve(non_silent_intervals);
      })
      .run();
  });
};

export const getAverageSilenceThreshold = async (file_path: string): Promise<number> => {
  try {
    const { stdout } = await execPromise(`ffprobe -v error -of json -show_format -show_streams "${file_path}"`);
    const data = JSON.parse(stdout);
    const audio_stream = data.streams.find((stream: any) => stream.codec_type === 'audio');
    
    if (!audio_stream) {
      throw new Error('No audio stream found');
    }

    const rms_level = parseFloat(audio_stream.rms_level) || -60;
    return rms_level + 10;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

export const getAverageSilenceDuration = async (file_path: string): Promise<number> => {
  const average_silence_threshold = await getAverageSilenceThreshold(file_path);
  const silence_segments = await detectSilence(file_path, average_silence_threshold + 25, 1);
  
  if (silence_segments.length === 0) {
    return 0;
  }

  const total_silence_duration = silence_segments.reduce(
    (sum, segment) => sum + (segment.end - segment.start), 
    0
  );
  
  return total_silence_duration / silence_segments.length;
};

export const extractNonSilentChunks = (
  silence_segments: SilenceInterval[], 
  total_duration: number
): AudioChunk[] => {
  const non_silent_chunks: AudioChunk[] = [];
  let last_end = 0;

  silence_segments.forEach((silence, index) => {
    if (silence.start > last_end) {
      non_silent_chunks.push({ start: last_end, end: silence.start });
    }
    last_end = silence.end;
    
    if (index === silence_segments.length - 1 && last_end < total_duration) {
      non_silent_chunks.push({ start: last_end, end: total_duration });
    }
  });

  return non_silent_chunks;
};

export const saveNonSilentChunks = async (
  file_path: string, 
  chunks: AudioChunk[]
): Promise<string[]> => {
  const output_dir = path.join(__dirname, 'storage', 'chunks');
  await fs.promises.mkdir(output_dir, { recursive: true });

  const saveChunk = async (chunk: AudioChunk, index: number): Promise<string> => {
    const output_path = path.join(output_dir, `chunk_${index}.wav`);
    return new Promise((resolve, reject) => {
      ffmpeg(file_path)
        .setStartTime(chunk.start)
        .setDuration(chunk.end - chunk.start)
        .output(output_path)
        .on('end', () => resolve(output_path))
        .on('error', reject)
        .run();
    });
  };

  return Promise.all(chunks.map(saveChunk));
};

export const processAndSaveNonSilentChunks = async (file_path: string): Promise<string[]> => {
  const metadata = await getMetadata(file_path);
  const silence_intervals = await detectSilence(file_path);
  const non_silent_chunks = extractNonSilentChunks(silence_intervals, metadata.duration);
  return saveNonSilentChunks(file_path, non_silent_chunks);
};

export const convertToOgg = async (input_path: string, output_path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    ffmpeg(input_path)
      .audioCodec('libvorbis')
      .toFormat('ogg')
      .on('error', reject)
      .on('end', resolve)
      .save(output_path);
  });
};

export const split = async (
  file_path: string, 
  silence_threshold_offset = 25
): Promise<string[]> => {
  const min_silence_duration = (await getAverageSilenceDuration(file_path)) * 0.9;
  const average_silence_threshold = await getAverageSilenceThreshold(file_path);
  
  let non_silent_chunks = await detectNonSilence(
    file_path, 
    average_silence_threshold + silence_threshold_offset, 
    min_silence_duration
  );
  
  non_silent_chunks = non_silent_chunks.filter(chunk => chunk.duration >= 1);
  const chunks = await saveNonSilentChunks(file_path, non_silent_chunks);
  const ogg_chunks: string[] = [];

  for (const chunk of chunks) {
    const ogg_chunk = chunk.replace(/\.[^/.]+$/, '.ogg');
    
    if (path.extname(chunk).toLowerCase() !== '.ogg') {
      await convertToOgg(chunk, ogg_chunk);
      await fs.promises.unlink(chunk);
    } else {
      await fs.promises.copyFile(chunk, ogg_chunk);
    }
    
    const stats = await fs.promises.stat(ogg_chunk);
    if (stats.size > 20 * 1024 * 1024) {
      await fs.promises.unlink(ogg_chunk);
      throw new Error(`File ${ogg_chunk} is too big (${stats.size} bytes)`);
    }
    
    ogg_chunks.push(ogg_chunk);
  }

  return ogg_chunks;
};

// Add Zod validation schemas
export const AudioMetadataSchema = z.object({
  duration: z.number(),
  sampleRate: z.number(),
  channels: z.number(),
  bitRate: z.number(),
  codec: z.string(),
  format: z.string()
});

export const AudioLoudnessDataSchema = z.object({
  time: z.number(),
  loudness: z.number()
});

export const SilenceIntervalSchema = z.object({
  start: z.number(),
  end: z.number(),
  duration: z.number()
});

export const AudioChunkSchema = z.object({
  start: z.number(),
  end: z.number()
});

export const NonSilentIntervalSchema = z.object({
  start: z.number(),
  end: z.number(),
  duration: z.number()
});
