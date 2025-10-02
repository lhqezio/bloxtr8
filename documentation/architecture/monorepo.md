# Monorepo Architecture

Bloxtr8 uses a pnpm monorepo with Turborepo for build orchestration.

## Structure

```
bloxtr8/
├── apps/              # Deployable applications
│   ├── api/          # Express.js REST API
│   ├── discord-bot/  # Discord.js bot
│   └── web-app/      # React web app
├── packages/         # Shared libraries
│   ├── database/     # Prisma ORM + schema
│   ├── shared/       # Common utilities
│   ├── storage/      # S3 storage client
│   ├── types/        # TypeScript types
│   ├── eslint-config/
│   └── tsconfig/
└── documentation/    # Technical docs
```

## Package Manager

**pnpm** with workspaces:

**pnpm-workspace.yaml**:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Benefits**:

- Disk-efficient (content-addressable storage)
- Fast installs
- Strict dependency resolution
- Built-in monorepo support

## Build System

**Turborepo** for coordinated builds:

**turbo.json**:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Features**:

- Dependency-aware task execution
- Incremental builds
- Remote caching (optional)
- Parallel execution

## TypeScript Configuration

Centralized TypeScript config in `packages/tsconfig/`:

**tsconfig.base.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@bloxtr8/database": ["./packages/database/src"],
      "@bloxtr8/shared": ["./packages/shared/src"],
      "@bloxtr8/storage": ["./packages/storage/src"],
      "@bloxtr8/types": ["./packages/types/src"]
    }
  }
}
```

Each app/package extends this base config.

## Import Aliases

Use `@bloxtr8/*` for clean imports:

```typescript
// Instead of
import { prisma } from '../../../packages/database/src';

// Use
import { prisma } from '@bloxtr8/database';
```

## Shared Packages

### @bloxtr8/database

Prisma ORM client and schema.

**Exports**:

```typescript
export { prisma } from './generated/prisma';
export * from './generated/prisma';
```

**Usage**:

```typescript
import { prisma } from '@bloxtr8/database';

const user = await prisma.user.findUnique({ where: { id } });
```

### @bloxtr8/types

Shared TypeScript types and interfaces.

**Exports**:

```typescript
export interface User { ... }
export interface Listing { ... }
export type ApiResponse<T> = { ... }
```

### @bloxtr8/shared

Common utilities and constants.

**Exports**:

```typescript
export const APP_NAME = 'Bloxtr8';
export enum ProviderId { DISCORD, ROBLOX, ... }
export enum EscrowState { ... }
```

### @bloxtr8/storage

AWS S3 storage utilities.

**Exports**:

```typescript
export class S3Client { ... }
export function generatePresignedUrl() { ... }
```

## Development Workflow

### Install Dependencies

```bash
# Install all workspace dependencies
pnpm install
```

### Development

```bash
# Start API server
pnpm dev

# Start specific workspace
pnpm --filter=@bloxtr8/discord-bot dev

# Run all dev servers
pnpm -r dev
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter=@bloxtr8/database build

# Build with dependencies
turbo run build --filter=@bloxtr8/api...
```

### Testing

```bash
# Run all tests
pnpm test

# Test specific workspace
pnpm --filter=@bloxtr8/api test

# Test with coverage
pnpm test:coverage
```

## Adding Packages

### Create New Shared Package

1. Create directory: `packages/new-package/`
2. Add `package.json`:

```json
{
  "name": "@bloxtr8/new-package",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  }
}
```

3. Add `tsconfig.json` extending base config
4. Update path mappings in `packages/tsconfig/tsconfig.base.json`
5. Run `pnpm install` to link workspace

### Use in Application

```typescript
// In apps/api/package.json
{
  "dependencies": {
    "@bloxtr8/new-package": "workspace:*"
  }
}
```

```typescript
// In apps/api/src/index.ts
import { something } from '@bloxtr8/new-package';
```

## Dependency Management

### Workspace Dependencies

Use `workspace:*` protocol:

```json
{
  "dependencies": {
    "@bloxtr8/database": "workspace:*",
    "@bloxtr8/types": "workspace:*"
  }
}
```

### Shared Dependencies

Install at root for all workspaces:

```bash
pnpm add -w typescript
pnpm add -w -D jest
```

### Workspace-Specific

Install in specific package:

```bash
pnpm --filter=@bloxtr8/api add express
pnpm --filter=@bloxtr8/discord-bot add discord.js
```

## Scripts

Common scripts defined in root `package.json`:

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "db:generate": "pnpm --filter=@bloxtr8/database generate",
    "db:migrate": "pnpm --filter=@bloxtr8/database migrate"
  }
}
```

## Module System

All packages use **ESM** (ECMAScript Modules):

- `"type": "module"` in all package.json files
- `.js` extensions in imports
- `import/export` syntax (no `require()`)
- NodeNext module resolution

**Import syntax**:

```typescript
import { something } from './module.js'; // Note .js extension
```

## Deployment

Each app can be deployed independently:

- **API**: Node.js server (Railway, Render, AWS)
- **Bot**: Long-running process (same as API or separate)
- **Web**: Static hosting (Vercel, Cloudflare Pages)

Shared packages are bundled with each app during build.

## Benefits

- **Code sharing**: Shared packages avoid duplication
- **Type safety**: Single source of truth for types
- **Atomic changes**: Update API + bot + types in single PR
- **Unified tooling**: One ESLint, Prettier, TypeScript config
- **Fast builds**: Turborepo caching and parallelization
- **Simple setup**: Single `pnpm install` for everything
