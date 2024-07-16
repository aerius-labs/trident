import {Balance, TokenId, UInt64} from '@proto-kit/library';
import {runtimeMethod, RuntimeModule, runtimeModule, state} from "@proto-kit/module";
import {assert, StateMap} from "@proto-kit/protocol";
import {Bool, Field, Poseidon, Provable, PublicKey, Struct} from "o1js";
import {Order} from "./order";
import {OrderId} from "./order-id";
import {MAX_MATCHES, OrderBook} from "../orderbook-new/orderbook";
import {OrderStatus} from "./order-status";
import {OrderType} from "./order-type";
import {Balances} from "../balances";
import {inject} from "tsyringe";

const errors = {
    insufficientBalance: () => "Insufficient balance",
    invalidPair: () => "Invalid trading pair",
};

class MatchedOrders extends Struct({
    orders: Provable.Array(Order, MAX_MATCHES * 2),
}) {
    static from(orders: Order[]): MatchedOrders {
        return new MatchedOrders({ orders });
    }
}

class TradingPair extends Struct({
    baseToken: TokenId,
    quoteToken: TokenId,
}) {
    toString(): string {
        return `${this.baseToken.toString()}-${this.quoteToken.toString()}`;
    }

    static fromTokens(tokenA: TokenId, tokenB: TokenId): TradingPair {
        let [x, y] =  conditionalSwap(tokenA.lessThan(tokenB), tokenA, tokenB);
        return new TradingPair({
            baseToken: x,
            quoteToken: y,

        });
    }

    // Add a method to hash the trading pair
    hash(): Field {
        return Poseidon.hash([this.baseToken.toFields(), this.quoteToken.toFields()].flat());
    }
}

function conditionalSwap(b: Bool, x: Field, y: Field): [Field, Field] {
    let m = b.toField().mul(x.sub(y)); // b*(x - y)
    const x_ = y.add(m); // y + b*(x - y)
    const y_ = x.sub(m); // x - b*(x - y) = x + b*(y - x)
    return [x_, y_];
}

@runtimeModule()
export class OrderbookExchange extends RuntimeModule {
    @state() public orders = StateMap.from<OrderId, Order>(OrderId, Order);
    @state() public registeredPairs = StateMap.from<Field, Bool>(Field, Bool);
    private orderBooks: Map<string, OrderBook> = new Map();

    public constructor(
        @inject("Balances") public balances: Balances,
    ) {
        super();
    }

    @runtimeMethod()
    public registerTradingPair(tokenA: TokenId, tokenB: TokenId): void {
        const pair = TradingPair.fromTokens(tokenA, tokenB);
        const pairHash = pair.hash();
        assert(this.registeredPairs.get(pairHash).isSome.not(), "Trading pair already registered");
        this.registeredPairs.set(pairHash, Bool(true));

        Provable.asProver(() => {
            this.orderBooks.set(pair.toString(), new OrderBook(pair.baseToken.toString(), pair.quoteToken.toString()));
        });
    }

    @runtimeMethod()
    public createOrderSigned(
        baseToken: TokenId,
        quoteToken: TokenId,
        price: Field,
        quantity: Field,
        isBuy: Bool,
        orderId: OrderId,
    ) {
        const pair = TradingPair.fromTokens(baseToken, quoteToken);
        const pairHash = pair.hash();
        assert(this.registeredPairs.get(pairHash).isSome.and(this.registeredPairs.get(pairHash).value.equals(Bool(true))), errors.invalidPair());

        const sender = this.transaction.sender.value;
        const timestamp = UInt64.from(Date.now());

        // replace with provable if
        const tokenToCheck = Provable.if(isBuy, quoteToken, baseToken);
        const amountToCheck = Provable.if(isBuy, price.mul(quantity), quantity);

        assert(
            this.balances.getBalance(tokenToCheck, sender).greaterThanOrEqual(Balance.from(amountToCheck)),
            errors.insufficientBalance()
        );

        assert(this.orders.get(orderId).isSome.not(), "orderId already exists");

        const order = new Order({
            id: orderId,
            price,
            quantity,
            baseToken: pair.baseToken,
            quoteToken: pair.quoteToken,
            sender,
            status: OrderStatus.pending(),
            isBuy,
            timestamp
        });

        Provable.asProver(() => {
            const orderBook = this.orderBooks.get(pair.toString())!;
            if (orderBook === undefined) {
                return Field(0);
            }
            orderBook.addOrder({
                id: order.id.toString(),
                price: Number(order.price.toBigInt()),
                quantity: Number(order.quantity.toBigInt()),
                baseToken: order.baseToken.toString(),
                quoteToken: order.quoteToken.toString(),
                isBuy: order.isBuy.toBoolean(),
                timestamp: Number(order.timestamp.toBigInt())
            });
        });

        this.orders.set(orderId, order);
    }

    @runtimeMethod()
    public cancelOrder(orderId: OrderId): void {
        const order = this.orders.get(orderId);
        assert(order.isSome, "Order not found");
        assert(order.value.status.equals(OrderStatus.pending()), "Order already processed");

        const pair = new TradingPair({ baseToken: order.value.baseToken, quoteToken: order.value.quoteToken });

        Provable.asProver( () => {
            const orderBook = this.orderBooks.get(pair.toString())!;
            orderBook.cancelOrder(orderId.toString(), Number(order.value.price.toBigInt()), order.value.isBuy.toBoolean());
            return Field(1);
        });

        const updatedOrder = new Order({
            ...order.value,
            status: OrderStatus.cancelled(),
        });

        this.orders.set(orderId, updatedOrder);
    }

