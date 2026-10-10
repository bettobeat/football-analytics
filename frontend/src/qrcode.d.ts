// Minimal types for the "qrcode" package (QR image for two-step login setup)
declare module 'qrcode' {
  export function toDataURL(text: string, options?: { margin?: number; width?: number; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): Promise<string>;
  const QRCode: { toDataURL: typeof toDataURL };
  export default QRCode;
}
