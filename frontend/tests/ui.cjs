/* UI contract smoke test with a mocked API. Never calls OpenAI or a real database. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let authenticated = false;
  let settings = { prompt: 'Converse com o usuário e crie a arte quando tiver os detalhes necessários.', quality: 'medium' };
  let chats = [];
  let messages = [];
  let turns = 0;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/login') { authenticated = true; return json({ ok: true }); }
    if (!authenticated) return json({ detail: 'Entre para acessar o Studio.' }, 401);
    if (path === '/api/auth/session') return json({ ok: true });
    if (path === '/api/auth/logout') { authenticated = false; return json({ ok: true }); }
    if (path === '/api/health') return json({ ok: true, configured: true });
    if (path === '/api/settings') {
      if (method === 'PUT') settings = request.postDataJSON();
      return json(settings);
    }
    if (path.startsWith('/api/images/')) return route.fulfill({ contentType: 'image/png', body: png });
    if (path === '/api/chats') {
      if (method === 'POST') { const chat = { id: 'chat-1', title: 'Nova criação', updated_at: new Date().toISOString() }; chats = [chat]; return json(chat, 201); }
      return json(chats);
    }
    if (path === '/api/chats/chat-1/messages') {
      turns++;
      chats[0].title = 'Pulseira para evento';
      messages.push({ id: `u-${turns}`, role: 'user', text: turns === 1 ? 'Quero uma pulseira' : 'Evento Aurora 2026', image: null, status: 'completed', mode: 'mockup' });
      messages.push({ id: `a-${turns}`, role: 'assistant', text: turns === 1 ? 'Qual é o nome do evento e a cor desejada?' : '', image: turns === 2 ? 'image.png' : null, status: 'completed', mode: 'mockup' });
      return json({ id: `a-${turns}`, status: 'pending' }, 202);
    }
    if (path === '/api/chats/chat-1') {
      if (method === 'PATCH') chats[0].title = request.postDataJSON().title;
      if (method === 'DELETE') { chats = []; messages = []; return route.fulfill({ status: 204 }); }
      return json({ ...chats[0], messages });
    }
    return json({ detail: 'Unexpected mock endpoint: ' + path }, 404);
  });
  try {
    await page.goto(process.env.TEST_APP_URL || 'http://127.0.0.1:3000');
    await page.getByLabel('Senha da equipe').fill('test-password');
    await page.getByRole('button', { name: 'Entrar no Studio' }).click();
    await page.getByRole('heading', { name: /Imagine. Crie./ }).waitFor();
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: /Festival & shows/ }).click();
    assert.match(await page.getByLabel('Descreva sua arte').inputValue(), /Aurora/);
    await page.getByLabel('Descreva sua arte').fill('Quero uma pulseira');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await page.getByText('Qual é o nome do evento e a cor desejada?', { exact: true }).waitFor();
    await page.getByLabel('Descreva sua arte').fill('Evento Aurora 2026');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await page.getByAltText('Simulação de pulseira gerada').waitFor();
    assert.match(await page.getByRole('link', { name: 'Baixar PNG' }).getAttribute('href'), /download=true/);
    await page.getByRole('button', { name: 'Configurações do assistente' }).click();
    await page.getByLabel('Prompt do assistente').fill('Use cores vibrantes. Pergunte o nome do evento antes de gerar.');
    await page.getByRole('button', { name: 'Salvar configurações' }).click();
    await page.getByRole('button', { name: /Configurações salvas/ }).waitFor();
    assert.match(settings.prompt, /cores vibrantes/);
    await page.getByRole('button', { name: 'Fechar configurações' }).click();
    await page.getByRole('button', { name: 'Renomear conversa' }).click();
    await page.getByRole('textbox', { name: 'Nome da criação' }).fill('Aurora VIP');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.getByRole('button', { name: 'Aurora VIP', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Excluir conversa' }).click();
    await page.getByRole('button', { name: 'Excluir criação' }).click();
    await page.getByRole('heading', { name: /Imagine. Crie./ }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true, animations: 'disabled' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile has horizontal overflow');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await page.getByLabel('Senha da equipe').waitFor();
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('UI passed: login, inspiration, text reply, image reply, download, settings, rename, delete, mobile layout, logout.');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
