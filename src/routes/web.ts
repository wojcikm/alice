import { Hono } from 'hono';
import { AppEnv } from '../types/hono';
import { webService } from '../services/tools/web.service';

const web = new Hono<AppEnv>()
  .post('/get-contents', async c => {
    try {
      const { url, conversation_uuid } = await c.req.json();

      if (!url) {
        return c.json({ success: false, error: 'URL parameter is required' }, 400);
      }

      const result = await webService.getContents(url, conversation_uuid || 'default');
      return c.json({ success: true, data: result });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  })
  .post('/search', async c => {
    try {
      const { query, conversation_uuid } = await c.req.json();

      if (!query) {
        return c.json({ success: false, error: 'Query parameter is required' }, 400);
      }

      const result = await webService.execute('search', {
        query,
        conversation_uuid: conversation_uuid || 'default'
      }, c.get('request'));

      return c.json({ success: true, data: result });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

export default web; 