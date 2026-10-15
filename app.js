const $=s=>document.querySelector(s),app=$('#app');
let U=JSON.parse(localStorage.u||'null'),T=localStorage.t||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const wa=(n,m)=>`https://wa.me/55${String(n).replace(/\D/g,'')}?text=${encodeURIComponent(m)}`;
const imgs=j=>{try{return JSON.parse(j)||[]}catch{return[]}};
const bg=u=>u?`style="background-image:url('${esc(u)}')"`:'';
const fd=d=>d.split('-').reverse().join('/');
async function api(a,body,qs='',quiet=false){
  const r=await fetch(`${window.SUPABASE_URL}/functions/v1/conectaelas-api?a=${a}${qs}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Token':T,'apikey':window.SUPABASE_PUBLISHABLE_KEY},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({error:'Resposta inválida'}));
  if(!r.ok){if(r.status===401&&T)logout(true);if(!quiet)alert(d.error||'Erro');throw d}return d}
function logout(s){localStorage.clear();U=null;T='';if(!s)location.hash='#/';nav();}
function nav(){$('#nav').innerHTML=`<a href="#/">Início</a>`+(U?`<a href="#/${U.role==='admin'?'admin':'painel'}">${U.role==='admin'?'Admin':U.role==='provider'?'Meu painel':'Meus agendamentos'}</a><button onclick="logout()">Sair</button>`:`<a href="#/login">Entrar</a><a class="btn sm" href="#/cadastro">Cadastrar</a>`)}
function route(){nav();const h=location.hash.slice(2).split('/');({'':home,p:()=>provider(h[1]),login,cadastro,painel,admin}[h[0]]||home)();scrollTo(0,0)}
addEventListener('hashchange',route);

async function home(){
  let cats;
  try { cats=await api('cats',null,'',true); } catch(e) { app.innerHTML=`<div class="box"><h2>Estamos preparando o Conecta Ela's</h2><p class="muted">A busca e os agendamentos ficarão disponíveis quando o banco de dados for configurado.</p><p class="muted">${esc(e?.error||'Serviço temporariamente indisponível.')}</p></div>`; return; }
  app.innerHTML=`<div class="hero"><h1>Encontre o profissional de beleza ideal</h1><div class="bar"><input id="q" placeholder="Buscar serviço ou profissional..."><select id="cat"><option value="">Todas as categorias</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select><button class="btn" style="background:#fff;color:var(--p)" id="go">Buscar</button></div></div><div class="grid" id="list"></div>`;
  const load=async()=>{const l=await api('providers',null,`&q=${encodeURIComponent($('#q').value)}&cat=${encodeURIComponent($('#cat').value)}`);
    $('#list').innerHTML=l.length?l.map(p=>`<a class="card" href="#/p/${p.id}"><div class="img" ${bg(imgs(p.img)[0])}><div class="logo" ${bg(p.logo)}></div></div><div class="info"><b>${esc(p.name)}</b><br><span class="tag">${esc(p.category||'')}</span><div class="muted">${esc(p.city||'')}</div>${p.min_price?`<div>a partir de <span class="price">${brl(p.min_price)}</span></div>`:''}</div></a>`).join(''):'<p class="muted">Nenhum profissional encontrado.</p>'};
  $('#go').onclick=load;$('#q').onkeydown=e=>e.key==='Enter'&&load();$('#cat').onchange=load;load()}

async function provider(id){
  const p=await api('provider',null,`&id=${id}`);let sv=null,sl=null;
  const days=[...new Set(p.slots.map(s=>s.day))];
  app.innerHTML=`<div class="profile-head"><div class="lg" ${bg(p.logo)}></div><div><h2 style="margin:0">${esc(p.name)}</h2><span class="tag">${esc(p.category||'')}</span> <span class="muted">${esc(p.city||'')}</span><p>${esc(p.bio||'')}</p><a class="btn wa sm" target="_blank" href="${wa(p.whatsapp,'Olá '+p.name+'! Vi seu perfil no Conecta Elas.')}">💬 WhatsApp</a></div></div>
  <h3>Serviços</h3><div class="row">${p.services.map(s=>{const im=imgs(s.images);return`<div class="box"><img class="main-img" id="m${s.id}" src="${esc(im[0]||'')}" alt=""><div class="thumbs">${im.map(u=>`<img src="${esc(u)}" onclick="document.getElementById('m${s.id}').src=this.src">`).join('')}</div><h4>${esc(s.title)}</h4><p class="muted">${esc(s.descr)}</p><div class="price">${brl(s.price)}</div><button class="btn sm" data-s="${s.id}">Escolher</button></div>`}).join('')||'<p class="muted">Sem serviços ainda.</p>'}</div>
  <div class="box"><h3>Agendar</h3><p id="sel" class="muted">Escolha um serviço acima.</p><label>Dia</label><select id="day"><option value="">Selecione</option>${days.map(d=>`<option value="${d}">${fd(d)}</option>`).join('')}</select><label>Horário</label><div class="slots" id="hrs"></div><br><button class="btn" id="bk">Confirmar agendamento</button></div>`;
  document.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{sv=b.dataset.s;$('#sel').textContent='Serviço: '+b.parentNode.querySelector('h4').textContent});
  $('#day').onchange=e=>{sl=null;$('#hrs').innerHTML=p.slots.filter(s=>s.day===e.target.value).map(s=>`<button data-i="${s.id}">${s.hour}</button>`).join('');document.querySelectorAll('#hrs button').forEach(b=>b.onclick=()=>{sl=b.dataset.i;document.querySelectorAll('#hrs button').forEach(x=>x.classList.remove('on'));b.classList.add('on')})};
  $('#bk').onclick=async()=>{if(!U||U.role!=='client')return alert('Entre como cliente para agendar.'),location.hash='#/login';if(!sv||!sl)return alert('Escolha serviço, dia e horário.');
    await api('book',{slot_id:sl,service_id:sv});alert('Agendado! Combine detalhes pelo WhatsApp.');location.hash='#/painel'}}

