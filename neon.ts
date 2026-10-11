import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  buckets: {
    coltbucket: { access: "private" },
  },
  functions: {
    api: { name: "api", source: "./hello.ts" },
  },
});
