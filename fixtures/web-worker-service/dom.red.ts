// role: service, platform: web-worker — DOM window/document globals do not
// exist in a worker.

export const el = document.createElement("div"); // expect: no-cross-runtime

export const width = window.innerWidth; // expect: no-cross-runtime
