// Statically computed access still identifies the ambient console.

globalThis["console"].info("computed"); // expect: no-ambient-console