function authForm(reg){
  app.innerHTML=`<div class="box auth"><h2>${reg?'Criar conta':'Entrar'}</h2>
  ${reg?`<label>Sou</label><select id="role"><option value="client">Cliente</option><option value="provider">Profissional / Estabelecimento</option></select><label>Nome</label><input id="name"><label>WhatsApp (com DDD)</label><input id="wa"><div id="pf" hidden><label>Especialidade</label><select id="cat"></select><label>Cidade</label><input id="city"></div>`:''}
  <label>E-mail</label><input id="email" type="email"><label>Senha</label><input id="pw" type="password"><br><br><button class="btn" id="ok" style="width:100%">${reg?'Cadastrar':'Entrar'}</button>
  <p class="muted">${reg?'Já tem conta? <a href="#/login">Entrar</a>':'Novo aqui? <a href="#/cadastro">Cadastre-se</a>'}</p></div>`;
  if(reg){api('cats').then(c=>$('#cat').innerHTML=c.map(x=>`<option>${esc(x)}</option>`).join(''));$('#role').onchange=e=>$('#pf').hidden=e.target.value!=='provider'}
  $('#ok').onclick=async()=>{const b={email:$('#email').value,password:$('#pw').value};
    if(reg)Object.assign(b,{role:$('#role').value,name:$('#name').value,whatsapp:$('#wa').value,category:$('#cat').value,city:$('#city').value});
    const r=await api(reg?'register':'login',b);T=r.token;U=r.user;localStorage.t=T;localStorage.u=JSON.stringify(U);location.hash=U.role==='admin'?'#/admin':'#/painel'}}
const login=()=>authForm(0),cadastro=()=>authForm(1);

function bookTable(l){return`<table><tr><th>Data</th><th>Serviço</th><th>${U.role==='client'?'Profissional':'Cliente'}</th><th>Status</th><th></th></tr>${l.map(b=>`<tr><td>${fd(b.day)} ${b.hour}</td><td>${esc(b.title)}<br>${brl(b.price)}</td><td>${esc(b.other_name)}</td><td>${b.status}</td><td><a class="btn wa sm" target="_blank" href="${wa(b.other_whatsapp,`Olá! Sobre o agendamento de ${b.title} em ${fd(b.day)} às ${b.hour}.`)}">WhatsApp</a>${U.role==='provider'&&b.status==='pendente'?` <button class="btn sm" onclick="st(${b.id},'confirmado')">Confirmar</button>`:''}${b.status!=='cancelado'?` <button class="btn red sm" onclick="st(${b.id},'cancelado')">Cancelar</button>`:''}</td></tr>`).join('')}</table>`}
window.st=async(id,status)=>{await api('booking_status',{id,status});painel()};

