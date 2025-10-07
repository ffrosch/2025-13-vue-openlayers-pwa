/**
 * @fileoverview Vue composable for reactive IndexedDB store management.
 *
 * Provides a type-safe, reactive interface for IndexedDB operations with automatic
 * data synchronization after mutations.
 *
 * @example Complete Usage Example
 * ```ts
 * // 1. Define your database schema (services/idb.ts)
 * import { openDB, type DBSchema } from 'idb';
 *
 * interface MyDB extends DBSchema {
 *   books: {
 *     key: number;
 *     value: {
 *       title: string;
 *       author: string;
 *       year: number;
 *     };
 *   };
 * }
 *
 * export const getDb = () => openDB<MyDB>('MyDatabase', 1, {
 *   upgrade(db) {
 *     db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
 *   }
 * });
 *
 * // 2. Create the composable factory (App.vue or main setup)
 * import { createUseIDBStore } from '@/composables/useIdb';
 * import { getDb } from '@/services/idb';
 *
 * const { useIDBStore } = createUseIDBStore(getDb());
 *
 * // 3. Use in components
 * const { data, isLoading, fetchAll, transactions } = useIDBStore('books');
 *
 * // 4. Perform operations
 * // Add records
 * await transactions('readwrite', (store) => [
 *   store.add({ title: '1984', author: 'George Orwell', year: 1949 })
 * ]);
 *
 * // Query data reactively
 * watchEffect(() => {
 *   if (data.value) {
 *     console.log(`Found ${data.value.length} books`);
 *   }
 * });
 * ```
 */

import type {
  IDBPDatabase,
  IDBPObjectStore,
  StoreKey,
  StoreNames,
  StoreValue,
  DBSchema,
} from "idb";
import { ref, reactive, watch, onUnmounted, type Ref } from "vue";

interface StoreOptions {
  /** Whether to automatically fetch all data on initialization. Defaults to `true`. */
  fetchData?: boolean;
}

/**
 * Factory function that creates a composable for managing IndexedDB stores.
 *
 * @template DBTypes - The database schema type extending DBSchema
 * @param getDb - Promise that resolves to the IDBPDatabase instance
 * @returns Object containing the `useIDBStore` composable function
 *
 * @example
 * ```ts
 * import { createUseIDBStore } from '@/composables/useIdb';
 * import { getDb } from '@/services/idb';
 *
 * // Create the composable factory
 * const { useIDBStore } = createUseIDBStore(getDb());
 *
 * // Use in components
 * const { data, isLoading, fetchAll, transactions } = useIDBStore('books');
 * ```
 */
