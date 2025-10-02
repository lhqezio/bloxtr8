# Contributing to Bloxtr8

Thank you for your interest in contributing to Bloxtr8! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

### Prerequisites

- Node.js ≥ 18.0.0
- pnpm ≥ 8.0.0
- PostgreSQL ≥ 14
- Git

### Setup Development Environment

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/bloxtr8.git
cd bloxtr8

# Add upstream remote
git remote add upstream https://github.com/bloxtr8/bloxtr8.git

# Install dependencies
pnpm install

# Setup environment variables
cp .env.local.example .env.development.local
# Edit .env.development.local with your credentials

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database (optional)
pnpm db:seed

# Start development server
pnpm dev
```

## Development Workflow

### 1. Create a Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Changes

- Write clean, maintainable code
- Follow our [coding standards](#coding-standards)
- Add tests for new features
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run linter
pnpm lint

# Run tests
pnpm test

# Check formatting
pnpm format:check

# Run type checking
pnpm build
```

### 4. Commit Your Changes

Follow our [commit guidelines](#commit-guidelines):

```bash
git add .
git commit -m "feat: add user profile page"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Avoid `any` types - use `unknown` or proper types
- Use type inference where appropriate
- Define interfaces for data structures

### Code Style

- Follow ESLint rules (run `pnpm lint`)
- Use Prettier for formatting (run `pnpm format`)
- Maximum line length: 80 characters
- Use meaningful variable and function names
- Write self-documenting code

### File Organization

```typescript
// 1. External imports
import { Router } from 'express';
import { z } from 'zod';

// 2. Internal package imports
import { prisma } from '@bloxtr8/database';
import { userSchema } from '@bloxtr8/types';

// 3. Relative imports
import { validateRequest } from '../middleware/validation.js';
import { AppError } from '../lib/errors.js';

// 4. Types
interface UserData {
  id: string;
  email: string;
}

// 5. Constants
const MAX_RETRIES = 3;

// 6. Implementation
export function createUser() {
  // ...
}
```

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Classes**: PascalCase (`UserService`)
- **Functions**: camelCase (`getUserById`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Interfaces**: PascalCase (`UserData`)
- **Types**: PascalCase (`UserRole`)
- **Enums**: PascalCase (`UserStatus`)

### Comments

- Use JSDoc for functions and classes
- Explain "why", not "what"
- Keep comments up-to-date

```typescript
/**
 * Verifies Roblox game ownership for a user
 *
 * @param userId - The user's database ID
 * @param gameId - The Roblox game ID to verify
 * @returns Verification result with ownership details
 * @throws {AppError} If verification fails
 */
export async function verifyGameOwnership(
  userId: string,
  gameId: string
): Promise<VerificationResult> {
  // Implementation
}
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks
- **perf**: Performance improvements
- **ci**: CI/CD changes

### Examples

```bash
feat(api): add user profile endpoint

Add GET /api/users/:id endpoint to retrieve user profiles.
Includes validation and error handling.

Closes #123

---

fix(bot): resolve Discord modal timeout issue

Modal submissions were timing out after 3 seconds.
Increased timeout to 15 seconds and added retry logic.

Fixes #456

---

docs: update development setup guide

Add instructions for Windows users and troubleshooting section.

---

refactor(database): optimize user query performance

Replace N+1 queries with single JOIN query.
Reduces query time from 500ms to 50ms.
```

### Commit Message Rules

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- Capitalize first letter of subject
- No period at end of subject
- Limit subject line to 50 characters
- Wrap body at 72 characters
- Separate subject from body with blank line

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] No linting errors
- [ ] No merge conflicts

### PR Title

Follow commit message format:

```
feat(api): add user authentication endpoint
```

### PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Describe testing performed

## Screenshots (if applicable)

Add screenshots

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No linting errors

## Related Issues

Closes #123
```

### Review Process

1. At least one maintainer approval required
2. All CI checks must pass
3. No merge conflicts
4. Branch must be up-to-date with main

### After Approval

- Squash and merge (default)
- Delete branch after merge
- Update related issues

## Testing

### Test Structure

```typescript
describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when ID is valid', async () => {
      // Arrange
      const userId = 'test-user-id';

      // Act
      const user = await getUserById(userId);

      // Assert
      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
    });

    it('should throw error when user not found', async () => {
      // Arrange
      const invalidId = 'invalid-id';

      // Act & Assert
      await expect(getUserById(invalidId)).rejects.toThrow('User not found');
    });
  });
});
```

### Test Coverage

- Aim for >80% code coverage
- Test happy paths and error cases
- Mock external dependencies
- Use integration tests for critical flows

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test user-service.test.ts
```

## Documentation

### What to Document

- All public APIs
- Complex algorithms
- Architecture decisions
- Setup/deployment procedures
- Breaking changes

### Documentation Locations

- **Code**: JSDoc comments
- **API**: `/documentation/api/`
- **Guides**: `/documentation/guides/`
- **Architecture**: `/documentation/architecture/`
- **ADRs**: `/documentation/adr/`

### Documentation Style

- Use clear, concise language
- Include code examples
- Add diagrams where helpful
- Keep examples up-to-date
- Use proper markdown formatting

## Questions?

- Check [FAQ](documentation/guides/faq.md)
- Search [existing issues](https://github.com/bloxtr8/bloxtr8/issues)
- Join our [Discord](https://discord.gg/bloxtr8)
- Email: dev@bloxtr8.com

---

Thank you for contributing to Bloxtr8! 🚀
