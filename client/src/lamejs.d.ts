interface LamejsMp3Encoder {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
}

interface LamejsGlobal {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => LamejsMp3Encoder;
}

interface Window {
  lamejs?: LamejsGlobal;
}
