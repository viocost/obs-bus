import { CuteSet } from "cute-set";

export type MessageName = string | number | Symbol;

export type Channel = {} | string | number | Symbol;

export type MBusMessage<T = any> = [messageName: MessageName, data?: T];

export type Subscription = {
    subscriber: Updatable;
    message?: MessageName;
    channel?: Channel;
};

export type UnsubscribeData = {
    channel?: Channel;
    message?: MessageName;
};

export type MBusPacket = {
    message: MBusMessage;
    sender: {};
    channels?: CuteSet<Channel>;
};

/**
 * This is interface for a subscriber
 * Any subscriber must implement this interface*/
export interface Updatable {
    update(message: MBusMessage, sender: {}, channel: Channel): void;
}

export interface IMessageBus {
    subscribe(subscription: Subscription): void;
    unsubscribe(subscriber: Updatable, data?: UnsubscribeData): void;
    deliver(message: MBusMessage, sender: {}, channel?: Channel): void;
    getSubscribers(): CuteSet<Updatable>;
}
