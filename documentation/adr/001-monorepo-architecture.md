# 1. Monorepo Architecture with pnpm Workspaces

Date: 2025-01-02

## Status

Accepted

## Context

Bloxtr8 consists of multiple related applications and packages:

- Express API server
- Discord bot
- React web application
- Shared database package (Prisma)
- Shared utilities and types
- Configuration packages (ESLint, TypeScript)

We needed to decide on a repository structure that would:

1. Allow code sharing between applications
2. Enable atomic changes across multiple packages
3. Simplify dependency management
4. Support independent deployments
5. Maintain good developer experience

## Decision

We will use a **monorepo architecture** with **pnpm workspaces** and **Turborepo** for build orchestration.

### Structure

```
bloxtr8/
├── apps/              # Deployable applications
│   ├── api/
│   ├── discord-bot/
│   └── web-app/
├── packages/          # Shared packages
│   ├── database/
│   ├── shared/
│   ├── types/
│   └── config packages/
└── package.json       # Root workspace config
```

### Key Technologies

- **pnpm**: Fast, disk-efficient package manager with built-in workspace support
- **Turborepo**: Incremental build system with intelligent caching
- **TypeScript path mapping**: Clean imports using `@bloxtr8/*` aliases

## Consequences

### Positive

- **Code Sharing**: Easy to share code via `@bloxtr8/*` packages
- **Atomic Changes**: Single PR can update API, bot, and shared packages
- **Type Safety**: Shared types ensure consistency across applications
- **Unified Tooling**: Single ESLint, Prettier, and TypeScript config
- **Efficient Builds**: Turborepo caches build outputs
- **Simplified CI/CD**: Single repository to clone and test
- **Dependency Management**: No version mismatches between shared dependencies
- **Refactoring**: Easy to refactor across package boundaries

### Negative

- **Initial Setup Complexity**: More complex initial configuration
- **Learning Curve**: Team needs to understand monorepo concepts
- **Build Times**: Must build dependencies before dependent packages
- **Git History**: Single repository means all teams share commit history
- **Deployment Coordination**: Changes to shared packages affect multiple apps

### Neutral

- **Repository Size**: Larger single repository vs. multiple small repos
- **Access Control**: Cannot easily restrict access to specific packages
- **Tooling Requirements**: Need monorepo-aware tools (Turborepo, pnpm)

## Alternatives Considered

### 1. Multiple Repositories (Polyrepo)

**Pros**:

- Independent versioning per repository
- Separate CI/CD pipelines
- Granular access control
- Smaller repositories

**Cons**:

- Difficult to share code
- Dependency version synchronization issues
- Atomic changes require multiple PRs
- Duplicate tooling configuration
- More complex local development setup

**Why Rejected**: Too much overhead for a small team, difficult to maintain consistency.

### 2. Lerna Monorepo

**Pros**:

- Established monorepo tool
- Good ecosystem support

**Cons**:

- Slower than pnpm workspaces
- Less actively maintained
- More complex configuration

**Why Rejected**: pnpm workspaces + Turborepo provide better performance and simpler setup.

### 3. Nx Monorepo

**Pros**:

- Powerful build orchestration
- Excellent caching
- Plugin ecosystem

**Cons**:

- Heavy tooling overhead
- Opinionated structure
- Steeper learning curve
- More than we need for current scale

**Why Rejected**: Turborepo provides similar benefits with simpler setup.

## Implementation Details

### Workspace Configuration

**pnpm-workspace.yaml**:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**package.json**:

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  }
}
```

### Path Mapping

**packages/tsconfig/tsconfig.base.json**:

```json
{
  "compilerOptions": {
    "paths": {
      "@bloxtr8/database": ["./packages/database/src"],
      "@bloxtr8/shared": ["./packages/shared/src"],
      "@bloxtr8/types": ["./packages/types/src"]
    }
  }
}
```

### Build Pipeline

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

## Migration Path

1. Create monorepo structure
2. Move existing code to `apps/` and `packages/`
3. Configure pnpm workspaces
4. Set up Turborepo
5. Update import paths to use `@bloxtr8/*`
6. Update CI/CD to use monorepo commands

## Success Metrics

- Developer can make cross-package changes in single PR
- Shared code has no version conflicts
- Build caching reduces CI time by >50%
- New developers can run entire stack with single command

## References

- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Monorepo Best Practices](https://monorepo.tools/)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

## Related

- ADR-003: Prisma ORM for Database Layer
