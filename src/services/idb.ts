import { openDB } from "idb";
import type { DBSchema } from "idb";

export interface MyDB extends DBSchema {
  reports: {
    key: number;
    value: {
      species_id: number;
      observation_type_id: number;
      date: Date;
    };
    indexes: { "by-date": Date };
  };
  areas: {
    key: string;
    value: {
      bbox: [number, number, number, number];
      minZoom: number;
      maxZoom: number;
    };
  };
  tiles: {
    key: string;
    value: Blob;
  };
}

const dbName = "OfflineFieldData";
const dbVersion = 1;

export const getDb = async () => {
  const db = openDB<MyDB>(dbName, dbVersion, {
    // @ts-expect-error - unused parameters required by idb upgrade callback signature
    upgrade(db, oldVersion, newVersion, transaction, event) {
      if (newVersion === 1) {
        const reports = db.createObjectStore("reports", {
          // The 'id' property of the object will be the key.
          keyPath: "id",
          // If it isn't explicitly set, create a value by auto incrementing.
          autoIncrement: true,
        });
        // Create an index on the 'date' property of the objects.
        reports.createIndex("by-date", "date");

        // @ts-expect-error - unused variable for future use
        const areas = db.createObjectStore("areas");

        // @ts-expect-error - unused variable for future use
        const tiles = db.createObjectStore("tiles");
      }
    },
  });

  db.then((db) => {
    db.onerror = (event) => {
      // Generic error handler for all errors targeted at this database's
      // requests!
      // @ts-expect-error - event.target.error exists on IDBRequest
      console.error(`Database error: ${event.target?.error?.message}`);
    };

    db.onclose = (event) => {
      // @ts-expect-error - event.target.error exists on IDBRequest
      console.log(`DB closed unexpectedly: ${event.target?.error?.message}`);
    };
  });

  return db;
};
