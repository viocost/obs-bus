class FunctorBase extends Function {
    constructor() {
        super("...args", "return this.__self__.__call__(...args)");
        var self = this.bind(this);
        this.__self__ = self;
        return self;
    }
}
module.exports = FunctorBase;
