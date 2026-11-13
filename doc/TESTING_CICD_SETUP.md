# Testing & CI/CD Setup Guide

## Overview

This guide covers the complete setup for automated testing and CI/CD pipeline for the Peladeiro API. The system ensures code quality, security, and reliable deployments.

## Phase Completion

### ✅ Phase 1: Validation Implementation (Complete)
- [x] Security middleware with helmet, cors, rate limiting
- [x] JWT authentication with refresh tokens
- [x] Zod validation schemas for all modules
- [x] Validation middleware for body, params, query
- [x] Applied validation to auth, users, and teams routes
- [x] Comprehensive Swagger documentation

### ✅ Phase 2: Testing Setup (In Progress)
- [x] Jest configuration with TypeScript support
- [x] Unit and integration test structure
- [x] Test coverage thresholds
- [ ] Unit test examples for controllers
- [ ] Integration tests for critical flows
- [ ] Database seeding for tests

### ✅ Phase 3: CI/CD Pipeline (Ready)
- [x] GitHub Actions workflow
- [x] Lint checking with TypeScript
- [x] Automated testing
- [x] Security scanning (npm audit, Snyk)
- [x] Docker build and push
- [x] Production deployment
- [x] Health checks
- [x] Slack notifications

## Installation

### 1. Install Testing Dependencies

```bash
npm install --save-dev jest ts-jest @types/jest
npm install --save-dev @testing-library/node supertest
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

### 2. Update package.json scripts

```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration",
    "test:unit": "jest --testPathPattern=unit"
  }
}
```

### 3. Create test directories

```bash
mkdir -p src/tests/unit
mkdir -p src/tests/integration
mkdir -p src/tests/fixtures
```

## Test Structure

### Unit Tests

Unit tests focus on individual functions and methods in isolation:

```typescript
// src/tests/unit/services/user.service.test.ts
import { UserService } from '../../../modules/users/service/user.service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('validateUser', () => {
    it('should return true for valid user data', () => {
      const userData = {
        email: 'user@example.com',
        password: 'ValidPassword123'
      };
      
      expect(userService.validateUser(userData)).toBe(true);
    });

    it('should return false for invalid email', () => {
      const userData = {
        email: 'invalid-email',
        password: 'ValidPassword123'
      };
      
      expect(userService.validateUser(userData)).toBe(false);
    });
  });
});
```

### Integration Tests

Integration tests verify multiple components working together:

```typescript
// src/tests/integration/auth.flow.test.ts
import request from 'supertest';
import { app } from '../../../main/app';

describe('Authentication Flow', () => {
  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'ValidPassword123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('john@example.com');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'John Doe',
          email: 'invalid-email',
          password: 'ValidPassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app)
        .post('/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'ValidPassword123'
        });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'john@example.com',
          password: 'ValidPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'john@example.com',
          password: 'WrongPassword'
        });

      expect(response.status).toBe(401);
    });
  });
});
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test File
```bash
npm test -- src/tests/unit/services/user.service.test.ts
```

### Integration Tests Only
```bash
npm run test:integration
```

## CI/CD Pipeline Configuration

### GitHub Secrets Required

Add these secrets to your GitHub repository settings:

```
SNYK_TOKEN          - Snyk security scanning token
DEPLOY_TOKEN        - Authentication token for deployment
DEPLOY_USER         - Deploy user (e.g., deploy@example.com)
DEPLOY_HOST         - Production server hostname
DEPLOY_KEY          - SSH private key for deployment
SLACK_WEBHOOK_URL   - Slack webhook for notifications
```

### Workflow Triggers

The CI/CD pipeline runs:

1. **On Push**: To `main` or `develop` branches
2. **On Pull Request**: Against `main` or `develop` branches

### Pipeline Stages

#### 1. Lint
- TypeScript type checking
- ESLint code quality
- Runs on all triggers

#### 2. Test
- Unit tests with coverage
- Integration tests
- Coverage upload to Codecov
- Required for merge to main

#### 3. Security
- npm audit for vulnerabilities
- Snyk security scanning
- Continues even if issues found

#### 4. Build
- Build Docker image
- Push to container registry
- Only runs on main branch pushes

#### 5. Deploy
- Pull latest Docker image
- Run database migrations
- Health check verification
- Only runs on main branch pushes

### Health Check

The deployment includes a health check that:
- Polls the `/health` endpoint
- Retries up to 30 times with 10-second intervals
- Ensures service is ready before considering deployment complete

### Slack Notifications

On successful deployment, the team receives a Slack notification with:
- Deployment status
- Repository and branch information
- Commit SHA
- Deployment URL

## Example Test Setup

### 1. Test Database Configuration

```typescript
// src/tests/fixtures/database.ts
import { Sequelize } from 'sequelize';

export async function setupTestDatabase() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'peladeiro_test',
    logging: false,
  });

  await sequelize.sync({ force: true });
  return sequelize;
}

export async function teardownTestDatabase(sequelize: Sequelize) {
  await sequelize.drop();
  await sequelize.close();
}
```

### 2. Jest Setup File

```typescript
// src/tests/setup.ts
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

// Mock external services
jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  }
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
```

### 3. Test Environment Configuration

Create `.env.test`:

```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/peladeiro_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=test-secret-key
RATE_LIMIT_WINDOW_MS=1000
RATE_LIMIT_MAX_REQUESTS=100
```

## Monitoring & Observability

### Coverage Thresholds

The project enforces minimum coverage:
- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 50%
- **Statements**: 50%

Increase thresholds as you grow test coverage.

### Codecov Integration

Coverage reports are automatically uploaded to Codecov for:
- Historical tracking
- Pull request insights
- Badge generation

## Best Practices

### ✅ DO:
- Write tests for critical business logic
- Use descriptive test names
- Keep tests focused and isolated
- Mock external dependencies
- Use fixtures for common test data
- Test both happy path and error cases
- Run tests locally before pushing
- Maintain test code quality

### ❌ DON'T:
- Skip tests to merge faster
- Write tests that depend on each other
- Test implementation details, not behavior
- Use real external services in tests
- Commit test data to repositories
- Ignore coverage reports
- Make tests too complex

## Troubleshooting

### Tests Timing Out
```bash
# Increase Jest timeout for integration tests
npm test -- --maxWorkers=1 --testTimeout=30000
```

### Database Connection Issues
```bash
# Verify test database is running
npm run test -- --detectOpenHandles
```

### Import Errors in Tests
```bash
# Clear Jest cache
jest --clearCache
npm test
```

## Next Steps

1. **Write Unit Tests**: Create tests for utility functions and services
2. **Add Integration Tests**: Test critical API flows end-to-end
3. **Increase Coverage**: Aim for 80%+ coverage on critical modules
4. **Monitor Deployments**: Review Slack notifications and Codecov metrics
5. **Optimize Pipeline**: Profile pipeline runs and optimize slow steps

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [TypeScript Testing Best Practices](https://www.typescriptlang.org/docs/handbook/testing.html)
