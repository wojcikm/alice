import {Hono} from 'hono';
import {AppEnv} from '../types/hono';
import {v4 as uuidv4} from 'uuid';
import {findFileByUuid, uploadFile} from '../services/common/upload.service';
import {FileType} from '../types/upload';

const files = new Hono<AppEnv>().post('/upload', async c => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as FileType;
    const uuid = formData.get('uuid') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    const result = await uploadFile({
      file: file,
      type: type || 'document',
      original_name: file.name,
      uuid: uuid || uuidv4()
    });

    return c.json(
      {
        success: true,
        data: result
      },
      201
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      400
    );
  }
})
.post('/upload/base64', async c => {
  try {
    const body = await c.req.json();

    const result = await uploadFile({
      uuid: uuidv4(),
      file: {
        base64: body.file.base64,
        mime_type: body.file.mime_type
      },
      type: body.type,
      original_name: body.original_name
    });

    return c.json(
      {
        success: true,
        data: result
      },
      201
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      400
    );
  }
})
.get('/:uuid', async c => {
  try {
    const uuid = c.req.param('uuid');
    const file = await findFileByUuid(uuid);

    if (!file) {
      return c.json({success: false, error: 'File not found'}, 404);
    }

    return c.body(file.buffer, {
      headers: {
        'Content-Type': file.mime_type,
        'Content-Disposition': `inline; filename="${file.original_name}"`
      }
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      500
    );
  }
});

export default files;
