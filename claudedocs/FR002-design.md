# FR002 Implementation Design: Configure Storage Persistence

## Requirement Summary

**FR002: Configure storage persistence**
- User Story: As a user, I want to be sure that my local data won't be deleted.
- Expected Behavior:
  - Settings section with storage type toggle (persistent/non-persistent)
  - Warning symbol on settings button when storage is not persistent
  - Warning symbol in front of toggle switch when storage is not persistent

## Architecture Overview

### Component Structure
```
App.vue
├── PWABadge.vue (existing)
├── SettingsButton.vue (new) - Floating button with warning indicator
└── SettingsPanel.vue (new) - Settings UI with storage toggle
```

### Service Layer
```
composables/
└── useStoragePersistence.ts - Encapsulates Storage API logic and state
```

## Technical Design

### 1. Storage Persistence Composable

**File**: `src/composables/useStoragePersistence.ts`

**Purpose**: Centralized logic for checking and managing storage persistence using the Storage API.

**API Design**:
```typescript
interface StoragePersistenceState {
  isPersistent: Ref<boolean>
  isSupported: Ref<boolean>
  isLoading: Ref<boolean>
  error: Ref<string | null>
}

interface StoragePersistenceActions {
  checkPersistence: () => Promise<void>
  requestPersistence: () => Promise<boolean>
  revokePersistence: () => Promise<void>
}

export function useStoragePersistence(): StoragePersistenceState & StoragePersistenceActions
```

**Key Features**:
- **Browser Support Detection**: Check if `navigator.storage` and `navigator.storage.persist()` exist
- **Persistence Status Checking**: Query current persistence state via `navigator.storage.persisted()`
- **Request Persistence**: Call `navigator.storage.persist()` to request persistent storage
- **Revoke Persistence**: Note - cannot directly revoke, but can inform user to do via browser settings
- **Reactive State**: Use Vue refs for reactive updates across components
- **Auto-check on mount**: Initialize persistence state when composable is first used

**Browser Compatibility Handling**:
- Safari: May not support Storage API on older versions
- Firefox/Chrome: Full support for Storage API
- Fallback: If API unavailable, indicate "not supported" state

### 2. Settings Button Component

**File**: `src/components/SettingsButton.vue`

**Purpose**: Floating action button (FAB) that opens settings panel, displays warning when storage is not persistent.

**UI Design**:
- **Position**: Fixed position (bottom-right or top-right corner)
- **Icon**: Gear/cog icon for settings
- **Warning Indicator**:
  - Small warning badge/dot (⚠️ or yellow/red indicator)
  - Only visible when `!isPersistent && isSupported`
  - Positioned at top-right corner of button
- **Interaction**: Click opens SettingsPanel

**Props**: None (uses composable for state)

**Emits**:
- `open-settings`: Trigger to show settings panel

**Styling**:
- TailwindCSS for positioning and appearance
- Floating button with shadow and hover effects
- Warning indicator with pulsing animation for visibility

### 3. Settings Panel Component

**File**: `src/components/SettingsPanel.vue`

**Purpose**: Modal/drawer UI containing storage persistence toggle and other future settings.

**UI Design**:
- **Layout**: Modal overlay or slide-in drawer from right
- **Header**: "Settings" title with close button
- **Content Sections**:
  1. **Storage Settings Section**
     - Title: "Storage Persistence"
     - Description: "Persistent storage ensures your offline map data won't be deleted by the browser."
     - Toggle Switch with warning icon
     - Status indicator text

**Storage Toggle UI**:
```
[⚠️]  Persistent Storage    [Toggle Switch]
                              OFF/ON
```
- Warning icon (⚠️) only visible when not persistent
- Toggle switch shows current state
- Text label indicates current status: "Storage is persistent" / "Storage is not persistent"

**Props**:
- `isOpen: boolean` - Controls panel visibility

**Emits**:
- `close` - User closes panel
- `update:isOpen` - v-model support

**Interaction Flow**:
1. User opens settings via SettingsButton
2. Panel displays current persistence state
3. User toggles switch:
   - **Enabling**: Calls `requestPersistence()`, updates UI based on result
   - **Disabling**: Shows info message that user must revoke via browser settings
4. Warning indicators update reactively based on state changes

**State Synchronization**:
- Uses `useStoragePersistence()` composable
- Reactive updates when persistence state changes
- Loading state during API calls
- Error handling with user-friendly messages

### 4. App Integration

**File**: `src/App.vue`

**Changes Required**:
- Import SettingsButton and SettingsPanel components
- Add state for controlling settings panel visibility
- Position components in app layout

**Layout**:
```vue
<template>
  <div id="app">
    <PWABadge />

    <!-- Future: Map component goes here -->

    <SettingsButton @open-settings="showSettings = true" />
    <SettingsPanel v-model:isOpen="showSettings" />
  </div>
</template>
```

