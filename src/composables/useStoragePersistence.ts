import { ref, onMounted } from 'vue'

export interface StoragePersistenceState {
  isPersistent: Readonly<ReturnType<typeof ref<boolean>>>
  isSupported: Readonly<ReturnType<typeof ref<boolean>>>
  isLoading: Readonly<ReturnType<typeof ref<boolean>>>
  error: Readonly<ReturnType<typeof ref<string | null>>>
}

export interface StoragePersistenceActions {
  checkPersistence: () => Promise<void>
  requestPersistence: () => Promise<boolean>
  revokePersistence: () => Promise<void>
}

export function useStoragePersistence(): StoragePersistenceState & StoragePersistenceActions {
  const isPersistent = ref(false)
  const isSupported = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Check if the Storage API is supported in the current browser
   */
  const checkSupport = (): boolean => {
    return !!(navigator.storage && navigator.storage.persist)
  }

  /**
   * Check the current persistence status
   */
  const checkPersistence = async (): Promise<void> => {
    error.value = null

    if (!isSupported.value) {
      error.value = 'Storage API is not supported in this browser'
      return
    }

    try {
      isLoading.value = true
      const persisted = await navigator.storage.persisted()
      isPersistent.value = persisted
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to check persistence status'
      console.error('Error checking storage persistence:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Request persistent storage from the browser
   * @returns true if persistence was granted, false otherwise
   */
  const requestPersistence = async (): Promise<boolean> => {
    error.value = null

    if (!isSupported.value) {
      error.value = 'Storage API is not supported in this browser'
      return false
    }

    try {
      isLoading.value = true
      const granted = await navigator.storage.persist()

      if (granted) {
        isPersistent.value = true
      } else {
        error.value = 'Browser denied persistent storage request. You may need to enable this in your browser settings.'
      }

      return granted
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to request persistent storage'
      console.error('Error requesting storage persistence:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Revoke persistent storage
   * Note: Cannot be done programmatically. User must clear site data via browser settings.
   */
  const revokePersistence = async (): Promise<void> => {
    error.value = 'Persistent storage cannot be revoked programmatically. Please clear site data in your browser settings to disable persistence.'
  }

  // Initialize on composable creation
  onMounted(async () => {
    isSupported.value = checkSupport()

    if (isSupported.value) {
      await checkPersistence()
    }
  })

  return {
    // State (readonly refs)
    isPersistent: isPersistent as Readonly<typeof isPersistent>,
    isSupported: isSupported as Readonly<typeof isSupported>,
    isLoading: isLoading as Readonly<typeof isLoading>,
    error: error as Readonly<typeof error>,

    // Actions
    checkPersistence,
    requestPersistence,
    revokePersistence,
  }
}
