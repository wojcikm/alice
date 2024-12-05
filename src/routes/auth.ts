import { Hono } from 'hono';
import { google } from 'googleapis';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { findByToken, findByUUID, getGoogleTokens, updateGoogleTokens } from '../services/common/user.service';
import { randomBytes } from 'crypto';
import { spotifyService } from '../services/tools/spotify.service';
import { AppEnv } from '../types/hono';


// Session interfaces
interface SessionData {
  id: string;
  user_email: string;
  access_token: string;
  refresh_token?: string;
  created_at: Date;
}

const SessionSchema = z.object({
  user_email: z.string().email(),
  access_token: z.string(),
  refresh_token: z.string().optional()
});

const SpotifyCallbackSchema = z.object({
  code: z.string(),
  state: z.string()
});

// In-memory session storage
const sessions = new Map<string, SessionData>();

// Session management functions
const createSession = async (data: Omit<SessionData, 'id' | 'created_at'>) => {
  const session: SessionData = {
    id: uuidv4(),
    ...data,
    created_at: new Date()
  };

  sessions.set(session.id, session);
  return session;
};

const GOOGLE_REDIRECT_URI = `${process.env.APP_URL}/api/auth/google/callback`;
const SPOTIFY_REDIRECT_URI = `${process.env.APP_URL}/api/auth/spotify/callback`;
// Add environment validation schema
const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  APP_URL: z.string().url()
});

// OAuth2 client setup with error handling
const createOAuth2Client = () => {
  const env = envSchema.parse(process.env);
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
};

const sessionService = {
  create: async (data: z.infer<typeof SessionSchema>) => {
    const session: SessionData = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    sessions.set(session.id, session);
    return session;
  },
  get: async (session_id: string) => sessions.get(session_id) || null
};

const googleService = {
  getAuthUrl: () => {
    const scopes = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      response_type: 'code',
      scope: scopes,
      prompt: 'consent',
      state: uuidv4(),
      redirect_uri: GOOGLE_REDIRECT_URI
    });
  },

  handleCallback: async (code: string) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const user_info = await oauth2.userinfo.get();

    return sessionService.create({
      user_email: user_info.data.email!,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? undefined
    });
  }
};

// Update the Google OAuth client setup to use user tokens
const createGoogleClient = async (user_uuid: string) => {
  const tokens = await getGoogleTokens(user_uuid);
  if (!tokens?.access_token) {
    throw new Error('Google authentication required');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expires_at?.getTime()
  });

  return oauth2Client;
};

// Add this schema for request validation
const AuthRequestSchema = z.object({
  token: z.string().optional()
});

export default new Hono<AppEnv>()
  .get('/google/authorize', async (c) => {
    const html = `<!DOCTYPE html>
    <html lang="en" class="h-full bg-gray-900">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Connect Google</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="h-full flex items-center justify-center">
        <div class="max-w-md w-full mx-auto p-8">
            <div class="text-center mb-8">
                <svg class="w-16 h-16 mx-auto text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                </svg>
                <h2 class="mt-6 text-3xl font-bold tracking-tight text-white">Connect your Google account</h2>
                <p class="mt-2 text-sm text-gray-400">
                    Enable Google services through our AI assistant
                </p>
            </div>
            
            <div class="mt-8">
                <form id="google-form" class="space-y-4">
                    <div>
                        <input 
                            type="text" 
                            id="token" 
                            required
                            placeholder="Enter your API token" 
                            class="w-full rounded-lg bg-gray-800 border-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                    </div>
                    <button 
                        type="submit" 
                        class="flex w-full justify-center items-center gap-3 rounded-lg bg-blue-500 px-6 py-4 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-400 focus:visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 transition-all duration-200"
                    >
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                        </svg>
                        Connect with Google
                    </button>
                </form>
            </div>
    
            <div class="mt-6 text-center text-sm text-gray-500">
                <p>By connecting, you agree to our Terms of Service and Privacy Policy</p>
            </div>
        </div>
    
        <script>
            document.getElementById('google-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const token = document.getElementById('token').value;
                
                try {
                    const response = await fetch('${process.env.APP_URL}/api/auth/google/authorize', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    const result = await response.json();
                    if (!result.success) {
                        throw new Error(result.error || 'Authorization failed');
                    }
                    
                    window.location.href = result.data.auth_url;
                } catch (error) {
                    console.error('Error:', error);
                    alert(error.message || 'Authorization failed. Please check your token and try again.');
                }
            });
        </script>
    </body>
    </html>`;
      
    return c.html(html);
  })
  
  .post('/google/authorize', async (c) => {
    try {
      const auth_header = c.req.header('Authorization');
      if (!auth_header || !auth_header.startsWith('Bearer ')) {
        console.log('Invalid auth header:', auth_header);
        return c.json({ success: false, error: 'Invalid authorization header' }, 401);
      }

      const token = auth_header.split(' ')[1];
      console.log('Looking up user with token:', token);
      
      const user = await findByToken(token);
      console.log('Found user:', user);
      
      if (!user) {
        return c.json({ success: false, error: 'Invalid token or user not found' }, 401);
      }

      const random_state = randomBytes(16).toString('hex');
      const combined_state = `${random_state}:${user.uuid}`;
      const scopes = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/drive.file'
      ];
      
      const oauth2Client = createOAuth2Client();
      const auth_url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        response_type: 'code',
        scope: scopes,
        prompt: 'consent',
        state: combined_state,
        redirect_uri: GOOGLE_REDIRECT_URI,
        include_granted_scopes: true
      });

      console.log('Generated auth URL:', auth_url);

      return c.json({ 
        success: true, 
        data: { auth_url } 
      });
    } catch (error) {
      console.error('Google auth error:', error);
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to initialize Google auth',
        details: error instanceof Error ? error.stack : undefined
      }, 500);
    }
  })

  .get('/google/callback', async (c) => {
    try {
      const code = c.req.query('code');
      const state = c.req.query('state');
      
      if (!code || !state) {
        return c.json({ success: false, error: 'Invalid callback parameters' }, 400);
      }

      const [random_state, user_uuid] = state.split(':');
      const user = await findByUUID(user_uuid);
      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      
      // Store tokens in the database
      await updateGoogleTokens(
        user_uuid,
        tokens.access_token!,
        tokens.refresh_token!,
        tokens.expiry_date! - Date.now()
      );

      return c.json({ 
        success: true,
        data: {
          message: 'Google authentication successful'
        }
      });
    } catch (error) {
      console.error('Google callback error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });
