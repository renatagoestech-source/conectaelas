const $ = (selector) => document.querySelector(selector);
const app = $('#app');
let U = JSON.parse(localStorage.u || 'null');
let T = localStorage.t || '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const brl = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const wa = (number, message) => `https://wa.me/55${String(number).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
const imgs = (value) => { try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch { return []; } };
const bg = (url) => url ? `style="background-image:url('${esc(url)}')"` : '';
const fd = (date) => date ? date.split('-').reverse().join('/') : '';
const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
}

function publicProfileUrl(id) {
  return `${location.origin}${location.pathname}#/p/${encodeURIComponent(id)}`;
}

async function api(action, body, query = '', quiet = false) {
  const response = await fetch(`${window.SUPABASE_URL}/functions/v1/conectaelas-api?a=${action}${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Token': T, apikey: window.SUPABASE_PUBLISHABLE_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({ error: 'Resposta inválida' }));
  if (!response.ok) {
    if (response.status === 401 && T) logout(true);
    if (!quiet) alert(data.error || 'Erro');
    throw data;
  }
  return data;
}

function logout(silent = false) {
  localStorage.removeItem('u');
  localStorage.removeItem('t');
  U = null;
  T = '';
  if (!silent) location.hash = '#/';
  nav();
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ce-theme', next);
  nav();
}

function nav() {
  $('#nav').innerHTML = `<a href="#/">Início</a>` + (U
    ? `<a href="#/${U.role === 'admin' ? 'admin' : 'painel'}">${U.role === 'admin' ? 'Admin' : U.role === 'provider' ? 'Meu painel' : 'Meus agendamentos'}</a><button onclick="logout()">Sair</button>`
    : `<a href="#/login">Entrar</a><a class="btn sm signup-link" href="#/cadastro">Cadastrar</a>`) +
    `<button class="theme-toggle" id="theme-toggle" type="button" aria-label="Alternar tema" title="Alternar tema"><span aria-hidden="true">${document.documentElement.dataset.theme === 'dark' ? '☀' : '☾'}</span></button>`;
  $('#theme-toggle').onclick = toggleTheme;
}

function route() {
  nav();
  const parts = location.hash.slice(2).split('/');
  ({ '': home, p: () => provider(parts[1]), login, cadastro, painel, admin }[parts[0]] || home)();
  scrollTo(0, 0);
}
addEventListener('hashchange', route);

async function home() {
  let categories;
  try {
    categories = await api('cats', null, '', true);
  } catch (error) {
    app.innerHTML = `<div class="box"><h2>Estamos preparando o ConectaFemme</h2><p class="muted">A busca e os agendamentos ficarão disponíveis quando o banco de dados for configurado.</p><p class="muted">${esc(error?.error || 'Serviço temporariamente indisponível.')}</p></div>`;
    return;
  }
  const visualCategories = [
    ['Unhas', '✧'], ['Cabelos', '⌁'], ['Maquiagem', '✦'], ['Cílios', '◌'], ['Sobrancelhas', '⌒'], ['Estética', '✿']
  ];
  app.innerHTML = `<section class="hero search-hero"><div class="search-copy"><span class="eyebrow">DESCUBRA PROFISSIONAIS</span><h1>Sua beleza começa com a escolha certa.</h1><p>Encontre profissionais de confiança, veja seus serviços e escolha quem combina com você.</p></div>
    <div class="bar"><label class="sr-only" for="q">Buscar serviço ou profissional</label><input id="q" placeholder="Buscar serviço ou profissional...">
      <select id="cat"><option value="">Todas as categorias</option>${categories.map((category) => `<option>${esc(category)}</option>`).join('')}</select>
      <input id="max-price" class="price-filter" type="number" min="0" step="0.01" placeholder="Preço máximo (R$)" aria-label="Preço máximo">
      <select id="sort" aria-label="Ordenar profissionais"><option value="price_asc">Menor preço primeiro</option><option value="price_desc">Maior preço primeiro</option><option value="recent">Mais recentes</option></select>
      <button class="btn search-btn" id="go">Buscar profissionais</button></div></section>
    <section class="category-section" aria-labelledby="category-title"><div class="section-intro"><span class="eyebrow">ENCONTRE SEU ESTILO</span><h2 id="category-title">Escolha uma categoria</h2><p>Inspire-se e encontre alguém especial para cuidar de você.</p></div><div class="category-list">${visualCategories.map(([label, icon]) => `<button class="category-chip" type="button" data-category="${esc(label)}"><span class="category-icon" aria-hidden="true">${icon}</span><span>${esc(label)}</span></button>`).join('')}</div></section>
    <p class="muted" id="results-count" aria-live="polite"></p><div class="grid" id="list"></div>`;

  const load = async () => {
    const query = `&q=${encodeURIComponent($('#q').value)}&cat=${encodeURIComponent($('#cat').value)}&max_price=${encodeURIComponent($('#max-price').value)}&sort=${encodeURIComponent($('#sort').value)}`;
    const providers = await api('providers', null, query);
    $('#results-count').textContent = `${providers.length} profissional${providers.length === 1 ? '' : 'is'} encontrado${providers.length === 1 ? '' : 's'}`;
    $('#list').innerHTML = providers.length ? providers.map((professional) => { const cover = imgs(professional.img)[0] || professional.logo || 'assets/conectafemme-logo.png'; return `<a class="card" href="#/p/${professional.id}">
      <div class="img" ${bg(cover)}><div class="logo" ${bg(professional.logo || cover)}></div></div>
      <div class="info"><b>${esc(professional.name)}</b> ${professional.is_demo ? '<span class="tag demo-tag">DEMO</span>' : ''}<br><span class="tag">${esc(professional.category || '')}</span><div class="muted">${esc(professional.city || '')}</div>
      ${professional.min_price != null ? `<div>a partir de <span class="price">${brl(professional.min_price)}</span></div>` : '<div class="muted">Consulte os serviços</div>'}<span class="card-link btn sm">Ver perfil <span aria-hidden="true">→</span></span></div></a>`; }).join('') : '<p class="muted">Nenhum profissional encontrado. Tente ampliar o preço máximo ou alterar a categoria.</p>';
  };
  $('#go').onclick = load;
  $('#q').onkeydown = (event) => event.key === 'Enter' && load();
  $('#max-price').onkeydown = (event) => event.key === 'Enter' && load();
  $('#cat').onchange = load;
  $('#sort').onchange = load;
  document.querySelectorAll('[data-category]').forEach((button) => button.onclick = () => {
    const requested = button.dataset.category;
    const exact = categories.find((category) => category.toLowerCase() === requested.toLowerCase());
    if (exact) { $('#cat').value = exact; $('#q').value = ''; } else { $('#cat').value = ''; $('#q').value = requested; }
    load();
  });
  load();
}

async function provider(id) {
  const professional = await api('provider', null, `&id=${encodeURIComponent(id)}`);
  let selectedService = null;
  let selectedSlot = null;
  const days = [...new Set(professional.slots.map((slot) => slot.day))];
  const instagram = professional.instagram_url
    ? `<a class="btn out sm" href="${esc(professional.instagram_url)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
    : '';
  app.innerHTML = `<div class="profile-head"><div class="lg" ${bg(professional.logo)}></div><div><h2 style="margin:0">${esc(professional.name)}</h2><span class="tag">${esc(professional.category || '')}</span> ${professional.is_demo ? '<span class="tag demo-tag">Perfil demonstrativo</span>' : ''} <span class="muted">${esc(professional.city || '')}</span><p>${esc(professional.bio || '')}</p>
    ${professional.is_demo ? '<p class="muted">Este perfil fictício é apenas para demonstração; o contato não está ativo.</p>' : `<div class="profile-actions"><a class="btn wa sm" target="_blank" rel="noopener noreferrer" href="${wa(professional.whatsapp, `Olá ${professional.name}! Vi seu perfil no ConectaFemme.`)}">WhatsApp</a>${instagram}</div>`}</div></div>
    <h3>Serviços</h3><div class="row">${professional.services.map((service) => {
      const images = imgs(service.images);
      return `<div class="box">${images[0] ? `<img class="main-img" id="m${service.id}" src="${esc(images[0])}" alt="Foto do serviço ${esc(service.title)}">` : '<div class="main-img service-placeholder" aria-label="Imagem ilustrativa">ConectaFemme</div>'}
        <div class="thumbs">${images.map((image) => `<img src="${esc(image)}" alt="Foto de ${esc(service.title)}" onclick="document.getElementById('m${service.id}').src=this.src">`).join('')}</div><h4>${esc(service.title)}</h4><p class="muted">${esc(service.descr)}</p><div class="price">${brl(service.price)}</div>
        ${professional.is_demo ? '<span class="tag demo-tag">Serviço de exemplo</span>' : `<button class="btn sm" data-s="${service.id}">Escolher</button>`}</div>`;
    }).join('') || '<p class="muted">Sem serviços ainda.</p>'}</div>
    ${professional.is_demo ? `<div class="box"><h3>Agenda de exemplo</h3><p class="demo-note">Horários ilustrativos. Perfis fictícios não aceitam agendamentos.</p><div class="slots">${professional.slots.map((slot) => `<span class="tag">${fd(slot.day)} · ${slot.hour}</span>`).join('') || '<span class="muted">Agenda de demonstração.</span>'}</div></div>` : `<div class="box"><h3>Agendar</h3><p id="sel" class="muted">Escolha um serviço acima.</p><label>Dia</label><select id="day"><option value="">Selecione</option>${days.map((day) => `<option value="${day}">${fd(day)}</option>`).join('')}</select><label>Horário disponível</label><div class="slots" id="hrs"></div><br><button class="btn" id="bk">Confirmar agendamento</button></div>`}`;
  if (!professional.is_demo) {
    document.querySelectorAll('[data-s]').forEach((button) => button.onclick = () => {
      selectedService = button.dataset.s;
      $('#sel').textContent = `Serviço: ${button.parentNode.querySelector('h4').textContent}`;
    });
    $('#day').onchange = (event) => {
      selectedSlot = null;
      $('#hrs').innerHTML = professional.slots.filter((slot) => slot.day === event.target.value)
        .map((slot) => `<button data-i="${slot.id}">${slot.hour}</button>`).join('');
      document.querySelectorAll('#hrs button').forEach((button) => button.onclick = () => {
        selectedSlot = button.dataset.i;
        document.querySelectorAll('#hrs button').forEach((item) => item.classList.remove('on'));
        button.classList.add('on');
      });
    };
    $('#bk').onclick = async () => {
      if (!U || U.role !== 'client') { alert('Entre como cliente para agendar.'); location.hash = '#/login'; return; }
      if (!selectedService || !selectedSlot) { alert('Escolha serviço, dia e horário.'); return; }
      await api('book', { slot_id: selectedSlot, service_id: selectedService });
      alert('Agendado! Combine os detalhes pelo WhatsApp.');
      location.hash = '#/painel';
    };
  }
}

function authForm(register) {
  app.innerHTML = `<div class="box auth"><h2>${register ? 'Criar conta' : 'Entrar'}</h2>
    ${register ? `<label>Sou</label><select id="role"><option value="client">Cliente</option><option value="provider">Profissional / Estabelecimento</option></select><label>Nome</label><input id="name"><label>WhatsApp (com DDD)</label><input id="wa"><div id="pf" hidden><label>Especialidade</label><select id="cat"></select><label>Cidade</label><input id="city"></div>` : ''}
    <label>E-mail</label><input id="email" type="email"><label>Senha</label><input id="pw" type="password"><br><br><button class="btn" id="ok" style="width:100%">${register ? 'Cadastrar' : 'Entrar'}</button>
    <p class="muted">${register ? 'Já tem conta? <a href="#/login">Entrar</a>' : 'Novo aqui? <a href="#/cadastro">Cadastre-se</a>'}</p></div>`;
  if (register) {
    api('cats').then((categories) => $('#cat').innerHTML = categories.map((category) => `<option>${esc(category)}</option>`).join(''));
    $('#role').onchange = (event) => $('#pf').hidden = event.target.value !== 'provider';
  }
  $('#ok').onclick = async () => {
    const body = { email: $('#email').value, password: $('#pw').value };
    if (register) Object.assign(body, { role: $('#role').value, name: $('#name').value, whatsapp: $('#wa').value, category: $('#cat').value, city: $('#city').value });
    const result = await api(register ? 'register' : 'login', body);
    T = result.token; U = result.user;
    localStorage.t = T; localStorage.u = JSON.stringify(U);
    location.hash = U.role === 'admin' ? '#/admin' : '#/painel';
  };
}
const login = () => authForm(false);
const cadastro = () => authForm(true);

function bookTable(bookings) {
  return `<table><tr><th>Data</th><th>Serviço</th><th>${U.role === 'client' ? 'Profissional' : 'Cliente'}</th><th>Status</th><th></th></tr>${bookings.map((booking) => `<tr><td>${fd(booking.day)} ${booking.hour}</td><td>${esc(booking.title)}<br>${brl(booking.price)}</td><td>${esc(booking.other_name || 'Cliente')}</td><td>${esc(booking.status)}</td><td>${booking.other_whatsapp ? `<a class="btn wa sm" target="_blank" rel="noopener noreferrer" href="${wa(booking.other_whatsapp, `Olá! Sobre o agendamento de ${booking.title} em ${fd(booking.day)} às ${booking.hour}.`)}">WhatsApp</a>` : ''}${U.role === 'provider' && booking.status === 'pendente' ? ` <button class="btn sm" onclick="st(${booking.id},'confirmado')">Confirmar</button>` : ''}${booking.status !== 'cancelado' ? ` <button class="btn red sm" onclick="st(${booking.id},'cancelado')">Cancelar</button>` : ''}</td></tr>`).join('')}</table>`;
}
window.st = async (id, status) => { await api('booking_status', { id, status }); painel(); };

function weeklyScheduleEditor(schedule = {}) {
  return DAYS.map((day, index) => {
    const settings = schedule[String(index)] || {};
    return `<div class="week-row" data-day="${index}"><label class="week-day"><input class="week-active" type="checkbox" ${settings.active ? 'checked' : ''}> ${day}</label>
      <label>Abre<input class="week-start" type="time" value="${esc(settings.start || '09:00')}"></label>
      <label>Fecha<input class="week-end" type="time" value="${esc(settings.end || '17:00')}"></label>
      <label>Intervalo de<input class="week-break-start" type="time" value="${esc(settings.break_start || '')}"></label>
      <label>Até<input class="week-break-end" type="time" value="${esc(settings.break_end || '')}"></label>
      <label>Duração<select class="week-duration">${[15, 20, 30, 40, 45, 50, 60, 90, 120].map((minutes) => `<option value="${minutes}" ${Number(settings.duration || 30) === minutes ? 'selected' : ''}>${minutes} min</option>`).join('')}</select></label></div>`;
  }).join('');
}

async function compressForUpload(file) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > 15_000_000) throw new Error('Escolha uma imagem com até 15 MB antes da otimização.');
  let dataUrl;
  if (file.size <= 2_500_000) {
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    });
  } else {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    dataUrl = canvas.toDataURL('image/webp', 0.82);
  }
  if (dataUrl.length > 4_200_000) throw new Error('A imagem continua muito grande após a compressão. Escolha outra imagem.');
  return dataUrl;
}

async function uploadSelected(file, kind) {
  return api('image_upload', { kind, data_url: await compressForUpload(file) });
}

async function copyPublicLink(id) {
  const link = publicProfileUrl(id);
  try {
    await navigator.clipboard.writeText(link);
    alert('Link público copiado. Você já pode enviar para suas clientes.');
  } catch {
    prompt('Copie o link público do seu perfil:', link);
  }
}
window.copyPublicLink = copyPublicLink;

function buildManualBookingForm(services, slots) {
  const available = slots.filter((slot) => slot.available && !slot.booked);
  return `<div class="box"><h3>Registrar agendamento combinado por fora do site</h3><p class="muted">Use quando a cliente entrar em contato por WhatsApp, telefone ou pessoalmente. O horário ficará reservado na agenda.</p>
    <div class="manual-booking-grid"><label>Serviço<select id="manual-service"><option value="">Escolha um serviço</option>${services.map((service) => `<option value="${service.id}">${esc(service.title)} · ${brl(service.price)}</option>`).join('')}</select></label>
      <label>Horário disponível<select id="manual-slot"><option value="">Escolha dia e horário</option>${available.map((slot) => `<option value="${slot.id}">${fd(slot.day)} · ${esc(slot.hour)}</option>`).join('')}</select></label>
      <label>Nome da cliente<input id="manual-name" maxlength="120" autocomplete="name"></label><label>WhatsApp da cliente<input id="manual-whatsapp" inputmode="tel" maxlength="30" placeholder="DDD + número" autocomplete="tel"></label></div>
    <br><button class="btn" id="manual-save" ${!available.length || !services.length ? 'disabled' : ''}>Salvar agendamento</button>${!available.length ? '<p class="muted">Não há horários livres. Configure o expediente na aba Agenda.</p>' : ''}</div>`;
}

