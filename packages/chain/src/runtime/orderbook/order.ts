import { Balance, TokenId, UInt64 } from "@proto-kit/library";
import { Provable, PublicKey, Struct } from "o1js";
import { OrderId } from "./order-id";
import { OrderStatus } from "./order-status";
import { OrderType } from "./order-type";

export class Order extends Struct({
    id: OrderId,
    tokenIdIn: TokenId,
    tokenIdOut: TokenId,
    amountIn: Balance,
    amountOut: Balance,
    sender: PublicKey,
    status: OrderStatus,
    orderType: OrderType,
    timestamp: UInt64,
}) {}