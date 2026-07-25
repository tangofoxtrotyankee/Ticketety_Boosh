import QRCode from "qrcode";
import { appUrl } from "@/lib/utils";

/** PNG buffer of a QR code encoding the ticket's public URL. */
export async function ticketQrPng(code: string): Promise<Buffer> {
  return QRCode.toBuffer(appUrl(`/tickets/${code}`), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Data URL of a QR code for in-page rendering. */
export async function ticketQrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(appUrl(`/tickets/${code}`), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
