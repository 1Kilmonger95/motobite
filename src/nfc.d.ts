// Tipos mínimos de Web NFC (no vienen en lib.dom). Solo disponible en Chrome para Android, con HTTPS.
interface NDEFRecordInit {
  recordType: string;
  data?: string | BufferSource;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
}
interface NDEFMessageInit {
  records: NDEFRecordInit[];
}
interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  data?: DataView;
  encoding?: string;
  lang?: string;
}
interface NDEFMessage {
  records: ReadonlyArray<NDEFRecord>;
}
interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}
declare class NDEFReader extends EventTarget {
  constructor();
  onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => unknown) | null;
  onreadingerror: ((this: NDEFReader, ev: Event) => unknown) | null;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: string | BufferSource | NDEFMessageInit, options?: { overwrite?: boolean; signal?: AbortSignal }): Promise<void>;
}
