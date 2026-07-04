// Google Sheets auth — a service account, not an interactive login. The
// account owner shares their keyword sheet with the service account's
// client_email (like sharing with a person) and the server authenticates
// headlessly. See DEPLOY.md for the one-time Google Cloud setup.
import { GoogleAuth } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function env(name: string): string | undefined {
  return process.env[name] || (import.meta.env as Record<string, string | undefined>)[name];
}

function credentialsFromEnv(): { client_email: string; private_key: string } | null {
  const json = env('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.client_email && parsed.private_key) {
        return { client_email: parsed.client_email, private_key: parsed.private_key };
      }
    } catch {
      // fall through to the split-var form
    }
  }
  const client_email = env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const rawKey = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (client_email && rawKey) {
    return { client_email, private_key: rawKey.replace(/\\n/g, '\n') };
  }
  return null;
}

export function hasGoogleCredentials(): boolean {
  return Boolean(credentialsFromEnv());
}

export function serviceAccountEmail(): string | null {
  return credentialsFromEnv()?.client_email || null;
}

let cachedAuth: GoogleAuth | null = null;

export async function getAccessToken(): Promise<string> {
  const creds = credentialsFromEnv();
  if (!creds) {
    throw new Error('Google Sheets is not connected on this server — set GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).');
  }
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({ credentials: creds, scopes: SCOPES });
  }
  const client = await cachedAuth.getClient();
  const res = await client.getAccessToken();
  if (!res || !res.token) throw new Error('Failed to obtain a Google access token.');
  return res.token;
}
