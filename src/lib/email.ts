/**
 * src/lib/email.ts
 *
 * Email sending helper using Resend.
 *
 * In test/dev environments without a RESEND_API_KEY, the send is a no-op
 * that logs to console — this prevents test failures and keeps local dev smooth.
 *
 * Usage:
 *   import { sendBookingConfirmation } from "@/lib/email";
 *   await sendBookingConfirmation({ guestName, guestEmail, bookingId, checkIn, checkOut });
 */

export interface BookingConfirmationPayload {
  guestName: string;
  guestEmail: string;
  bookingId: string;
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
  facilityNames: string[];
  totalPrice: number;
}

/**
 * Sends a booking confirmation email to the guest.
 * Silently skips if RESEND_API_KEY is not set (dev/test mode).
 */
export async function sendBookingConfirmation(
  payload: BookingConfirmationPayload,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";

  if (!apiKey || process.env.NODE_ENV === "test") {
    // Dev/test: log instead of sending
    console.log("[email:mock] booking confirmation", {
      to: payload.guestEmail,
      bookingId: payload.bookingId,
    });
    return;
  }

  const checkInStr = payload.checkIn.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const checkOutStr = payload.checkOut.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const facilitiesLine =
    payload.facilityNames.length > 0
      ? payload.facilityNames.join(", ")
      : "N/A";

  const html = `
    <h2>Booking Confirmed — ${payload.propertyName}</h2>
    <p>Dear ${escapeHtml(payload.guestName)},</p>
    <p>Your booking has been confirmed. Here are the details:</p>
    <ul>
      <li><strong>Booking ID:</strong> ${escapeHtml(payload.bookingId)}</li>
      <li><strong>Check-in:</strong> ${checkInStr}</li>
      <li><strong>Check-out:</strong> ${checkOutStr}</li>
      <li><strong>Facilities:</strong> ${escapeHtml(facilitiesLine)}</li>
      <li><strong>Total:</strong> £${payload.totalPrice.toFixed(2)}</li>
    </ul>
    <p>Thank you for your booking.</p>
  `;

  const body = JSON.stringify({
    from,
    to: payload.guestEmail,
    subject: `Booking Confirmed — ${payload.propertyName}`,
    html,
  });

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!resp.ok) {
    // Log but don't throw — email failure should never block the booking response
    console.error("[email] Resend API error", resp.status, await resp.text());
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
