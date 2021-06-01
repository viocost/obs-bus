const CuteSet = require("cute-set")
const Functor = require("./Functor")

/*

import Messages from "some-shit"
Messages.FOO({data}, {data}...)
Messages.CHAT_MESSAGE({sdfj, asdf})
CHAT_CLIENT: {

    !FOO
    name string null-ok
    ...

    !BAR

}
class CHAT_CLIENT {
    static FOO(data) {
        // all checks are here
        return ["FOO", ...data];
    }

    static BAR(data) {
        //...
    }
}
*
*/

class MBusMessage extends Array {
    static make(name, data) {
        if (new Set(["string", "symbol"]).has(typeof name)) {
            return new MBusMessage(name, data)
        }
        throw new Error(
            `Name parameter is required and must be a String or a Symbol. Got: ${name}`
        )
    }

    static fromBlob(blob) {
        let [name, data] = JSON.parse(blob)
        return MBusMessage.make(name, data)
    }

    static asMessage(item) {
        return item instanceof MBusMessage
            ? item
            : Array.isArray(item)
            ? MBusMessage.make(...item)
            : MBusMessage.make(item)
    }

    constructor() {
        super(...arguments)
    }
}

/**
 * this class implements a map with default value,
 * such that when key does not exist a default value is returned,
 * instead of undefined or throwing error.
 *
 * The value that is returned is determined by default function
 * which by default returns undefined
 * */
class SubscriptionMap extends Map {
    get(key) {
        if (!this.has(key)) return this.default()
        return super.get(key)
    }

    constructor(defaultFunction = () => undefined, entries) {
        super(entries)
        this.default = defaultFunction
    }
}

class ChannelSender {
    constructor(mBus) {
        this.channels = new CuteSet()
        this.mBus = mBus
    }

    to(channel) {
        this.channels.add(channel)
        return this
    }

    deliver(message, sender, channel) {
        if (channel) this.channels.add(channel)
        this.mBus.deliver.call(
            this.mBus,
            message,
            sender,
            this.channels.toArray()
        )
    }
}

class LoggerSubscriber {
    update(message, sender) {
        console.log(
            `====Debugger: message ${message[0].toString()} from ${
                sender.constructor.name
            }`
        )
    }
}

class MessageBuilder extends Functor {
    constructor(mBus, func) {
        super()
        this.mBus = mBus
        this.buildFunctions = [func]
    }

    deliver(data, sender, channel) {
        this.mBus._deliver(this(data), sender, channel)
    }
    addFactory(factoryName) {
        if (!this.mBus.hasMessageFactory(factoryName)) {
            throw new Error(`Message factory ${factoryName} not found`)
        }
        //pushing factory function at index 0
        this.buildFunctions.splice(
            0,
            0,
            this.mBus.messageFactories[factoryName]
        )
    }

    __call__(data) {
        return this.buildFunctions.reduce((acc, func) => func(acc), data)
    }
}

class DeliveryAgent extends Functor {
    constructor(mBus) {
        super()
        this.mBus = mBus
        this.messageBuilder = new MessageBuilder(mBus)
    }

    __call__(...args) {
        this.mBus._deliver(...args)
    }
}

class MessageBus {
    static make(messageFactories = {}, debug) {
        const mBus = new MessageBus(debug)
        for (const name in messageFactories) {
            mBus.addMessageFactory(name, messageFactories[name])
        }

        return mBus
    }

    constructor(debug) {
        // message factories
        // This object will contain domain message factories that
        // can be later called to create domain specific messages.
        this.messageFactories = {}

        this.deliver = new Proxy(new DeliveryAgent(this), {
            get: (target, prop) => {
                if (prop === "call" || prop === "apply") {
                    return target[prop]
                }

                if (!this.hasMessageFactory(prop)) {
                    throw new Error(`Message factory ${prop} not found`)
                }

                return new Proxy(
                    new MessageBuilder(this, this.messageFactories[prop]),
                    {
                        get: (target, prop, receiver) => target[prop],
                        apply: (target, __, args) => target.deliver(...args)
                    }
                )
            }
        })

        this.debug = !!debug
        this._queue = []
        this._processing = false

        this.subscriptionsPerChannel = new SubscriptionMap(() => new CuteSet())

        // If subscription is done for certain message
        // it is stored here as messageType -> subscriber -> channels
        this.subscriptionsPerMessage = new SubscriptionMap(() => new Map())

        // If subscriber signs up for all messages
        // it is placed in this map
        this.subscriptionsFull = new CuteSet()
        if (debug) this.subscribe({ subscriber: new LoggerSubscriber() })
    }

    addMessageFactory(name, factory) {
        if (typeof name !== "string" || typeof factory !== "function") {
            throw new Error(
                `Expected name and factory function, but got ${name}, ${factory}`
            )
        }
        this.messageFactories[name] = factory
    }

    hasMessageFactory(name) {
        return name in this.messageFactories
    }
    subscribe({ subscriber, message, channel }) {
        if (this.debug) console.log("Subscribe called")
        if (typeof subscriber.update !== "function") {
            throw new Error("Subscriber must have update method")
        }

        if (null == message) {
            if (null == channel) {
                this._subscribeToAll(subscriber)
            }

            this._subscribeToChannel(subscriber, asArray(channel))
        } else {
            for (let msg of asArray(message)) {
                this._subscribeToMessage(subscriber, msg, asSet(channel))
            }
        }
    }