async function painel(tab = 'ag') {
  if (!U) return location.hash = '#/login';
  if (U.role === 'admin') return location.hash = '#/admin';
  const bookings = await api('bookings');
  if (U.role === 'client') {
    app.innerHTML = `<h2>Meus agendamentos</h2><div class="box">${bookings.length ? bookTable(bookings) : '<p class="muted">Nenhum agendamento.</p>'}</div>`;
    return;
  }

  const [categories, me, publicProfile, slots] = await Promise.all([
    api('cats'), api('my_profile'), api('provider', null, `&id=${U.id}`), api('my_slots'),
  ]);
  const services = publicProfile.services || [];
  const profileLink = publicProfileUrl(U.id);
  const tabs = {
    ag: `${buildManualBookingForm(services, slots)}<div class="box">${bookings.length ? bookTable(bookings) : '<p class="muted">Sem agendamentos ainda.</p>'}</div>`,
    perfil: `<div class="box"><h3>Seu perfil público</h3><p class="muted">Envie este link às suas clientes para elas verem seus serviços e agendarem.</p><div class="share-link-row"><input id="public-link" readonly value="${esc(profileLink)}"><button class="btn" id="copy-link" type="button">Copiar link público</button></div>
      <label>Nome do estabelecimento</label><input id="n" value="${esc(me.name)}"><label>WhatsApp</label><input id="w" value="${esc(me.whatsapp)}"><label>Especialidade</label><select id="c">${categories.map((category) => `<option ${category === me.category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select><label>Cidade</label><input id="ci" value="${esc(me.city)}">
      <label>Instagram</label><input id="instagram" type="url" placeholder="https://www.instagram.com/seuperfil" value="${esc(me.instagram_url || '')}"><label>Foto ou logo do perfil</label><input id="logo-file" type="file" accept="image/jpeg,image/png,image/webp"><small class="muted">JPG, PNG ou WebP; a imagem será carregada diretamente do seu dispositivo.</small>${me.logo ? `<div class="upload-preview" ${bg(me.logo)} aria-label="Logo atual"></div>` : ''}
      <label>Sobre você</label><textarea id="b" rows="4">${esc(me.bio)}</textarea><br><br><button class="btn" id="sp">Salvar perfil</button></div>`,
    serv: `<div class="box"><h3>Novo serviço</h3><label>Título</label><input id="t" maxlength="160"><label>Descrição</label><textarea id="d" rows="3"></textarea><label>Valor (R$)</label><input id="pr" type="number" min="0" step="0.01" required><label>Fotos do serviço</label><input id="service-files" type="file" accept="image/jpeg,image/png,image/webp" multiple><small class="muted">Escolha até 4 imagens do dispositivo; imagens grandes são otimizadas antes do envio.</small><br><br><button class="btn" id="ss">Publicar serviço</button></div>${services.map((service) => `<div class="box"><b>${esc(service.title)}</b> — ${brl(service.price)} <button class="btn red sm" onclick="del('service_del',${service.id})">Excluir</button></div>`).join('')}`,
    agenda: `<div class="box"><h3>Expediente semanal</h3><p class="muted">Marque os dias de atendimento, informe abertura, fechamento e intervalo. Vamos gerar horários disponíveis para os próximos 60 dias.</p><div class="week-schedule">${weeklyScheduleEditor(me.weekly_schedule || {})}</div><br><button class="btn" id="save-weekly">Salvar expediente e gerar horários</button></div>
      <div class="box"><h3>Adicionar horários para uma data específica</h3><p class="muted">Use para abrir um horário extra sem alterar sua rotina semanal.</p><div class="manual-booking-grid"><label>Data<input id="extra-day" type="date" min="${todayInBrazil()}"></label><label>Início<input id="extra-start" type="time" value="09:00"></label><label>Fim<input id="extra-end" type="time" value="17:00"></label><label>Duração<select id="extra-duration">${[15,20,30,40,45,50,60,90,120].map((minutes) => `<option value="${minutes}" ${minutes === 30 ? 'selected' : ''}>${minutes} min</option>`).join('')}</select></label></div><br><button class="btn" id="add-extra">Gerar horários do dia</button></div>
      <div class="box"><h3>Próximos horários</h3><div class="slots">${slots.filter((slot) => slot.available || slot.booked).map((slot) => `<button ${slot.booked ? 'class="on" disabled' : `onclick="del('slot_del',${slot.id})"`} title="${slot.booked ? 'Reservado' : 'Clique para remover'}">${fd(slot.day)} ${esc(slot.hour)}${slot.booked ? ' · Reservado' : ' · Remover'}</button>`).join('') || '<span class="muted">Nenhum horário nos próximos 60 dias. Configure seu expediente acima.</span>'}</div></div>`,
  };
  app.innerHTML = `<h2>Painel do profissional</h2><div class="tabs">${[['ag','Agendamentos'],['perfil','Perfil público'],['serv','Serviços'],['agenda','Expediente e agenda']].map(([key, label]) => `<button class="${key === tab ? 'on' : ''}" onclick="painel('${key}')">${label}</button>`).join('')}</div>${tabs[tab]}`;
  const on = (selector, handler) => { if ($(selector)) $(selector).onclick = handler; };

  on('#copy-link', () => copyPublicLink(U.id));
  on('#sp', async () => {
    const selectedFile = $('#logo-file').files[0];
    let logo = me.logo || '';
    if (selectedFile) logo = (await uploadSelected(selectedFile, 'profile')).url;
    await api('profile_save', { name: $('#n').value, whatsapp: $('#w').value, category: $('#c').value, city: $('#ci').value, logo, bio: $('#b').value, instagram_url: $('#instagram').value });
    alert('Perfil atualizado!');
    painel('perfil');
  });
  on('#ss', async () => {
    const files = [...$('#service-files').files];
    if (files.length > 4) return alert('Escolha no máximo 4 imagens por serviço.');
    const images = [];
    for (const file of files) images.push((await uploadSelected(file, 'service')).url);
    await api('service_save', { title: $('#t').value, descr: $('#d').value, price: $('#pr').value, images });
    painel('serv');
  });
  on('#save-weekly', async () => {
    const schedule = {};
    document.querySelectorAll('.week-row').forEach((row) => {
      schedule[row.dataset.day] = {
        active: row.querySelector('.week-active').checked,
        start: row.querySelector('.week-start').value,
        end: row.querySelector('.week-end').value,
        break_start: row.querySelector('.week-break-start').value,
        break_end: row.querySelector('.week-break-end').value,
        duration: Number(row.querySelector('.week-duration').value),
      };
    });
    await api('schedule_save', { schedule });
    alert('Expediente salvo. Os horários disponíveis dos próximos 60 dias foram atualizados.');
    painel('agenda');
  });
  on('#add-extra', async () => {
    await api('slot_generate', { day: $('#extra-day').value, start: $('#extra-start').value, end: $('#extra-end').value, duration: Number($('#extra-duration').value) });
    alert('Horários adicionados à agenda.');
    painel('agenda');
  });
  on('#manual-save', async () => {
    await api('manual_book', { slot_id: $('#manual-slot').value, service_id: $('#manual-service').value, name: $('#manual-name').value, whatsapp: $('#manual-whatsapp').value });
    alert('Agendamento registrado e horário reservado.');
    painel('ag');
  });
  window._tab = tab;
}
window.painel = painel;
window.del = async (action, id) => { await api(action, { id }); painel(window._tab); };

async function admin(tab = 'u') {
  if (!U || U.role !== 'admin') return location.hash = '#/login';
  const [users, categories, bookings] = await Promise.all([api('admin_users'), api('cats'), api('admin_bookings')]);
  const demos = users.filter((user) => user.is_demo);
  const professionals = users.filter((user) => user.role === 'provider');
  const clients = users.filter((user) => user.role === 'client');
  const userTable = (people, title, empty) => `<div class="box admin-user-group"><h3>${title}</h3>${people.length ? `<table><tr><th>Nome</th><th>Especialidade</th><th>E-mail</th><th>WhatsApp</th><th></th></tr>${people.map((user) => `<tr><td>${esc(user.name)} ${user.is_demo ? '<span class="tag demo-tag">DEMO</span>' : ''}</td><td>${user.role === 'provider' ? esc(user.category || 'Sem categoria') : '—'}</td><td>${esc(user.email)}</td><td>${esc(user.whatsapp)}</td><td><button class="btn red sm" onclick="adel(${user.id})">Excluir</button></td></tr>`).join('')}</table>` : `<p class="muted">${empty}</p>`}</div>`;
  const content = {
    u: `${userTable(professionals, 'Profissionais', 'Nenhum profissional cadastrado.')} ${userTable(clients, 'Clientes', 'Nenhum cliente cadastrado.')}`,
    d: `<div class="box"><p class="muted">Estes perfis são fictícios e estão identificados como demonstração no site público. Removê-los também apaga seus serviços e horários.</p>${demos.length ? `<table><tr><th>Profissional demonstrativo</th><th>Categoria</th><th>E-mail</th><th></th></tr>${demos.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.category || '')}</td><td>${esc(user.email)}</td><td><button class="btn red sm" onclick="adelDemo(${user.id})">Excluir demonstração</button></td></tr>`).join('')}</table>` : '<p class="muted">Nenhum perfil demonstrativo ativo.</p>'}</div>`,
    c: `<div class="box"><div class="bar"><input id="nc" placeholder="Nova categoria"><button class="btn" id="ac">Adicionar</button></div><br>${categories.map((category) => `<span class="tag">${esc(category)} <a href="#" onclick="acd('${esc(category)}');return false">✕</a></span> `).join('')}</div>`,
    b: `<div class="box"><table><tr><th>Data</th><th>Serviço</th><th>Cliente</th><th>Profissional</th><th>Status</th></tr>${bookings.map((booking) => `<tr><td>${fd(booking.day)} ${esc(booking.hour)}</td><td>${esc(booking.title)}</td><td>${esc(booking.client || 'Agendamento manual')}</td><td>${esc(booking.provider)}</td><td>${esc(booking.status)}</td></tr>`).join('')}</table></div>`,
    s: `<div class="box security-box"><h3>Alterar senha administrativa</h3><p class="muted">Use esta área para trocar a senha do acesso administrativo. A senha atual é necessária e a nova senha deve ter pelo menos 8 caracteres.</p><label>Senha atual</label><input id="admin-current-password" type="password" autocomplete="current-password"><label>Nova senha</label><input id="admin-new-password" type="password" minlength="8" autocomplete="new-password"><label>Confirmar nova senha</label><input id="admin-confirm-password" type="password" minlength="8" autocomplete="new-password"><br><br><button class="btn" id="change-admin-password" type="button">Salvar nova senha</button></div>`,
  };
  app.innerHTML = `<h2>Administração</h2><div class="tabs">${[['u','Usuários'],['d','Demonstrações'],['c','Categorias'],['b','Agendamentos'],['s','Segurança']].map(([key,label]) => `<button class="${key === tab ? 'on' : ''}" onclick="admin('${key}')">${label}</button>`).join('')}</div>${content[tab]}`;
  window._at = tab;
  if ($('#ac')) $('#ac').onclick = async () => { await api('admin_cat_add', { name: $('#nc').value }); admin('c'); };
  if ($('#change-admin-password')) $('#change-admin-password').onclick = async () => {
    const current_password = $('#admin-current-password').value;
    const new_password = $('#admin-new-password').value;
    const confirm_password = $('#admin-confirm-password').value;
    if (new_password.length < 8) return alert('A nova senha precisa ter pelo menos 8 caracteres.');
    if (new_password !== confirm_password) return alert('A confirmação da nova senha não confere.');
    await api('admin_password_change', { current_password, new_password, confirm_password });
    alert('Senha administrativa alterada com sucesso.');
    admin('s');
  };
}
window.admin = admin;
window.adel = async (id) => { if (confirm('Excluir esta conta e seus dados?')) { await api('admin_user_del', { id }); admin('u'); } };
window.adelDemo = async (id) => { if (confirm('Excluir este perfil demonstrativo, seus serviços e horários?')) { await api('admin_demo_del', { id }); admin('d'); } };
window.acd = async (name) => { await api('admin_cat_del', { name }); admin('c'); };
route();
