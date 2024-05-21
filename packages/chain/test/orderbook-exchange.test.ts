import "reflect-metadata";
import { Balance, TokenId } from "@proto-kit/library";
import {PrivateKey, Provable, PublicKey} from "o1js";
import { fromRuntime } from "./testing-appchain";
import { config, modules } from "../src/runtime";
import { OrderbookExchange } from "../src/runtime/orderbook/orderbook-exchange";
import { OrderType } from "../src/runtime/orderbook/order-type";
import { OrderStatus } from "../src/runtime/orderbook/order-status";
import {drip, TridentTestinAppchain} from "./util";
import {OrderId} from "../src";
import * as console from "console";
import {expect} from "@jest/globals";

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

    async function createOrderSigned(
        appChain: TridentTestinAppchain,
        senderPrivateKey: PrivateKey,
        tokenIdIn: TokenId,
        tokenIdOut: TokenId,
        amountIn: Balance,
        amountOut: Balance,
        orderType: OrderType,
        orderId: OrderId,
        options?: { nonce: number }
    ) {
        const orderbook = appChain.runtime.resolve("OrderbookExchange");
        appChain.setSigner(senderPrivateKey);

        const tx = await appChain.transaction(
            senderPrivateKey.toPublicKey(),
            () => {
                orderbook.createOrderSigned(
                    tokenIdIn,
                    tokenIdOut,
                    amountIn,
                    amountOut,
                    orderType,
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
        tokenIdIn: TokenId,
        tokenIdOut: TokenId,
        options?: { nonce: number }
    ) {
        const orderbook = appChain.runtime.resolve("OrderbookExchange");
        appChain.setSigner(senderPrivateKey);

        const tx = await appChain.transaction(
            senderPrivateKey.toPublicKey(),
            () => {
                orderbook.matchOrdersSigned(tokenIdIn, tokenIdOut);
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

        it("should create and match orders", async () => {
            // check token balance

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

            const amountIn = Balance.from(100);
            const amountOut = Balance.from(200);

            const buyOrderId = OrderId.random();
            await createOrderSigned(
                appChain,
                alicePrivateKey,
                tokenIdIn,
                tokenIdOut,
                amountIn,
                amountOut,
                OrderType.buy(),
                buyOrderId,
                { nonce: nonce++ }
            );

            const sellOrderId = OrderId.random();
            await createOrderSigned(
                appChain,
                alicePrivateKey,
                tokenIdOut,
                tokenIdIn,
                amountOut,
                amountIn,
                OrderType.sell(),
                sellOrderId,
                { nonce: nonce++ }
            );

            const tx = await matchOrdersSigned(
                appChain,
                alicePrivateKey,
                tokenIdOut,
                tokenIdIn,
                { nonce: nonce++ }
            );
            let provenBlock = await appChain.produceBlock();

            const aliceBalance = await queryBalance(appChain, tokenIdIn, alice);
            const bobBalance = await queryBalance(appChain, tokenIdOut, alice);
            expect(aliceBalance?.toString()).toEqual(initialBalance.add(amountIn).toString());
            expect(bobBalance?.toString()).toEqual(initialBalance.add(amountOut).toString());

            const buyOrder = await queryOrder(appChain, buyOrderId);
            const sellOrder = await queryOrder(appChain, sellOrderId);

            // check token balance
            expect(buyOrder?.status.toString()).toEqual(OrderStatus.filled().toString());
            expect(sellOrder?.status.toString()).toEqual(OrderStatus.filled().toString());
        });
    });
});