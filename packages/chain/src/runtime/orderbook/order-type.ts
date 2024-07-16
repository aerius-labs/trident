import { Bool } from "o1js";

export class OrderType extends Bool {
    static buy(): Bool {
        return Bool(true);
    }

    static sell(): Bool {
        return Bool(false);
    }
}