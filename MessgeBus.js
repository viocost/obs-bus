const CuteSet = require("cute-set");

class MBusMessage extends Array {
    static make(name, data) {
        if (new Set(["string", "symbol"]).has(typeof name)) {
            return new MBusMessage(name, data);
        }
        throw new Error(
            `Name parameter is required and must be a String or a Symbol. Got: ${name}`
        );
    }

    static fromBlob(blob) {
        let [name, data] = JSON.parse(blob);
        return MBusMessage.make(name, data);
    }

    static asMessage(item) {
        return item instanceof MBusMessage
            ? item
            : Array.isArray(item)
            ? MBusMessage.make(...item)
            : MBusMessage.make(item);
    }

    constructor() {
        super(...arguments);
    }
}

class SubscriptionMap extends Map {
    get(key) {
        if (!this.has(key)) return this.default();
        return super.get(key);
    }

    constructor(defaultFunction, entries) {
        super(entries);
        this.default = defaultFunction;
    }
}

class ChannelSender {
    constructor(mBus) {
        this.channels = new CuteSet();
        this.mBus = mBus;
    }

    to(channel) {
        this.channels.add(channel);
        return this;
    }

    deliver(message, sender, channel) {
        if (channel) this.channels.add(channel);
        this.mBus.deliver.call(
            this.mBus,
            message,
            sender,
            this.channels.toArray()
        );
    }
}

class LoggerSubscriber {
    update(message, sender) {
        console.log(
            `====Debugger: message ${message[0].toString()} from ${
                sender.constructor.name
            }`
        );
    }
}

class MessageBus {
    static make(debug) {
        return new MessageBus(debug);
    }
    constructor(debug) {
        this.debug = !!debug;
        this._queue = [];
        this._processing = false;

        this.subscriptionsPerChannel = new SubscriptionMap(() => new CuteSet());

        // If subscription is done for certain message
        // it is stored here as messageType -> subscriber
        this.subscriptionsPerMessage = new SubscriptionMap(() => new Map());

        // If subscriber signs up for all messages
        // it is placed in this map
        this.subscriptionsFull = new CuteSet();
        if (debug) this.subscribe({ subscriber: new LoggerSubscriber() });
    }

    subscribe({ subscriber, message, channel }) {
        if (this.debug) console.log("Subscribe called");
        if (typeof subscriber.update !== "function") {
            throw new Error("Subscriber must have update method");
        }

        if (null == message) {
            if (null == channel) {
                this._subscribeToAll(subscriber);
            }

            this._subscribeToChannel(subscriber, asArray(channel));
        } else {
            this._subscribeToMessage(subscriber, message, asSet(channel));
        }
    }

    unsubscribe(subscriber, { channel, message } = {}) {
        if (channel) this._unsubscribeFromChannel(subscriber, channel);
        if (message) this._unsubscribeFromMessage(subscriber, message);
        if (!channel && !message) this._unsubscribeTotally(subscriber);
    }

    deliver(message, sender, channel) {
        this._queue.push({
            message: MBusMessage.asMessage(message),
            sender,
            channels: asSet(channel),
        });

        if (this._processing) return;

        this._processQueue();
    }

    to(channel) {
        const sender = new ChannelSender(this);
        return sender.to(channel);
    }

    _unsubscribeFromChannel(subscriber, channel) {
        this.subscriptionsPerChannel.get(channel).delete(subscriber);
    }

    _unsubscribeFromMessage(subscriber, message) {
        this.subscriptionsPerMessage.get(message).delete(subscriber);
    }

    _unsubscribeTotally(subscriber) {
        this.subscriptionsFull.delete(subscriber);
        for (let [__, channel] of this.subscriptionsPerChannel) {
            channel.delete(subscriber);
        }

        for (let [__, message] of this.subscriptionsPerMessage) {
            message.delete(subscriber);
        }
    }

    _subscribeToMessage(subscriber, message, channels) {
        if (this.debug) console.log(`Subscribing to message ${message}`);
        if (!this.subscriptionsPerMessage.has(message)) {
            this.subscriptionsPerMessage.set(message, new Map());
        }

        let subscriptions = this.subscriptionsPerMessage.get(message);
        subscriptions.set(subscriber, channels);
    }

    _subscribeToChannel(subscriber, channels) {
        if (this.debug) console.log(`Subscribing to channel ${channels}`);
        for (let channel of channels) {
            if (!this.subscriptionsPerChannel.has(channel)) {
                this.subscriptionsPerChannel.set(channel, new CuteSet());
            }

            this.subscriptionsPerChannel.get(channel).add(subscriber);
        }
    }

    _subscribeToAll(subscriber) {
        if (this.debug) console.log(`Subscribing to all`);
        this.subscriptionsFull.add(subscriber);
    }

    _processQueue() {
        this.processing = true;

        // For every packet in queue
        let packet;
        while ((packet = this._queue.splice(0, 1)[0])) {
            const { message, sender, channels } = packet;
            const receivedSet = new CuteSet();
            receivedSet.add(sender);

            const deliver = function (msg, sender, mBus, subscriber) {
                subscriber.update.call(subscriber, msg, sender, mBus);
            }.bind(null, message, sender, this);

            // Send to full subscribers
            for (let subscriber of this.subscriptionsFull) {
                if (this.debug) console.log("Delivering to all");
                deliver(subscriber);
                receivedSet.add(subscriber);
            }

            // Send to per-message subscribers
            for (let [
                subscriber,
                channelFilter,
            ] of this.subscriptionsPerMessage.get(message[0])) {
                if (receivedSet.has(subscriber)) continue;

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
                    if (this.debug) console.log("Delivering per message");
                    deliver(subscriber);
                    receivedSet.add(subscriber);
                }
            }

            //Extracting all keys from subscriptionsPerChannel
            //that are found in channels of the message
            const combinedChannels = channels.union([sender]);
            let relevantChannels = Array.from(
                this.subscriptionsPerChannel.keys()
            ).filter((key) => combinedChannels.has(key));

            //For each channel getting set of subscribers
            // joining them all together and substracting subscribers that are
            // already got that message
            let subscribers = relevantChannels
                .reduce((acc, key) => {
                    return acc.union(this.subscriptionsPerChannel.get(key));
                }, new CuteSet())
                .minus(receivedSet);

            //Delivering
            for (let subscriber of subscribers) {
                deliver(subscriber);
                receivedSet.add(subscriber);
            }
        }
    }
}

function asArray(thing) {
    if (null == thing) return [];
    return Array.isArray(thing) ? thing : [thing];
}

function asSet(thing) {
    return new CuteSet(asArray(thing));
}

module.exports = {
    default: MessageBus,
    MessageBus,
    MBusMessage,
};
