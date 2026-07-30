// role: application, platform: browser — browser globals are the declared
// surface; worker-only and server-runtime globals stay rejected.

export const heading = document.querySelector("h1");

export const origin = window.location.origin;

export const agent = navigator.userAgent;
