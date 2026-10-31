/* CasinoCheck Phase 2 — Supabase-backed directory, auth and admin moderation. */
const cfg = window.CASINOCHECK_CONFIG || {};
const configured = /^https:\/\//.test(cfg.supabaseUrl || '') && (cfg.supabaseAnonKey || '').length > 20 && !String(cfg.supabaseUrl).includes('YOUR_');
const sb = configured && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
const $ = (s, root=document) => root.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slugify = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55);
let currentUser = null, currentProfile = null, games = [], activeFilter = 'All';
const categories = ['All','Social arcade','Adventure','Puzzle','Simulation','Other'];
const status = (msg, el=$('#globalMessageFallback')) => { if (el) el.textContent = msg || ''; };
const stars = n => '★'.repeat(Number(n)) + '☆'.repeat(5-Number(n));

function showConfigState(){
  const note = $('#setupNotice');
  if (note) note.hidden = !!sb;
  if (!sb) {
    const btn = $('#accountBtn'); if (btn) btn.textContent = 'Setup required';
    status('Connect Supabase to enable shared reviews, accounts and admin tools.');
  }
}
function setAccountUI(){
  const btn = $('#accountBtn');
  if (btn) btn.textContent = currentUser ? (currentProfile?.role === 'admin' ? 'Admin · Account' : 'My account') : 'Sign in';
  const adminLink = $('#adminNavLink'); if (adminLink) adminLink.hidden = currentProfile?.role !== 'admin';
  const authState = $('#authState');
  if (authState) authState.innerHTML = currentUser ? `<p>Signed in as <b>${esc(currentUser.email)}</b>.</p><button class="btn btn-outline" id="signOutBtn" type="button">Sign out</button>` : '<p>Sign in with email or Google to submit a review.</p>';
  $('#signOutBtn')?.addEventListener('click', signOut);
}
async function loadProfile(){
  if (!sb || !currentUser) { currentProfile=null; return; }
  const {data,error}=await sb.from('profiles').select('id,display_name,role').eq('id',currentUser.id).maybeSingle();
  if (error) console.error(error);
  currentProfile=data || {id:currentUser.id,role:'user'};
}
async function loadGames(){
  if (!sb) { renderGames([]); return; }
  const {data,error}=await sb.from('games').select('id,slug,name,category,developer,website_url,short_description,full_description,icon,is_demo,status').eq('status','published').order('name');
  if (error) { console.error(error); status('Could not load the game directory. Check your Supabase setup and SQL policies.'); renderGames([]); return; }
  games=data || []; renderGames(games);
}
async function loadApprovedReviews(gameId){
  if (!sb) return [];
  const {data,error}=await sb.from('reviews').select('id,display_name,rating,body,created_at').eq('game_id',gameId).eq('status','approved').order('created_at',{ascending:false}).limit(30);
  if (error) { console.error(error); return []; }
  return data || [];
}
function averageFor(id){const rows=approvedCache[id]||[];return rows.length ? (rows.reduce((a,r)=>a+Number(r.rating),0)/rows.length).toFixed(1) : '—';}
const approvedCache={};
async function refreshApprovedCounts(){
  if (!sb) return;
  await Promise.all(games.map(async g=>{approvedCache[g.id]=await loadApprovedReviews(g.id);}));
  renderGames(games);
}
function renderGames(rows){
  const q=($('#searchInput')?.value||'').trim().toLowerCase();
  let list=(rows||[]).filter(g=>(activeFilter==='All'||g.category===activeFilter)&&(`${g.name} ${g.category} ${g.short_description||''}`).toLowerCase().includes(q));
  const sort=$('#sortSelect')?.value;
  if(sort==='rating') list.sort((a,b)=>Number(averageFor(b.id)||0)-Number(averageFor(a.id)||0));
  if(sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  const grid=$('#gameGrid'); if(!grid)return;
  grid.innerHTML=list.length?list.map(g=>{
    const avg=averageFor(g.id), count=(approvedCache[g.id]||[]).length;
    return `<article class="game-card"><div class="card-art"><span class="card-tag">${g.is_demo?'SAMPLE LISTING':'DIRECTORY LISTING'}</span><span aria-hidden="true">${esc(g.icon||'🎮')}</span></div><div class="card-body"><div class="card-top"><h3>${esc(g.name)}</h3><span class="score">${avg}</span></div><div class="stars">${avg==='—'?'No ratings yet':stars(Math.round(Number(avg)))}</div><p>${esc(g.short_description)}</p><div class="card-meta"><span>${esc(g.category)} · ${count} approved review${count===1?'':'s'}</span><button data-open="${esc(g.id)}">View details ↗</button></div></div></article>`;
  }).join(''):'<div class="empty-state">No published games found. Try another search or category.</div>';
}
async function openGame(id){
  const g=games.find(x=>x.id===id); if(!g)return;
  const rows=await loadApprovedReviews(id); approvedCache[id]=rows;
  const avg=rows.length?(rows.reduce((a,r)=>a+Number(r.rating),0)/rows.length).toFixed(1):'No ratings yet';
  $('#dialogContent').innerHTML=`<div class="detail-head"><div class="detail-icon">${esc(g.icon||'🎮')}</div><div><div class="eyebrow">${esc(g.category)} · ${g.is_demo?'SAMPLE LISTING':'DIRECTORY LISTING'}</div><h2>${esc(g.name)}</h2><div class="detail-score">${avg} <span class="stars">${rows.length?stars(Math.round(Number(avg))):''}</span></div></div></div><p class="detail-copy">${esc(g.full_description||g.short_description)}</p>${g.developer?`<p class="detail-copy"><b>Developer:</b> ${esc(g.developer)}</p>`:''}${g.website_url?`<p><a class="text-link" href="${esc(g.website_url)}" target="_blank" rel="noopener noreferrer">Official game website ↗</a></p>`:''}<div class="detail-label">APPROVED PLAYER REVIEWS</div><div id="approvedReviews">${rows.length?rows.map(r=>`<div class="saved-review"><b>${esc(r.display_name)} · ${stars(Number(r.rating))}</b><p>${esc(r.body)}</p><small>${new Date(r.created_at).toLocaleDateString()}</small></div>`).join(''):'<p class="detail-copy">No approved reviews yet.</p>'}</div><button class="btn btn-gold" id="reviewThisGame" type="button" data-game="${esc(g.id)}">Write a review</button><p class="detail-demo">Reviews are user-submitted and published only after moderation. Sample listings are fictional and are not endorsements.</p>`;
  $('#gameDialog').showModal();
  $('#reviewThisGame')?.addEventListener('click',()=>openReview(g.id));
}
function openAuth(){ if(!sb){status('Add your Supabase URL and anon key in config.js first.');return;} $('#authDialog').showModal(); }
function openReview(gameId=''){
  if(!sb){status('Reviews are not enabled until Supabase is configured.');return;}
  if(!currentUser){openAuth();status('Please sign in before submitting a review.');return;}
  const select=$('#reviewGame');select.innerHTML=games.map(g=>`<option value="${esc(g.id)}" ${g.id===gameId?'selected':''}>${esc(g.name)}</option>`).join('');
  status('', $('#reviewMessage'));$('#reviewDialog').showModal();
}
async function signInEmail(e){
  e.preventDefault(); if(!sb)return;
  const email=$('#authEmail').value.trim(), password=$('#authPassword').value;
  const mode=$('#authMode').value;
  const result=mode==='signup'?await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin}}):await sb.auth.signInWithPassword({email,password});
  if(result.error){status(result.error.message,$('#authMessage'));return;}
  if(mode==='signup'&&!result.data.session){status('Check your email for the confirmation link, then sign in.',$('#authMessage'));return;}
  status('Authentication successful.',$('#authMessage'));$('#authDialog').close();
}
async function signInGoogle(){if(!sb)return;const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});if(error)status(error.message,$('#authMessage'));}
async function signOut(){if(sb){await sb.auth.signOut();$('#authDialog').close();}}
async function submitReview(e){
  e.preventDefault(); if(!sb||!currentUser){status('Sign in first.',$('#reviewMessage'));return;}
  const fd=new FormData(e.currentTarget);
  const displayName=String(fd.get('name')).trim().slice(0,40);
  const payload={game_id:fd.get('game'),user_id:currentUser.id,display_name:displayName,rating:Number(fd.get('rating')),body:String(fd.get('review')).trim(),status:'pending'};
  const btn=$('#reviewSubmit');btn.disabled=true;
  const {error}=await sb.from('reviews').insert(payload);btn.disabled=false;
  if(error){status(error.code==='23505'?'You have already submitted a review for this game.':error.message,$('#reviewMessage'));return;}
  status('Thanks! Your review has been submitted and is waiting for admin approval.',$('#reviewMessage'));e.currentTarget.reset();
}
function showAdmin(){if(currentProfile?.role!=='admin'){status('Admin access only.');return;}$('#adminSection').hidden=false;$('#adminSection').scrollIntoView({behavior:'smooth'});loadAdmin();}
async function loadAdmin(){
  if(!sb||currentProfile?.role!=='admin')return;
  const [gRes,rRes]=await Promise.all([
    sb.from('games').select('*').order('created_at',{ascending:false}),
    sb.from('reviews').select('id,game_id,user_id,display_name,rating,body,status,created_at,games(name)').eq('status','pending').order('created_at',{ascending:true})
  ]);
  if(gRes.error||rRes.error){status(gRes.error?.message||rRes.error?.message,$('#adminMessage'));return;}
  $('#adminGames').innerHTML=(gRes.data||[]).map(g=>`<div class="admin-row"><div><b>${esc(g.name)}</b><small>${esc(g.category)} · ${esc(g.status)} ${g.is_demo?'· DEMO':''}</small></div><button class="btn btn-outline" data-archive-game="${esc(g.id)}">${g.status==='archived'?'Archived':'Archive'}</button></div>`).join('')||'<p>No games yet.</p>';
  $('#pendingReviews').innerHTML=(rRes.data||[]).map(r=>`<div class="admin-review"><div><b>${esc(r.display_name)} · ${stars(Number(r.rating))}</b><small>${esc(r.games?.name||'Game')} · ${new Date(r.created_at).toLocaleString()}</small><p>${esc(r.body)}</p></div><div class="admin-actions"><button class="btn btn-gold" data-review-action="approved" data-review-id="${esc(r.id)}">Approve</button><button class="btn btn-outline" data-review-action="rejected" data-review-id="${esc(r.id)}">Reject</button></div></div>`).join('')||'<p>No reviews waiting for approval.</p>';
}
async function addGame(e){
  e.preventDefault();if(!sb||currentProfile?.role!=='admin')return;
  const fd=new FormData(e.currentTarget), name=String(fd.get('name')).trim();
  const row={name,slug:slugify(name)+'-'+Math.random().toString(36).slice(2,6),category:fd.get('category'),developer:String(fd.get('developer')||'').trim()||null,website_url:(/^https?:\/\//i.test(String(fd.get('website_url')||'').trim())?String(fd.get('website_url')).trim():null),short_description:String(fd.get('short_description')).trim(),full_description:String(fd.get('full_description')||'').trim()||null,icon:String(fd.get('icon')||'🎮').trim().slice(0,8),status:fd.get('status'),is_demo:fd.get('is_demo')==='on'};
  const {error}=await sb.from('games').insert(row);if(error){status(error.message,$('#adminMessage'));return;}
  status('Game saved.',$('#adminMessage'));e.currentTarget.reset();await loadGames();await loadAdmin();
}
async function moderateReview(e){const b=e.target.closest('[data-review-action]');if(!b||currentProfile?.role!=='admin')return;const {error}=await sb.from('reviews').update({status:b.dataset.reviewAction,moderated_at:new Date().toISOString()}).eq('id',b.dataset.reviewId);if(error){status(error.message,$('#adminMessage'));return;}await loadAdmin();await refreshApprovedCounts();}
async function archiveGame(e){const b=e.target.closest('[data-archive-game]');if(!b||currentProfile?.role!=='admin')return;const {error}=await sb.from('games').update({status:'archived',updated_at:new Date().toISOString()}).eq('id',b.dataset.archiveGame);if(error){status(error.message,$('#adminMessage'));return;}await loadGames();await loadAdmin();}

$('#filters')?.addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;activeFilter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderGames(games);});
$('#searchInput')?.addEventListener('input',()=>renderGames(games));$('#sortSelect')?.addEventListener('change',()=>renderGames(games));
$('#gameGrid')?.addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)openGame(b.dataset.open);});
$('#writeReviewTop')?.addEventListener('click',()=>openReview());$('#accountBtn')?.addEventListener('click',openAuth);$('#adminNavLink')?.addEventListener('click',e=>{e.preventDefault();showAdmin();});
$('#authForm')?.addEventListener('submit',signInEmail);$('#googleLogin')?.addEventListener('click',signInGoogle);$('#reviewForm')?.addEventListener('submit',submitReview);$('#gameForm')?.addEventListener('submit',addGame);
$('#pendingReviews')?.addEventListener('click',moderateReview);$('#adminGames')?.addEventListener('click',archiveGame);
$('#authMode')?.addEventListener('change',e=>{$('#authSubmit').textContent=e.target.value==='signup'?'Create account':'Sign in';});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
$('#menuToggle')?.addEventListener('click',()=>{const nav=$('#mainNav');const open=nav.classList.toggle('open');$('#menuToggle').setAttribute('aria-expanded',String(open));});
document.querySelectorAll('#mainNav a').forEach(a=>a.addEventListener('click',()=>{$('#mainNav').classList.remove('open');$('#menuToggle')?.setAttribute('aria-expanded','false');}));
$('#year').textContent=new Date().getFullYear();showConfigState();
if(sb){sb.auth.getSession().then(async({data})=>{currentUser=data.session?.user||null;await loadProfile();setAccountUI();await loadGames();await refreshApprovedCounts();if(currentProfile?.role==='admin')$('#adminNavLink').hidden=false;});sb.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;setTimeout(async()=>{await loadProfile();setAccountUI();await loadGames();await refreshApprovedCounts();},0);});}
