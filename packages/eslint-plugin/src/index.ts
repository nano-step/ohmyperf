import type { ESLint, Linter, Rule } from "eslint";
import { noDocumentWrite } from "./rules/no-document-write.js";
import { noSyncXhr } from "./rules/no-sync-xhr.js";
import { noLargeInlineDataUrl } from "./rules/no-large-inline-data-url.js";
import { preferLoadingLazy } from "./rules/prefer-loading-lazy.js";
import { preferFetchpriority } from "./rules/prefer-fetchpriority.js";
import { noRenderBlockingScriptInHead } from "./rules/no-render-blocking-script-in-head.js";
import { noPassiveEventViolation } from "./rules/no-passive-event-violation.js";

const RULES: Record<string, Rule.RuleModule> = {
  "no-document-write": noDocumentWrite,
  "no-sync-xhr": noSyncXhr,
  "no-large-inline-data-url": noLargeInlineDataUrl,
  "prefer-loading-lazy": preferLoadingLazy,
  "prefer-fetchpriority": preferFetchpriority,
  "no-render-blocking-script-in-head": noRenderBlockingScriptInHead,
  "no-passive-event-violation": noPassiveEventViolation,
};

const PLUGIN_NAME = "ohmyperf";

const recommendedRules: Linter.RulesRecord = {
  [`${PLUGIN_NAME}/no-document-write`]: "error",
  [`${PLUGIN_NAME}/no-sync-xhr`]: "error",
  [`${PLUGIN_NAME}/no-large-inline-data-url`]: "warn",
  [`${PLUGIN_NAME}/prefer-loading-lazy`]: "warn",
  [`${PLUGIN_NAME}/prefer-fetchpriority`]: "warn",
  [`${PLUGIN_NAME}/no-render-blocking-script-in-head`]: "warn",
  [`${PLUGIN_NAME}/no-passive-event-violation`]: "warn",
};

const plugin: ESLint.Plugin = {
  meta: {
    name: "@ohmyperf/eslint-plugin",
    version: "0.1.0",
  },
  rules: RULES,
  configs: {},
};

plugin.configs!["recommended"] = {
  plugins: { [PLUGIN_NAME]: plugin },
  rules: recommendedRules,
};

plugin.configs!["legacy-recommended"] = {
  plugins: [PLUGIN_NAME],
  rules: recommendedRules,
};

export default plugin;
export { RULES, recommendedRules };
