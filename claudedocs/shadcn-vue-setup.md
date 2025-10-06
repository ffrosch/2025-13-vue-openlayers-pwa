# shadcn-vue Setup and Usage

**Date**: 2025-10-06
**Status**: Configured and ready for component installation

## Configuration

shadcn-vue is fully configured in this project with the following settings:

### components.json Configuration
- **Style Variant**: "new-york" - Modern, refined component styling
- **TypeScript**: Enabled (all components are TypeScript-ready)
- **Icon Library**: Lucide icons via `lucide-vue-next`
- **Tailwind Integration**: CSS variables enabled, neutral base color
- **CSS File**: src/style.css

### Path Aliases
```
@/components → src/components
@/components/ui → src/components/ui (shadcn components)
@/lib → src/lib
@/lib/utils → src/lib/utils
@/composables → src/composables
```

### Dependencies Installed
- `class-variance-authority`: ^0.7.1 - CVA for variant styling
- `clsx`: ^2.1.1 - Conditional className utilities
- `lucide-vue-next`: ^0.545.0 - Icon library
- `tailwind-merge`: ^3.3.1 - Smart Tailwind class merging
- `tw-animate-css`: ^1.4.0 - Animation utilities

## Usage Guidelines

### When to Use shadcn-vue
**ALWAYS prefer shadcn-vue components** for:
- Buttons, forms, inputs, selects
- Dialogs, modals, sheets, popovers
- Cards, badges, alerts, toasts
- Navigation (tabs, menus, dropdowns)
- Data display (tables, data tables)
- Layout components (separator, aspect-ratio)

### Installing Components
```bash
# Add a single component
bunx shadcn-vue@latest add button

# Add multiple components at once
bunx shadcn-vue@latest add button card dialog

# View all available components
bunx shadcn-vue@latest add
```

### Using Components in Code
```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
</script>

<template>
  <Card>
    <CardHeader>Example</CardHeader>
    <CardContent>
      <Button variant="default">Click me</Button>
      <Button :class="cn('mt-2', someCondition && 'bg-blue-500')">
        Conditional styling
      </Button>
    </CardContent>
  </Card>
</template>
```

### cn() Utility Function
The `cn()` helper in `@/lib/utils` merges className strings intelligently:
- Combines clsx for conditional classes
- Uses tailwind-merge to resolve conflicting Tailwind classes
- Essential for component composition and conditional styling

```typescript
import { cn } from '@/lib/utils'

// Conditional classes
cn('px-4 py-2', isActive && 'bg-blue-500')

// Merge with Tailwind conflicts resolved
cn('px-4 py-2', props.class) // Later classes override earlier ones
```

## Available Component Categories

### Form Components
- Button, Input, Textarea, Select, Checkbox, Radio, Switch
- Label, Form (with validation), Combobox, Command

### Overlay Components
- Dialog, Sheet, Popover, Dropdown Menu, Context Menu, Hover Card
- Alert Dialog, Tooltip

### Data Display
- Card, Badge, Avatar, Separator, Aspect Ratio
- Table, Data Table, Accordion, Collapsible

### Navigation
- Tabs, Navigation Menu, Menubar, Breadcrumb
- Pagination, Scroll Area

### Feedback
- Alert, Toast, Progress, Skeleton, Spinner

### Utility
- Calendar, Date Picker, Slider, Toggle, Toggle Group
- Resizable, Sonner (toast notifications)

## Current Status

- ✅ shadcn-vue configured
- ✅ Dependencies installed
- ✅ Path aliases set up
- ✅ cn() utility available
- ✅ TypeScript support enabled
- ⏳ No UI components installed yet (ready for installation as needed)

## Best Practices

1. **Always use shadcn-vue first**: Before creating custom UI components, check if shadcn-vue has a suitable component
2. **Install only what you need**: Components are copied to your project, so only add components you'll actually use
3. **Use cn() for styling**: Leverage the cn() utility for all conditional and merged className logic
4. **Follow variant patterns**: shadcn components use CVA variants - follow these patterns for consistency
5. **Customize when needed**: Components are in your codebase, so you can customize them directly if needed

## Example: Creating a Feature with shadcn-vue

```bash
# 1. Identify needed components
# For a login form: Button, Input, Card, Label

# 2. Install components
bunx shadcn-vue@latest add button input card label

# 3. Use in your component
```

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const handleLogin = () => {
  // Login logic
}
</script>

<template>
  <Card class="w-full max-w-md">
    <CardHeader>
      <CardTitle>Login</CardTitle>
    </CardHeader>
    <CardContent>
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <Label for="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
        </div>
        <div>
          <Label for="password">Password</Label>
          <Input id="password" type="password" />
        </div>
        <Button type="submit" class="w-full">Sign In</Button>
      </form>
    </CardContent>
  </Card>
</template>
```

## Resources

- [shadcn-vue Documentation](https://shadcn-vue.com)
- [Lucide Icons](https://lucide.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
