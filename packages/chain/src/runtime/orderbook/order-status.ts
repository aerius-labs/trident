import { Field } from "o1js";

export class OrderStatus extends Field {
    public static pending(): OrderStatus {
        return OrderStatus.from(Field(0));
    }

    public static filled(): OrderStatus {
        return OrderStatus.from(Field(1));
    }

    public static cancelled(): OrderStatus {
        return OrderStatus.from(Field(2));
    }
}