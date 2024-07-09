import { OrderBook, Order } from '../src/orderbook';

let orderBook: OrderBook;

beforeEach(() => {
    orderBook = new OrderBook('BTC', 'USD');
});

describe('OrderBook', () => {
    describe('Order Addition', () => {
        test('should add buy orders correctly', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('2', 50001, 0.5, 'BTC', 'USD', true, Date.now()));
            const { buyOrders, sellOrders } = orderBook.getAllOrders();
            expect(buyOrders.length).toBe(2);
            expect(sellOrders.length).toBe(0);
        });

        test('should add sell orders correctly', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'USD', 'BTC', false, Date.now()));
            orderBook.addOrder(new Order('2', 49999, 0.5, 'USD', 'BTC', false, Date.now()));
            const { buyOrders, sellOrders } = orderBook.getAllOrders();
            expect(buyOrders.length).toBe(0);
            expect(sellOrders.length).toBe(2);
        });

        test('should normalize orders correctly', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('2', 1/50000, 50000, 'USD', 'BTC', false, Date.now()));
            const { buyOrders, sellOrders } = orderBook.getAllOrders();
            expect(buyOrders.length).toBe(1);
            expect(sellOrders.length).toBe(1);
            expect(sellOrders[0].price).toBeCloseTo(50000);
        });

        test('should throw an error for invalid token pairs', () => {
            expect(() => orderBook.addOrder(new Order('1', 50000, 1, 'ETH', 'USD', true, Date.now())))
                .toThrow("Order tokens do not match the orderbook");
        });
    });

    describe('Order Matching', () => {
        test('should match orders with exact price match', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('2', 1/50000, 25000, 'USD', 'BTC', false, Date.now()));
            const { matches } = orderBook.matchOrders();
            expect(matches.length).toBe(1);
            expect(matches[0][0].id).toBe('1');
            expect(matches[0][1].id).toBe('2');
            expect(matches[0][0].quantity).toBe(0.5);
            expect(matches[0][1].quantity).toBe(0.5);
        });

        test('should not match orders with different prices', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('2', 1/50001, 25000, 'USD', 'BTC', false, Date.now()));
            const { matches } = orderBook.matchOrders();
            expect(matches.length).toBe(0);
        });

        test('should handle partial matches correctly', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('2', 1/50000, 25000, 'USD', 'BTC', false, Date.now()));
            const { matches, partialMatch } = orderBook.matchOrders();
            expect(matches.length).toBe(1);
            expect(matches[0][0].quantity).toBe(0.5);
            expect(matches[0][1].quantity).toBe(0.5);
            expect(partialMatch?.id).toBe('1');
            expect(partialMatch?.quantity).toBe(0.5);
        });
    });

    describe('Order Cancellation', () => {
        test('should cancel an existing order', () => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            expect(orderBook.cancelOrder('1', 50000, true)).toBe(true);
            const { buyOrders } = orderBook.getAllOrders();
            expect(buyOrders.length).toBe(0);
        });

        test('should return false when cancelling a non-existent order', () => {
            expect(orderBook.cancelOrder('1', 50000, true)).toBe(false);
        });
    });

    describe('Order Book Queries', () => {
        beforeEach(() => {
            orderBook.addOrder(new Order('1', 50000, 1, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('2', 50001, 0.5, 'BTC', 'USD', true, Date.now()));
            orderBook.addOrder(new Order('3', 1/50002, 0.7 * 50002, 'USD', 'BTC', false, Date.now()));
            orderBook.addOrder(new Order('4', 1/50003, 0.3 * 50003, 'USD', 'BTC', false, Date.now()));
        });

        test('should return all orders', () => {
            const { buyOrders, sellOrders } = orderBook.getAllOrders();
            expect(buyOrders.length).toBe(2);
            expect(sellOrders.length).toBe(2);
        });

        test('should return current price', () => {
            expect(orderBook.getCurrentPrice()).toBeNull();
            orderBook.addOrder(new Order('5', 1/50000, 25000, 'USD', 'BTC', false, Date.now()));
            orderBook.matchOrders();
            expect(orderBook.getCurrentPrice()).toBe(50001);
        });

        test('should return price history', () => {
            orderBook.addOrder(new Order('5', 1/50000, 25000, 'USD', 'BTC', false, Date.now()));
            orderBook.matchOrders();
            const priceHistory = orderBook.getPriceHistory();
            expect(priceHistory.length).toBe(1);
            expect(priceHistory[0].price).toBe(50001);
        });

        test('should return best bid and ask', () => {
            const { bestBid, bestAsk } = orderBook.getBestBidAsk();
            expect(bestBid).toBe(50001);
            expect(bestAsk).toBe(50002);
        });

        test('should return order book depth', () => {
            const { bids, asks } = orderBook.getOrderBookDepth(2);
            expect(bids.length).toBe(2);
            expect(asks.length).toBe(2);
            expect(bids[0][0]).toBe(50001);
            expect(asks[0][0]).toBe(50002);
        });
    });

    describe('Edge Cases', () => {
        test('should handle orders with zero quantity', () => {
            expect(() => orderBook.addOrder(new Order('1', 50000, 0, 'BTC', 'USD', true, Date.now())))
                .not.toThrow();
        });

        test('should handle orders with negative price', () => {
            expect(() => orderBook.addOrder(new Order('1', -50000, 1, 'BTC', 'USD', true, Date.now())))
                .not.toThrow();
        });
    });

    describe('Performance', () => {
        test('should handle a large number of orders efficiently', () => {
            const startTime = Date.now();
            for (let i = 0; i < 10000; i++) {
                orderBook.addOrder(new Order(`buy${i}`, 50000 + Math.random(), 1, 'BTC', 'USD', true, Date.now()));
                orderBook.addOrder(new Order(`sell${i}`, 50000 + Math.random(), 1, 'USD', 'BTC', false, Date.now()));
            }
            const addTime = Date.now() - startTime;

            const matchStartTime = Date.now();
            orderBook.matchOrders();
            const matchTime = Date.now() - matchStartTime;

            console.log(`Time to add 20000 orders: ${addTime}ms`);
            console.log(`Time to match orders: ${matchTime}ms`);

            expect(addTime).toBeLessThan(1000); // Adjust based on your performance requirements
            expect(matchTime).toBeLessThan(100); // Adjust based on your performance requirements
        }, 5000);
    });
});