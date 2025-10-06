# shadcn-vue Component System

## Configuration
- **Style**: "new-york" variant (modern, refined)
- **TypeScript**: Enabled
- **Icons**: Lucide via `lucide-vue-next`
- **Styling**: TailwindCSS v4 with CSS variables
- **Base Color**: neutral

## Key Usage Rules
1. **ALWAYS prefer shadcn-vue components** for UI elements
2. Install components with: `bunx shadcn-vue@latest add <component>`
3. Import from `@/components/ui/<component>`
4. Use `cn()` utility from `@/lib/utils` for className merging

## Path Aliases
- `@/components/ui` → UI components location
- `@/lib/utils` → Contains cn() utility

## Available Component Types
- Forms: Button, Input, Select, Checkbox, Radio, etc.
- Overlays: Dialog, Sheet, Popover, Dropdown Menu, etc.
- Data: Card, Badge, Table, Accordion, etc.
- Navigation: Tabs, Breadcrumb, Pagination, etc.
- Feedback: Alert, Toast, Progress, Skeleton, etc.

## Dependencies
- class-variance-authority, clsx, lucide-vue-next, tailwind-merge, tw-animate-css

## Status
- ✅ Fully configured
- ⏳ No components installed yet (ready for on-demand installation)

## Example Usage
```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
</script>

<template>
  <Button variant="default">Click me</Button>
  <Button :class="cn('mt-2', condition && 'bg-blue-500')">Conditional</Button>
</template>
```

For complete documentation, see: claudedocs/shadcn-vue-setup.md
