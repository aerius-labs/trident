import {Balance, TokenId, UInt64} from '@proto-kit/library';
import { RuntimeModule, runtimeMethod, runtimeModule, state } from "@proto-kit/module";
import { StateMap, assert } from "@proto-kit/protocol";
import { Bool, Field, Provable, PublicKey, Struct } from "o1js";
import { Order } from "./order";
import { OrderId } from "./order-id";
import {MatchedOrders, OrderMatchingEngine} from "./order-matching-engine";
import { OrderPair } from "./order-pair";
import { OrderStatus } from "./order-status";
import { OrderType } from "./order-type";
import { Balances } from "../balances";
import {inject} from "tsyringe";

const errors = {
    insufficientBalance: () => "Insufficient balance",
};

@runtimeModule()
export class OrderbookExchange extends RuntimeModule {
    @state() public orders = StateMap.from<OrderId, Order>(OrderId, Order);
    private orderMatchingEngine: OrderMatchingEngine = new OrderMatchingEngine();

    public constructor(
        @inject("Balances") public balances: Balances,
    ) {
        super();
    }

    @runtimeMethod()
    public createOrderSigned(
        tokenIdIn: TokenId,
        tokenIdOut: TokenId,
        amountIn: Balance,
        amountOut: Balance,
        orderType: OrderType,
        orderId: OrderId,
    ) {
        const sender = this.transaction.sender.value;
        const timestamp = UInt64.from(Date.now());

        assert(
            this.balances.getBalance(tokenIdIn, sender).greaterThanOrEqual(amountIn),
            errors.insufficientBalance()
        );

        // check that orderId is not set
        assert(this.orders.get(orderId).isSome.not(), "orderId already exists");

        const order = new Order({
            id: orderId,
            tokenIdIn,
            tokenIdOut,
            amountIn,
            amountOut,
            sender,
            status: OrderStatus.pending(),
            orderType,
            timestamp
        });

        Provable.witness(Field, () => {
            this.orderMatchingEngine.addOrder(order);
            return Field.from(1);
        });

        this.orders.set(orderId, order);
    }

    @runtimeMethod()
    public cancelOrder(orderId: OrderId): void {
        const order = this.orders.get(orderId);
        assert(order.isSome, "Order not found");
        assert(Bool(order.value.status.equals(OrderStatus.pending())), "Order already processed");

        const updatedOrder = new Order({
            ...order.value,
            status: OrderStatus.cancelled(),
        });

        Provable.witness(Field, () => {
            this.orderMatchingEngine.removeOrder(updatedOrder);
            return Field.from(1);
        })

        this.orders.set(orderId, updatedOrder);
    }

    @runtimeMethod()
    public matchOrdersSigned(tokenIdIn: TokenId, tokenIdOut: TokenId): void {
        const matchedOrdersStruct = Provable.witness(MatchedOrders, () => {
            const orderPair = new OrderPair(tokenIdIn.toString(), tokenIdOut.toString());
            return MatchedOrders.from(this.orderMatchingEngine.matchOrders(orderPair));
        });

        let matchedOrders = matchedOrdersStruct.orders;
        let emptySender = PublicKey.empty();

        // assert matched order length is divisible by two, then iterate in pairs
        // assert(matchedOrders.length % 2 === 0, "Invalid number of matched orders");
        const buyOrder = matchedOrders[0];
        const sellOrder = matchedOrders[1];

        const matchedAmountInBuy = Provable.if(emptySender.equals(buyOrder.sender), Balance.from(0).value, Balance.from(buyOrder.amountIn.value).value);
        const matchedAmountInSell = Provable.if(emptySender.equals(buyOrder.sender), Balance.from(0).value, Balance.from(sellOrder.amountIn.value).value);
        const filledBuyOrder = new Order({
            ...buyOrder,
            status: OrderStatus.filled(),
        });

        const filledSellOrder = new Order({
            ...sellOrder,
            status: OrderStatus.filled(),
        });

        this.orders.set(filledBuyOrder.id, filledBuyOrder);
        this.orders.set(filledSellOrder.id, filledSellOrder);

        this.balances.transfer(tokenIdIn, filledBuyOrder.sender, filledSellOrder.sender, Balance.from(matchedAmountInSell));
        this.balances.transfer(tokenIdOut, filledSellOrder.sender, filledBuyOrder.sender, Balance.from(matchedAmountInBuy));
    }

    public getOrder(orderId: OrderId): Order | undefined {
        const order = this.orders.get(orderId);
        return order.isSome ? order.value : undefined;
    }

    public getOrders(tokenIdIn: TokenId, tokenIdOut: TokenId): Order[] {
        const orderPair = new OrderPair(tokenIdIn.toString(), tokenIdOut.toString());
        const key = JSON.stringify(orderPair);
        const buyOrdersMap = this.orderMatchingEngine.buyOrders.get(key);
        const sellOrdersMap = this.orderMatchingEngine.sellOrders.get(key);
        const buyOrders = buyOrdersMap ? Array.from(buyOrdersMap.values()) : [];
        const sellOrders = sellOrdersMap ? Array.from(sellOrdersMap.values()) : [];

        return [...buyOrders, ...sellOrders];
    }
}