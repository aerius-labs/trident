import "reflect-metadata";
import { Balance, TokenId } from "@proto-kit/library";
import { PrivateKey, Provable, PublicKey, Field, Bool } from "o1js";
import { fromRuntime } from "./testing-appchain";
import { config, modules } from "../src/runtime";
import { OrderbookExchange, Order } from "../src";
import { OrderStatus } from "../src";
import { drip, TridentTestinAppchain } from "./util";
import { OrderId } from "../src";
import * as console from "console";
import { expect } from "@jest/globals";

describe("orderbook exchange", () => {
    const alicePrivateKey = PrivateKey.random();
    const alice = alicePrivateKey.toPublicKey();
    Provable.log("alice pubkey:", alice);

    const tokenIdIn = TokenId.from(0);
    const tokenIdOut = TokenId.from(1);
    const initialBalance = Balance.from(1_000_000);

    let appChain: ReturnType<typeof fromRuntime<typeof modules>>;
    let orderbook: OrderbookExchange;

    let nonce = 0;

    async function queryOrder(
        appChain: TridentTestinAppchain,
        orderId: OrderId,
    ) {
        return await appChain.query.runtime.OrderbookExchange.orders.get(orderId);
    }

    async function queryBalance(
        appChain: TridentTestinAppchain,
        tokenId: TokenId,
        address: PublicKey
    ) {
        return await appChain.query.runtime.Balances.balances.get({
            tokenId,
            address,
        });
    }

    async function registerTradingPair(
        appChain: TridentTestinAppchain,
        senderPrivateKey: PrivateKey,
        tokenA: TokenId,
        tokenB: TokenId,
        options?: { nonce: number }
    ) {
        const orderbook = appChain.runtime.resolve("OrderbookExchange");
        appChain.setSigner(senderPrivateKey);

        const tx = await appChain.transaction(
            senderPrivateKey.toPublicKey(),
            () => {
                orderbook.registerTradingPair(tokenA, tokenB);
            },
            options
        );

        await tx.sign();
        await tx.send();

        return tx;
    }

    async function createOrderSigned(
        appChain: TridentTestinAppchain,
        senderPrivateKey: PrivateKey,
        baseToken: TokenId,
        quoteToken: TokenId,
        price: Field,
        quantity: Field,
        isBuy: Bool,
        orderId: OrderId,
        options?: { nonce: number }
    ) {
        const orderbook = appChain.runtime.resolve("OrderbookExchange");
        appChain.setSigner(senderPrivateKey);

        const tx = await appChain.transaction(
            senderPrivateKey.toPublicKey(),
            () => {
                orderbook.createOrderSigned(
                    baseToken,
                    quoteToken,
                    price,
                    quantity,
                    isBuy,
                    orderId
                );
            },
            options
        );

        await tx.sign();
        await tx.send();

        return tx;
    }

    async function matchOrdersSigned(
        appChain: TridentTestinAppchain,
        senderPrivateKey: PrivateKey,
        tokenA: TokenId,
        tokenB: TokenId,
        options?: { nonce: number }
    ) {
        const orderbook = appChain.runtime.resolve("OrderbookExchange");
        appChain.setSigner(senderPrivateKey);

        const tx = await appChain.transaction(
            senderPrivateKey.toPublicKey(),
            () => {
                orderbook.matchOrdersSigned(tokenA, tokenB);
            },
            options
        );

        await tx.sign();
        await tx.send();

        return tx;
    }

    describe("create and match orders", () => {
        beforeAll(async () => {
            appChain = fromRuntime(modules);

            appChain.configurePartial({
                Runtime: config,
            });

            await appChain.start();

            orderbook = appChain.runtime.resolve("OrderbookExchange");
        });

        it("should register trading pair, create and match orders", async () => {
            // Register trading pair
            await registerTradingPair(
                appChain,
                alicePrivateKey,
                tokenIdIn,
                tokenIdOut,
                { nonce: nonce++ }
            );
            await appChain.produceBlock();

            // Check token balance
            await drip(
                appChain,
                alicePrivateKey,
                tokenIdIn,
                initialBalance,
                {
                    nonce: nonce++,
                }
            );
            await appChain.produceBlock();

            await drip(
                appChain,
                alicePrivateKey,
                tokenIdOut,
                initialBalance,
                {
                    nonce: nonce++,
                }
            );
            await appChain.produceBlock();

            const price = Field(2); // 2 tokenOut per 1 tokenIn
            const quantity = Field(100);

            const buyOrderId = OrderId.random();
            await createOrderSigned(
                appChain,
                alicePrivateKey,
                tokenIdIn,
                tokenIdOut,
                price,
                quantity,
                Bool(true),
                buyOrderId,
                { nonce: nonce++ }
            );

            const sellOrderId = OrderId.random();
            await createOrderSigned(
                appChain,
                alicePrivateKey,
                tokenIdIn,
                tokenIdOut,
                price,
                quantity,
                Bool(false),
                sellOrderId,
                { nonce: nonce++ }
            );

            const tx = await matchOrdersSigned(
                appChain,
                alicePrivateKey,
                tokenIdIn,
                tokenIdOut,
                { nonce: nonce++ }
            );
            let provenBlock = await appChain.produceBlock();

            const aliceBalanceIn = await queryBalance(appChain, tokenIdIn, alice);
            const aliceBalanceOut = await queryBalance(appChain, tokenIdOut, alice);
            expect(aliceBalanceIn?.toString()).toEqual(initialBalance.toString());
            expect(aliceBalanceOut?.toString()).toEqual(initialBalance.toString());

            const buyOrder = await queryOrder(appChain, buyOrderId);
            const sellOrder = await queryOrder(appChain, sellOrderId);

            // check order status
            // expect(buyOrder?.status.toString()).toEqual(OrderStatus.filled().toString());
            // expect(sellOrder?.status.toString()).toEqual(OrderStatus.filled().toString());
            //
            // // Test new getter functions
            // const allOrders = await orderbook.getAllOrders(tokenIdIn, tokenIdOut);
            // expect(allOrders.buyOrders.length).toEqual(0);
            // expect(allOrders.sellOrders.length).toEqual(0);
            //
            // const orderBookDepth = await orderbook.getOrderBookDepth(tokenIdIn, tokenIdOut, 10);
            // expect(orderBookDepth.bids.length).toBe(0);
            // expect(orderBookDepth.asks.length).toBe(0);
            //
            // const bestBidAsk = await orderbook.getBestBidAsk(tokenIdIn, tokenIdOut);
            // expect(bestBidAsk.bestBid).toBeNull();
            // expect(bestBidAsk.bestAsk).toBeNull();
        });
    });
});