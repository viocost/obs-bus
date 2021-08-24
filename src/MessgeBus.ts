import * as CuteSet from "cute-set";

import {
    MessageName,
    MBusMessage,
    Updatable,
    Channel,
    IMessageBus,
    UnsubscribeData,
    Subscription,
    MBusPacket,
} from "./types";

export class MessageFactory extends Array {
    static make<T>(name: MessageName, data: T): MBusMessage {
        if (new Set(["string", "symbol", "number"]).has(typeof name)) {
            return [name, data];
        }
        throw new Error(
            `Name parameter is required and must be a String, a Symbol or a Number. Got neither.`
        );
    }

    static fromBlob(blob: string) {
        let [name, data] = JSON.parse(blob);
        return MessageFactory.make(name, data);
    }
}

class SubscriptionMap<TKey = any, TVal = any> {
    private defaultFunction: Function;
    private readonly map: Map<TKey, TVal> = new Map<TKey, TVal>();
    [Symbol.iterator] = function* () {
        for (const record of this.map) {
            yield record;
        }
    };

    get(key: TKey): TVal {
        if (!this.map.has(key)) return this.defaultFunction();
        return this.map.get(key);
    }

    set(key: TKey, val: TVal): void {
        this.map.set(key, val);
    }

    has(key: TKey): boolean {
        return this.map.has(key);
    }

    keys(): IterableIterator<TKey> {
        return this.map.keys();
    }

    values(): IterableIterator<TVal> {
        return this.map.values();
    }

    delete(key: TKey): void {
        this.map.delete(key);
    }

    clear(): void {
        this.map.clear();
    }

    entries(): IterableIterator<[TKey, TVal]> {
        return this.map.entries();
    }

    constructor(defaultFunction = () => undefined) {
        this.defaultFunction = defaultFunction;
    }
}

class LoggerSubscriber implements Updatable {
    update(message: MBusMessage, sender: {}, channel?: Channel) {
        try {
            console.log(
                `====Debugger: message ${message[0].toString()} from ${this.getSenderRepr(
                    sender
                )} on channel ${channel}`
            );
        } catch (err) {
            console.log(`====Debugger: received message but failed to parse`);
        }
    }

    getSenderRepr(sender: {}) {
        return !sender || !sender.constructor
            ? "UNKNOWN"
            : sender.constructor.name;
    }
}

export default class MessageBus implements IMessageBus {
    private readonly _queue: Array<MBusPacket> = [];
    private _processing = false;
    private debug = false;
    private subscriptionsPerChannel: SubscriptionMap<Channel, CuteSet>;
    private subscriptionsPerMessage: SubscriptionMap<
        MessageName,
        Map<Updatable, CuteSet>
    >;
    private subscriptionsFull: CuteSet;
    private messageFactories = {};

    static make(messageFactories = {}, debug: boolean): IMessageBus {
        const mBus = new MessageBus(debug);
        for (const name in messageFactories) {
            mBus.addMessageFactory(name, messageFactories[name]);
        }

        return mBus;
    }

    constructor(debug = false) {
        // message factories
        // This object will contain domain message factories that
        // can be later called to create domain specific messages.

        this.debug = !!debug;

        this.subscriptionsPerChannel = new SubscriptionMap(() => new CuteSet());

        // If subscription is done for certain message
        // it is stored here as messageType -> subscriber -> channels
        this.subscriptionsPerMessage = new SubscriptionMap(() => new Map());

        // If subscriber signs up for all messages
        // it is placed in this map
        this.subscriptionsFull = new CuteSet();
        if (debug) this.subscribe({ subscriber: new LoggerSubscriber() });
    }

    addMessageFactory(name: string, factory: Function) {
        this.messageFactories[name] = factory;
    }

    hasMessageFactory(name: string) {
        return name in this.messageFactories;
    }

    subscribe(data: Subscription) {
        const { subscriber, message, channel } = data;
        if (this.debug) console.log("Subscribe called");
        if (typeof subscriber.update !== "function") {
            throw new Error("Subscriber must have update method");
        }

        if (null == message) {
            if (null == channel) {
                this._subscribeToAll(subscriber);
            }

            this._subscribeToChannel(subscriber, asArray<Channel>(channel));
        } else {
            for (let msg of asArray<MessageName>(message)) {
                this._subscribeToMessage(
                    subscriber,
                    msg,
                    asSet<Channel>(channel)
                );
            }
        }
    }

