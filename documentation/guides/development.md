# Development Guide

This guide covers the development workflow, architecture, and best practices for working with the Bloxtr8 codebase.

## Table of Contents

- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Organization](#code-organization)
- [Testing](#testing)
- [Debugging](#debugging)
- [Database Development](#database-development)
- [API Development](#api-development)
- [Bot Development](#bot-development)
- [Web Development](#web-development)

## Project Structure

### Monorepo Layout

```
bloxtr8/
├── apps/
│   ├── api/              # Express API server
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point
│   │   │   ├── routes/            # API routes
│   │   │   ├── lib/               # Business logic
│   │   │   ├── middleware/        # Express middleware
│   │   │   ├── schemas/           # Zod schemas
│   │   │   └── __tests__/         # Tests
│   │   └── package.json
│   │
│   ├── discord-bot/      # Discord bot
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point
│   │   │   ├── commands/          # Slash commands
│   │   │   └── utils/             # Utilities
│   │   └── package.json
│   │
│   └── web-app/          # React web app
│       ├── src/
│       │   ├── main.tsx           # Entry point
│       │   ├── routes/            # Pages
│       │   ├── components/        # React components
│       │   └── lib/               # Utilities
│       └── package.json
│
├── packages/
│   ├── database/         # Prisma ORM
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Database schema
│   │   │   └── migrations/        # Migrations
│   │   └── src/
│   │       └── index.ts           # Prisma client export
│   │
│   ├── shared/           # Shared utilities
│   ├── storage/          # S3 storage utilities
│   ├── types/            # TypeScript types
│   ├── eslint-config/    # ESLint config
│   └── tsconfig/         # TypeScript config
│
└── documentation/        # Documentation
```

### Key Files

- `package.json` - Root package with workspace configuration
- `turbo.json` - Turborepo build configuration
- `pnpm-workspace.yaml` - pnpm workspace configuration
- `.env.development.local` - Development environment variables

## Development Workflow

### 1. Start a New Feature

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Start development server
pnpm dev
```

### 2. Make Changes

Edit files in the appropriate workspace:

- API changes → `apps/api/src/`
- Bot changes → `apps/discord-bot/src/`
- Web changes → `apps/web-app/src/`
- Database changes → `packages/database/prisma/schema.prisma`
- Shared code → `packages/shared/src/`

### 3. Test Changes

```bash
# Run linter
pnpm lint

# Run tests
pnpm test

# Check types
pnpm build
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add your feature"
```

See [Contributing Guide](../../CONTRIBUTING.md) for commit message format.

## Code Organization

### Import Order

```typescript
// 1. External dependencies
import { Router } from 'express';
import { z } from 'zod';

// 2. Internal packages (@bloxtr8/*)
import { prisma } from '@bloxtr8/database';
import { userSchema } from '@bloxtr8/types';

// 3. Relative imports
import { validateRequest } from '../middleware/validation.js';
import type { UserData } from '../types/user.js';

// 4. Constants
const MAX_RETRY_COUNT = 3;

// 5. Implementation
export function createUser() {
  // ...
}
```

### File Naming

- **TypeScript files**: `kebab-case.ts`
- **Test files**: `kebab-case.test.ts`
- **Components**: `PascalCase.tsx`
- **Constants**: `UPPER_SNAKE_CASE`

### Module Exports

```typescript
// Named exports (preferred)
export function getUserById(id: string) {}
export class UserService {}

// Default exports (for React components)
export default function UserProfile() {}
```

## Testing

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('UserService', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = 'test-id';

      // Act
      const user = await getUserById(userId);

      // Assert
      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
    });

    it('should throw error when not found', async () => {
      await expect(getUserById('invalid')).rejects.toThrow();
    });
  });
});
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# Specific file
pnpm test user-service.test.ts

# Specific workspace
pnpm --filter=@bloxtr8/api test
```

### Mocking

```typescript
// Mock Prisma client
jest.mock('@bloxtr8/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ data: 'test' }),
  })
) as jest.Mock;
```

## Debugging

### VS Code Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "skipFiles": ["<node_internals>/**"],
      "cwd": "${workspaceFolder}"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test", "--watch"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### Console Logging

```typescript
// Development only
console.log('Debug:', data);
console.error('Error:', error);
console.warn('Warning:', warning);

// Production (use structured logging)
logger.info('User created', { userId: user.id });
logger.error('Failed to create user', { error, userId });
```

### Database Queries

```typescript
// Enable Prisma query logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

## Database Development

### Schema Changes

1. **Edit Schema**: Modify `packages/database/prisma/schema.prisma`

```prisma
model User {
  id    String @id @default(cuid())
  email String @unique
  name  String?
  // Add new field
  avatar String?
}
```

2. **Create Migration**:

```bash
pnpm db:migrate
# Enter migration name when prompted
```

3. **Generate Client**:

```bash
pnpm db:generate
```

### Querying Data

```typescript
import { prisma } from '@bloxtr8/database';

// Find unique
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { listings: true },
});

// Find many with filtering
const users = await prisma.user.findMany({
  where: {
    kycVerified: true,
    kycTier: 'TIER_2',
  },
  orderBy: { createdAt: 'desc' },
  take: 10,
});

// Create
const newUser = await prisma.user.create({
  data: {
    email: 'user@example.com',
    name: 'John Doe',
  },
});

// Update
const updated = await prisma.user.update({
  where: { id: userId },
  data: { kycVerified: true },
});

// Delete
await prisma.user.delete({
  where: { id: userId },
});

// Transactions
await prisma.$transaction(async tx => {
  const user = await tx.user.create({ data: userData });
  await tx.account.create({ data: { userId: user.id } });
});
```

### Seeding Database

Edit `packages/database/src/seed.ts`:

```typescript
async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Test User',
      kycTier: 'TIER_1',
    },
  });

  console.log('Created user:', user.id);
}
```

Run seed:

```bash
pnpm db:seed
```

## API Development

### Creating a New Endpoint

1. **Define Route** in `apps/api/src/routes/`:

```typescript
// apps/api/src/routes/users.ts
import { Router } from 'express';
import { prisma } from '@bloxtr8/database';
import { userSchema } from '../schemas/index.js';

const router = Router();

router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
```

2. **Add Validation Schema** in `apps/api/src/schemas/`:

```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  kycTier: z.enum(['TIER_0', 'TIER_1', 'TIER_2']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

3. **Register Route** in `apps/api/src/routes/api.ts`:

```typescript
import usersRouter from './users.js';

router.use('/', usersRouter);
```

### Error Handling

```typescript
import { AppError } from '../middleware/errorHandler.js';

// Throw operational errors
if (!user) {
  throw new AppError('User not found', 404);
}

// Validation errors
const result = userSchema.safeParse(data);
if (!result.success) {
  throw new AppError('Validation failed', 400);
}
```

## Bot Development

### Creating a New Command

1. **Create Command Handler** in `apps/discord-bot/src/commands/`:

```typescript
// apps/discord-bot/src/commands/profile.ts
import type { ChatInputCommandInteraction } from 'discord.js';

export async function handleProfile(interaction: ChatInputCommandInteraction) {
  try {
    const userId = interaction.user.id;

    // Fetch user data from API
    const response = await fetch(`${process.env.API_URL}/api/users/${userId}`);
    const user = await response.json();

    await interaction.reply({
      content: `**Profile**\nEmail: ${user.email}\nKYC Tier: ${user.kycTier}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Profile command error:', error);
    await interaction.reply({
      content: 'Failed to fetch profile',
      ephemeral: true,
    });
  }
}
```

2. **Register Command** in `apps/discord-bot/src/index.ts`:

```typescript
import { SlashCommandBuilder } from 'discord.js';
import { handleProfile } from './commands/profile.js';

