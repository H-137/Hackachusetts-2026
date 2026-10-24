/// <reference types="vite/client" />

// Vite's `?raw` suffix imports a file's contents as a string at build time.
declare module "*?raw" {
  const content: string;
  export default content;
}
