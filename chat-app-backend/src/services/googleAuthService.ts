import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

export interface GooglePayload {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
}

export async function verifyGoogleToken(idToken: string): Promise<GooglePayload> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_WEB_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email || !payload.name) {
    throw new Error('Token de Google inválido');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    avatar: payload.picture,
  };
}
