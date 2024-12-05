import {z} from 'zod';
import fs from 'fs/promises';
import {google, calendar_v3} from 'googleapis';
import {OAuth2Client} from 'google-auth-library';
import {LangfuseSpanClient} from 'langfuse';
import {documentService} from './document.service';
import {stateManager} from './state.service';
import type {DocumentType} from './document.service';
import {createTextService} from '../common/text.service';

// Initialize text service
const text_service = await createTextService({model_name: 'gpt-4o'});

interface CalendarCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

interface CalendarTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

const eventSchema = z.object({
  summary: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional().default('Europe/Warsaw')
  }),
  end: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional().default('Europe/Warsaw')
  })
});

const eventSearchSchema = z.object({
  query: z.string(),
  timeMin: z.string().transform(date => new Date(date).toISOString()),
  timeMax: z.string().transform(date => new Date(date).toISOString()),
  maxResults: z.number().optional()
});

const eventUpdateSchema = z.object({
  eventId: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional().default('Europe/Warsaw')
  }),
  end: z.object({
    dateTime: z.string(),
    timeZone: z.string().optional().default('Europe/Warsaw')
  })
});

const loadTokens = async (): Promise<CalendarTokens | null> => {
  const access_token = process.env.GOOGLE_ACCESS_TOKEN;
  const refresh_token = process.env.GOOGLE_REFRESH_TOKEN;
  const expiry_date = process.env.GOOGLE_TOKEN_EXPIRY;

  if (access_token && refresh_token && expiry_date) {
    return {
      access_token,
      refresh_token,
      expiry_date: parseInt(expiry_date, 10),
    };
  }
  return null;
};

const saveTokens = async (tokens: CalendarTokens): Promise<void> => {
  let env_content = await fs.readFile('.env', 'utf-8').catch(() => '');

  const updateEnvVariable = (name: string, value: string) => {
    const regex = new RegExp(`^${name}=.*`, 'm');
    if (regex.test(env_content)) {
      env_content = env_content.replace(regex, `${name}=${value}`);
    } else {
      env_content += `\n${name}=${value}`;
    }
  };

  updateEnvVariable('GOOGLE_ACCESS_TOKEN', tokens.access_token);
  updateEnvVariable('GOOGLE_REFRESH_TOKEN', tokens.refresh_token || '');
  updateEnvVariable('GOOGLE_TOKEN_EXPIRY', tokens.expiry_date?.toString() || '');

  await fs.writeFile('.env', env_content.trim() + '\n');

  // Update process.env
  process.env.GOOGLE_ACCESS_TOKEN = tokens.access_token;
  process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token || '';
  process.env.GOOGLE_TOKEN_EXPIRY = tokens.expiry_date?.toString() || '';
};

const createAuthClient = async ({client_id, client_secret, redirect_uri}: CalendarCredentials): Promise<OAuth2Client> => {
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
  const tokens = await loadTokens();
  
  if (!tokens) {
    throw new Error('No authentication tokens found. Please authenticate first.');
  }

  // Set initial credentials
  auth.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });

  // Check token expiry
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    if (!tokens.refresh_token) {
      throw new Error('Token expired and no refresh token available. Please re-authenticate.');
    }
    
    try {
      // Use getAccessToken instead of refreshToken
      const response = await auth.getAccessToken();
      if (response.token) {
        const new_tokens: CalendarTokens = {
          access_token: response.token,
          refresh_token: tokens.refresh_token, // Keep existing refresh token
          expiry_date: auth.credentials.expiry_date
        };
        await saveTokens(new_tokens);
        auth.setCredentials(new_tokens);
      }
    } catch (error) {
      throw new Error('Failed to refresh token. Please re-authenticate.');
    }
  }

  return auth;
};

const createCalendarClient = (auth: OAuth2Client) => google.calendar({version: 'v3', auth});

const getAuthUrl = (auth: OAuth2Client): string => {
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    redirect_uri: process.env.GOOGLE_REDIRECT_URI
  });
};

const handleCallback = async (auth: OAuth2Client, code: string, span?: LangfuseSpanClient): Promise<CalendarTokens> => {
  try {
    const {tokens} = await auth.getToken(code);
    auth.setCredentials(tokens);
    await saveTokens(tokens);
    
    span?.event({
      name: 'calendar_auth_success',
      input: {code_length: code.length},
      output: {has_refresh_token: !!tokens.refresh_token}
    });
    
    return tokens;
  } catch (error) {
    span?.event({
      name: 'calendar_auth_error',
      input: {code_length: code.length},
      output: {error: error instanceof Error ? error.message : 'Unknown error'},
      level: 'ERROR'
    });
    throw error;
  }
};

