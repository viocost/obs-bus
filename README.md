Observer pattern message bus

# Motivation
Most of event driven libraries implement following pattern:

```
emitter.on("some_event", some_callback)
```
While it is certainly useful and solves coupling problem, there are still few issues with it.
We have to explicitly introduce callbacks to an emitter object, thus coupling both together.
Such pattern encourages to make huge objects with tons of event handlers that are hard to maintain.

# obs-bus 
This library offers different approach.

``` javascript
import MessageBus from "obs-bus"

// Initializing message bus
const mBus = new MessageBus()

class Subscriber{
    //Any subscriber must have update method.
    //Following parameters will be passed when update called:
    update(message, senderObject, messageBus){
        //process message
    }
}

// Subscribing an object to a message
mBus.subscribe({subscriber, message, channel}) 

//We can form a message as array where first item is 
//the name of the message and other items is data
const message1 = ['TEST', {/*some data*/}, {/*more data*/}]

//We can just send a string without any data.
//It will be turned into ['HEY'] implicitly.
const message2 = 'HEY'


// Putting message on the bus
mBus.deliver(message1, senderObject, channel)

// Now if message1 is relevant to subscriber subscriber's update method will be called.

```

So, if we want obj1 and obj2 to communicate, we don't have to 
make one of them some kind of emitter and have the other share some callback explicitly. We just subscribe them to message bus and they talk to each other by sending messages.


# Subscriptions 

## Subscribing

``` javascript
mBus.subscribe({subscriber, message: "message_type_as_string", channel: '55'})
```
message and channel are optional
message can be any string or symbol, channel can be anything subscriber must have an update method that is called when relevant message is received,  otherwise error will be thrown.


A subscriber can subscribe to all messages:
```javascript
mBus.subscribe({subscriber})

```

// Subscriber can subscribe to certain type of messages
```javascript
mBus.subscribe({subscriber, message: "message_type_as_string"})
```

Subscriber can subscribe to a message and a channel.
Message will be delivered to the subscriber only when message type
channel match.
```javascript
mBus.subscribe({subscriber, message: "message_type_as_string", channel: '55'})
```

Subscriber can subscribe to a channel, thus
any message sent over to channel '55' will be delivered to subscriber
```javascript
mBus.subscribe({subscriber,  channel: '55'})
```

## Channels
Channel can be anything: number, string, object, array or another sender. 

Each sender represents its own channel. When messages are delivered and there are some objects subscribed to the sender of the message - the message will be delivered, and there is no need to 
explicitly specify a channel: 


```javascript
const obj1, obj2
mBus.subscribe({obj1,  channel: obj2})

mBus.deliver(some_message, obj2)
// obj1 will receive this message
```

## Unsubscribing
We can unsubscribe objects completely, no more messages will be delivered to this obj:
```javascript
mBus.unsubscribe(obj)
```

We can unsubscribe from message or channel:
```javascript
mBus.unsubscribe(obj, {message: "message_type"})
mBus.unsubscribe(obj, {channel})
```

## Sending messages
When sending messages message type and sender are required, 
channel is optional.


