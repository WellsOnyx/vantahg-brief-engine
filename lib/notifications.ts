// Twilio SMS notification stub — wire up when ready
export async function sendReviewerNotification(phone: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS STUB] Would send to ${phone}: ${message}`);
    return;
  }

  // TODO: Implement Twilio SMS sending
  // const twilio = require('twilio')(accountSid, authToken);
  // await twilio.messages.create({ body: message, from: fromNumber, to: phone });
  console.log(`[SMS STUB] Would send to ${phone}: ${message}`);
}
