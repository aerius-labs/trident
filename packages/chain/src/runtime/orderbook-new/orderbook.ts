import { RBTree } from 'bintrees';
import { CircularBuffer } from "./circular_buffer";

const MAX_PRICE_HISTORY = 1000;

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

class OrderNode {
    next: OrderNode | null = null;
    constructor(public order: Order) {}
}

class OrderLinkedList {
    head: OrderNode | null = null;
    tail: OrderNode | null = null;

    addOrder(order: Order): void {
        const newNode = new OrderNode(order);
        if (!this.head) {
            this.head = this.tail = newNode;
        } else {
            this.tail!.next = newNode;
            this.tail = newNode;
        }
    }

    removeFirstOrder(): Order | null {
        if (!this.head) return null;
        const order = this.head.order;
        this.head = this.head.next;
        if (!this.head) this.tail = null;
        return order;
    }

    isEmpty(): boolean {
        return this.head === null;
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
        this.buyPrices = new RBTree<number>((a, b) => a - b);  // Descending order for buys
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
        }
        orderMap.set(normalizedOrder.price, priceLevel);
        priceTree.insert(normalizedOrder.price);
        priceLevel.addOrder(normalizedOrder);
    }

    matchOrders(): { matches: [Order, Order][]; partialMatch: Order | null } {
        const matches: [Order, Order][] = [];
        let partialMatch: Order | null = null;

        while (this.buyPrices.size > 0 && this.sellPrices.size > 0) {
            const bestBuyPrice = this.buyPrices.max();
            const bestSellPrice = this.sellPrices.min();

            if (bestBuyPrice === null || bestSellPrice === null || bestBuyPrice < bestSellPrice) {
                break;
            }

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
        }

        return { matches, partialMatch };
    }

    cancelOrder(id: string, price: number, isBuy: boolean): boolean {
        const orderMap = isBuy ? this.buyOrders : this.sellOrders;
        const priceTree = isBuy ? this.buyPrices : this.sellPrices;

        const priceLevel = orderMap.get(price);
        if (!priceLevel) return false;

        const index = priceLevel.orders.findIndex(order => order.id === id);
        if (index === -1) return false;

        const [cancelledOrder] = priceLevel.orders.splice(index, 1);
        priceLevel.totalQuantity -= cancelledOrder.quantity;

        if (priceLevel.isEmpty()) {
            orderMap.delete(price);
            priceTree.remove(price);
        }

        return true;
    }

    getAllOrders(): { buyOrders: Order[]; sellOrders: Order[] } {
        const buyOrders: Order[] = [];
        const sellOrders: Order[] = [];

        for (const priceLevel of this.buyOrders.values()) {
            buyOrders.push(...priceLevel.orders);
        }

        for (const priceLevel of this.sellOrders.values()) {
            sellOrders.push(...priceLevel.orders);
        }

        return { buyOrders, sellOrders };
    }

    getPriceHistory(): { timestamp: number; price: number }[] {
        return this.priceHistory.getItems();
    }

    getCurrentPrice(): number | null {
        return this.lastTradePrice;
    }

    getBestBidAsk(): { bestBid: number | null; bestAsk: number | null } {
        const bestBid = this.buyPrices.size > 0 ? this.buyPrices.max() : null;
        const bestAsk = this.sellPrices.size > 0 ? this.sellPrices.min() : null;
        return { bestBid, bestAsk };
    }

    getOrderBookDepth(depth: number): { bids: [number, number][]; asks: [number, number][] } {
        const bids: [number, number][] = [];
        const asks: [number, number][] = [];

        let buyIt = this.buyPrices.iterator(), sellIt = this.sellPrices.iterator();
        let buyNext = buyIt.prev(), sellNext = sellIt.next();

        for (let i = 0; i < depth; i++) {
            if (buyNext !== null) {
                const priceLevel = this.buyOrders.get(buyNext)!;
                bids.push([buyNext, priceLevel.totalQuantity]);
                buyNext = buyIt.prev();
            }

            if (sellNext !== null) {
                const priceLevel = this.sellOrders.get(sellNext)!;
                asks.push([sellNext, priceLevel.totalQuantity]);
                sellNext = sellIt.next();
            }

            if (buyNext === null && sellNext === null) break;
        }

        return { bids, asks };
    }

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