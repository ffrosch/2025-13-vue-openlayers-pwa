<script setup lang="ts">
import { getDb } from '@/services/idb';
import { createUseIDBStore } from '@/composables/useIdb';
import { Button } from '@/components/ui/button';

const { useIDBDB, useIDBStore } = createUseIDBStore(getDb());
const { transactions: dbTransactions } = useIDBDB();
const { data, isLoading, transactions } = useIDBStore('reports', { fetchData: true });

const addReportViaDbTransactions = async () => {
  await dbTransactions('readwrite', stores => {
    return [stores.reports.add({ species_id: 1, observation_type_id: 1, date: new Date() })];
  });
};

const addReport = async () => {
  await transactions('readwrite', store => {
    return [store.add({ species_id: 1, observation_type_id: 1, date: new Date() })];
  });
};
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div class="bg-white rounded-lg shadow-lg p-8">
      <!-- Header with Add Button -->
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-semibold text-gray-700">
          Reports ({{ data?.length }})
        </h2>
        <Button @click="addReportViaDbTransactions">
          Add New Report via DB Transactions
        </Button>
        <Button @click="addReport">
          Add New Report
        </Button>
      </div>

      <!-- Reports List -->
      <div
          v-if="isLoading"
          class="text-center text-gray-500"
      >
        Loading reports...
      </div>
      <div
          v-else-if="!data || data.length === 0"
          class="text-center text-gray-500"
      >
        No reports yet. Click "Add New Report" to create one.
      </div>
      <div
          v-else
          class="space-y-3"
      >
        <div
            v-for="(report, index) in data"
            :key="index"
            class="flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div>
            <span class="font-medium text-gray-700">Report #{{ index + 1 }}</span>
          </div>
          <div class="text-sm text-gray-500">
            {{ new Date(report.date).toLocaleDateString() }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