    unsubscribe(subscriber: Updatable, data: UnsubscribeData = {}) {
        const { channel, message } = data;
        if (channel) this._unsubscribeFromChannel(subscriber, channel);
        if (message) this._unsubscribeFromMessage(subscriber, message);
        if (!channel && !message) this._unsubscribeFully(subscriber);
    }

    deliver(message: MBusMessage | MessageName, sender: {}, channel?: Channel) {
        this._queue.push({
            message: asMessage(message),
            sender,
            channels: asSet<Channel>(channel),
        });

        if (this._processing) return;

        this._processQueue();
    }

    //Returns list of all active subscribers
    getSubscribers(): CuteSet<Updatable> {
        const perChannel = Array.from(
            this.subscriptionsPerChannel.keys()
        ).reduce(
            (acc, key) => acc.union(this.subscriptionsPerChannel.get(key)),
            new CuteSet()
        );

        const perMessage = Array.from(
            this.subscriptionsPerMessage.keys()
        ).reduce(
            (acc, key) =>
                acc.union(this.subscriptionsPerMessage.get(key).keys()),
            new CuteSet()
        );
        return this.subscriptionsFull.union(perChannel).union(perMessage);
    }

    private _unsubscribeFromChannel(subscriber: Updatable, channel: Channel) {
        this.subscriptionsPerChannel.get(channel).delete(subscriber);
    }

    private _unsubscribeFromMessage(
        subscriber: Updatable,
        message: MessageName
    ) {
        this.subscriptionsPerMessage.get(message).delete(subscriber);
    }

    private _unsubscribeFully(subscriber: Updatable) {
        this.subscriptionsFull.delete(subscriber);
        for (let [__, channel] of this.subscriptionsPerChannel) {
            channel.delete(subscriber);
        }

        for (let [__, message] of this.subscriptionsPerMessage) {
            message.delete(subscriber);
        }
    }

    private _subscribeToMessage(
        subscriber: Updatable,
        message: MessageName,
        channels: Array<Channel>
    ) {
        if (this.debug) console.log(`Subscribing to message ${message}`);
        if (!this.subscriptionsPerMessage.has(message)) {
            this.subscriptionsPerMessage.set(message, new Map());
        }

        let subscriptions = this.subscriptionsPerMessage.get(message);
        subscriptions.set(subscriber, channels);
    }

    private _subscribeToChannel(
        subscriber: Updatable,
        channels: Array<Channel>
    ) {
        if (this.debug) console.log(`Subscribing to channel ${channels}`);
        for (let channel of channels) {
            if (!this.subscriptionsPerChannel.has(channel)) {
                this.subscriptionsPerChannel.set(channel, new CuteSet());
            }

            this.subscriptionsPerChannel.get(channel).add(subscriber);
        }
    }

    _subscribeToAll(subscriber: Updatable) {
        if (this.debug) console.log(`Subscribing to all`);
        this.subscriptionsFull.add(subscriber);
    }

    _processQueue() {
        this.setProcessing(true);

        // For every packet in queue
        let packet: MBusPacket;
        while ((packet = this._queue.splice(0, 1)[0])) {
            const { message, sender, channels } = packet;

            if (this.debug) console.log(`Processing message ${message[0]}`);
            const receivedSet = new CuteSet();
            receivedSet.add(sender);

            const deliver = function (
                msg: MBusMessage,
                sender: {},
                mBus: IMessageBus,
                subscriber: Updatable
            ) {
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

        this.setProcessing(false);
    }

    private setProcessing(isProcessing: boolean) {
        this._processing = isProcessing;
    }
}

function asArray<T>(thing: T | Array<T>): Array<T> {
    if (null == thing) return [];
    return Array.isArray(thing) ? thing : [thing];
}

function asSet<T>(item: T) {
    return new CuteSet(asArray<T>(item));
}

function asMessage(item: MBusMessage | MessageName): MBusMessage {
    if (typeof item === "string") {
        return [item];
    }

    if (
        Array.isArray(item) &&
        ["string", "number", "symbol"].includes(typeof item[0])
    ) {
        return item;
    }

    throw new Error(`Invalid message candidate type.`);
}