const createEvent = async (
  calendar: calendar_v3.Calendar,
  event_data: z.infer<typeof eventSchema>,
  span?: LangfuseSpanClient
): Promise<calendar_v3.Schema$Event> => {
  try {
    const validated_event = eventSchema.parse(event_data);
    
    // Format dates to ISO 8601 format with seconds and timezone offset
    const formatted_event = {
      ...validated_event,
      start: {
        ...validated_event.start,
        dateTime: new Date(validated_event.start.dateTime.replace(' ', 'T')).toISOString()
      },
      end: {
        ...validated_event.end,
        dateTime: new Date(validated_event.end.dateTime.replace(' ', 'T')).toISOString()
      }
    };
    
    // Remove empty strings for optional fields
    if (formatted_event.description === '') delete formatted_event.description;
    if (formatted_event.location === '') delete formatted_event.location;
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: formatted_event,
    });

    return response.data;
  } catch (error) {
    console.error('Event creation error:', error);
    throw error;
  }
};

const searchEvents = async (
  calendar: calendar_v3.Calendar,
  search_params: z.infer<typeof eventSearchSchema>,
  span?: LangfuseSpanClient
): Promise<string> => {
  try {
    const validated_params = eventSearchSchema.parse(search_params);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      q: validated_params.query,
      timeMin: validated_params.timeMin,
      timeMax: validated_params.timeMax,
      maxResults: validated_params.maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items ?? [];
    
    // Convert to XML format
    const xml_events = events.map(event => `  <event
    id="${event.id}"
    status="${event.status}"
    link="${event.htmlLink}"
    summary="${event.summary}"
    start="${event.start?.dateTime || event.start?.date}"
    end="${event.end?.dateTime || event.end?.date}"
    ${event.location ? `location="${event.location}"` : ''}
  />`).join('\n');

    const xml_output = `
<events>
${xml_events}
</events>`;

    span?.event({
      name: 'calendar_events_searched',
      input: validated_params,
      output: { events_count: events.length }
    });

    return xml_output;
  } catch (error) {
    span?.event({
      name: 'calendar_search_error',
      input: search_params,
      output: { error: error instanceof Error ? error.message : 'Unknown error' },
      level: 'ERROR'
    });
    throw error;
  }
};

const updateEvent = async (
  calendar: calendar_v3.Calendar,
  update_data: z.infer<typeof eventUpdateSchema>,
  span?: LangfuseSpanClient
): Promise<calendar_v3.Schema$Event> => {
  try {
    const validated_data = eventUpdateSchema.parse(update_data);
    const { eventId, ...eventData } = validated_data;
    
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: {
        ...eventData,
        start: {
          ...eventData.start,
          dateTime: eventData.start.dateTime.replace(' ', 'T')
        },
        end: {
          ...eventData.end,
          dateTime: eventData.end.dateTime.replace(' ', 'T')
        }
      },
    });

    span?.event({
      name: 'calendar_event_updated',
      input: validated_data,
      output: { event_id: response.data.id }
    });

    return response.data;
  } catch (error) {
    span?.event({
      name: 'calendar_update_error',
      input: update_data,
      output: { error: error instanceof Error ? error.message : 'Unknown error' },
      level: 'ERROR'
    });
    throw error;
  }
};

// Add more specific error types
interface CalendarError extends Error {
  code?: number;
  details?: string;
}

