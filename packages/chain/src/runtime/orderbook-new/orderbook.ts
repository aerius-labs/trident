import { RBTree } from 'bintrees';
import { CircularBuffer } from "./circular_buffer";

const MAX_PRICE_HISTORY = 1000;
const MAX_MATCHES_PER_ROUND = 5; // Adjust this value as needed

export class Order {
    constructor(
        public id: string,
        public price: number,
        public quantity: number,
        public baseToken: string,
        public quoteToken: string,
        public isBuy: boolean,
        public timestamp: number
    ) {}

    static createEmptyOrder(): Order {
        return new Order('', 0, 0, '', '', false, 0);
    }
}

class PriceLevel {
    orders: Order[] = [];
    totalQuantity: number = 0;

    addOrder(order: Order): void {
        this.orders.push(order);
        this.totalQuantity += order.quantity;
    }

    removeOrder(): Order | undefined {
        const order = this.orders.shift();
        if (order) {
            this.totalQuantity -= order.quantity;
        }
        return order;
    }

    isEmpty(): boolean {
        return this.orders.length === 0;
    }
}

export class OrderBook {
    private buyOrders: Map<number, PriceLevel>;
    private sellOrders: Map<number, PriceLevel>;
    private buyPrices: RBTree<number>;
    private sellPrices: RBTree<number>;
    private baseToken: string;
    private quoteToken: string;
    private lastTradePrice: number | null;

    private priceHistory: CircularBuffer<{ timestamp: number; price: number }>;

    constructor(baseToken: string, quoteToken: string) {
        this.buyOrders = new Map<number, PriceLevel>();
        this.sellOrders = new Map<number, PriceLevel>();
        this.buyPrices = new RBTree<number>((a, b) => b - a);  // Descending order for buys
        this.sellPrices = new RBTree<number>((a, b) => a - b);  // Ascending order for sells
        this.baseToken = baseToken;
        this.quoteToken = quoteToken;
        this.lastTradePrice = null;

        this.priceHistory = new CircularBuffer<{ timestamp: number; price: number }>(MAX_PRICE_HISTORY);
    }

    addOrder(order: Order): void {
        if (
            (order.baseToken !== this.baseToken || order.quoteToken !== this.quoteToken) &&
            (order.baseToken !== this.quoteToken || order.quoteToken !== this.baseToken)
        ) {
            throw new Error("Order tokens do not match the orderbook");
        }

        const normalizedOrder = this.normalizeOrder(order);
        const orderMap = normalizedOrder.isBuy ? this.buyOrders : this.sellOrders;
        const priceTree = normalizedOrder.isBuy ? this.buyPrices : this.sellPrices;

        let priceLevel = orderMap.get(normalizedOrder.price);
        if (!priceLevel) {
            priceLevel = new PriceLevel();
            orderMap.set(normalizedOrder.price, priceLevel);
            priceTree.insert(normalizedOrder.price);
        }
        priceLevel.addOrder(normalizedOrder);
    }

    matchOrders(): { matches: [Order, Order][]; partialMatch: Order | null } {
        const matches: [Order, Order][] = [];
        let partialMatch: Order | null = null;

        for (let i = 0; i < MAX_MATCHES_PER_ROUND; i++) {
            if (this.buyPrices.size > 0 && this.sellPrices.size > 0) {
                const bestBuyPrice = this.buyPrices.max();
                const bestSellPrice = this.sellPrices.min();

                if (bestBuyPrice !== null && bestSellPrice !== null && bestBuyPrice >= bestSellPrice) {
                    const buyPriceLevel = this.buyOrders.get(bestBuyPrice)!;
                    const sellPriceLevel = this.sellOrders.get(bestSellPrice)!;

                    const buy = buyPriceLevel.orders[0];
                    const sell = sellPriceLevel.orders[0];

                    const matchedQuantity = Math.min(buy.quantity, sell.quantity);

                    buy.quantity -= matchedQuantity;
                    sell.quantity -= matchedQuantity;

                    matches.push([
                        { ...buy, quantity: matchedQuantity },
                        { ...sell, quantity: matchedQuantity }
                    ]);

                    this.lastTradePrice = bestBuyPrice;
                    this.addToPriceHistory(bestBuyPrice);

                    if (buy.quantity === 0) buyPriceLevel.removeOrder();
                    if (sell.quantity === 0) sellPriceLevel.removeOrder();

                    if (buyPriceLevel.isEmpty()) {
                        this.buyOrders.delete(bestBuyPrice);
                        this.buyPrices.remove(bestBuyPrice);
                    }
                    if (sellPriceLevel.isEmpty()) {
                        this.sellOrders.delete(bestSellPrice);
                        this.sellPrices.remove(bestSellPrice);
                    }

                    if (buy.quantity > 0 || sell.quantity > 0) {
                        partialMatch = buy.quantity > 0 ? buy : sell;
                    }
                } else {
                    // No more matches possible, fill with empty orders
                    matches.push([Order.createEmptyOrder(), Order.createEmptyOrder()]);
                }
            } else {
                // Not enough orders to match, fill with empty orders
                matches.push([Order.createEmptyOrder(), Order.createEmptyOrder()]);
            }
        }

        return { matches, partialMatch };
    }

    // ... (keep other methods like cancelOrder, getAllOrders, getPriceHistory, etc.)

    private normalizeOrder(order: Order): Order {
        if (order.baseToken === this.baseToken && order.quoteToken === this.quoteToken && order.isBuy) {
            return order;
        } else {
            return new Order(
                order.id,
                1 / order.price,
                order.quantity * order.price,
                order.quoteToken,
                order.baseToken,
                order.isBuy,
                order.timestamp
            );
        }
    }

    private addToPriceHistory(price: number): void {
        this.priceHistory.push({ timestamp: Date.now(), price });
    }
}