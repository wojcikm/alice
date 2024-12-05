import {z} from 'zod';

export const FileUploadDto = z.object({
  file: z.union([
    z.instanceof(Blob),
    z.object({
      base64: z.string(),
      mime_type: z.string()
    })
  ]),
  category: z.enum(['text', 'audio', 'image', 'document']),
  original_name: z.string(),
  metadata: z.record(z.any()).optional(),
  user: z.string()
});

export type FileUpload = z.infer<typeof FileUploadDto>;