## Data Flow Diagram

```
User Interaction
      ↓
SettingsButton (click)
      ↓
showSettings = true
      ↓
SettingsPanel (mounted)
      ↓
useStoragePersistence() ← checks navigator.storage.persisted()
      ↓
Display current state + warnings
      ↓
User toggles switch
      ↓
requestPersistence() ← calls navigator.storage.persist()
      ↓
Update isPersistent state
      ↓
UI updates reactively (warnings hide/show)
```

## Implementation Plan

### Phase 1: Storage Composable (Core Logic)
1. Create `src/composables/` directory
2. Implement `useStoragePersistence.ts`
3. Add browser compatibility checks
4. Implement state management with Vue refs
5. Add error handling

### Phase 2: UI Components
1. Create `SettingsButton.vue`
   - Floating button styling
   - Warning indicator badge
   - Click handler to emit event
2. Create `SettingsPanel.vue`
   - Modal/drawer layout
   - Storage toggle section
   - Warning icon integration
   - User-friendly messaging

### Phase 3: Integration
1. Update `App.vue` to include new components
2. Test persistence flow across browser refresh
3. Test warning indicators in different states
4. Handle edge cases (unsupported browsers, permission denied)

### Phase 4: Styling & Polish
1. TailwindCSS utility classes for responsive design
2. Animations for panel open/close
3. Warning indicator pulsing animation
4. Accessibility: ARIA labels, keyboard navigation
5. Mobile-responsive layout

## Browser API Reference

### Storage API Methods
- `navigator.storage.persisted()`: Returns Promise<boolean> - checks if storage is persistent
- `navigator.storage.persist()`: Returns Promise<boolean> - requests persistent storage
- `navigator.storage.estimate()`: Returns storage quota info (useful for future enhancements)

### Permission States
- **Granted**: User/browser allowed persistence, returns `true`
- **Prompt**: Browser will prompt user, may return `true` or `false`
- **Denied**: Browser denied persistence, returns `false`
- **Not Supported**: API not available, requires fallback

## Edge Cases & Error Handling

1. **API Not Supported**:
   - Display message: "Persistent storage not supported in this browser"
   - Hide toggle, show informational text only

2. **Permission Denied**:
   - Show message: "Browser denied persistent storage request"
   - Provide link to browser help documentation

3. **Already Persistent**:
   - Toggle shows ON state
   - No warning indicators visible
   - Informational text: "Storage is persistent"

4. **Disabling Persistence**:
   - Cannot programmatically revoke
   - Show instructions: "To disable persistent storage, clear site data in browser settings"

5. **Network Offline**:
   - API calls should still work (local browser API)
   - No impact expected

## Accessibility Considerations

- **ARIA Labels**: Proper labels for buttons and toggles
- **Keyboard Navigation**: Tab navigation through settings UI
- **Screen Readers**: Announce state changes (persistent/not persistent)
- **Color Contrast**: Warning indicators meet WCAG AA standards
- **Focus Management**: Return focus to settings button when panel closes

## Testing Strategy

### Unit Tests
- `useStoragePersistence.ts`: Mock Storage API, test state transitions
- Component tests: Verify warning indicators based on props/state

### Integration Tests
- Full flow: Open settings → toggle → verify API calls → check UI updates
- Browser compatibility tests across Chrome, Firefox, Safari

### Manual Testing Checklist
- [ ] Warning badge appears on SettingsButton when not persistent
- [ ] Warning icon appears in SettingsPanel toggle when not persistent
- [ ] Toggle switch enables persistence successfully
- [ ] State persists across page refresh
- [ ] Works on mobile devices (responsive)
- [ ] Accessible via keyboard navigation
- [ ] Error messages display correctly when API fails

## Future Enhancements

1. **Storage Quota Display**: Show used/available storage via `navigator.storage.estimate()`
2. **Additional Settings**: Theme toggle, language selection, map defaults
3. **Storage Management**: Clear cached tiles, manage offline data
4. **Permission Status Monitoring**: Listen for permission changes via Permissions API
5. **Onboarding**: Show guide on first visit explaining persistent storage benefits

## File Summary

**New Files**:
- `src/composables/useStoragePersistence.ts` (~100 lines)
- `src/components/SettingsButton.vue` (~80 lines)
- `src/components/SettingsPanel.vue` (~150 lines)

**Modified Files**:
- `src/App.vue` (~20 line changes)

**Total Estimated LOC**: ~350 lines

## Dependencies

**Existing**:
- Vue 3 Composition API
- TailwindCSS v4
- TypeScript

**New**: None required (uses native Web APIs)

## Timeline Estimate

- **Phase 1** (Composable): 2-3 hours
- **Phase 2** (Components): 4-5 hours
- **Phase 3** (Integration): 1-2 hours
- **Phase 4** (Polish): 2-3 hours

**Total**: 9-13 hours of development time
