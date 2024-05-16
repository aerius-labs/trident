import { Field } from "o1js";

export class OrderType extends Field {
    public static buy() {
        return OrderType.from(0);
    }

    public static sell() {
        return OrderType.from(1);
    }
}