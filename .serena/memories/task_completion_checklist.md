# Task Completion Checklist

## Before Marking Task Complete

### 1. Type Checking
```bash
vue-tsc -b
```
- Must pass with no errors
- Strict TypeScript rules enforced
- No unused variables or parameters

### 2. Build Verification
```bash
vue-tsc -b && bunx --bun vite build
```
- Ensure production build succeeds
- No build warnings or errors
- Service worker generation successful

### 3. Code Quality
- [ ] No TypeScript errors
- [ ] No unused imports or variables
- [ ] Follows established naming conventions
- [ ] Uses `<script setup>` for Vue components
- [ ] Path aliases (`@/`) used correctly

### 4. PWA Considerations
- [ ] Service worker functionality not broken
- [ ] PWA manifest updated if needed
- [ ] Assets regenerated if icons/splash screens changed

### 5. Documentation
- [ ] CLAUDE.md updated if architecture changes
- [ ] Comments added for complex logic
- [ ] Type definitions complete

### 6. Git Workflow
- [ ] Changes on feature branch (not main)
- [ ] Meaningful commit message
- [ ] `git status` reviewed before commit
- [ ] `git diff` checked for unintended changes

## Common Quality Gates

### TypeScript Strict Mode
All code must satisfy:
- No implicit `any`
- Null/undefined checking
- Strict function types
- No unused locals/parameters

### Vue Component Standards
- Proper reactivity patterns (ref, reactive, computed)
- Type-safe props and emits
- Scoped styles when appropriate

### PWA Standards
- Service worker registration follows manual pattern
- Update notifications properly handled
- Offline functionality maintained