    unsubscribe(subscriber, { channel, message } = {}) {
        if (channel) this._unsubscribeFromChannel(subscriber, channel)
        if (message) this._unsubscribeFromMessage(subscriber, message)
        if (!channel && !message) this._unsubscribeTotally(subscriber)
    }

    _deliver(message, sender, channel) {
        this._queue.push({
            message: MBusMessage.asMessage(message),
            sender,
            channels: asSet(channel)
        })

        if (this._processing) return

        this._processQueue()
    }

    //Returns list of all active subscribers
    subscribers() {
        const perChannel = Array.from(
            this.subscriptionsPerChannel.keys()
        ).reduce(
            (acc, key) => acc.union(this.subscriptionsPerChannel.get(key)),
            new CuteSet()
        )

        const perMessage = Array.from(
            this.subscriptionsPerMessage.keys()
        ).reduce(
            (acc, key) =>
                acc.union(this.subscriptionsPerMessage.get(key).keys()),
            new CuteSet()
        )
        return this.subscriptionsFull.union(perChannel).union(perMessage)
    }

    to(channel) {
        const sender = new ChannelSender(this)
        return sender.to(channel)
    }

    _unsubscribeFromChannel(subscriber, channel) {
        this.subscriptionsPerChannel.get(channel).delete(subscriber)
    }

    _unsubscribeFromMessage(subscriber, message) {
        this.subscriptionsPerMessage.get(message).delete(subscriber)
    }

    _unsubscribeTotally(subscriber) {
        this.subscriptionsFull.delete(subscriber)
        for (let [__, channel] of this.subscriptionsPerChannel) {
            channel.delete(subscriber)
        }

        for (let [__, message] of this.subscriptionsPerMessage) {
            message.delete(subscriber)
        }
    }

    _subscribeToMessage(subscriber, message, channels) {
        if (this.debug) console.log(`Subscribing to message ${message}`)
        if (!this.subscriptionsPerMessage.has(message)) {
            this.subscriptionsPerMessage.set(message, new Map())
        }

        let subscriptions = this.subscriptionsPerMessage.get(message)
        subscriptions.set(subscriber, channels)
    }

    _subscribeToChannel(subscriber, channels) {
        if (this.debug) console.log(`Subscribing to channel ${channels}`)
        for (let channel of channels) {
            if (!this.subscriptionsPerChannel.has(channel)) {
                this.subscriptionsPerChannel.set(channel, new CuteSet())
            }

            this.subscriptionsPerChannel.get(channel).add(subscriber)
        }
    }

    _subscribeToAll(subscriber) {
        if (this.debug) console.log(`Subscribing to all`)
        this.subscriptionsFull.add(subscriber)
    }

    _processQueue() {
        this.processing = true

        // For every packet in queue
        let packet
        while ((packet = this._queue.splice(0, 1)[0])) {
            const { message, sender, channels } = packet

            if (this.debug) console.log(`Processing message ${message[0]}`)
            const receivedSet = new CuteSet()
            receivedSet.add(sender)

            const deliver = function (msg, sender, mBus, subscriber) {
                subscriber.update.call(subscriber, msg, sender, mBus)
            }.bind(null, message, sender, this)

            // Send to full subscribers
            for (let subscriber of this.subscriptionsFull) {
                if (this.debug) console.log("Delivering to all")
                deliver(subscriber)
                receivedSet.add(subscriber)
            }

            // Send to per-message subscribers
            for (let [
                subscriber,
                channelFilter
            ] of this.subscriptionsPerMessage.get(message[0])) {
                if (receivedSet.has(subscriber)) continue

                if (
                    // channelFilter is a set of channels per message subscription
                    // if it is empty, then there is no filter by channel and message
                    // is just delivered
                    channelFilter.length == 0 ||
                    // if intersection of channelFilter and message channels is
                    // not empty, then at least one channel matched and we can deliver
                    channelFilter.intersection(channels.union([sender]))
                        .length > 0
                ) {
                    if (this.debug) console.log("Delivering per message")
                    deliver(subscriber)
                    receivedSet.add(subscriber)
                }
            }

            //Extracting all keys from subscriptionsPerChannel
            //that are found in channels of the message
            const combinedChannels = channels.union([sender])
            let relevantChannels = Array.from(
                this.subscriptionsPerChannel.keys()
            ).filter((key) => combinedChannels.has(key))

            //For each channel getting set of subscribers
            // joining them all together and substracting subscribers that are
            // already got that message
            let subscribers = relevantChannels
                .reduce((acc, key) => {
                    return acc.union(this.subscriptionsPerChannel.get(key))
                }, new CuteSet())
                .minus(receivedSet)

            //Delivering
            for (let subscriber of subscribers) {
                deliver(subscriber)
                receivedSet.add(subscriber)
            }
        }
    }
}

function asArray(thing) {
    if (null == thing) return []
    return Array.isArray(thing) ? thing : [thing]
}

function asSet(channel) {
    return new CuteSet(asArray(channel))
}

module.exports = {
    default: MessageBus,
    MessageBus,
    MBusMessage
}
