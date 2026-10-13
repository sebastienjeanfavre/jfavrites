// The input arrays are reused between calls, so post a copy.
registerProcessor('capture', class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
});
