var messageCount = 0;

function message() {
  messageCount++;
  const currentCount = messageCount;
  return new Promise((resolve) => resolve(`Nachricht ${currentCount}`));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function* promiseGenerator(count) {
  for (let i = 0; i < count; i++) {
    yield sleep(3000).then(message);
  }
}

async function* generator(promiseGenerator, maxConcurrent) {
  if (maxConcurrent < 1) {
    throw new Error("Value error: 'maxConcurrent' cannot be smaller than 1.");
  }

  const pendingPromises = new Set();

  function queuePromise(promise) {
    console.log("--- queueing ---");
    pendingPromises.add(promise);
    promise.then(() => pendingPromises.delete(promise));
  }

  function getNextResolved() {
    return Promise.race(pendingPromises);
  }

  for (const promise of promiseGenerator) {
    queuePromise(promise);
    console.log("Queue Size:", pendingPromises.size);

    while (pendingPromises.size >= maxConcurrent) {
      yield getNextResolved();
    }
  }

  while (pendingPromises.size > 0) {
    yield getNextResolved();
    console.log("Queue Size:", pendingPromises.size);
  }
}

var startedTimestamp = Date.now();
for await (const promise of generator(promiseGenerator(5), 2)) {
  console.log(`[For Loop at ${Date.now() - startedTimestamp}]`, promise);
}
console.log("Done!")
