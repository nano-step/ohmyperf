export const PACKAGE_NAME = "@ohmyperf/plugins-builtin" as const;

export { cwvPlugin, type CwvPluginOptions } from "./cwv.js";
export { axePlugin, type AxePluginOptions } from "./axe.js";
export {
  customMetricExamplePlugin,
  type CustomMetricExampleOptions,
} from "./custom-metric-example.js";
export {
  thirdPartiesPlugin,
  type ThirdPartiesPluginOptions,
} from "./third-parties.js";
