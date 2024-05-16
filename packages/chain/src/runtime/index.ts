import { Balance, VanillaRuntimeModules } from "@proto-kit/library";
import { ModulesConfig } from "@proto-kit/common";
import { Balances } from "./balances";
import { OrderbookExchange } from "./orderbook/orderbook-exchange";
import {Faucet} from "./faucet";

export const modules = {
    Faucet,
    Balances,
    OrderbookExchange,
};

export const config: ModulesConfig<
    ReturnType<typeof VanillaRuntimeModules.with<typeof modules>>
    > = {
    Balances: {
        totalSupply: Balance.from(1_000_000_000),
    },
    Faucet: {},
    OrderbookExchange: {},
};

export default {
    modules,
    config,
};