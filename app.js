/* Edinburghlympics: static site, CSV-backed, no build tools needed. */
const cfg = window.EDINBURGHLYMPICS_CONFIG || {};
const state = { teams: [], competitors: [], events: [], results: [], matches: [], loaded: false };
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Small CSV parser that handles quoted cells, commas, doubled quotes and CRLF.
function parseCSV(text) {
  const lines = []; let row = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) { if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"'){quoted=false}else{cell+=ch} }
    else if(ch==='"'){quoted=true}
    else if(ch===','){row.push(cell.trim());cell=''}
    else if(ch==='\n'){row.push(cell.trim());if(row.some(Boolean))lines.push(row);row=[];cell=''}
    else if(ch!=='\r'){cell+=ch}
  }
  row.push(cell.trim());if(row.some(Boolean))lines.push(row);
  const [headers,...data]=lines;
  if(!headers)return [];
  headers[0]=headers[0].replace(/^\uFEFF/,'');
  return data.map(cols=>Object.fromEntries(headers.map((key,i)=>[key,cols[i]??''])));
}
async function getCSV(name) {
  const resp = await fetch(`data/${name}.csv?v=${Date.now()}`, {cache:'no-store'});
  if(!resp.ok)throw new Error(`Couldn't load data/${name}.csv (${resp.status})`);
  return parseCSV(await resp.text());
}
function getScores() {
  const people=state.competitors.map(c=>({...c,points:0,played:0}));
  const byID = new Map(people.map(p=>[p.id,p]));
  const completed = new Set(state.events.filter(e=>e.status.toLowerCase()==='completed').map(e=>e.id));
  const countedEvents = new Set();
  for(const r of state.results){
    const p=byID.get(r.competitor_id);
    if(!p || !completed.has(r.event_id))continue;
    const pts=Number(r.points);
    if(!Number.isFinite(pts))continue;
    p.points+=pts;p.played++;countedEvents.add(r.event_id);
  }
  people.sort((a,b)=>b.points-a.points || a.name.localeCompare(b.name));
  let prev=null,rank=0;people.forEach((p,i)=>{if(p.points!==prev){rank=i+1;prev=p.points}p.rank=rank});
  const teams=state.teams.map(t=>({...t,points:people.filter(p=>p.team_id===t.id).reduce((a,p)=>a+p.points,0),athletes:people.filter(p=>p.team_id===t.id).length}));
  teams.sort((a,b)=>b.points-a.points || a.name.localeCompare(b.name));
  prev=null;rank=0;teams.forEach((t,i)=>{if(t.points!==prev){rank=i+1;prev=t.points}t.rank=rank});
  return {people,teams,completedCount:countedEvents.size,hasScores:state.results.length>0&&countedEvents.size>0};
}
const medal = r=>r===1?'🥇':r===2?'🥈':r===3?'🥉':'✦';
function headshot(p,big=false) {
  const initials = p.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
  const sz=big?' big':'';
  // Missing headshots gracefully fall back to initials.
  return `<div class="headshot-fallback headshot${sz}" style="background:${escapeHTML(teamFor(p.team_id)?.color||'#527a83')}"><img class="headshot${sz}" src="${escapeHTML(p.headshot)}" alt="${escapeHTML(p.name)}" onerror="this.remove();this.parentElement.textContent='${escapeHTML(initials)}'" /></div>`;
}
function teamFor(id){return state.teams.find(t=>t.id===id)}
const portraitAnimationClasses = ['portrait-spin-y','portrait-spin-z','portrait-pulse','portrait-sway','portrait-tilt'];
function randomBetween(min,max){return Math.random()*(max-min)+min}
function applyPortraitAnimations(){
  document.querySelectorAll('#individual-leaderboard .headshot-fallback').forEach(el=>{
    el.classList.remove(...portraitAnimationClasses);
    const choice = portraitAnimationClasses[Math.floor(Math.random()*portraitAnimationClasses.length)];
    el.classList.add('portrait-anim',choice);
    el.style.setProperty('--portrait-duration', `${randomBetween(14,28).toFixed(2)}s`);
    el.style.setProperty('--portrait-delay', `${(-randomBetween(0,18)).toFixed(2)}s`);
    el.style.setProperty('--portrait-tilt', `${randomBetween(-10,10).toFixed(1)}deg`);
    el.style.setProperty('--portrait-scale', randomBetween(1.03,1.12).toFixed(2));
    el.style.setProperty('--portrait-travel', `${randomBetween(4,10).toFixed(1)}px`);
  });
}
// Sort both UK dates (DD/MM/YYYY) and ISO dates (YYYY-MM-DD) numerically.
function eventDateValue(value) {
  const date=String(value||'').trim();
  let y,m,d;
  let match=date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(match){[,d,m,y]=match.map(String)}
  else {match=date.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!match)return Number.POSITIVE_INFINITY;[,y,m,d]=match;}
  const result=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
  return result.getUTCFullYear()===Number(y)&&result.getUTCMonth()===Number(m)-1&&result.getUTCDate()===Number(d)?result.getTime():Number.POSITIVE_INFINITY;
}
function formatEventDate(value) {
  const time=eventDateValue(value);
  return Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(time)).toUpperCase():String(value||'DATE TBC').toUpperCase();
}
// Optional graphic column: assets/events/darts.svg, etc. Falls back to sport-specific symbols.
function eventGraphic(event) {
  const file=String(event.graphic||'').trim();
  if(file && /^assets\/[a-zA-Z0-9_./-]+\.(svg|png|webp|jpg|jpeg)$/i.test(file) && !file.includes('..')) {
    return `<img class="event-graphic-image" src="${escapeHTML(file)}" alt="" />`;
  }
  const key=`${event.id||''} ${event.name||''}`.toLowerCase();
  const icons=[[/pool|billiard|snooker/, '🎱'],[/dart/, '🎯'],[/ping.?pong|table.?tennis/, '🏓'],[/curl/, '🥌'],[/bowl/, '🎳'],[/video|game|console|mario|fifa/, '🎮'],[/quiz|trivia/, '🧠'],[/final|festiv|christmas/, '🏆']];
  return `<span class="event-graphic-symbol" aria-hidden="true">${(icons.find(([pattern])=>pattern.test(key))||[null,'🏅'])[1]}</span>`;
}
function render() {
  const {teams,people,completedCount,hasScores}=getScores();
  Object.entries(cfg.copy||{}).forEach(([key,value])=>{document.querySelectorAll(`[data-copy="${key}"]`).forEach(el=>el.textContent=value)});
  const copy=cfg.copy||{};
  const heroTitle=$('#overview-heading');
  if(copy.heroTitle){const title=String(copy.heroTitle).trim();const split=title.match(/^(.*?)\s+(GAMES\s+BEGIN\.?)$/i);heroTitle.innerHTML=split?`${escapeHTML(split[1])}<br><em>${escapeHTML(split[2])}</em>`:escapeHTML(title)}
  [['teamHeading','#team-heading'],['individualHeading','#individual-heading'],['resultsHeading','#results-heading']].forEach(([k,sel])=>{if(copy[k])$(sel).textContent=copy[k]});
  $('#hero-tagline').textContent=copy.heroTagline||cfg.eventTagline||'One city. Four teams. Eternal office glory.';
  $('#demo-banner').hidden=!cfg.demoMode;
  const leaderT=teams[0], leaderP=people[0];
  $('#leading-team').innerHTML=hasScores&&leaderT?
    `${flagHTML(leaderT,"champion-flag")}<div><div class="champion-title">${escapeHTML(leaderT.name)}</div><div class="champion-sub">${escapeHTML(leaderT.motto)}</div></div><div class="champion-score"><b>${leaderT.points}</b><span>POINTS</span></div>`:
    `<div><div class="champion-title">THE CROWN<br/>IS UP FOR GRABS</div><div class="champion-sub">The first points are yet to be won</div></div>`;
  $('#leading-individual').innerHTML=hasScores&&leaderP?
    `${headshot(leaderP,true)}<div><div class="champion-title">${escapeHTML(leaderP.name)}</div><div class="champion-sub">${escapeHTML(teamFor(leaderP.team_id)?.name||'')} · ${leaderP.played} result${leaderP.played===1?'':'s'}</div></div><div class="champion-score"><b>${leaderP.points}</b><span>POINTS</span></div>`:
    `<div><div class="champion-title">A LEGEND<br/>AWAITING GLORY</div><div class="champion-sub">Who will claim the first gold?</div></div>`;
  // Anything not explicitly completed/cancelled is eligible; status names like 'planned' and 'scheduled' work too.
  const upcoming=state.events.filter(e=>!['completed','complete','cancelled','canceled'].includes(String(e.status||'').trim().toLowerCase())).sort((a,b)=>eventDateValue(a.date)-eventDateValue(b.date))[0];
  if(upcoming){
    const dateText=formatEventDate(upcoming.date);
    $('#next-event').innerHTML=`<div class="next-left"><div class="next-kicker">⚡ UP NEXT / EVENT ${String(state.events.filter(e=>e.status.toLowerCase()==='completed').length+1).padStart(2,'0')}</div><div class="next-title">${escapeHTML(upcoming.name)}</div><div class="next-description">${escapeHTML(upcoming.description)}</div></div><div class="next-side"><div class="next-side-label">SAVE THE DATE ↗</div><div class="next-date">${escapeHTML(dateText)}</div><div class="next-place">📍 ${escapeHTML(upcoming.location)}${cfg.nextEventTime?' · '+escapeHTML(cfg.nextEventTime):''}</div></div><div class="next-decoration">${eventGraphic(upcoming)}</div>`;
  }else{$('#next-event').innerHTML='<div class="next-left"><div class="next-kicker">THE GAMES</div><div class="next-title">THAT’S A WRAP!</div><div class="next-description">All scheduled events are complete.</div></div>'}
  $('#team-tiles').innerHTML=state.teams.map(t=>`<div class="team-tile">${flagHTML(t,"tile-flag")}<div><strong>${escapeHTML(t.name)}</strong><small>${escapeHTML(t.motto)}</small></div></div>`).join('');
  $('#teams-event-count').textContent=`${completedCount} SCORED EVENT${completedCount===1?'':'S'}`;
  $('#athlete-count').textContent=`${people.length} ATHLETES ON THE START LINE`;
  $('#team-leaderboard').innerHTML=teams.map(t=>`<div class="board-row ${t.rank===1&&hasScores?'rank-first':''}"><div class="board-rank">${String(t.rank).padStart(2,'0')}</div>${flagHTML(t,"board-flag")}<div class="board-main"><div class="board-name">${escapeHTML(t.name)}</div><div class="board-detail">${escapeHTML(t.motto)} · ${t.athletes} athletes</div></div><div class="board-medal">${hasScores?medal(t.rank):'—'}</div><div class="board-points"><b>${t.points}</b><span>POINTS</span></div></div>`).join('');
  $('#individual-leaderboard').innerHTML=people.map(p=>`<div class="board-row ${p.rank===1&&hasScores?'rank-first':''}"><div class="board-rank">${String(p.rank).padStart(2,'0')}</div>${headshot(p)}<div class="board-main"><div class="board-name">${escapeHTML(p.name)}</div><div class="athlete-team">${flagHTML(teamFor(p.team_id),"board-flag")} ${escapeHTML(teamFor(p.team_id)?.name||'Unknown team')} · ${p.played} result${p.played===1?'':'s'}</div></div><div class="board-medal">${hasScores?medal(p.rank):'—'}</div><div class="board-points"><b>${p.points}</b><span>POINTS</span></div></div>`).join('');
  applyPortraitAnimations();
  renderMatches();
  $('#updated-at').textContent=`UPDATED ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}
async function loadData() {
  try {
    const [teams,competitors,events,results,matches]=await Promise.all(['teams','competitors','events','results','matches'].map(getCSV));
    state.teams=teams;state.competitors=competitors;state.events=events;state.results=results;state.matches=matches;state.loaded=true;
    render();$('#error-message').hidden=true;
  } catch(err) {
    console.error(err);
    $('#error-message').textContent=`Unable to load scoreboard CSVs. ${err.message}. Run a local web server rather than opening index.html directly.`;
    $('#error-message').hidden=false;
  }
}
function switchTab(tab){
  if(!['overview','teams','individuals','results'].includes(tab))return;
  document.querySelectorAll('.tab-panel').forEach(el=>el.classList.toggle('active',el.id===`panel-${tab}`));
  document.querySelectorAll('.nav-btn').forEach(btn=>{const active=btn.dataset.tab===tab;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current')});
  if(tab==='individuals')applyPortraitAnimations();
  if(location.hash!==`#${tab}`)history.replaceState(null,'',`#${tab}`);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.goto)));
window.addEventListener('hashchange',()=>switchTab(location.hash.slice(1)));
switchTab(location.hash.slice(1)||'overview');
loadData();
setInterval(loadData,Math.max(15,Number(cfg.refreshSeconds)||60)*1000);

// Click any team flag to inspect the SVG at full size.
function flagHTML(t,cls) {
  if(!t||!t.flag)return '';
  return `<button type="button" class="flag-trigger" data-flag="${escapeHTML(t.flag)}" data-flag-name="${escapeHTML(t.name)}" aria-label="Enlarge ${escapeHTML(t.name)} flag"><img class="${cls}" src="${escapeHTML(t.flag)}" alt="${escapeHTML(t.name)} flag" /></button>`;
}
const personName=id=>state.competitors.find(c=>c.id===id)?.name||id||'TBC';
function renderMatches() {
  const picker=$('#event-picker');
  const prior=picker.value;
  const events=state.events;
  picker.innerHTML=events.map(e=>`<option value="${escapeHTML(e.id)}">${escapeHTML(e.name)}</option>`).join('');
  const chosen=events.find(e=>e.id===prior)||events.find(e=>state.matches.some(m=>m.event_id===e.id))||events[0];
  if(!chosen){$('#match-list').innerHTML='<p class="empty-note">No events yet.</p>';return}
  picker.value=chosen.id;
  const matches=state.matches.filter(m=>m.event_id===chosen.id);
  $('#event-summary').textContent=`${chosen.date||''} · ${chosen.location||''} · ${matches.length} MATCH${matches.length===1?'':'ES'}`;
  $('#match-list').innerHTML=matches.length?matches.map((m,i)=>{
    const left=personName(m.competitor_1_id),right=personName(m.competitor_2_id);
    const win1=m.winner_id&&m.winner_id===m.competitor_1_id,win2=m.winner_id&&m.winner_id===m.competitor_2_id;
    return `<article class="match-card"><div class="match-round">${escapeHTML(m.round||`MATCH ${i+1}`)}</div><div class="match-versus"><div class="match-player ${win1?'match-winner':''}">${escapeHTML(left)}</div><div class="match-score">${escapeHTML(m.score_1||'–')} <span>:</span> ${escapeHTML(m.score_2||'–')}</div><div class="match-player match-player-right ${win2?'match-winner':''}">${escapeHTML(right)}</div></div>${m.notes?`<div class="match-notes">${escapeHTML(m.notes)}</div>`:''}</article>`;
  }).join(''):`<div class="matches-empty"><strong>No matches recorded yet</strong><p>Please check back later obviously.</p></div>`;
}
$('#event-picker').addEventListener('change',renderMatches);
document.addEventListener('click',e=>{
  const flag=e.target.closest('.flag-trigger');
  if(flag){const d=$('#flag-dialog');$('#flag-dialog-img').src=flag.dataset.flag;$('#flag-dialog-img').alt=`${flag.dataset.flagName} flag`;$('#flag-dialog-caption').textContent=flag.dataset.flagName;if(!d.open)d.showModal()}
  if(e.target.closest('.flag-close'))$('#flag-dialog').close();
});
$('#flag-dialog').addEventListener('click',e=>{if(e.target.id==='flag-dialog')e.currentTarget.close()});
