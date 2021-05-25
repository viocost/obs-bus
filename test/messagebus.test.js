const { MessageBus, MBusMessage } = require("../");
const assert = require("assert")
const CuteSet = require("cute-set")

class Subscriber {
    constructor(id) {
        this.id = id;
        this.delivered = [];
    }

    update(message) {
        this.delivered.push(message);
        console.log(`Subscriber ${this.id} received message ${message[0]} DATA:`);
        console.dir(message[1])
    }
}



describe("Testing message bus", ()=>{

    it("Should create message bus", ()=>{
        const mBus = MessageBus.make();
        assert(mBus instanceof MessageBus)
    })

    it("Should subscribe subscribers", ()=>{
        
        const s1 = new Subscriber(1);
        const s2 = new Subscriber(2);
        const s3 = new Subscriber(3);

        const mBus = MessageBus.make();
        mBus.subscribe({ subscriber: s1, message: "TEST" });
        mBus.subscribe({ subscriber: s2, message: "TEST", channel: [1, 2] });
        mBus.subscribe({ subscriber: s3 });

        assert(new CuteSet([s1, s2, s3]).equal(mBus.subscribers()))
    })

})

function runTest() {
    console.log("===Testing regular subscriptions and delivery");
    return new Promise((resolve, reject) => {
        const mBus = MessageBus.make();

        const s1 = new Subscriber(1);
        const s2 = new Subscriber(2);
        const s3 = new Subscriber(3);

        mBus.subscribe({ subscriber: s1, message: "TEST" });
        mBus.subscribe({ subscriber: s2, message: "TEST" });
        mBus.subscribe({ subscriber: s3 });

        mBus.deliver(MBusMessage.make("TEST1", { a: 1, b: 2 }), s2);
        mBus.deliver(MBusMessage.make("TEST2", { a: 1, b: 2 }), s2);
        mBus.to("ch1").to("ch2").deliver("FOO", s2);
        mBus.unsubscribe(s3);

        mBus.to("ch1").to("ch2").deliver("TEST", s2);
        assert(s1.delivered.length === 1);
        assert(s2.delivered.length === 0);
        setTimeout(() => resolve(), 500);
    });
}

function testChannels() {
    console.log("\n\n==Testing channels ");
    return new Promise((resolve, reject) => {
        const mBus = MessageBus.make(true);

        const s1 = new Subscriber(1);
        const s2 = new Subscriber(2);
        const s3 = new Subscriber(3);

        mBus.subscribe({ subscriber: s1, channel: [s2, "x", 55] });

        mBus.deliver("TEST1_nopayload", s2, s2);
        mBus.deliver("TEST2_nopayload", s2, "x");
        mBus.deliver("TEST3_nopayload", s2, 55);
        mBus.deliver("TEST4_nopayload", s2, [s2, "a", "x"]);
        mBus.to(55).deliver("TEST4_nopayload", s2);
        mBus.to(58).deliver("TEST8_nopayload", s2);
        mBus.unsubscribe(s1, { channel: s2 });
        mBus.to(58).deliver("TEST8_nopayload", s2);

        mBus.unsubscribe(s1, { channel: "non-existent" });
        mBus.unsubscribe(s1, { message: "non-existent" });
        mBus.unsubscribe(s1);
        assert(s1.delivered.length === 6);
        assert(s2.delivered.length === 0);

        mBus.subscribe({ subscriber: s1, message: "TEST1", channel: s2 });

        mBus.deliver("TEST1", s2);

        // Should not be delivered
        mBus.deliver("TEST2", s2, s2);

        // Should not be delivered
        mBus.deliver("TEST2", s2);

        mBus.deliver("TEST1", s2, s2);

        //Should be deliverd as we say channel s2
        mBus.deliver("TEST1", s3, s2);

        //Should not be deliverd as no filter pass
        mBus.deliver("TEST1", s3);
        mBus.deliver("TEST1", {});

        mBus.deliver(Symbol("TEST1"), s3, s2);
        assert(s1.delivered.length === 9);
        console.log(s1.delivered.length);
        setTimeout(() => resolve(), 500);
    });
}

function testEndless() {
    return new Promise((resolve, reject) => {
        try{
            
            const s1 = new Subscriber(1);
            const s2 = new Subscriber(2);
            const mBus = MessageBus.make(null, true);

            s1.update = function (message, sender, bus) {
                console.log(`Subscriber ${this.id} Received message ${message[0]}`);
                bus.deliver("test", s1);
            };
            s2.update = function (message, sender, bus) {
                console.log(`Subscriber ${this.id} Received message ${message[0]}`);
                bus.deliver("test", s2);
            };

            mBus.subscribe({ subscriber: s2, channel: s1 });
            mBus.subscribe({ subscriber: s1, channel: s2 });

            mBus.deliver("test", s1);
        }catch(err){
            console.log("Stack blew up successfully");
            resolve()
        }

    });
}


