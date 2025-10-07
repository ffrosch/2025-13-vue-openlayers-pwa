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

        const areas = db.createObjectStore("areas");

        const tiles = db.createObjectStore("tiles");
      }
    },
  });

  db.then((db) => {
    db.onerror = (event) => {
      // Generic error handler for all errors targeted at this database's
      // requests!
      console.error(`Database error: ${event.target?.error?.message}`);
    };

    db.onclose = (event) => {
      console.log(`DB closed unexpectedly: ${event.target?.error?.message}`);
    };
  });

  return db;
};
