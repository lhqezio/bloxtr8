import { PrismaClient } from '@bloxtr8/database';
import type { Request, Response, NextFunction } from 'express';
import { Router, type Router as ExpressRouter } from 'express';
import jwt from 'jsonwebtoken';

const router: ExpressRouter = Router();
const prisma = new PrismaClient();

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

const createAccessToken = (userId: string, discordId: string, username: string) => {
  const secret = process.env.JWT_SECRET as string;
  return jwt.sign({ sub: userId, discordId, username }, secret, { expiresIn: '15m' });
};

const generateRandomToken = (length = 64) => {
  return [...crypto.getRandomValues(new Uint8Array(length))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

async function exchangeAndSetCookies({ code, redirectUri, res }: { code: string; redirectUri: string; res: Response }) {
  const clientId = process.env.DISCORD_CLIENT_ID as string;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET as string;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Discord OAuth not configured' });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!tokenResp.ok) {
    const errTxt = await tokenResp.text().catch(() => '');
    return res.status(401).json({ error: 'Token exchange failed', details: errTxt });
  }

  const tokenJson = (await tokenResp.json()) as DiscordTokenResponse;
  const userResp = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userResp.ok) {
    const errTxt = await userResp.text().catch(() => '');
    return res.status(401).json({ error: 'Failed to fetch Discord user', details: errTxt });
  }
  const discordUser = (await userResp.json()) as DiscordUser;

  const synthesizedEmail = discordUser.email || `${discordUser.id}@discord.local`;
  const displayName = discordUser.global_name || discordUser.username;
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : undefined;

  const user = await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: {
      username: discordUser.username,
      name: displayName,
      email: synthesizedEmail,
      image: avatarUrl,
    },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      name: displayName,
      email: synthesizedEmail,
      image: avatarUrl,
    },
  });

  const accessToken = createAccessToken(user.id, user.discordId, user.username);

  const refreshToken = generateRandomToken(48);
  const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      token: refreshToken,
      expiresAt: refreshExpiresAt,
      userId: user.id,
    },
  });

  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return res.status(200).json({ user: { id: user.id, username: user.username, discordId: user.discordId } });
}

router.post('/identity/discord/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, redirectUri } = req.body as { code?: string; redirectUri?: string };
    if (!code || !redirectUri) {
      return res.status(400).json({ error: 'Missing code or redirectUri' });
    }
    return await exchangeAndSetCookies({ code, redirectUri, res });
  } catch (err) {
    next(err);
  }
});

router.get('/identity/discord/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string | undefined;
    if (!code) {
      return res.status(400).send('Missing code');
    }
    const redirectUri = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
    return await exchangeAndSetCookies({ code, redirectUri, res });
  } catch (err) {
    next(err);
  }
});

export default router;