const calendarService = {
  execute: async (action: string, payload: unknown, span?: LangfuseSpanClient): Promise<DocumentType> => {
    const state = stateManager.getState();
    const conversation_uuid = state.config.conversation_uuid ?? 'unknown';

    try {
      // Validate environment variables
      const required_env_vars = {
        CALENDAR_CLIENT_ID: process.env.CALENDAR_CLIENT_ID,
        CALENDAR_CLIENT_SECRET: process.env.CALENDAR_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI
      };

      const missing_vars = Object.entries(required_env_vars)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

      if (missing_vars.length > 0) {
        throw new Error(`Missing required environment variables: ${missing_vars.join(', ')}`);
      }

      const auth = await createAuthClient({
        client_id: required_env_vars.CALENDAR_CLIENT_ID!,
        client_secret: required_env_vars.CALENDAR_CLIENT_SECRET!,
        redirect_uri: required_env_vars.GOOGLE_REDIRECT_URI!
      });

      const calendar = createCalendarClient(auth);

      // Validate payload before processing
      if (action !== 'get_auth_url' && !payload) {
        throw new Error('Payload is required for this action');
      }

      switch (action) {
        case 'create_event': {
          const event = await createEvent(calendar, payload as z.infer<typeof eventSchema>, span);
          const event_text = JSON.stringify(event, null, 2);
          const [tokenized_content] = await text_service.split(event_text, Infinity);
          
          return documentService.createDocument({
            conversation_uuid,
            source_uuid: conversation_uuid,
            text: event_text,
            metadata_override: {
              type: 'text',
              content_type: 'full',
              name: event.summary ?? 'Unnamed event',
              description: `Calendar event created: ${event.id}`,
              tokens: tokenized_content.metadata.tokens,
              mimeType: 'application/json',
              source: 'google_calendar'
            }
          });
        }

        case 'update_event': {
          const event = await updateEvent(calendar, payload as z.infer<typeof eventUpdateSchema>, span);
          const event_text = JSON.stringify(event, null, 2);
          const [tokenized_content] = await text_service.split(event_text, Infinity);

          return documentService.createDocument({
            conversation_uuid,
            source_uuid: conversation_uuid,
            text: event_text,
            metadata_override: {
              type: 'text',
              content_type: 'full',
              name: event.summary ?? 'Updated event',
              description: `Calendar event updated: ${event.id}`,
              tokens: tokenized_content.metadata.tokens,
              mimeType: 'application/json',
              source: 'google_calendar'
            }
          });
        }

        case 'search_events': {
          const events_xml = await searchEvents(calendar, payload as z.infer<typeof eventSearchSchema>, span);
          const [tokenized_content] = await text_service.split(events_xml, Infinity);

          return documentService.createDocument({
            conversation_uuid,
            source_uuid: conversation_uuid,
            text: events_xml,
            metadata_override: {
              type: 'text',
              content_type: 'full',
              name: 'Search Results',
              description: 'Calendar events in XML format',
              tokens: tokenized_content.metadata.tokens,
              mimeType: 'application/xml',
              source: 'google_calendar'
            }
          });
        }

        case 'get_auth_url': {
          const auth_url = getAuthUrl(auth);
          const [tokenized_content] = await text_service.split(auth_url, Infinity);

          return documentService.createDocument({
            conversation_uuid,
            source_uuid: conversation_uuid,
            text: auth_url,
            metadata_override: {
              type: 'text',
              content_type: 'full',
              name: 'Authorization URL',
              description: 'Google Calendar authorization URL',
              tokens: tokenized_content.metadata.tokens,
              mimeType: 'text/plain',
              source: 'google_calendar'
            }
          });
        }

        case 'handle_auth': {
          const code = z.string().parse(payload);
          const tokens = await handleCallback(auth, code, span);
          const tokens_text = JSON.stringify(tokens);
          const [tokenized_content] = await text_service.split(tokens_text, Infinity);
          
          return documentService.createDocument({
            conversation_uuid,
            source_uuid: conversation_uuid,
            text: tokens_text,
            metadata_override: {
              type: 'text',
              content_type: 'full',
              name: 'Authentication Status',
              description: 'Successfully authenticated with Google Calendar',
              tokens: tokenized_content.metadata.tokens,
              mimeType: 'application/json',
              source: 'google_calendar'
            }
          });
        }

        default:
          throw new Error(`Unknown calendar action: ${action}`);
      }
    } catch (error) {
      span?.event({
        name: 'calendar_operation_error',
        input: { action, payload_type: typeof payload },
        output: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          code: (error as CalendarError).code,
          details: (error as CalendarError).details
        },
        level: 'ERROR'
      });

      return documentService.createErrorDocument({
        error,
        conversation_uuid,
        context: 'Failed to execute calendar operation',
        metadata: {
          action,
          payload_type: typeof payload,
          error_details: (error as CalendarError).details
        }
      });
    }
  },

  getRecentEventsContext: async (span?: LangfuseSpanClient): Promise<DocumentType> => {
    const today = new Date();
    const timeMin = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
    const timeMax = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ahead
    const state = stateManager.getState();

    return calendarService.execute('search_events', {
      query: '', // Empty query to fetch all events
      timeMin,
      timeMax,
      maxResults: 50 // Reasonable limit for context
    }, span);
  }
};

export {
  calendarService,
  eventSchema,
  eventSearchSchema,
  eventUpdateSchema
};