async function painel(tab='ag'){
  if(!U)return location.hash='#/login';
  if(U.role==='admin')return location.hash='#/admin';
  const bk=await api('bookings');
  if(U.role==='client'){app.innerHTML=`<h2>Meus agendamentos</h2><div class="box">${bk.length?bookTable(bk):'<p class="muted">Nenhum agendamento.</p>'}</div>`;return}
  const cats=await api('cats'),me=await api('my_profile'),sv=(await api('provider',null,`&id=${U.id}`)).services,slots=await api('my_slots');
  const tabs={ag:`<div class="box">${bk.length?bookTable(bk):'<p class="muted">Sem agendamentos.</p>'}</div>`,
  perfil:`<div class="box"><label>Nome do estabelecimento</label><input id="n" value="${esc(me.name)}"><label>WhatsApp</label><input id="w" value="${esc(me.whatsapp)}"><label>Especialidade</label><select id="c">${cats.map(c=>`<option ${c===me.category?'selected':''}>${esc(c)}</option>`).join('')}</select><label>Cidade</label><input id="ci" value="${esc(me.city)}"><label>URL da logo</label><input id="l" value="${esc(me.logo)}"><label>Sobre você</label><textarea id="b" rows="4">${esc(me.bio)}</textarea><br><br><button class="btn" id="sp">Salvar</button></div>`,
  serv:`<div class="box"><h3>Novo serviço</h3><label>Título</label><input id="t"><label>Descrição</label><textarea id="d" rows="3"></textarea><label>Valor (R$)</label><input id="pr" type="number" step="0.01"><label>URLs das fotos (uma por linha)</label><textarea id="im" rows="3"></textarea><br><br><button class="btn" id="ss">Publicar</button></div>${sv.map(s=>`<div class="box"><b>${esc(s.title)}</b> — ${brl(s.price)} <button class="btn red sm" onclick="del('service_del',${s.id})">Excluir</button></div>`).join('')}`,
  agenda:`<div class="box"><h3>Disponibilizar horários</h3><label>Dia</label><input id="dy" type="date"><label>Horários (separados por vírgula)</label><input id="hs" placeholder="09:00, 10:30, 14:00"><br><br><button class="btn" id="sa">Adicionar</button></div><div class="box"><div class="slots">${slots.map(s=>`<button ${s.booked?'class="on"':''} onclick="${s.booked?'':`del('slot_del',${s.id})`}" title="${s.booked?'Reservado':'Clique para remover'}">${fd(s.day)} ${s.hour}${s.booked?' ✔':' ✕'}</button>`).join('')||'<span class="muted">Nenhum horário.</span>'}</div></div>`};
  app.innerHTML=`<h2>Painel do profissional</h2><div class="tabs">${[['ag','Agendamentos'],['perfil','Perfil e logo'],['serv','Serviços'],['agenda','Agenda']].map(([k,v])=>`<button class="${k===tab?'on':''}" onclick="painel('${k}')">${v}</button>`).join('')}</div>${tabs[tab]}`;
  const on=(id,f)=>$(id)&&($(id).onclick=f);
  on('#sp',async()=>{await api('profile_save',{name:$('#n').value,whatsapp:$('#w').value,category:$('#c').value,city:$('#ci').value,logo:$('#l').value,bio:$('#b').value});alert('Salvo!')});
  on('#ss',async()=>{await api('service_save',{title:$('#t').value,descr:$('#d').value,price:$('#pr').value,images:$('#im').value});painel('serv')});
  on('#sa',async()=>{await api('slot_add',{day:$('#dy').value,hours:$('#hs').value.split(',').map(x=>x.trim().padStart(5,'0'))});painel('agenda')});
  window._tab=tab}
window.painel=painel;
window.del=async(a,id)=>{await api(a,{id});painel(window._tab)};

async function admin(tab='u'){
  if(!U||U.role!=='admin')return location.hash='#/login';
  const [us,cats,bk]=await Promise.all([api('admin_users'),api('cats'),api('admin_bookings')]);
  const t={u:`<div class="box"><table><tr><th>Nome</th><th>Tipo</th><th>E-mail</th><th>WhatsApp</th><th></th></tr>${us.map(u=>`<tr><td>${esc(u.name)}</td><td>${u.role==='provider'?'Prestador · '+esc(u.category||''):'Cliente'}</td><td>${esc(u.email)}</td><td>${esc(u.whatsapp)}</td><td><button class="btn red sm" onclick="adel(${u.id})">Excluir</button></td></tr>`).join('')}</table></div>`,
  c:`<div class="box"><div class="bar"><input id="nc" placeholder="Nova categoria"><button class="btn" id="ac">Adicionar</button></div><br>${cats.map(c=>`<span class="tag">${esc(c)} <a href="#" onclick="acd('${esc(c)}');return false">✕</a></span> `).join('')}</div>`,
  b:`<div class="box"><table><tr><th>Data</th><th>Serviço</th><th>Cliente</th><th>Profissional</th><th>Status</th></tr>${bk.map(b=>`<tr><td>${fd(b.day)} ${b.hour}</td><td>${esc(b.title)}</td><td>${esc(b.client)}</td><td>${esc(b.provider)}</td><td>${b.status}</td></tr>`).join('')}</table></div>`};
  app.innerHTML=`<h2>Administração</h2><div class="tabs">${[['u','Usuários'],['c','Categorias'],['b','Agendamentos']].map(([k,v])=>`<button class="${k===tab?'on':''}" onclick="admin('${k}')">${v}</button>`).join('')}</div>${t[tab]}`;
  window._at=tab;if($('#ac'))$('#ac').onclick=async()=>{await api('admin_cat_add',{name:$('#nc').value});admin('c')}}
window.admin=admin;
window.adel=async id=>{if(confirm('Excluir esta conta e seus dados?')){await api('admin_user_del',{id});admin('u')}};
window.acd=async name=>{await api('admin_cat_del',{name});admin('c')};
route();
