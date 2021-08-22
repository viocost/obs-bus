export type MessageName = string | number | Symbol;

export type MBusMessage<T> = [messageName: MessageName, data: T];

/**
 * This is interface for a subscriber
 * Any subscriber must implement this interface*/
export interface Updatable {}