const commands = [
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile')
    .toJSON(),
];

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'profile') {
      await handleProfile(interaction);
    }
  }
});
```

### Using Modals

```typescript
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';

const modal = new ModalBuilder()
  .setCustomId('user_profile_modal')
  .setTitle('Update Profile');

const nameInput = new TextInputBuilder()
  .setCustomId('name')
  .setLabel('Name')
  .setStyle(TextInputStyle.Short)
  .setRequired(true);

modal.addComponents(
  new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
);

await interaction.showModal(modal);

// Handle submission
if (interaction.isModalSubmit()) {
  if (interaction.customId === 'user_profile_modal') {
    const name = interaction.fields.getTextInputValue('name');
    // Process data
  }
}
```

## Web Development

### Creating a New Page

1. **Create Route** in `apps/web-app/src/routes/`:

```typescript
// apps/web-app/src/routes/profile.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div>
      <h1>Profile</h1>
      {/* Component content */}
    </div>
  );
}
```

2. **Create Component** in `apps/web-app/src/components/`:

```typescript
// apps/web-app/src/components/ProfileCard.tsx
interface ProfileCardProps {
  name: string;
  email: string;
}

export function ProfileCard({ name, email }: ProfileCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-xl font-bold">{name}</h2>
      <p className="text-gray-600">{email}</p>
    </div>
  );
}
```

### API Calls

```typescript
import { authClient } from '../lib/auth';

// Fetch with auth
const response = await fetch('/api/users/me', {
  headers: {
    Authorization: `Bearer ${await authClient.getToken()}`,
  },
});

const user = await response.json();
```

## Best Practices

### TypeScript

- Use strict mode
- Avoid `any` - use `unknown` or proper types
- Leverage type inference
- Use discriminated unions for complex types

### Performance

- Use database indexes
- Implement pagination
- Cache frequently accessed data
- Use Prisma's `select` to fetch only needed fields

### Security

- Validate all input with Zod
- Use parameterized queries (Prisma ORM)
- Implement rate limiting
- Never log sensitive data

### Error Handling

- Use try-catch blocks
- Throw operational errors with `AppError`
- Log errors with context
- Return user-friendly error messages

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Discord.js Guide](https://discordjs.guide/)
- [Express Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Next**: [API Reference](../api/README.md)
