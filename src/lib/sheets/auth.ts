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

/**
 * Explains *why* credentials weren't picked up (unset vs present-but-broken),
 * so the "Sheets not connected" badge can say something actionable instead of
 * just "no". Returns null once credentialsFromEnv() would succeed.
 */
export function credentialsDiagnosis(): string | null {
  const json = env('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      return `GOOGLE_SERVICE_ACCOUNT_JSON is set but isn't valid JSON (${e instanceof Error ? e.message : String(e)}). Paste the raw contents of the downloaded key file — no surrounding quotes, no extra escaping.`;
    }
    if (!parsed || typeof parsed !== 'object' || !(parsed as Record<string, unknown>).client_email || !(parsed as Record<string, unknown>).private_key) {
      return 'GOOGLE_SERVICE_ACCOUNT_JSON is valid JSON but is missing "client_email" or "private_key" — make sure you pasted the whole downloaded key file, not a partial copy.';
    }
    return null;
  }
  const email = env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const key = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (email && !key) return 'GOOGLE_SERVICE_ACCOUNT_EMAIL is set but GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is missing.';
  if (key && !email) return 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is set but GOOGLE_SERVICE_ACCOUNT_EMAIL is missing.';
  if (email && key) return null;
  return 'No GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) environment variable found on this server.';
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
