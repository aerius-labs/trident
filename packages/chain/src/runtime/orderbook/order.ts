import { Balance, TokenId, UInt64 } from "@proto-kit/library";
import {Provable, PublicKey, Struct, Field, Bool} from "o1js";
import { OrderId } from "./order-id";
import { OrderStatus } from "./order-status";
import { OrderType } from "./order-type";

export class Order extends Struct({
    id: OrderId,
    price: Field,  // Changed from number to Field
    quantity: Field,  // Changed from number to Field
    baseToken: TokenId,
    quoteToken: TokenId,
    sender: PublicKey,
    status: OrderStatus,
    isBuy: Bool,  // Changed from orderType to isBuy
    timestamp: UInt64,
}) {
    static createEmptyOrder(): Order {
        return new Order({
            id: OrderId.from(Field(0)),
            price: Field(0),
            quantity: Field(0),
            baseToken: TokenId.from(Field(0)),
            quoteToken: TokenId.from(Field(0)),
            sender: PublicKey.empty(),
            status: OrderStatus.pending(),
            isBuy: Bool(false),
            timestamp: UInt64.from(0)
        });
    }
}