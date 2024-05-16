import {Balance, TokenId, UInt64} from "@proto-kit/library";
import { Order } from "./order";
import { OrderPair } from "./order-pair";
import { OrderStatus } from "./order-status";
import { OrderType } from "./order-type";
import {bigIntMin} from "./utils";
import * as console from "console";
import {Field, Provable, PublicKey, Struct} from "o1js";
import {OrderId} from "./order-id";

export const MATCHED_ORDERS_LEN = 2
export class MatchedOrders extends Struct({
    orders: Provable.Array(Order, MATCHED_ORDERS_LEN),
}) {
    public static from(orders: Order[]) {
        return new MatchedOrders({ orders });
    }
}

export class OrderMatchingEngine {
    buyOrders: Map<string, Map<string, Order>>;
    sellOrders: Map<string, Map<string, Order>>;

    constructor() {
        this.buyOrders = new Map();
        this.sellOrders = new Map();
    }

    public addOrder(order: Order): void {
        const orderPair = new OrderPair(order.tokenIdIn.toString(), order.tokenIdOut.toString());
        if (order.orderType.toString() === OrderType.buy().toString()) {
            this.addBuyOrder(orderPair, order);
        } else if (order.orderType.toString() === OrderType.sell().toString()) {
            this.addSellOrder(orderPair, order);
        }
    }

    private addBuyOrder(orderPair: OrderPair, order: Order): void {
        const key = JSON.stringify(orderPair);
        let orders = this.buyOrders.get(key);
        if (!orders) {
            orders = new Map();
        } else if (orders.has(order.id.toString()))  {
            return;
        }
        orders.set(order.id.toString(), order);
        this.buyOrders.set(key, orders);
    }

    private addSellOrder(orderPair: OrderPair, order: Order): void {
        const key = JSON.stringify(orderPair);
        let orders = this.sellOrders.get(key);
        if (!orders) {
            orders = new Map();
        } else if (orders.has(order.id.toString()))  {
            return;
        }
        orders.set(order.id.toString(), order);
        this.sellOrders.set(key, orders);
    }

    public removeOrder(order: Order): void {
        const orderPair = new OrderPair(order.tokenIdIn.toString(), order.tokenIdOut.toString());
        if (order.orderType.toString() === OrderType.buy().toString()) {
            this.removeBuyOrder(orderPair, order);
        } else if (order.orderType.toString() === OrderType.sell().toString()) {
            this.removeSellOrder(orderPair, order);
        }
    }

    private removeBuyOrder(orderPair: OrderPair, order: Order): void {
        const key = JSON.stringify(orderPair);
        const orders = this.buyOrders.get(key);
        if (!orders) {
            return;
        }
        const updatedOrders = new Map([...orders].filter(([id, _o]) => id !== order.id.toString()));
        this.buyOrders.set(key, updatedOrders);
    }

    private removeSellOrder(orderPair: OrderPair, order: Order): void {
        const key = JSON.stringify(orderPair);
        const orders = this.sellOrders.get(key) || [];
        const updatedOrders = new Map([...orders].filter(([id, _o]) => id !== order.id.toString()));
        this.sellOrders.set(key, updatedOrders);
    }

    public matchOrders(orderPair: OrderPair): [Order, Order] {
        let emptyOrder = new Order({
            id: OrderId.from(0),
            tokenIdIn: TokenId.from(0),
            tokenIdOut: TokenId.from(0),
            amountIn: Balance.from(0),
            amountOut: Balance.from(0),
            sender: PublicKey.empty(),
            status: OrderStatus.pending(),
            orderType: OrderType.buy(),
            timestamp: UInt64.from(0),
        });

        // console.error("buyorders", this.buyOrders);
        // console.error("sellorders", this.sellOrders);

        const key = JSON.stringify(orderPair);
        let buyOrdersIter = this.buyOrders.get(key)?.values();
        let sellOrdersIter = this.sellOrders.get(key)?.values();
        const matchedOrders: Order[] = [];

        if (!buyOrdersIter || !sellOrdersIter) {
            return [emptyOrder, emptyOrder];
        }

        const buyOrders = Array.from(buyOrdersIter);
        const sellOrders = Array.from(sellOrdersIter);

        buyOrders.sort((a, b) => Number(b.amountOut.toBigInt() > a.amountOut.toBigInt()));
        sellOrders.sort((a, b) => Number(a.amountIn.toBigInt() - b.amountIn.toBigInt()));

        while (buyOrders.length > 0 && sellOrders.length > 0 && matchedOrders.length < MATCHED_ORDERS_LEN) {
            const buyOrder = buyOrders[0];
            const sellOrder = sellOrders[0];

            if (buyOrder.amountOut.value >= sellOrder.amountIn.value) {
                const matchedAmount = bigIntMin(buyOrder.amountIn.toBigInt(), sellOrder.amountOut.toBigInt());
                const filledBuyOrder = new Order({
                    ...buyOrder,
                    amountIn: Balance.from(matchedAmount.valueOf()),
                    status: OrderStatus.filled(),
                });
                const filledSellOrder = new Order({
                    ...sellOrder,
                    amountOut: Balance.from(matchedAmount.valueOf()),
                    status: OrderStatus.filled(),
                });

                matchedOrders.push(filledBuyOrder, filledSellOrder);
                buyOrders.shift();
                sellOrders.shift();
            } else {
                break;
            }
        }

        if (matchedOrders.length === 0) {
            return [emptyOrder, emptyOrder];
        }

        return [matchedOrders[0], matchedOrders[1]];
    }
}
