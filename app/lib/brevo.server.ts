export type BrevoMessage = {
  to: Array<{email: string; name?: string}>;
  replyTo?: {email: string; name: string};
  subject: string;
  htmlContent: string;
  textContent: string;
  attachment?: Array<{content: string; name: string}>;
};

// One transactional request per call. Provider details never leave this module.
export async function sendBrevoEmail(
  apiKey: string,
  message: BrevoMessage,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        ...message,
        sender: {name: 'Wandini', email: 'info@wandini.shop'},
      }),
      signal: controller.signal,
      redirect: 'error',
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
