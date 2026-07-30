// role: service, platform: web-worker — the worker surface (self, location,
// navigator) is admitted.

export const scope = self;

export const href = location.href;

export const agent = navigator.userAgent;
