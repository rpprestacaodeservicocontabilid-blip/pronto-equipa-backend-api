import { HttpNotificationProvider } from './http-notification.provider';
describe('Notification provider delivery uncertainty', () => {
  const savedFetch = global.fetch;
  const savedEnv = { ...process.env };
  const input = {
    id: 'delivery-1',
    channel: 'EMAIL' as const,
    recipient: 'test@example.invalid',
    subject: 'Test',
    body: 'Test',
  };
  beforeEach(() => {
    process.env.NOTIFICATIONS_EMAIL_URL = 'https://provider.example.invalid/send';
    process.env.NOTIFICATIONS_EMAIL_TOKEN = 'test';
  });
  afterEach(() => {
    global.fetch = savedFetch;
    process.env = { ...savedEnv };
  });
  it('preserves uncertain outcomes instead of risking a duplicate resend', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    expect(await new HttpNotificationProvider().send(input)).toEqual({ status: 'UNKNOWN' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('sends a stable idempotency key and records provider acceptance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ACCEPTED', providerMessageId: 'p1' }),
    });
    expect(await new HttpNotificationProvider().send(input)).toEqual({
      status: 'ACCEPTED',
      providerMessageId: 'p1',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'delivery-1' }),
      }),
    );
  });
  it('separates retryable failures from permanent rejection', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(new HttpNotificationProvider().send(input)).rejects.toThrow();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    expect(await new HttpNotificationProvider().send(input)).toEqual({ status: 'REJECTED' });
  });
  it('refuses insecure provider endpoints', async () => {
    process.env.NOTIFICATIONS_EMAIL_URL = 'http://provider.example.invalid';
    await expect(new HttpNotificationProvider().send(input)).rejects.toThrow('HTTPS');
  });
  it.each([null, ['ACCEPTED'], { status: 7 }, { status: 'UNRECOGNISED' }])(
    'keeps malformed successful responses uncertain (%j)',
    async (payload) => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => payload });
      expect(await new HttpNotificationProvider().send(input)).toEqual({ status: 'UNKNOWN' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('does not turn an unreadable successful response into a retryable failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
    });
    expect(await new HttpNotificationProvider().send(input)).toEqual({ status: 'UNKNOWN' });
  });
});