export function createUseIDBStore<DBTypes extends DBSchema>(
  getDb: Promise<IDBPDatabase<DBTypes>>
) {
  // BroadcastChannel for cross-tab communication
  const channel = new BroadcastChannel('idb-store-updates');

  // Reactive map for same-tab updates: storeName -> version counter
  const storeVersions = reactive(new Map<string, number>());

  function notifyUpdate(storeName: string) {
    // Increment version to trigger reactivity (same-tab)
    const currentVersion = storeVersions.get(storeName) ?? 0;
    storeVersions.set(storeName, currentVersion + 1);

    // Notify other tabs via BroadcastChannel
    channel.postMessage({
      type: 'store-updated',
      storeName
    });
  }

  function useIDBDB() {
    type StoresMap<TransactionMode extends IDBTransactionMode> = {
      [K in StoreNames<DBTypes>]: IDBPObjectStore<
        DBTypes,
        StoreNames<DBTypes>[],
        K,
        TransactionMode
      >;
    };

    async function transactions<TransactionMode extends IDBTransactionMode>(
      mode: TransactionMode,
      callback: (stores: StoresMap<TransactionMode>) => Promise<any>[]
    ): Promise<void> {
      const db = await getDb;
      const storeNames = Array.from(db.objectStoreNames) as StoreNames<DBTypes>[];
      const tx = db.transaction(storeNames, mode);
      const stores = Object.fromEntries(
        storeNames.map((name) => [name, tx.objectStore(name)])
      ) as StoresMap<TransactionMode>;
      const actions = [...callback(stores), tx.done];

      try {
        await Promise.all(actions);

        // Notify all tabs about updates (including this one)
        if (mode === 'readwrite' || mode === 'versionchange') {
          for (const storeName of storeNames) {
            notifyUpdate(storeName as string);
          }
        }
      } catch (error) {
        console.error(`Transaction failed:`, error);
        throw error;
      }
    }

    return { transactions };
  }

  /**
   * Vue composable for reactive IndexedDB store operations.
   *
   * @template StoreName - The name of the store from the database schema
   * @param storeName - Name of the IndexedDB object store to interact with
   * @param options - Configuration options for store behavior
   * @returns Reactive store interface with data, loading state, and operation methods
   *
   * @example
   * ```ts
   * // Auto-fetch data on mount
   * const { data, isLoading } = useIDBStore('books');
   *
   * // Disable auto-fetch
   * const { data, fetchAll } = useIDBStore('books', { fetchData: false });
   * await fetchAll(); // Manually trigger fetch
   * ```
   */
  function useIDBStore<StoreName extends StoreNames<DBTypes>>(
    storeName: StoreName,
    options: StoreOptions = {}
  ) {
    const { fetchData = true } = options;

    /** Reactive array of all records in the store, or `null` if not yet fetched */
    const data: Ref<StoreValue<DBTypes, StoreName>[] | null> = ref(null);

    /** Reactive loading state indicator */
    const isLoading = ref(false);

    /**
     * Fetches all records from the IndexedDB store and updates reactive `data`.
     *
     * @throws {Error} If database connection fails
     *
     * @example
     * ```ts
     * const { data, fetchAll } = useIDBStore('books', { fetchData: false });
     *
     * // Manually trigger fetch
     * await fetchAll();
     * console.log(data.value); // Array of all books
     * ```
     */
    async function fetchAll(): Promise<void> {
      const db = await getDb;
      isLoading.value = true;
      try {
        data.value = await db.getAll(storeName);
      } finally {
        isLoading.value = false;
      }
    }

    /**
     * Internal helper to refresh data after mutations.
     * Only updates if data was previously fetched (not null).
     *
     * @internal
     */
    async function _updateData(): Promise<void> {
      // Only refresh if data was previously fetched (not null)
      if (data.value !== null) {
        await fetchAll();
      }
    }

    /**
     * Executes multiple IndexedDB operations in a single transaction.
     * Automatically refreshes reactive `data` after successful commit.
     *
     * @template TransactionMode - Transaction mode: 'readonly' | 'readwrite' | 'versionchange'
     * @param mode - Transaction mode determining operation permissions
     * @param callback - Function receiving the object store and returning array of promises
     * @returns Promise that resolves when transaction completes
     * @throws {Error} If transaction fails or database not initialized
     *
     * @example
     * ```ts
     * const { transactions } = useIDBStore('books');
     *
     * // Add multiple records atomically
     * await transactions('readwrite', (store) => [
     *   store.add({ title: '1984', author: 'George Orwell', year: 1949 }),
     *   store.add({ title: 'Brave New World', author: 'Aldous Huxley', year: 1932 })
     * ]);
     *
     * // Update and delete in same transaction
     * await transactions('readwrite', (store) => [
     *   store.put({ id: 1, title: '1984', author: 'George Orwell', year: 1949 }),
     *   store.delete(2)
     * ]);
     *
     * // Read operations (use 'readonly' for better performance)
     * await transactions('readonly', (store) => [
     *   store.get(1),
     *   store.count()
     * ]);
     * ```
     */
    async function transactions<TransactionMode extends IDBTransactionMode>(
      mode: TransactionMode,
      callback: (
        store: IDBPObjectStore<DBTypes, [StoreName], StoreName, TransactionMode>
      ) => Promise<StoreKey<DBTypes, StoreName>>[]
    ): Promise<void> {
      const db = await getDb;
      const tx = db.transaction(storeName, mode);
      const actions = [...callback(tx.store), tx.done];

      try {
        await Promise.all(actions);
        await _updateData();
      } catch (error) {
        console.error(
          `Transaction failed for store "${storeName as string}":`,
          error
        );
        throw error;
      }
    }

    // Watch for same-tab updates (reactive version changes)
    watch(
      () => storeVersions.get(storeName as string),
      () => {
        if (data.value !== null) {
          fetchAll();
        }
      }
    );

    // Listen for cross-tab updates (from BroadcastChannel)
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'store-updated' && event.data.storeName === storeName) {
        if (data.value !== null) {
          fetchAll();
        }
      }
    };
    channel.addEventListener('message', handleMessage);

    // Cleanup on unmount
    onUnmounted(() => {
      channel.removeEventListener('message', handleMessage);
    });

    // Auto-fetch on initialization if requested
    if (fetchData) {
      fetchAll();
    }

    return {
      /** Reactive array of store records, `null` until first fetch */
      data,
      /** Reactive loading state indicator */
      isLoading,
      /** Manually fetch all records from the store */
      fetchAll,
      /** Execute atomic transactions with automatic data refresh */
      transactions,
    };
  }

  return { useIDBDB, useIDBStore };
}
