'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUp, Check, ChevronDown, CircleHelp, ImagePlus, Layers3, LoaderCircle, LogOut, Menu, MessageSquare, MoreHorizontal, Palette, Plus, Search, Settings2, Sparkles, Trash2, X } from 'lucide-react';

type Chat = { id: string; title: string; updated_at: string };
type Message = { id: string; role: 'user' | 'assistant'; text: string; image: string | null; status: string; mode: string; error: string | null };
type Conversation = Chat & { messages: Message[] };
type Configuration = { prompt: string; quality: string };
const examples = [
  { name: 'Festival & shows', text: 'Pulseira para o festival Aurora, com cores vibrantes, rosa e laranja, e o texto “AURORA FEST 2026 · ACESSO VIP”.', style: 'festival', label: 'AURORA FEST', icon: '✳' },
  { name: 'Eventos corporativos', text: 'Pulseira elegante azul-marinho para um evento corporativo, com o texto “CONNECT 2026” em branco e detalhes geométricos.', style: 'corporate', label: 'CONNECT 2026', icon: '↗' },
  { name: 'Festas & celebrações', text: 'Pulseira lilás e verde-lima para uma festa, com o texto “VAMOS CELEBRAR” e pequenas estrelas.', style: 'party', label: 'VAMOS CELEBRAR', icon: '✦' },
];

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/session') window.dispatchEvent(new Event('studio:session-expired'));
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : `Não foi possível concluir a operação (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json();
}
const imageUrl = (name: string) => `/api/images/${name}`;

export default function Studio() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [mode, setMode] = useState('mockup');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [settings, setSettings] = useState<Configuration | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  const sendLock = useRef(false);
  const requestRef = useRef<string | null>(null);
  const busy = sending || !!current?.messages.some(message => message.status === 'pending');

  async function refreshList() { setChats(await api<Chat[]>('/chats')); }
  useEffect(() => {
    api('/auth/session').then(() => setSignedIn(true)).catch(() => setSignedIn(false));
    const expired = () => { setSignedIn(false); setActive(null); setCurrent(null); setChats([]); selectedRef.current = null; setSettingsOpen(false); setExpanded(null); };
    window.addEventListener('studio:session-expired', expired);
    return () => window.removeEventListener('studio:session-expired', expired);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    setLoading(true);
    Promise.all([api<Chat[]>('/chats'), api<{ configured: boolean }>('/health')])
      .then(([items, health]) => { setChats(items); setConfigured(health.configured); })
      .catch(() => setError('Leve o backend ao ar para conectar o Studio. Veja as instruções no README.'))
      .finally(() => setLoading(false));
  }, [signedIn]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!active || !signedIn) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<Conversation>(`/chats/${active}`);
        if (disposed) return;
        setCurrent(result);
      } catch (e) { if (!disposed) setError((e as Error).message); }
      if (!disposed) timer = setTimeout(poll, 2500);
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, signedIn]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [current?.messages.length, current?.messages.at(-1)?.status]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setExpanded(null); setSettingsOpen(false); setRename(false); setDeleteOpen(false); setHelp(false); setSidebar(false); }
    };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const selector = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = Array.from(modal.querySelectorAll<HTMLElement>(selector));
      const first = elements[0], last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    modal.querySelector<HTMLElement>(selector)?.focus();
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [settingsOpen, expanded, rename, deleteOpen, help]);

  function select(chat: Chat | null) {
    if (sendLock.current) return;
    selectedRef.current = chat?.id || null;
    setActive(chat?.id || null); setCurrent(null); setSidebar(false); setError(''); setDraft(''); setFile(null); requestRef.current = null;
  }
  function attach(candidate?: File) {
    if (!candidate) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(candidate.type)) { setError('Escolha uma imagem PNG, JPG ou WebP.'); return; }
    if (candidate.size > 10 * 1024 * 1024) { setError('A imagem deve ter até 10 MB.'); return; }
    setFile(candidate); setError(''); requestRef.current = null;
  }
  async function send() {
    if (busy || sendLock.current || (!draft.trim() && !file)) return;
    sendLock.current = true; setSending(true); setError('');
    try {
      let id = selectedRef.current;
      if (!id) {
        const chat = await api<Chat>('/chats', { method: 'POST' });
        id = chat.id; selectedRef.current = id; setActive(id);
      }
      requestRef.current ||= crypto.randomUUID();
      const data = new FormData(); data.append('text', draft); data.append('mode', mode); data.append('request_id', requestRef.current);
      if (file) data.append('image', file);
      await api(`/chats/${id}/messages`, { method: 'POST', body: data });
      setDraft(''); setFile(null); requestRef.current = null;
      setCurrent(await api<Conversation>(`/chats/${id}`)); await refreshList();
    } catch (e) { setError((e as Error).message); }
    finally { sendLock.current = false; setSending(false); }
  }
  async function retry(id: string) {
    setSending(true); setError('');
    try { await api(`/messages/${id}/retry`, { method: 'POST' }); if (active) setCurrent(await api<Conversation>(`/chats/${active}`)); }
    catch (e) { setError((e as Error).message); } finally { setSending(false); }
  }
  async function openSettings() {
    setSettingsOpen(true); setSaved(false); setSettings(null);
    try { setSettings(await api<Configuration>('/settings')); } catch (e) { setSettingsOpen(false); setError((e as Error).message); }
  }
  async function saveSettings() {
    setSaving(true);
    try { await api('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); setSaved(true); }
    catch (e) { setSettingsOpen(false); setError((e as Error).message); } finally { setSaving(false); }
  }
  async function changeTitle() {
    try { const chat = await api<Conversation>(`/chats/${active}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }); setCurrent(chat); setRename(false); await refreshList(); }
    catch (e) { setRename(false); setError((e as Error).message); }
  }
  async function removeChat() {
    try { await api(`/chats/${active}`, { method: 'DELETE' }); setDeleteOpen(false); select(null); await refreshList(); }
    catch (e) { setDeleteOpen(false); setError((e as Error).message); }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault(); setLoggingIn(true); setLoginError('');
    try { await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); setPassword(''); setSignedIn(true); }
    catch (e) { setLoginError((e as Error).message); } finally { setLoggingIn(false); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); window.dispatchEvent(new Event('studio:session-expired')); setDraft(''); setFile(null); }
    catch (e) { setError((e as Error).message); }
  }

  if (signedIn === null) return <div className="login-page"><LoaderCircle className="spin" /><p>Conectando ao Studio…</p></div>;
  if (!signedIn) return <div className="login-page"><div className="login-decoration">✳</div><form className="login-card" onSubmit={login}><span className="eyebrow"><Layers3 size={20} /> SUPERPULSEIRAS STUDIO</span><h1>Ideias que ganham<br /><span>forma no pulso.</span></h1><p>Entre no espaço criativo da sua equipe.</p><label className="field-label" htmlFor="password">Senha da equipe</label><input id="password" className="field-select" type="password" autoComplete="current-password" required minLength={1} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} placeholder="Digite sua senha" />{loginError && <p className="login-error" role="alert">{loginError}</p>}<button className="primary-button" disabled={loggingIn}>{loggingIn ? 'Entrando…' : 'Entrar no Studio'}<ArrowUp size={16} /></button><small>Acesso exclusivo à equipe SuperPulseiras</small></form></div>;

  return <div className="studio">
    {sidebar && <button className="sidebar-shade" aria-label="Fechar menu" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'visible' : ''}`}>
      <a className="brand" href="/" aria-label="SuperPulseiras início"><span className="brand-symbol"><Layers3 size={23} /></span><span>super<span className="brand-light">pulseiras</span><small>DESIGN STUDIO</small></span></a>
      <button className="new-chat" onClick={() => select(null)} disabled={sending}><Plus size={18} /> Nova criação <span>+</span></button>
      <label className="search"><Search size={16} /><input placeholder="Buscar conversas" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="history-title">SUAS CRIAÇÕES <span>{chats.length.toString().padStart(2, '0')}</span></div>
      <nav className="history" aria-label="Conversas">
        {loading ? <p className="muted small">Carregando conversas…</p> : chats.filter(chat => chat.title.toLowerCase().includes(search.toLowerCase())).map(chat => <button key={chat.id} className={`chat-link ${active === chat.id ? 'selected' : ''}`} onClick={() => select(chat)} disabled={sending}><MessageSquare size={15} /><span>{chat.title}</span></button>)}
        {!loading && chats.length === 0 && <div className="history-empty"><MessageSquare size={22} /><p>Suas próximas ideias<br />vão morar aqui.</p></div>}
        {search && chats.length > 0 && !chats.some(chat => chat.title.toLowerCase().includes(search.toLowerCase())) && <p className="muted small">Nenhuma conversa encontrada.</p>}
      </nav>
      <div className="sidebar-bottom"><div className="workspace"><span className="workspace-icon">SP</span><div>Seu espaço criativo<small>Equipe SuperPulseiras</small></div><span className="online-dot" /></div>
        <button className="settings-link" onClick={openSettings}><Settings2 size={17} /> Configurações do assistente</button>
        <button className="settings-link" onClick={logout}><LogOut size={16} /> Sair da conta</button>
      </div>
    </aside>
    <main>
      <header><div className="header-left"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setSidebar(true)}><Menu size={21} /></button><span className="header-name">Studio <ChevronDown size={14} /></span><span className="header-divider" /><span className="header-subtitle">Seu próximo design começa aqui</span></div><div className="header-right"><span className="internal-badge"><span /> Uso interno</span><button className="icon-button" aria-label="Como funciona" onClick={() => setHelp(true)}><CircleHelp size={18} /></button></div></header>
      {current && <div className="conversation-header"><span>{current.title}</span><div><button className="icon-button" aria-label="Renomear conversa" onClick={() => { setTitle(current.title); setRename(true); }}><MoreHorizontal size={20} /></button><button className="icon-button" aria-label="Excluir conversa" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 size={16} /></button></div></div>}
      <div className={`content ${current?.messages.length ? 'with-messages' : ''}`}>
        {!active && <section className="welcome"><span className="eyebrow"><span className="tiny-star">✳</span> DA SUA IDEIA PARA A PULSEIRA</span><h1>Imagine. Crie.<br /><span>Coloque no pulso.</span></h1><p>Uma referência, algumas palavras e infinitas possibilidades.<br />Crie artes únicas para o seu próximo evento.</p>
          <div className="inspiration-heading"><span>Uma ideia para começar</span><span>FEITO PARA INSPIRAR <Sparkles size={12} /></span></div>
          <div className="examples">{examples.map(example => <button className="example" key={example.style} onClick={() => { setDraft(example.text); textarea.current?.focus(); }}><div className={`example-art ${example.style}`}><div className="art-circle" /><div className="wristband"><span>{example.icon}</span><b>{example.label}</b><span>{example.icon}</span><div className="perforation" /></div><span className="sample-label">EXEMPLO ILUSTRATIVO</span></div><div className="example-caption">{example.name}<span>↗</span></div></button>)}</div>
        </section>}
        {active && !current && <div className="loading-chat"><LoaderCircle className="spin" /> Carregando sua criação…</div>}
        {current && !current.messages.length && <div className="empty-conversation"><Sparkles size={30} /><h2>Vamos criar sua próxima pulseira?</h2><p>Descreva sua ideia ou anexe uma referência abaixo.</p></div>}
        {current?.messages.map((message, index) => <article key={message.id} className={`message ${message.role}`}>
          {message.role === 'user' ? <div className="user-bubble">{message.image && <button className="reference-button" onClick={() => setExpanded(message.image)}><img src={imageUrl(message.image)} alt="Referência enviada" /></button>}{message.text && <p>{message.text}</p>}<small>{message.mode === 'mockup' ? 'Simulação da pulseira' : 'Arte plana'}</small></div> : <><div className="assistant-label"><span className="assistant-icon"><Sparkles size={15} /></span> SuperPulseiras <span>STUDIO</span></div>
            {message.status === 'pending' && <div className="generation-state" role="status"><div className="generating-orb"><Sparkles size={29} /></div><h3>Trabalhando na sua ideia</h3><p>O assistente está preparando a resposta. Imagens podem levar alguns minutos.</p><span className="progress-track"><span /></span><small>Você pode sair desta conversa e voltar depois.</small></div>}
            {message.status === 'completed' && message.text && <div className="assistant-text">{message.text}</div>}
            {message.status === 'failed' && <div className="failed-state" role="alert"><p>{message.error}</p>{index === current.messages.length - 1 && <button className="secondary-button" disabled={busy} onClick={() => retry(message.id)}>Tentar novamente</button>}</div>}
            {message.image && <div className="result"><button className="result-image" onClick={() => setExpanded(message.image)}><img src={imageUrl(message.image)} alt={message.mode === 'mockup' ? 'Simulação de pulseira gerada' : 'Arte plana de pulseira gerada'} /></button><div className="result-footer"><span><Check size={14} /> {message.mode === 'mockup' ? 'Simulação criada' : 'Arte plana criada'}</span><a href={`${imageUrl(message.image)}?download=true`} download><ArrowDownToLine size={15} /> Baixar PNG</a></div></div>}</>}
        </article>)}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Fechar aviso"><X size={16} /></button></div>}
        {configured === false && !error && <div className="setup-banner"><span className="setup-dot" /> Adicione sua chave da OpenAI em <code>backend/.env</code> para conversar e gerar imagens.</div>}
        <div className="composer" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) attach(event.dataTransfer.files[0]); }}>
          {preview && <div className="attachment"><img src={preview} alt="Referência a enviar" /><span>{file?.name}</span><button className="icon-button" aria-label="Remover referência" onClick={() => { setFile(null); requestRef.current = null; }} disabled={busy}><X size={16} /></button></div>}
          <textarea ref={textarea} aria-label="Descreva sua arte" placeholder={current?.messages.length ? 'O que você quer mudar nesta arte?' : 'Descreva sua pulseira ou envie uma imagem de referência…'} value={draft} onChange={event => { setDraft(event.target.value); requestRef.current = null; }} maxLength={6000} disabled={busy} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} onPaste={event => { const image = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/')); if (image) { event.preventDefault(); attach(image); } }} />
          <div className="composer-toolbar"><div className="composer-tools"><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { attach(event.target.files?.[0]); event.target.value = ''; }} /><button className="attach-button" onClick={() => upload.current?.click()} disabled={busy}><ImagePlus size={18} /><span>Referência</span></button><span className="tool-divider" /><label className="mode-select"><Palette size={15} /><select aria-label="Tipo de resultado" value={mode} disabled={busy} onChange={event => { setMode(event.target.value); requestRef.current = null; }}><option value="mockup">Simulação</option><option value="flat">Arte plana</option></select><ChevronDown size={12} /></label></div><button className="send-button" aria-label="Enviar mensagem" disabled={busy || (!draft.trim() && !file) || (!!active && !current)} onClick={send}>{busy ? <LoaderCircle className="spin" size={19} /> : <ArrowUp size={21} />}</button></div>
        </div><p className="composer-note">{mode === 'flat' ? 'Arte conceitual em PNG. Confira textos, medidas e cores antes de preparar para impressão.' : 'Crie, ajuste e explore. Converse com o assistente e refine sua arte.'}<span>Enter para enviar</span></p>
      </div>
    </main>
    {settingsOpen && <div className="modal-backdrop"><section className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Configurações do assistente"><div className="modal-heading"><div><span className="eyebrow">DO SEU JEITO</span><h2>Configure seu assistente</h2></div><button autoFocus className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Fechar configurações"><X /></button></div><p className="muted">Defina como o Studio cria as artes da sua equipe. As alterações serão usadas nos próximos pedidos.</p>{settings ? <><label className="field-label" htmlFor="system-prompt">Prompt do assistente</label><textarea id="system-prompt" className="prompt-editor" value={settings.prompt} maxLength={16000} onChange={event => { setSaved(false); setSettings({ ...settings, prompt: event.target.value }); }} /><label className="field-label" htmlFor="quality">Qualidade da imagem</label><select id="quality" className="field-select" value={settings.quality} onChange={event => { setSaved(false); setSettings({ ...settings, quality: event.target.value }); }}><option value="low">Rascunho · menor custo</option><option value="medium">Equilibrada · padrão</option><option value="high">Alta · mais detalhes</option></select><div className="modal-footer"><span className="muted small">Salvo no banco de dados da equipe.</span><button className="primary-button" disabled={saving || settings.prompt.trim().length < 10} onClick={saveSettings}>{saving ? 'Salvando…' : saved ? '✓ Configurações salvas' : 'Salvar configurações'}</button></div></> : <p>Carregando configurações…</p>}</section></div>}
    {expanded && <div className="modal-backdrop image-backdrop" role="dialog" aria-modal="true" aria-label="Visualizar imagem" onClick={() => setExpanded(null)}><button className="close-image icon-button" autoFocus aria-label="Fechar imagem" onClick={() => setExpanded(null)}><X /></button><img src={imageUrl(expanded)} alt="Arte ampliada" onClick={event => event.stopPropagation()} /><a className="primary-button" href={`${imageUrl(expanded)}?download=true`} download onClick={event => event.stopPropagation()}><ArrowDownToLine size={16} /> Baixar imagem</a></div>}
    {rename && <div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-label="Renomear conversa"><h2>Nome da criação</h2><input className="field-select" aria-label="Nome da criação" autoFocus value={title} maxLength={100} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && title.trim()) changeTitle(); }} /><div className="modal-footer"><button className="secondary-button" onClick={() => setRename(false)}>Cancelar</button><button className="primary-button" disabled={!title.trim()} onClick={changeTitle}>Salvar</button></div></section></div>}
    {deleteOpen && <div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-label="Excluir conversa"><h2>Excluir esta criação?</h2><p>O histórico e as imagens desta conversa serão excluídos permanentemente.</p><div className="modal-footer"><button autoFocus className="secondary-button" onClick={() => setDeleteOpen(false)}>Cancelar</button><button className="danger-button" onClick={removeChat}>Excluir criação</button></div></section></div>}
    {help && <div className="modal-backdrop"><section className="modal compact" role="dialog" aria-modal="true" aria-label="Como funciona"><div className="modal-heading"><h2>Da ideia à arte</h2><button autoFocus className="icon-button" aria-label="Fechar ajuda" onClick={() => setHelp(false)}><X /></button></div><ol className="help-steps"><li>Descreva sua pulseira, envie uma foto ou combine os dois. Você também pode colar ou arrastar uma imagem.</li><li>Escolha simulação para visualizar a pulseira pronta ou arte plana para desenvolver a estampa.</li><li>Responda às perguntas do assistente e continue na mesma conversa para mudar cores, textos e detalhes.</li><li>Baixe a imagem em PNG quando estiver satisfeito.</li></ol><p className="muted small">O Studio usa as últimas quatro imagens e os textos da conversa como referência. A arte plana é conceitual; a preparação técnica para impressão é uma etapa posterior.</p></section></div>}
  </div>;
}
