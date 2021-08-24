import MessageBus from "../src/MessgeBus";
import { Updatable, MBusMessage, IMessageBus, MessageName } from "../src/types";
const assert = require("assert");
const CuteSet = require("cute-set");

type TestPayload = {
    value: number;
};

enum Messages {
    ADDED,
}

class SubscriberAdder implements Updatable {
    messages: Array<string> = [];
    mBus: IMessageBus;
    constructor(mBus: IMessageBus) {
        mBus.subscribe({ subscriber: this, message: "ADD" });
        this.mBus = mBus;
    }
    update(message: MBusMessage) {
        const [name, payload] = message;
        console.log(`Received message ${name}`);
        payload.value += 10;
        this.mBus.deliver([Messages.ADDED, payload], this);
        this.messages.push("ADDED");
    }
}

class SubAll implements Updatable {
    messages: Array<MessageName> = [];
    mBus: IMessageBus;
    constructor(mBus: IMessageBus) {
        this.mBus = mBus;
        mBus.subscribe({ subscriber: this });
    }
    update(message: MBusMessage) {
        this.messages.push(message[0]);
    }
}

class Added implements Updatable {
    messages: Array<MessageName> = [];
    mBus: IMessageBus;
    constructor(mBus: IMessageBus) {
        this.mBus = mBus;
        mBus.subscribe({ subscriber: this, message: Messages.ADDED });
    }
    update(message: MBusMessage) {
        this.messages.push(message[0]);
    }
}

class Fan implements Updatable {
    messages: Array<MessageName> = [];
    mBus: IMessageBus;
    constructor(mBus: IMessageBus, other: any) {
        this.mBus = mBus;
        mBus.subscribe({ subscriber: this, channel: other });
    }
    update(message: MBusMessage) {
        this.messages.push(message[0]);
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
        const adder = new SubscriberAdder(mBus);
        const adder2 = new SubscriberAdder(mBus);
        const added = new Added(mBus);
        const all = new SubAll(mBus);
        const fan = new Fan(mBus, adder);
        const fan2 = new Fan(mBus, "123");
        beforeAll(() => {
            mBus.deliver(["ADD", payload], null);
            mBus.deliver(["ADD", payload], null);
            mBus.deliver(["ADD", payload], null);
            mBus.deliver(["ADD", payload], null);
            mBus.deliver(["FOO", payload], null, "123");
        });
        it("Should verify that value has been incremented", async () => {
            expect(all.messages.length).toBe(13);
            expect(payload.value).toBe(80);
        });

        it("Should verify number of message specific messages", () => {
            expect(added.messages.length).toBe(8);
        });

        it("Should verify number of messages received from another sender", () => {
            expect(fan.messages.length).toBe(4);
            for (let m of fan.messages) {
                expect(m).toBe(Messages.ADDED);
            }
        });

        it("should verify messages from channel", () => {
            expect(fan2.messages.length).toBe(1);
            expect(fan2.messages[0]).toBe("FOO");
        });
    });

    describe("Testing unsubscribe", () => {
        const mBus = new MessageBus();
        const fan2 = new Fan(mBus, "123");
        beforeAll(() => {
            mBus.deliver("ADD", null, "123");
            mBus.deliver("ADD", null);
            mBus.deliver("ADD", null);
            mBus.deliver("ADD", null);
            mBus.deliver("FOO", null, "123");

            mBus.deliver("ASDF", null);
            mBus.unsubscribe(fan2);
            mBus.deliver("FOO", null, "123");
        });

        it("Should verify number of received messages", () => {
            expect(fan2.messages.length).toBe(2);
        });

        it("Should throw an error because of undefined message", () => {
            expect(() => {
                mBus.deliver(undefined, null, "123");
            }).toThrowError();
        });
    });
});
