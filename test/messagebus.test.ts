import MessageBus from "../src/MessgeBus";
import { Updatable, MBusMessage, IMessageBus, MessageName } from "../src/types";
const assert = require("assert");
const CuteSet = require("cute-set");

type TestPayload = {
    value: number;
};

class Agent {
    protected mBus: IMessageBus;
    constructor(mBus: IMessageBus, message: MessageName) {
        this.mBus = mBus;
        this.mBus.subscribe({ message, subscriber: this });
    }

    update(message: MBusMessage<TestPayload>) {}
}

class SubscriberAdder extends Agent implements Updatable {
    constructor(mBus: IMessageBus, message: MessageName = "ADD") {
        super(mBus, message);
    }
    update(message: MBusMessage) {
        const [name, payload] = message;
        console.log(`Received message ${name}`);
        payload.value++;
        this.mBus.deliver(["ADDED", payload], this);
    }
}

describe(MessageBus.name, () => {
    it("Should create message bus", () => {
        const m = new MessageBus();
        expect(m).toBeDefined();
    });

    describe("Testing subscription and send functionality", () => {
        const mBus = new MessageBus();
        const payload = { value: 0 };
        const adder = new SubscriberAdder(mBus, "ADD");
        mBus.deliver(["ADD", payload], null);
        it("Should verify that value has been incremented", () => {
            expect(payload.value).toBe(1);
        });
    });
});
