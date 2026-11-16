declare module "lz4js" {
  const lz4: { decompress(bytes: Uint8Array): Uint8Array };
  export default lz4;
}
