# Quick Reference Checklist

## 🎯 Before Starting Development

### Initial Setup (First Time Only)
```bash
# Install dependencies
npm install

# Verify TypeScript compiles
npm run type-check

# Run linter to check code quality
npm run lint

# Run all tests
npm test
```

### Daily Development Workflow
```bash
# Start development server
npm run dev

# In another terminal - watch for changes and test
npm run test:watch

# Before committing - format and lint
npm run format
npm run lint:fix
```

---

## 🧪 Testing Checklist

### Before Submitting a Pull Request
- [ ] Code passes TypeScript check: `npm run type-check`
- [ ] Code passes linter: `npm run lint`
- [ ] All tests pass: `npm test`
- [ ] Code is formatted: `npm run format`
- [ ] New features have test coverage
- [ ] No console.error or console.log left in code (use logger instead)
- [ ] Updated Swagger documentation for new endpoints

### Running Specific Tests
```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests in watch mode for TDD
npm run test:watch

# Generate coverage report
npm run test:coverage
```

---

## 🔐 Security Checklist

### Endpoint Validation
- [ ] All endpoints have request validation
- [ ] Body validation: `validateBody(schema)`
- [ ] Params validation: `validateParams(schema)`
- [ ] Query validation: `validateQuery(schema)`
- [ ] Authentication: `authenticate` middleware applied

### Password Requirements
- [ ] Minimum 8 characters
- [ ] At least 1 uppercase letter
- [ ] At least 1 lowercase letter
- [ ] At least 1 number
- [ ] Example: `ValidPassword123`

### API Security
- [ ] Rate limiting on sensitive endpoints (auth)
- [ ] CORS properly configured for your domain
- [ ] JWT tokens in Authorization header: `Authorization: Bearer <token>`
- [ ] Tokens expire after 24 hours
- [ ] Refresh tokens available for extending sessions

---

## 📝 Adding New Endpoints

### Step-by-Step Guide

1. **Create Validation Schema**
   ```typescript
   // src/modules/myfeature/validation/myfeature.validation.ts
   import { z } from 'zod';
   
   export const createMyFeatureSchema = z.object({
     name: z.string().min(1, "Name is required"),
     email: z.string().email("Invalid email"),
     // Add more fields...
   });
   ```

2. **Update Routes with Validation**
   ```typescript
   // src/modules/myfeature/routes/myfeature.routes.ts
   import { validateBody } from '../../../shared/middlewares/validation.middleware';
   import { authenticate } from '../../../shared/middlewares/auth.middleware';
   import { createMyFeatureSchema } from '../validation/myfeature.validation';
   
   router.post(
     '/',
     authenticate,                              // Add auth check
     validateBody(createMyFeatureSchema),       // Add validation
     controller.create                          // Call handler
   );
   ```

3. **Add Swagger Documentation**
   ```typescript
   /**
    * @swagger
    * /myfeature:
    *   post:
    *     summary: Create feature
    *     tags: [MyFeature]
    *     security:
    *       - bearerAuth: []
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateMyFeatureRequest'
    *     responses:
    *       201:
    *         description: Created successfully
    */
   ```

4. **Write Tests**
   ```typescript
   // src/tests/integration/myfeature.test.ts
   describe('MyFeature API', () => {
     it('should create feature with valid data', async () => {
       // Test implementation
     });
   
     it('should reject invalid data', async () => {
       // Test validation errors
     });
   });
   ```

---

## 🚀 Common Commands Reference

| Command | Purpose | When to Use |
|---------|---------|-----------|
| `npm run dev` | Start dev server | During development |
| `npm run type-check` | Check TypeScript | Before committing |
| `npm run lint` | Check code quality | Before committing |
| `npm run lint:fix` | Auto-fix linting issues | Before committing |
| `npm run format` | Format code with Prettier | Before committing |
| `npm test` | Run all tests | Before committing |
| `npm run test:watch` | Run tests in watch mode | During TDD |
| `npm run test:coverage` | Generate coverage report | Review test coverage |
| `npm run build` | Build for production | Before deployment |
| `npm start` | Run built application | Production only |

---

## 🔍 Debugging Tips

### Enable Debug Logging
```bash
# See all debug output
DEBUG=* npm run dev

# See only specific module
DEBUG=peladeiro:* npm run dev
```

### Test a Single File
```bash
npm test -- src/tests/unit/my.test.ts
```

### Test a Single Test Case
```bash
npm test -- -t "should create user"
```

### Check What Tests Changed
```bash
npm test -- --onlyChanged
```

---

## 📊 Code Structure Rules

### ✅ DO:
- Keep controllers small - 1 responsibility per method
- Use services for business logic
- Validate all inputs at route level
- Write tests for important logic
- Use TypeScript types, avoid `any`
- Use async/await, not callbacks
- Keep functions under 20 lines if possible
- Use meaningful variable names

### ❌ DON'T:
- Put business logic in controllers
- Skip validation on any endpoint
- Use `any` type (use `unknown` and narrow)
- Mix business logic and HTTP concerns
- Commit without running tests
- Add `console.log` (use logger instead)
- Create functions longer than 30 lines
- Ignore TypeScript errors

---

## 🎯 PR Checklist

Before creating a Pull Request:

- [ ] Feature branch created from `develop`
- [ ] Code follows project structure
- [ ] All validation added to endpoints
- [ ] Tests written and passing
- [ ] No TypeScript errors: `npm run type-check`
- [ ] No linting errors: `npm run lint`
- [ ] Code formatted: `npm run format`
- [ ] Swagger docs updated
- [ ] Breaking changes documented
- [ ] No secrets in code
- [ ] PR description explains changes
- [ ] Related issue referenced

---

## 🐛 Troubleshooting

### Tests Not Running
```bash
# Clear Jest cache
jest --clearCache
npm test
```

### TypeScript Errors
```bash
# Check for configuration issues
npm run type-check

# Rebuild type definitions
rm -rf dist/
npm run type-check
```

### Linting Errors
```bash
# Auto-fix most issues
npm run lint:fix

# For remaining issues, follow eslint output
```

### Database Connection Issues
```bash
# Check environment variables in .env
# Verify database is running
# Check DATABASE_URL format: postgresql://user:pass@host:port/db
```

---

## 📞 Getting Help

1. **Check Documentation**: [TESTING_CICD_SETUP.md](TESTING_CICD_SETUP.md)
2. **Review Test Examples**: [src/tests/](src/tests/)
3. **Check Implementation**: [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)
4. **Search Code**: Use VSCode search for similar patterns
5. **Ask Team**: Post in team channel with specific error

---

## 🎓 Learning Resources

### Essential Reading
- [Validation Guide](TESTING_CICD_SETUP.md#test-structure)
- [Security Features](IMPLEMENTATION_COMPLETE.md#-phase-1-security--validation-complete)
- [Testing Examples](TESTING_CICD_SETUP.md#example-test-setup)

### External Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Zod Validation](https://zod.dev/)
- [Jest Testing](https://jestjs.io/docs/getting-started)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)

---

**Last Updated**: 2024
**Status**: Active - All features implemented and documented
**Questions?** Check the documentation files or ask in team channel
