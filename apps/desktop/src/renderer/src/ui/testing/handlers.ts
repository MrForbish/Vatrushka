import { delay, http, HttpResponse } from 'msw';

export const defaultHandlers = [
  http.get('*/health', async () => {
    await delay(80);
    return HttpResponse.json({ ok: true, service: 'vatrushka-storybook' });
  }),
];
