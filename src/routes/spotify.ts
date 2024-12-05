import { Hono } from 'hono';
import { AppEnv } from '../types/hono';
import { spotifyService } from '../services/tools/spotify.service';
import { findByUUID } from '../services/common/user.service';
import { randomBytes } from 'crypto';

const media = new Hono<AppEnv>()
  .post('/search', async c => {
    try {
      const { query } = await c.req.json();
      const request = c.get('request');
      const user = request.user;

      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      if (!query) {
        return c.json({ success: false, error: 'Query parameter is required' }, 400);
      }

      const results = await spotifyService.search(query, ['track', 'playlist', 'album'], 5);
      return c.json({ success: true, data: results });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  })
  .post('/play', async c => {
    try {
      const { query, conversation_uuid } = await c.req.json();
      const request = c.get('request');
      const user = request.user;

      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      if (!query) {
        return c.json({ success: false, error: 'Query parameter is required' }, 400);
      }

      if (!conversation_uuid) {
        return c.json({ success: false, error: 'Conversation UUID is required' }, 400);
      }

      const result = await spotifyService.playMusic(query, conversation_uuid);
      return c.json({ success: true, data: result });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  })
  .post('/', async c => {
    try {
      const request = c.get('request');
      const user = request.user;
      
      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }
      
      const state = randomBytes(16).toString('hex');
      const scope = 'user-read-playback-state user-modify-playback-state';
      
      const auth_url = new URL('https://accounts.spotify.com/authorize');
      auth_url.searchParams.append('response_type', 'code');
      auth_url.searchParams.append('client_id', process.env.SPOTIFY_CLIENT_ID!);
      auth_url.searchParams.append('scope', scope);
      auth_url.searchParams.append('redirect_uri', `${process.env.APP_URL}/spotify/callback`);
      auth_url.searchParams.append('state', state);
      auth_url.searchParams.append('user_uuid', user.uuid);

      return c.json({ 
        success: true, 
        data: { 
          auth_url: auth_url.toString() 
        } 
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

export default media; 