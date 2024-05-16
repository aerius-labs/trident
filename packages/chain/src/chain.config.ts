import { LocalhostAppChain } from "@proto-kit/cli";
import runtime from "./runtime";

export const modules = {
  ...runtime.modules,
};

const appChain = LocalhostAppChain.fromRuntime(modules);

appChain.configure({
  ...appChain.config,
  Runtime: runtime.config,
});

export default appChain as any;