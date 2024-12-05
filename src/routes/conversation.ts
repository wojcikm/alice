import {Hono} from 'hono';
import {AppEnv} from '../types/hono';
import {conversationService} from '../services/agent/conversation.service';
import {z} from 'zod';
import {v4 as uuidv4} from 'uuid';

export default new Hono<AppEnv>()
  .get('/', async c => {
    try {
      const request = c.get('request');
      const user = request.user;
      const conversations = await conversationService.getRecentConversations({user_id: user.uuid, limit: 1});
      return c.json({conversations});
    } catch (error) {
      return c.json({error: 'Failed to fetch conversations'}, 500);
    }
  })
  .get('/:conversation_uuid', async c => {
    try {
      const conversation_uuid = c.req.param('conversation_uuid');
      const conversation = await conversationService.findByUuid(conversation_uuid);
      
      if (!conversation) {
        return c.json({error: 'Conversation not found'}, 404);
      }

      const messages = await conversationService.getConversationMessages(conversation_uuid);
      return c.json({conversation, messages});
    } catch (error) {
      return c.json({error: 'Failed to fetch conversation'}, 500);
    }
  })
  .post('/new', async c => {
    try {
      const request = c.get('request');
      const body = await c.req.json();
      const {name} = z.object({
        name: z.string().optional()
      }).parse(body);
      
      const conversation = await conversationService.create({
        uuid: uuidv4(),
        user_id: request.user.uuid,
        name: name || 'New Conversation'
      });

      return c.json({conversation});
    } catch (error) {
      console.log(error);
      if (error instanceof z.ZodError) {
        return c.json({error: 'Invalid request data', details: error.errors}, 400);
      }
      return c.json({error: 'Failed to create conversation'}, 500);
    }
  }); 