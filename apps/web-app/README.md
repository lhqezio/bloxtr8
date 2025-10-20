# Bloxtr8 Web Application

React web app for OAuth callbacks, account linking, and contract signing.

## Overview

The web app serves as the browser-based interface for:

- **OAuth Callbacks**: Handle Discord and Roblox OAuth redirects
- **Roblox Account Linking**: Complete Roblox authentication flow
- **Contract Signing**: Web-based contract signing with magic links
- **User Profiles**: View account information and settings

## Features

### OAuth Integration

**Discord OAuth**:
- Redirect endpoint: `/auth/callback`
- Integrated with Better Auth
- Session management with HTTP-only cookies

**Roblox OAuth**:
- Link flow: `/auth/link/roblox`
- Success page: `/auth/link/success`
- Error handling: `/auth/link/error`
- Upgrades user KYC tier to TIER_1

### Contract Signing

**Magic Link Authentication**:
- Secure 15-minute tokens
- Single-use tokens with automatic cleanup
- No password required

**Signing Pages**:
- `/contract/:contractId/sign` - Contract preview and signing
- `/contract/:contractId/complete` - Post-signature confirmation
- Full contract details display
- Sign button with confirmation
- Captures IP address and user agent for audit trail

### User Management

- `/profile` - User profile page
- `/user` - User settings (Coming Soon)
- View linked accounts (Discord, Roblox)
- Check KYC tier status

## Tech Stack

- **Framework**: React 19
- **Build Tool**: Vite
- **Routing**: TanStack Router (file-based)
- **Styling**: Tailwind CSS
- **Auth**: Better Auth client
- **State**: TanStack Store (optional)
- **Testing**: Vitest

## Project Structure

```
apps/web-app/
├── src/
│   ├── routes/
│   │   ├── __root.tsx           # Root layout
│   │   ├── index.tsx             # Home page
│   │   ├── auth/
│   │   │   ├── callback.tsx      # OAuth callback handler
│   │   │   └── link/
│   │   │       ├── roblox.tsx    # Roblox linking page
│   │   │       ├── success.tsx   # Link success
│   │   │       └── error.tsx     # Link error
│   │   ├── contract/
│   │   │   ├── $contractId.sign.tsx     # Contract signing
│   │   │   └── $contractId.complete.tsx # Signature complete
│   │   ├── profile.tsx           # User profile
│   │   └── user.tsx              # User settings
│   ├── components/               # React components
│   ├── lib/                      # Utilities
│   └── main.tsx                  # App entry point
├── package.json
└── vite.config.ts
```

## Routes

### `/` - Home

Landing page with links to Discord bot invite.

### `/auth/callback` - OAuth Callback

Handles OAuth redirects from Discord and Roblox.

**Query Parameters**:
- `code` - OAuth authorization code
- `state` - CSRF protection token

**Flow**:
1. Receive OAuth callback
2. Exchange code for token
3. Create/update user session
4. Redirect to appropriate page

### `/auth/link/roblox` - Roblox Linking

Initiated from Discord bot `/link` command.

**Flow**:
1. User clicks OAuth URL from Discord
2. Roblox authentication
3. Callback validation
4. Link Roblox account to user
5. Upgrade KYC tier to TIER_1
6. Redirect to success page

### `/contract/:contractId/sign` - Contract Signing

Secure contract signing page accessed via magic link.

**Query Parameters**:
- `token` - Single-use signing token (15min expiry)

**Features**:
- Token validation
- Contract preview
- Sign button
- Signature confirmation
- Captures audit metadata (IP, user agent)

**Flow**:
1. Validate magic link token
2. Fetch contract details
3. Display contract preview
4. User clicks "Sign Contract"
5. POST to `/api/contracts/:id/sign`
6. Redirect to completion page

### `/contract/:contractId/complete` - Signature Complete

Post-signature confirmation page.

**Shows**:
- Signature timestamp
- Contract status (PENDING_SIGNATURE or EXECUTED)
- Next steps (wait for counterparty or proceed to escrow)

