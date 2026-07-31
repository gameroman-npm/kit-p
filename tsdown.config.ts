import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  exports: true,
  inputOptions: { experimental: { attachDebugInfo: "none" } },
});
