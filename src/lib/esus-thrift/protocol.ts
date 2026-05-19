/**
 * Apache Thrift TBinaryProtocol writer — implementação minimalista,
 * pura JS, sem dependências nativas (roda em Cloudflare Workers).
 *
 * Spec de referência: https://github.com/apache/thrift/blob/0.9.2/lib/java/src/org/apache/thrift/protocol/TBinaryProtocol.java
 * Wire format: big-endian para todos os inteiros e double IEEE-754.
 */

// Type IDs do protocolo Thrift
export const TType = {
  STOP: 0,
  VOID: 1,
  BOOL: 2,
  BYTE: 3,
  DOUBLE: 4,
  I16: 6,
  I32: 8,
  I64: 10,
  STRING: 11, // também usado para binary
  STRUCT: 12,
  MAP: 13,
  SET: 14,
  LIST: 15,
} as const;

export type TTypeId = typeof TType[keyof typeof TType];

/**
 * Buffer de escrita que cresce dinamicamente.
 * Mantém um Uint8Array interno e duplica quando enche.
 */
export class TBinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  private offset = 0;

  constructor(initialSize = 1024) {
    this.buf = new Uint8Array(initialSize);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number) {
    if (this.offset + extra <= this.buf.byteLength) return;
    let cap = this.buf.byteLength;
    while (cap < this.offset + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  /** Retorna uma cópia exata dos bytes escritos. */
  toBytes(): Uint8Array {
    return this.buf.slice(0, this.offset);
  }

  // ---------- primitivos ----------

  writeBool(v: boolean) {
    this.ensure(1);
    this.view.setUint8(this.offset, v ? 1 : 0);
    this.offset += 1;
  }

  writeByte(v: number) {
    this.ensure(1);
    this.view.setInt8(this.offset, v);
    this.offset += 1;
  }

  writeI16(v: number) {
    this.ensure(2);
    this.view.setInt16(this.offset, v, false);
    this.offset += 2;
  }

  writeI32(v: number) {
    this.ensure(4);
    this.view.setInt32(this.offset, v, false);
    this.offset += 4;
  }

  /**
   * Thrift i64 é signed 64-bit. JS Number só vai com segurança até 2^53.
   * Aceitamos number (até MAX_SAFE_INTEGER) ou bigint para valores grandes
   * como datas Epoch em ms (que cabem em 2^53).
   */
  writeI64(v: number | bigint) {
    this.ensure(8);
    const big = typeof v === "bigint" ? v : BigInt(v);
    this.view.setBigInt64(this.offset, big, false);
    this.offset += 8;
  }

  writeDouble(v: number) {
    this.ensure(8);
    this.view.setFloat64(this.offset, v, false);
    this.offset += 8;
  }

  writeString(v: string) {
    const utf8 = new TextEncoder().encode(v);
    this.ensure(4 + utf8.byteLength);
    this.view.setInt32(this.offset, utf8.byteLength, false);
    this.offset += 4;
    this.buf.set(utf8, this.offset);
    this.offset += utf8.byteLength;
  }

  writeBinary(v: Uint8Array) {
    this.ensure(4 + v.byteLength);
    this.view.setInt32(this.offset, v.byteLength, false);
    this.offset += 4;
    this.buf.set(v, this.offset);
    this.offset += v.byteLength;
  }

  // ---------- struct ----------

  /** Escreve o cabeçalho de um campo (tipo + fieldId). */
  writeFieldBegin(type: TTypeId, id: number) {
    this.writeByte(type);
    this.writeI16(id);
  }

  /** Marca fim de struct (STOP). */
  writeFieldStop() {
    this.writeByte(TType.STOP);
  }

  // ---------- containers ----------

  writeListBegin(elemType: TTypeId, size: number) {
    this.writeByte(elemType);
    this.writeI32(size);
  }

  writeSetBegin(elemType: TTypeId, size: number) {
    this.writeByte(elemType);
    this.writeI32(size);
  }

  writeMapBegin(keyType: TTypeId, valueType: TTypeId, size: number) {
    this.writeByte(keyType);
    this.writeByte(valueType);
    this.writeI32(size);
  }

  // ---------- helpers de alto nível ----------

  /** Atalho: campo opcional só é escrito se valor não-nulo. */
  optString(id: number, v: string | null | undefined) {
    if (v == null || v === "") return;
    this.writeFieldBegin(TType.STRING, id);
    this.writeString(v);
  }

  reqString(id: number, v: string) {
    this.writeFieldBegin(TType.STRING, id);
    this.writeString(v);
  }

  optI64(id: number, v: number | bigint | null | undefined) {
    if (v == null) return;
    this.writeFieldBegin(TType.I64, id);
    this.writeI64(v);
  }

  reqI64(id: number, v: number | bigint) {
    this.writeFieldBegin(TType.I64, id);
    this.writeI64(v);
  }

  optI32(id: number, v: number | null | undefined) {
    if (v == null) return;
    this.writeFieldBegin(TType.I32, id);
    this.writeI32(v);
  }

  optBool(id: number, v: boolean | null | undefined) {
    if (v == null) return;
    this.writeFieldBegin(TType.BOOL, id);
    this.writeBool(v);
  }

  reqBool(id: number, v: boolean) {
    this.writeFieldBegin(TType.BOOL, id);
    this.writeBool(v);
  }

  reqBinary(id: number, v: Uint8Array) {
    this.writeFieldBegin(TType.STRING, id); // binary usa o type-id de STRING
    this.writeBinary(v);
  }

  /** Escreve uma sub-struct usando um callback que recebe o próprio writer. */
  reqStruct(id: number, build: (w: TBinaryWriter) => void) {
    this.writeFieldBegin(TType.STRUCT, id);
    build(this);
    this.writeFieldStop();
  }

  optStruct(
    id: number,
    obj: unknown,
    build: (w: TBinaryWriter) => void,
  ) {
    if (obj == null) return;
    this.reqStruct(id, build);
  }

  /** Lista de inteiros longos (códigos LEDI). */
  optListI64(id: number, values: ReadonlyArray<number | bigint> | null | undefined) {
    if (!values || values.length === 0) return;
    this.writeFieldBegin(TType.LIST, id);
    this.writeListBegin(TType.I64, values.length);
    for (const v of values) this.writeI64(v);
  }

  /** Lista de structs (cada item construído por um callback). */
  optListStruct<T>(
    id: number,
    items: ReadonlyArray<T> | null | undefined,
    build: (w: TBinaryWriter, item: T) => void,
  ) {
    if (!items || items.length === 0) return;
    this.writeFieldBegin(TType.LIST, id);
    this.writeListBegin(TType.STRUCT, items.length);
    for (const item of items) {
      build(this, item);
      this.writeFieldStop();
    }
  }

  /** Lista de strings. */
  optListString(id: number, values: ReadonlyArray<string> | null | undefined) {
    if (!values || values.length === 0) return;
    this.writeFieldBegin(TType.LIST, id);
    this.writeListBegin(TType.STRING, values.length);
    for (const v of values) this.writeString(v);
  }
}

/**
 * Constrói uma struct top-level e devolve os bytes.
 * Inclui o STOP final.
 */
export function buildStruct(build: (w: TBinaryWriter) => void): Uint8Array {
  const w = new TBinaryWriter();
  build(w);
  w.writeFieldStop();
  return w.toBytes();
}
