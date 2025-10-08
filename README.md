# Vue + Openlayers as PWA

Vue and Openlayers as Progressive Web App (PWA) with local tile storage for offline mode.

## Technical documentation

The `idb` library uses types and especially type narrowing/type negation very well.
This makes it possible for it to infer the specific keys, schemas, etc. for each store.
For more context on how it works, see this great article on [type negation](https://catchts.com/type-negation#type_negation) or peek at the [source code](node_modules/idb/build/entry.d.ts).