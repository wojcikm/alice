import {z} from 'zod';
import {mkdir, writeFile, readFile, readdir, unlink} from 'fs/promises';
import {join} from 'path';
import {v4 as uuidv4} from 'uuid';
import {FileType, UploadResult} from '../../types/upload';
import {mimeTypes} from '../../config/mime.config';
import {glob} from 'glob';

class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

const uploadSchema = z.object({
  file: z.union([
    z.instanceof(Blob),
    z.instanceof(File),
    z.object({
      base64: z.string(),
      mime_type: z.string()
    })
  ]),
  type: z.nativeEnum(FileType),
  original_name: z.string(),
  uuid: z.string()
});

const STORAGE_PATH = process.env.STORAGE_PATH || './storage';
const TEMP_PATH = process.env.TEMP_PATH || '/tmp';

interface TempFileResult {
  path: string;
  cleanup: () => Promise<void>;
}

export const tempFile = {
  fromBuffer: async (buffer: Buffer, extension: string): Promise<TempFileResult> => {
    try {
      const temp_uuid = uuidv4();
      const temp_path = join(TEMP_PATH, `${temp_uuid}.${extension}`);
      await writeFile(temp_path, buffer);
      
      return {
        path: temp_path,
        cleanup: async () => {
          try {
            await unlink(temp_path);
          } catch (error) {
            console.error(`Failed to cleanup temp file ${temp_path}:`, error);
          }
        }
      };
    } catch (error) {
      throw new Error(`Failed to create temp file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

export const uploadFile = async (input: z.infer<typeof uploadSchema>): Promise<UploadResult> => {
  try {
    const {uuid, file, type, original_name} = uploadSchema.parse(input);

    const extension = original_name.match(/\.[0-9a-z]+$/i)?.[0].toLowerCase();
    if (!extension || !mimeTypes[type].extensions.includes(extension)) {
      throw new FileValidationError(`Invalid file extension ${extension} for type: ${type}`);
    }

    const mime_type = file instanceof File || file instanceof Blob ? file.type : file.mime_type;
    const base_mime_type = mime_type.split(';')[0];
    if (!mimeTypes[type].mimes.includes(base_mime_type)) {
      throw new FileValidationError(`Invalid mime type ${mime_type} for type: ${type}`);
    }

    const date_string = new Date().toISOString().slice(0, 10);
    const storage_path = join(STORAGE_PATH, type, date_string);
    const file_path = join(storage_path, uuid, original_name);

    await mkdir(join(storage_path, uuid), {recursive: true});

    const buffer =
      file instanceof Blob || file instanceof File
        ? Buffer.from(await file.arrayBuffer())
        : Buffer.from(file.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');

    await writeFile(file_path, buffer);

    return {uuid, type, path: file_path, original_name};
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new FileValidationError(`Validation error: ${error.message}`);
    }
    throw error;
  }
};

interface FileResponse {
  buffer: Buffer;
  mime_type: string;
  original_name: string;
}

export const findFileByUuid = async (uuid: string): Promise<FileResponse | null> => {
  try {
    const files = await glob(`${STORAGE_PATH}/**/${uuid}/*`);

    if (!files.length) {
      return null;
    }

    const file_path = files[0];
    const original_name = file_path.split('/').pop() || '';
    const extension = original_name.match(/\.[0-9a-z]+$/i)?.[0].toLowerCase() || '';
    const file_type = Object.entries(mimeTypes).find(([_, config]) => config.extensions.includes(extension))?.[0] as
      | FileType
      | undefined;

    if (!file_type) {
      throw new Error('Unknown file type');
    }

    const mime_type = mimeTypes[file_type].mimes[0];
    const buffer = await readFile(file_path);

    return {
      buffer,
      mime_type,
      original_name
    };
  } catch (error) {
    console.error('Error finding file:', error);
    return null;
  }
};
