import { ClientAppChain } from "@proto-kit/sdk";
import runtime from "./runtime";
import { OrderbookExchange } from "./runtime/orderbook/orderbook-exchange";
import { Order } from "./runtime/orderbook/order";
import { OrderId } from "./runtime/orderbook/order-id";
import { OrderPair } from "./runtime/orderbook/order-pair";
import { OrderStatus } from "./runtime/orderbook/order-status";
import { OrderType } from "./runtime/orderbook/order-type";

export const modules = {
  ...runtime.modules,
};

const appChain = ClientAppChain.fromRuntime(modules);

appChain.configurePartial({
  Runtime: runtime.config,
});

export const client = appChain;

export {
  OrderbookExchange,
  Order,
  OrderId,
  OrderPair,
  OrderStatus,
  OrderType,
};