### `/profile` - User Profile

View user information and linked accounts.

**Displays**:
- Discord account
- Roblox account (if linked)
- KYC tier
- Account creation date

## Development

### Prerequisites

- Node.js 18+
- pnpm
- API server running

### Environment Variables

Create `.env.development.local`:

```env
VITE_API_URL=http://localhost:3000
VITE_APP_URL=http://localhost:5173
```

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Development Server

```bash
pnpm dev
```

Runs on `http://localhost:5173`

## Building

### Production Build

```bash
pnpm build
```

Outputs to `dist/` directory.

### Type Checking

```bash
pnpm type-check
```

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Deployment

### Static Hosting

The web app is a static SPA and can be deployed to:

- **Vercel**: Zero-config deployment
- **Cloudflare Pages**: Fast global CDN
- **Netlify**: Easy integration
- **AWS S3 + CloudFront**: Custom setup

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Environment Variables (Production)

Required environment variables:

- `VITE_API_URL` - Production API URL (e.g., `https://api.bloxtr8.com`)
- `VITE_APP_URL` - Production web app URL (e.g., `https://app.bloxtr8.com`)

## Routing

### File-Based Routing

TanStack Router uses file-based routing in `src/routes/`:

- `index.tsx` → `/`
- `profile.tsx` → `/profile`
- `auth/callback.tsx` → `/auth/callback`
- `contract/$contractId.sign.tsx` → `/contract/:contractId/sign`

### Dynamic Routes

Use `$` prefix for route parameters:

```tsx
// src/routes/contract/$contractId.sign.tsx
export const Route = createFileRoute('/contract/$contractId/sign')({
  component: ContractSignPage,
});
```

Access params in component:

```tsx
const { contractId } = Route.useParams();
```

### Links

Use `Link` component for SPA navigation:

```tsx
import { Link } from '@tanstack/react-router';

<Link to="/profile">Profile</Link>
<Link to="/contract/$contractId/sign" params={{ contractId: '123' }}>
  Sign Contract
</Link>
```

## Authentication

### Better Auth Client

```tsx
import { authClient } from './lib/auth-client';

// Get session
const session = await authClient.getSession();

// Sign out
await authClient.signOut();
```

### Protected Routes

Use route guards to protect authenticated pages:

```tsx
export const Route = createFileRoute('/profile')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  component: ProfilePage,
});
```

## Styling

### Tailwind CSS

Utility-first CSS framework configured out of the box.

```tsx
<div className="bg-blue-500 text-white p-4 rounded-lg">
  Hello World
</div>
```

### Custom Styles

Global styles in `src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
.my-custom-class {
  @apply bg-gray-100 p-4;
}
```

## Linting & Formatting

```bash
# Lint code
pnpm lint

# Format code
pnpm format

# Check formatting
pnpm check
```

## Contract Signing Security

### Magic Link Tokens

- Generated server-side with cryptographically secure random bytes
- 15-minute expiration
- Single-use only (deleted after signature)
- Validated on every request

### Audit Trail

Each signature captures:
- User ID
- Timestamp
- IP address
- User agent
- Signature method (WEB_BASED)

### Token Validation

```tsx
// Validate token before showing contract
const response = await fetch(`/api/contracts/${contractId}/validate-token`, {
  method: 'POST',
  body: JSON.stringify({ token }),
});

if (!response.ok) {
  // Token expired or invalid
  redirect('/auth/link/error');
}
```

## API Integration

### Fetch Contract

```tsx
const response = await fetch(`${API_URL}/api/contracts/${contractId}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

const contract = await response.json();
```

### Sign Contract

```tsx
const response = await fetch(`${API_URL}/api/contracts/${contractId}/sign`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: user.id,
    signatureMethod: 'WEB_BASED',
    ipAddress: clientIp,
    userAgent: navigator.userAgent,
  }),
});

const result = await response.json();
// result.bothPartiesSigned indicates if contract is fully executed
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md)

## License

ISC