    @runtimeMethod()
    public matchOrdersSigned(tokenA: TokenId, tokenB: TokenId): void {
        const pair = TradingPair.fromTokens(tokenA, tokenB);
        const pairHash = pair.hash();
        assert(this.registeredPairs.get(pairHash).isSome.equals(Bool(true)), errors.invalidPair());

        const matchedOrdersStruct = Provable.witness(MatchedOrders, () => {
            const orderBook = this.orderBooks.get(pair.toString())!;
            const { matches } = orderBook.matchOrders();

            const flatMatches = matches.flat().map((order) => {
                if (order.isBuy) {
                    return new Order({
                        id: OrderId.from(order.id),
                        price: Field(order.price),
                        quantity: Field(order.quantity),
                        baseToken: pair.baseToken,
                        quoteToken: pair.quoteToken,
                        sender: PublicKey.empty(),
                        status: OrderStatus.pending(),
                        isBuy: Bool(order.isBuy),
                        timestamp: UInt64.from(order.timestamp)
                    });
                } else {
                    let price = 0;
                    let quantity = 0;
                    if (order.price != 0) {
                        price = 1 / order.price;
                        quantity = order.quantity / order.price;
                    }
                    return new Order({
                        id: OrderId.from(order.id),
                        price: Field(price),
                        quantity: Field(quantity),
                        baseToken: pair.quoteToken,
                        quoteToken: pair.baseToken,
                        sender: PublicKey.empty(),
                        status: OrderStatus.pending(),
                        isBuy: Bool(order.isBuy),
                        timestamp: UInt64.from(order.timestamp)
                    });
                }


            });
            return MatchedOrders.from(flatMatches);
        });

        const matchedOrders = matchedOrdersStruct.orders;

        for (let i = 0; i < matchedOrders.length; i += 2) {
            const buyOrder = matchedOrders[i];
            const sellOrder = matchedOrders[i + 1];

            const isEmptyOrder = (order: Order) => order.id.equals(Field(0));
            if (isEmptyOrder(buyOrder) || isEmptyOrder(sellOrder)) {
                continue;
            }

            const matchedAmount = buyOrder.quantity;

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

            this.balances.transfer(pair.baseToken, filledBuyOrder.sender, filledSellOrder.sender, Balance.from(matchedAmount));
            this.balances.transfer(pair.quoteToken, filledSellOrder.sender, filledBuyOrder.sender, Balance.from(matchedAmount.mul(buyOrder.price)));
        }
    }

    public getOrder(orderId: OrderId): Order | undefined {
        const order = this.orders.get(orderId);
        return order.isSome ? order.value : undefined;
    }

    public getOrders(tokenA: TokenId, tokenB: TokenId): { buyOrders: Order[]; sellOrders: Order[] } {
        const pair = TradingPair.fromTokens(tokenA, tokenB);
        const orderBook = this.orderBooks.get(pair.toString());
        if (!orderBook) return { buyOrders: [], sellOrders: [] };

        const { buyOrders, sellOrders } = orderBook.getAllOrders();
        return {
            buyOrders: buyOrders.map(order => this.convertToCircuitOrder(order, pair)),
            sellOrders: sellOrders.map(order => this.convertToCircuitOrder(order, pair))
        };
    }

    public getAllOrders(tokenA: TokenId, tokenB: TokenId): { buyOrders: Order[]; sellOrders: Order[] } {
        const pair = TradingPair.fromTokens(tokenA, tokenB);
        const orderBook = this.orderBooks.get(pair.toString());
        if (!orderBook) {
            return { buyOrders: [], sellOrders: [] };
        }
        const { buyOrders, sellOrders } = orderBook.getAllOrders();
        return {
            buyOrders: buyOrders.map(order => this.convertToCircuitOrder(order, pair)),
            sellOrders: sellOrders.map(order => this.convertToCircuitOrder(order, pair))
        };
    }

    public getBestBidAsk(tokenA: TokenId, tokenB: TokenId): { bestBid: Field | null; bestAsk: Field | null } {
        const pair = TradingPair.fromTokens(tokenA, tokenB);
        const orderBook = this.orderBooks.get(pair.toString());
        if (!orderBook) return { bestBid: null, bestAsk: null };

        const { bestBid, bestAsk } = orderBook.getBestBidAsk();
        return {
            bestBid: bestBid !== null ? Field(bestBid) : null,
            bestAsk: bestAsk !== null ? Field(bestAsk) : null
        };
    }

    public getOrderBookDepth(tokenA: TokenId, tokenB: TokenId, depth: number): { bids: [Field, Field][]; asks: [Field, Field][] } {
        const pair = TradingPair.fromTokens(tokenA, tokenB);
        const orderBook = this.orderBooks.get(pair.toString());
        if (!orderBook) return { bids: [], asks: [] };

        const { bids, asks } = orderBook.getOrderBookDepth(depth);
        return {
            bids: bids.map(([price, quantity]) => [Field(price), Field(quantity)]),
            asks: asks.map(([price, quantity]) => [Field(price), Field(quantity)])
        };
    }

    private convertToCircuitOrder(order: any, pair: TradingPair): Order {
        return new Order({
            id: OrderId.from(order.id),
            price: Field(order.price),
            quantity: Field(order.quantity),
            baseToken: pair.baseToken,
            quoteToken: pair.quoteToken,
            sender: PublicKey.empty(),
            status: OrderStatus.pending(),
            isBuy: Bool(order.isBuy),
            timestamp: UInt64.from(order.timestamp)
        });
    }
}