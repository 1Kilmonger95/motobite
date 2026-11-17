// La compilación "legacy" de pdf.js funciona en navegadores Android más antiguos; sus tipos son los mismos.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
