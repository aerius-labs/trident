import { TokenId } from "@proto-kit/library";
import { Provable, Struct } from "o1js";

export class OrderPair{
    tokenIdA: string;
    tokenIdB: string;

    constructor(tokenIdX: string, tokenIdY: string) {
        if (tokenIdX.localeCompare(tokenIdY) < 0) {
            this.tokenIdA = tokenIdX;
            this.tokenIdB = tokenIdY;
        } else {
            this.tokenIdA = tokenIdY;
            this.tokenIdB = tokenIdX;
        }
    }
}