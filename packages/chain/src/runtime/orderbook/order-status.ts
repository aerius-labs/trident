import { Field } from "o1js";

export class OrderStatus extends Field {
    public static pending() {
        return OrderStatus.from(0);
    }

    public static filled() {
        return OrderStatus.from(1);
    }

    public static cancelled() {
        return OrderStatus.from(2);
    }
}