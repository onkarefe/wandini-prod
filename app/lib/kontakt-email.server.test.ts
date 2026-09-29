import {describe, expect, it} from 'vitest';
import {
  buildInternalKontaktEmail,
  buildKontaktAcknowledgement,
} from '~/lib/kontakt-email.server';

const submission = {
  fullName: 'Anna Example',
  email: 'Anna@example.com',
  phone: '+49 123',
  message: 'A question about my room.\nSecond line.',
};

describe('Kontakt email content', () => {
  it.each([
    ['DE', 'Neue Kontaktanfrage – Anna Example'],
    ['EN', 'New contact request – Anna Example'],
  ] as const)('builds the %s internal message', (language, subject) => {
    const email = buildInternalKontaktEmail(submission, {language});
    expect(email.subject).toBe(subject);
    expect(email.to).toEqual([{email: 'info@wandini.shop'}]);
    expect(email.replyTo).toEqual({
      email: 'Anna@example.com',
      name: 'Anna Example',
    });
    expect(email).not.toHaveProperty('sender');
    expect(email).not.toHaveProperty('attachment');
    for (const value of Object.values(submission)) {
      expect(email.textContent).toContain(value);
      expect(email.htmlContent).toContain(value.replace(/\n/g, '<br>'));
    }
    expect(email.htmlContent).toContain(
      'lang="' + language.toLowerCase() + '"',
    );
    expect(email.htmlContent).toContain('<h1>Wandini</h1>');
  });

  it('escapes all customer-controlled HTML values and preserves plain text', () => {
    const values = {
      fullName: 'Anna & < > " \'',
      email: 'email&<>"\'@example.com',
      phone: '+49 & < > " \'',
      message: '<script>alert("test")</script> & \'message\'\r\nNext line.',
    };
    const email = buildInternalKontaktEmail(values, {language: 'EN'});
    expect(email.htmlContent).toContain('Anna &amp; &lt; &gt; &quot; &#39;');
    expect(email.htmlContent).toContain(
      'email&amp;&lt;&gt;&quot;&#39;@example.com',
    );
    expect(email.htmlContent).toContain('+49 &amp; &lt; &gt; &quot; &#39;');
    expect(email.htmlContent).toContain(
      '&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; &#39;message&#39;<br>Next line.',
    );
    expect(email.htmlContent).not.toContain('<script>');
    for (const value of Object.values(values))
      expect(email.textContent).toContain(value);
  });

  it.each([
    [
      'DE',
      'Wir haben deine Nachricht erhalten',
      'Vielen Dank für deine Nachricht. Wir haben sie erhalten und werden sie prüfen.',
    ],
    [
      'EN',
      'We received your message',
      'Thank you for your message. We received it and will review it.',
    ],
  ] as const)(
    'builds the exact %s acknowledgement without additional promises or extras',
    (language, subject, body) => {
      const email = buildKontaktAcknowledgement(submission, {language});
      expect(email).toEqual({
        to: [{email: submission.email, name: submission.fullName}],
        subject,
        textContent: 'Wandini\n\n' + body,
        htmlContent:
          '<!doctype html><html lang="' +
          language.toLowerCase() +
          '"><body><h1>Wandini</h1><p>' +
          body +
          '</p></body></html>',
      });
      expect(email).not.toHaveProperty('attachment');
      expect(email).not.toHaveProperty('replyTo');
      expect(email.htmlContent).not.toContain('<img');
    },
  );
});
