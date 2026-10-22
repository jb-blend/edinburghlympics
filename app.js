/* Edinburghlympics: static site, CSV-backed, no build tools needed. */
const cfg = window.EDINBURGHLYMPICS_CONFIG || {};
window.EDINBURGHLYMPICS_SCORING_BUILD = '2026-10-21-real-matches-verified-2';
const state = { teams: [], competitors: [], events: [], results: [], matches: [], teamResults: [], loaded: false };
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Small CSV parser that handles quoted cells, commas, doubled quotes and CRLF.
function parseCSV(text, kind = '') {
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
  const standard=[
    'event_id','match_id','round','competitor_1_id','competitor_2_id',
    'score_1','score_2','winner_id','notes','format','points','team_1_id','team_2_id'
  ];
  const formatFirst=[
    'event_id','match_id','format','round','competitor_1_id',
    'competitor_2_id','score_1','score_2','winner_id','points','team_1_id','team_2_id','notes'
  ];
  const names=headers.map(h=>h.trim());
  const isFormat=v=>/^(singles?|doubles?)$/i.test(String(v||'').trim());
  return data.map((cols,i)=>{
    let keys=names;
    if(kind==='matches'){
      // Previous updates documented TWO different 13-column orders. Detect the
      // row's actual order, even if the CSV still has the nine-column header.
      if(cols.length>=13 && isFormat(cols[2]) && !isFormat(cols[9]))keys=formatFirst;
      else if(cols.length>=13 && isFormat(cols[9]) && !isFormat(cols[2]))keys=standard;
      else if(cols.length>=9 && names.join(',')===formatFirst.join(',') && !isFormat(cols[2])
              && cols[5]!=='' && cols[6]!=='' && Number.isFinite(Number(cols[5]))
              && Number.isFinite(Number(cols[6])))keys=standard;
    }
    const row=Object.fromEntries(keys.map((key,i)=>[key,cols[i]??'']));
    if(kind==='matches'){
      row.__csvLine=i+2;
      row.__schemaCorrected=keys.join(',')!==names.join(',');
      row.__columnCount=cols.length;
    }
    return row;
  });
}
async function getCSV(name, optional = false) {
  const resp = await fetch(`data/${name}.csv?v=${Date.now()}`, {cache:'no-store'});
  if(optional && resp.status===404)return [];
  if(!resp.ok)throw new Error(`Couldn't load data/${name}.csv (${resp.status})`);
  return parseCSV(await resp.text(),name);
}
// Accept exact IDs, harmless differences in case/spacing, and unambiguous
// competitor names. This does not create or guess missing competitors.
function normalizedKey(value){return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()}
function lookupID(value, items){
  const sought=normalizedKey(value);
  if(!sought)return '';
  const matches=items.filter(p=>normalizedKey(p.id)===sought||normalizedKey(p.name)===sought);
  return matches.length===1?matches[0].id:String(value).trim();
}
function isDrawWord(value){return /^(draw|drawn|tie|tied|equal|even|0\.5|0,5|=|-)$/i.test(String(value??'').trim())}
function normaliseScoringInputs(){
  state.teams.forEach(t=>{t.id=String(t.id??'').trim()});
  state.competitors.forEach(p=>{p.id=String(p.id??'').trim();p.team_id=lookupID(p.team_id,state.teams)});
  state.events.forEach(e=>{e.id=String(e.id??'').trim()});
  state.matches.forEach(row=>{
    row.event_id=lookupID(row.event_id,state.events);
    row.competitor_1_id=lookupID(row.competitor_1_id,state.competitors);
    row.competitor_2_id=lookupID(row.competitor_2_id,state.competitors);
    for(const field of ['team_1_id','team_2_id'])row[field]=lookupID(row[field],state.teams);
    const winner=String(row.winner_id??'').trim();
    row.__declaredDraw=isDrawWord(winner);
    if(row.__declaredDraw)row.winner_id='';
    else if(winner==='1' && !state.competitors.some(p=>p.id==='1'))row.winner_id=row.competitor_1_id;
    else if(winner==='2' && !state.competitors.some(p=>p.id==='2'))row.winner_id=row.competitor_2_id;
    else row.winner_id=lookupID(winner,state.competitors);
    row.format=String(row.format??'').trim().toLowerCase();
  });
  state.results.forEach(row=>{
    row.event_id=lookupID(row.event_id,state.events);
    row.competitor_id=lookupID(row.competitor_id,state.competitors);
    if(row.team_id)row.team_id=lookupID(row.team_id,state.teams);
  });
  state.teamResults.forEach(row=>{
    row.event_id=lookupID(row.event_id,state.events);
    row.team_id=lookupID(row.team_id,state.teams);
  });
}
function numericPoints(value, fallback) {
  return String(value??'').trim()===''?fallback:Number(value);
}
function scoresAreTied(row){
  const a=String(row.score_1??'').trim(),b=String(row.score_2??'').trim();
  return a!==''&&b!==''&&Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Number(a)===Number(b);
}
function drawConflictsWithScore(row){
  const a=String(row.score_1??'').trim(),b=String(row.score_2??'').trim();
  return !!row.__declaredDraw&&a!==''&&b!==''&&Number.isFinite(Number(a))
    && Number.isFinite(Number(b))&&Number(a)!==Number(b);
}
function isDrawnMatchRow(row){
  if(row.winner_id||drawConflictsWithScore(row))return false;
  // A tied nonzero score with no winner is a draw, even for an older CSV with
  // no points column. A blank 0-0 fixture isn't treated as played unless DRAW
  // or an explicit 0.5 points is entered.
  if(row.__declaredDraw)return true;
  if(!scoresAreTied(row))return false;
  const points=String(row.points??'').trim();
  return points!==''?Number(points)===0.5:Number(row.score_1)!==0;
}
// A doubles win gives EACH winning player +2 individual points, while the
// winning team receives +2 for the fixture in total (+1 per winning-player row).
// Each doubles fixture is recorded in TWO rows sharing a match_id. This keeps
// individual and team scoring separate and prevents counting a doubles fixture
// twice on the team board. Singles wins award +1 to both player and team.
// Draws still award +0.5 per participant; results.csv adds individual bonuses,
// including the Pool 10/5 championship bonuses exactly once. team_results.csv
// contains team-only awards/penalties. Points count regardless of event status.
function isPoolEvent(id) {
  const event=state.events.find(e=>e.id===id);
  const text=`${id||''} ${event?.name||''}`;
  return /\bpool\b|billiard|snooker|8[- ]?ball/i.test(text);
}
// The earlier code recognised only an exact 'Singles Final' round and exact
// numeric positions '1' and '2'. Accept normal tournament wording as well.
function isSinglesFinal(row) {
  const round=String(row.round||row.stage||'').trim();
  const namedFinal=/(?:\bfinals?\b|\bchampionship(?: match)?\b|\bgold medal match\b)/i.test(round);
  if(!namedFinal || /\bsemi[\s_/-]*finals?\b|\bsemi\b|\bquarter[\s_/-]*finals?\b/i.test(round))return false;
  if(/^doubles?$/i.test(String(row.format||'')))return false;
  // A doubles fixture uses two records with the same match ID: never award a
  // singles championship to the winner of a doubles final.
  if(row.match_id&&state.matches.filter(r=>r.event_id===row.event_id&&r.match_id===row.match_id).length>1)return false;
  return true;
}
function getPoolFinal() {
  const finals=state.matches.filter(r=>isPoolEvent(r.event_id)&&isSinglesFinal(r));
  // Find the last final with a valid decisive result. An empty fixture marked
  // "Final" must not hide an earlier recorded result.
  for(let i=finals.length-1;i>=0;i--){
    const row=finals[i];
    const a=row.competitor_1_id,b=row.competitor_2_id,w=row.winner_id;
    if(!a||!b||a===b||(w!==a&&w!==b))continue;
    const championSide=w===a?1:2;
    const runnerUpSide=championSide===1?2:1;
    const championTeam=String(row[`team_${championSide}_id`]||state.competitors.find(p=>p.id===w)?.team_id||'').trim();
    const runnerUp=w===a?b:a;
    const runnerUpTeam=String(row[`team_${runnerUpSide}_id`]||state.competitors.find(p=>p.id===runnerUp)?.team_id||'').trim();
    return {event_id:row.event_id,match_id:row.match_id,champion:w,runnerUp,championTeam,runnerUpTeam};
  }
  return null;
}
// Accept common ways of specifying first/second place in results.csv.
function poolPlacing(row){
  if(!isPoolEvent(row.event_id))return 0;
  const position=String(row.position||'').trim().toLowerCase();
  const reason=String(row.reason||row.notes||'').trim().toLowerCase();
  if(/^(?:1|1st|first|winner|champion|gold)$/.test(position))return 1;
  if(/^(?:2|2nd|second|runner[ -]?up|silver)$/.test(position))return 2;
  if(/\bchampion\b|\bwinner\b|\bfirst place\b/.test(reason))return 1;
  if(/runner[ -]?up|\bsecond place\b/.test(reason))return 2;
  // Older CSV versions have sometimes omitted the position column entirely.
  // Only infer from the points when the reason identifies a placement bonus.
  return 0;
}
function getAwardEntries() {
  const final=getPoolFinal();
  const awards=[];
  const byID=new Set(state.competitors.map(p=>p.id));
  const seen=new Set();
  const placed=new Set();
  for(const row of state.results){
    if(!byID.has(row.competitor_id))continue;
    const explicitPlace=poolPlacing(row);
    // Also recognise hand-entered 10/5 bonuses with an empty position,
    // but only when the finalist identity makes their meaning unambiguous.
    const place=explicitPlace||(final&&row.event_id===final.event_id&&
      row.competitor_id===final.champion&&numericPoints(row.points,NaN)===10?1:
      final&&row.event_id===final.event_id&&
      row.competitor_id===final.runnerUp&&numericPoints(row.points,NaN)===5?2:0);
    if(place){
      const expectedPerson=final?(place===1?final.champion:final.runnerUp):null;
      // A mismatch between final and a hand-entered placing must not award
      // two different people the same championship bonus.
      if(expectedPerson&&row.event_id===final.event_id&&row.competitor_id!==expectedPerson)continue;
      const key=`${row.event_id}|pool-placement-${place}`;
      if(placed.has(key))continue;
      placed.add(key);
      const pts=place===1?10:5;
      const overrideTeam=final&&row.event_id===final.event_id
        ?place===1?final.championTeam:final.runnerUpTeam:'';
      awards.push({...row,position:String(place),points:pts,
        team_id:row.team_id||overrideTeam||'',auto:false});
      continue;
    }
    const pts=numericPoints(row.points,NaN);
    if(!Number.isFinite(pts))continue;
    const position=String(row.position||'').trim();
    const key=position?`${row.event_id}|${row.competitor_id}|${position}`:null;
    if(key&&seen.has(key))continue;
    if(key)seen.add(key);
    awards.push({...row,points:pts,auto:false});
  }
  if(final){
    for(const [id,position,points,reason,team] of [
      [final.champion,'1',10,'Singles champion bonus',final.championTeam],
      [final.runnerUp,'2',5,'Singles runner-up bonus',final.runnerUpTeam]
    ]){
      const key=`${final.event_id}|pool-placement-${position}`;
      if(byID.has(id)&&!placed.has(key)){
        awards.push({event_id:final.event_id,competitor_id:id,position,points,reason,team_id:team,auto:true});
        placed.add(key);
      }
    }
  }
  return awards;
}
function getScores() {
  const people=state.competitors.map(c=>({...c,points:0,played:0}));
  const byID=new Map(people.map(p=>[p.id,p]));
  const countedEvents=new Set();
  const teamPoints=new Map(state.teams.map(t=>[t.id,0]));
  const playedOnce=new Set(),creditedOnce=new Set();
  const auditEntries=[];
  const groupedRowCounts=new Map();
  for(const row of state.matches){
    if(row.match_id){
      const key=`${row.event_id}|${row.match_id}`;
      groupedRowCounts.set(key,(groupedRowCounts.get(key)||0)+1);
    }
  }
  function credit(id,individualPts,teamPts,row,side){
    const person=byID.get(id);
    if(!person || !Number.isFinite(individualPts) || !Number.isFinite(teamPts))return;
    const matchKey=String(row.match_id||`single-row-${row.__rowIndex}`);
    const key=`${row.event_id}|${matchKey}|${id}`;
    if(creditedOnce.has(key))return; // Protect against duplicate winner rows.
    creditedOnce.add(key);
    person.points+=individualPts;
    const teamID=String(row[`team_${side}_id`]||person.team_id||'').trim();
    if(teamPoints.has(teamID))teamPoints.set(teamID,teamPoints.get(teamID)+teamPts);
    auditEntries.push({source:'matches.csv',event_id:row.event_id,match_id:matchKey,
      format:row.format||'',round:row.round||'',player:id,team:teamID,
      individual_points:individualPts,team_points:teamPoints.has(teamID)?teamPts:0});
    countedEvents.add(row.event_id);
  }
  for(const [rowIndex,original] of state.matches.entries()){
    const row={...original,__rowIndex:rowIndex};
    const matchKey=String(row.match_id||`single-row-${rowIndex}`);
    const isDoubles=/^doubles?$/i.test(String(row.format||'')) ||
      (row.match_id && (groupedRowCounts.get(`${row.event_id}|${row.match_id}`)||0)>1);
    for(const id of [row.competitor_1_id,row.competitor_2_id]){
      if(!byID.has(id))continue;
      const key=`${row.event_id}|${matchKey}|${id}`;
      if(!playedOnce.has(key)){byID.get(id).played++;playedOnce.add(key)}
    }
    if(isDrawnMatchRow(row)){
      // Draws remain +0.5 per player and +0.5 per represented team per row.
      credit(row.competitor_1_id,0.5,0.5,row,1);
      credit(row.competitor_2_id,0.5,0.5,row,2);
    }else if(String(row.winner_id||'').trim()){
      // Win scoring is fixed by match type. In particular, legacy points=1
      // doubles rows still award +2 to the winning player. Two rows make
      // +2 for the winning team in total, rather than +4.
      const individualPts=isDoubles?2:1;
      const teamPts=1;
      const side=row.winner_id===row.competitor_1_id?1:row.winner_id===row.competitor_2_id?2:0;
      if(side)credit(row.winner_id,individualPts,teamPts,row,side);
    }
  }
  for(const row of getAwardEntries()){
    const person=byID.get(row.competitor_id);
    if(!person)continue;
    const pts=Number(row.points);
    person.points+=pts;
    const teamID=String(row.team_id||person.team_id||'').trim();
    if(teamPoints.has(teamID))teamPoints.set(teamID,teamPoints.get(teamID)+pts);
    auditEntries.push({source:row.auto?'automatic final bonus':'results.csv',event_id:row.event_id,
      match_id:'',format:'bonus',round:row.reason||row.notes||'Bonus',player:person.id,team:teamID,
      individual_points:pts,team_points:teamPoints.has(teamID)?pts:0});
    countedEvents.add(row.event_id);
  }
  for(const row of state.teamResults){
    if(!teamPoints.has(row.team_id))continue;
    const pts=numericPoints(row.points,NaN);
    if(!Number.isFinite(pts))continue;
    teamPoints.set(row.team_id,teamPoints.get(row.team_id)+pts);
    auditEntries.push({source:'team_results.csv',event_id:row.event_id,match_id:'',format:'team adjustment',
      round:row.reason||row.notes||'',player:'',team:row.team_id,individual_points:0,team_points:pts});
    countedEvents.add(row.event_id);
  }
  people.sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));
  let prev=null,rank=0;
  people.forEach((p,i)=>{if(p.points!==prev){rank=i+1;prev=p.points}p.rank=rank});
  const teams=state.teams.map(t=>({...t,points:teamPoints.get(t.id)||0,athletes:people.filter(p=>p.team_id===t.id).length}));
  teams.sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));
  prev=null;rank=0;
  teams.forEach((t,i)=>{if(t.points!==prev){rank=i+1;prev=t.points}t.rank=rank});
  return {people,teams,completedCount:countedEvents.size,hasScores:countedEvents.size>0,auditEntries};
}

// Optional browser-console diagnostic. Does not alter standings or page design.
// On the live site, type edinburghlympicsScoreCheck() in DevTools Console.
window.edinburghlympicsScoreCheck=()=>{
  const final=getPoolFinal();
  const awards=getAwardEntries();
  const totals=getScores();
  return {
    build:window.EDINBURGHLYMPICS_SCORING_BUILD,
    recordsLoaded:{matches:state.matches.length,competitors:state.competitors.length,teams:state.teams.length,bonuses:state.results.length,teamAdjustments:state.teamResults.length},
    poolFinal:final?{
      champion:state.competitors.find(p=>p.id===final.champion)?.name||final.champion,
      runnerUp:state.competitors.find(p=>p.id===final.runnerUp)?.name||final.runnerUp,
      event_id:final.event_id, match_id:final.match_id
    }:null,
    bonusAwards:awards.filter(r=>isPoolEvent(r.event_id)&&['1','2'].includes(String(r.position||''))).map(r=>({
      player:state.competitors.find(p=>p.id===r.competitor_id)?.name||r.competitor_id,
      position:r.position,points:r.points,source:r.auto?'auto final':'results.csv',team:r.team_id||state.competitors.find(p=>p.id===r.competitor_id)?.team_id||''
    })),
    individualTotals:totals.people.map(p=>({name:p.name,points:p.points})),
    teamTotals:totals.teams.map(t=>({name:t.name,points:t.points})),
    warnings:scoreDataWarnings()
  };
};

// Auditable breakdown from the SAME award entries used to render the standings.
// Run edinburghlympicsScoreAudit('james') or edinburghlympicsScoreAudit('leith').
window.edinburghlympicsScoreAudit=(idOrName)=>{
  const key=normalizedKey(idOrName);
  const result=getScores();
  const player=state.competitors.find(p=>normalizedKey(p.id)===key||normalizedKey(p.name)===key);
  const team=state.teams.find(t=>normalizedKey(t.id)===key||normalizedKey(t.name)===key);
  if(!player&&!team){
    return {build:window.EDINBURGHLYMPICS_SCORING_BUILD,error:'No matching competitor or team in loaded CSVs',searched:String(idOrName),
      loadedCompetitorIds:state.competitors.map(p=>p.id),loadedTeamIds:state.teams.map(t=>t.id)};
  }
  const entries=result.auditEntries.filter(x=>player?x.player===player.id:x.team===team.id);
  const total=entries.reduce((sum,x)=>sum+Number(player?x.individual_points:x.team_points),0);
  const detail=entries.map(x=>({event_id:x.event_id,match_id:x.match_id,round:x.round,format:x.format,
    player:x.player,team:x.team,source:x.source,points:player?x.individual_points:x.team_points}));
  if(typeof console!=='undefined'&&console.table)console.table(detail);
  return {build:window.EDINBURGHLYMPICS_SCORING_BUILD,subject:player?player.name:team.name,
    subjectId:player?player.id:team.id,scope:player?'individual':'team',total,
    leaderboardTotal:player?result.people.find(p=>p.id===player.id)?.points:result.teams.find(t=>t.id===team.id)?.points,
    recordsLoaded:state.matches.length,detail};
};

const medal = r=>r===1?'🥇':r===2?'🥈':r===3?'🥉':'✦';
function headshot(p,big=false) {
  const initials = p.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
  const sz=big?' big':'';
  // Missing headshots gracefully fall back to initials.
  const image=p.headshot?`<img class="headshot${sz}" src="${escapeHTML(p.headshot)}" alt="${escapeHTML(p.name)}" onerror="this.remove();this.parentElement.textContent='${escapeHTML(initials)}'" />`:escapeHTML(initials);
  return `<div class="headshot-fallback headshot${sz}" style="background:${escapeHTML(teamFor(p.team_id)?.color||'#527a83')}">${image}</div>`;
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
  $('#individual-leaderboard').innerHTML=people.map(p=>`<div class="board-row ${p.rank===1&&hasScores?'rank-first':''}"><div class="board-rank">${String(p.rank).padStart(2,'0')}</div>${headshot(p)}<div class="board-main"><div class="board-name">${escapeHTML(p.name)}</div><div class="athlete-team">${flagHTML(teamFor(p.team_id),"board-flag")} ${escapeHTML(teamFor(p.team_id)?.name||'Wildcard / guest')} · ${p.played} result${p.played===1?'':'s'}</div></div><div class="board-medal">${hasScores?medal(p.rank):'—'}</div><div class="board-points"><b>${p.points}</b><span>POINTS</span></div></div>`).join('');
  applyPortraitAnimations();
  renderMatches();
  $('#updated-at').textContent=`UPDATED ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}
// Don't silently ignore bad CSV IDs: show a concise, actionable warning.
function scoreDataWarnings(){
  const warnings=[];
  const people=new Set(state.competitors.map(p=>p.id));
  const teams=new Set(state.teams.map(t=>t.id));
  const events=new Set(state.events.map(e=>e.id));
  const recovered=state.matches.filter(r=>r.__schemaCorrected);
  if(recovered.length)console.warn(`Edinburghlympics: automatically reconciled ${recovered.length} match rows whose CSV values followed an older 13-column order. Please make the header match the actual rows. Points will still count.`);
  for(const [i,r] of state.matches.entries()){
    const number=r.__csvLine||i+2;
    if(!events.has(r.event_id))warnings.push(`matches.csv row ${number}: unknown event "${r.event_id||'(blank)'}"`);
    for(const field of ['competitor_1_id','competitor_2_id']){
      if(!people.has(r[field]))warnings.push(`matches.csv row ${number}: unknown ${field} "${r[field]||'(blank)'}"`);
    }
    const winner=String(r.winner_id||'').trim();
    if(winner&&winner!==r.competitor_1_id&&winner!==r.competitor_2_id)
      warnings.push(`matches.csv row ${number}: winner_id "${winner}" is not "${r.competitor_1_id}" or "${r.competitor_2_id}". Use a player ID, or blank/DRAW for a draw`);
    if(drawConflictsWithScore(r))warnings.push(`matches.csv row ${number}: DRAW conflicts with unequal scores (${r.score_1}:${r.score_2})`);
    if(isDrawnMatchRow(r)&&String(r.points??'').trim()&&Number(r.points)!==0.5)
      warnings.push(`matches.csv row ${number}: draws award 0.5 per player; found points="${r.points}" (scoring 0.5)`);
    for(const field of ['team_1_id','team_2_id']){
      if(r[field]&&!teams.has(r[field]))warnings.push(`matches.csv row ${number}: unknown team "${r[field]}"`);
    }
    if(!winner&&!isDrawnMatchRow(r)&&String(r.points||'').trim()&&!r.__declaredDraw)
      warnings.push(`matches.csv row ${number}: points without a winner or a recognised draw (use DRAW or 0.5 points with tied scores)`);
  }
  for(const [i,r] of state.results.entries()){
    if(!people.has(r.competitor_id))warnings.push(`results.csv row ${i+2}: unknown player "${r.competitor_id}"`);
    if(r.team_id&&!teams.has(r.team_id))warnings.push(`results.csv row ${i+2}: unknown team "${r.team_id}"`);
  }
  for(const [i,r] of state.teamResults.entries()){
    if(!teams.has(r.team_id))warnings.push(`team_results.csv row ${i+2}: unknown team "${r.team_id}"`);
  }
  const final=getPoolFinal();
  for(const row of state.results){
    const place=poolPlacing(row);
    if(!final||!place||row.event_id!==final.event_id)continue;
    const expected=place===1?final.champion:final.runnerUp;
    if(row.competitor_id!==expected){
      warnings.push(`results.csv: position ${place} names "${row.competitor_id}" but the Pool final identifies "${expected}"; conflicting bonus ignored`);
    }
  }
  if(state.matches.some(r=>isPoolEvent(r.event_id)&&/(?:\bfinals?\b|championship)/i.test(String(r.round||'')))&&!final
    &&!getAwardEntries().some(r=>isPoolEvent(r.event_id)&&[1,2].includes(poolPlacing(r)))){
    warnings.push('Pool final found but no winning finalist identified. Set winner_id to one of the two competitor IDs, or enter the 10/5 bonus rows in results.csv');
  }
  return warnings;
}
async function loadData() {
  try {
    const [teams,competitors,events,results,matches,teamResults]=await Promise.all([getCSV('teams'),getCSV('competitors'),getCSV('events'),getCSV('results',true),getCSV('matches'),getCSV('team_results',true)]);
    state.teams=teams;state.competitors=competitors;state.events=events;state.results=results;state.matches=matches;state.teamResults=teamResults;state.loaded=true;
    normaliseScoringInputs();
    render();
    const problems=scoreDataWarnings();
    if(problems.length){
      console.warn('Edinburghlympics data issues:',problems);
      $('#error-message').textContent=`Some scores could not be attributed: ${problems.slice(0,3).join('; ')}${problems.length>3?`; plus ${problems.length-3} more. Check the browser console.`:''}`;
      $('#error-message').hidden=false;
    }else{$('#error-message').hidden=true;}
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
const eventOrder=e=>Number.isFinite(Number(e.display_order))&&String(e.display_order||'').trim()?Number(e.display_order):Number.POSITIVE_INFINITY;
const displayEventList=()=>[...state.events].sort((a,b)=>eventOrder(a)-eventOrder(b)||eventDateValue(a.date)-eventDateValue(b.date));
const pointLabel=n=>Number(n)>0?`+${Number(n)}`:String(Number(n));
function matchCard(rows,index){
  const m=rows[0];
  const isDoubles=rows.length>1 || /^double/i.test(String(m.format||''));
  const round=String(m.round||m.stage||`MATCH ${index+1}`);
  const isSemi=/semi[ -]?final/i.test(round);
  const isFinal=isSinglesFinal(m)||(!isSemi&&/\bfinals?\b/i.test(round));
  const stageClass=isFinal?'match-final':isSemi?'match-semi':'';
  const side1=rows.map(r=>r.competitor_1_id).filter(Boolean);
  const side2=rows.map(r=>r.competitor_2_id).filter(Boolean);
  const wonLeft=rows.some(r=>r.winner_id && r.winner_id===r.competitor_1_id);
  const wonRight=rows.some(r=>r.winner_id && r.winner_id===r.competitor_2_id);
  const left=side1.map(id=>escapeHTML(personName(id))).join('<span class="match-join"> + </span>');
  const right=side2.map(id=>escapeHTML(personName(id))).join('<span class="match-join"> + </span>');
  const score1=String(m.score_1||'').trim();
  const score2=String(m.score_2||'').trim();
  const score=score1||score2?`${escapeHTML(score1||'–')} <span>:</span> ${escapeHTML(score2||'–')}`:'VS';
  const drawnMatch=rows.every(isDrawnMatchRow) && (isDoubles?rows.length===2:rows.length===1);
  const winningPlayers=new Set(rows.filter(r=>r.winner_id &&
    (r.winner_id===r.competitor_1_id || r.winner_id===r.competitor_2_id))
    .map(r=>r.winner_id));
  const earned=winningPlayers.size;
  const winPointChip=earned?(isDoubles
    ?`<span class="match-point-chip">${pointLabel(earned)} team points</span>`
    :`<span class="match-point-chip">${pointLabel(earned)} match point${earned===1?'':'s'}</span>`):'';
  const drawPointsPerSide=drawnMatch?rows.length*0.5:0;
  const drawUnit=isDoubles?'team':'player';
  const note=rows.map(r=>r.notes).find(Boolean)||'';
  const sides=rows.some(r=>r.team_1_id||r.team_2_id)?`<div class="match-attribution">${escapeHTML(teamFor(m.team_1_id)?.name||'')} ${m.team_2_id?'vs '+escapeHTML(teamFor(m.team_2_id)?.name||''):''}</div>`:'';
  // The +10 / +5 are credited ONCE by getAwardEntries(), never by rendering.
  // Display them on the actual Pool singles final rather than only in a list.
  const final=getPoolFinal();
  const isPoolChampionship=isSinglesFinal(m)&&!isDoubles&&final&&m.event_id===final.event_id
    && (m.match_id||'')===(final.match_id||'')
    && m.winner_id===final.champion;
  const finalAwards=isPoolChampionship?getAwardEntries().filter(a=>a.event_id===final.event_id&&
    ((a.competitor_id===final.champion&&String(a.position)==='1')||
     (a.competitor_id===final.runnerUp&&String(a.position)==='2'))):[];
  const finalChips=finalAwards.map(a=>`<span class="match-point-chip">${String(a.position)==='1'?'🏆 CHAMPION':'🥈 RUNNER-UP'} ${escapeHTML(personName(a.competitor_id))}: ${escapeHTML(pointLabel(a.points))} bonus points</span>`).join(' ');
  const detail=[note?escapeHTML(note):'',drawnMatch?`<span class="match-point-chip">DRAW: ${pointLabel(drawPointsPerSide)} point${drawPointsPerSide===1?'':'s'} per ${drawUnit}</span>`:winPointChip,finalChips].filter(Boolean).join(' ');
  return `<article class="match-card result-game ${stageClass}">
    <div class="match-card-header"><span class="match-round">${isFinal?'🏆 ':isSemi?'⚔️ ':''}${escapeHTML(round)}</span><span class="match-format">${isDoubles?'DOUBLES':'SINGLES'}${drawnMatch?' \u00b7 DRAW':''}</span></div>
    <div class="match-versus"><div class="match-player ${wonLeft?'match-winner':''}">${left||'TBC'}</div><div class="match-score">${score}</div><div class="match-player match-player-right ${wonRight?'match-winner':''}">${right||'TBC'}</div></div>
    ${sides}${detail?`<div class="match-notes">${detail}</div>`:''}
  </article>`;
}
function renderMatches(){
  const picker=$('#event-picker');
  const prior=picker.value;
  const events=displayEventList();
  picker.innerHTML=events.map(e=>`<option value="${escapeHTML(e.id)}">${escapeHTML(e.name)}</option>`).join('');
  const withResults=e=>state.matches.some(m=>m.event_id===e.id)||state.teamResults.some(r=>r.event_id===e.id)||state.results.some(r=>r.event_id===e.id);
  const chosen=events.find(e=>e.id===prior)||[...events].reverse().find(e=>e.status?.toLowerCase()==='completed'&&withResults(e))||events[0];
  if(!chosen){$('#match-list').innerHTML='<p class="empty-note">No events yet.</p>';return}
  picker.value=chosen.id;
  const matches=state.matches.filter(m=>m.event_id===chosen.id);
  const grouped=new Map();
  matches.forEach((m,i)=>{const key=m.match_id||`match-row-${i}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(m)});
  const teams=state.teamResults.filter(r=>r.event_id===chosen.id);
  const allAdjustments=getAwardEntries().filter(r=>r.event_id===chosen.id);
  const poolFinal=getPoolFinal();
  const adjustments=allAdjustments.filter(r=>!(poolFinal&&poolFinal.event_id===chosen.id&&
    ((r.competitor_id===poolFinal.champion&&String(r.position)==='1')||
     (r.competitor_id===poolFinal.runnerUp&&String(r.position)==='2'))));
  const count=grouped.size;
  const isFlags=chosen.id==='flags';
  const countLabel=isFlags?`${teams.length} TEAM PLACEMENT${teams.length===1?'':'S'}`:`${count} MATCH${count===1?'':'ES'}`;
  $('#event-summary').textContent=`${formatEventDate(chosen.date)} · ${chosen.location||''} · ${countLabel}`;
  const sections=[];
  if(isFlags || (teams.length && !matches.length)){
    const ranked=[...teams].sort((a,b)=>(String(a.position||'').trim()?Number(a.position):Infinity)-(String(b.position||'').trim()?Number(b.position):Infinity));
    if(ranked.length){
      sections.push('<h2 class="results-section-title">🏳️ FLAG JUDGING · TEAM RANKINGS</h2>');
      sections.push(...ranked.map(t=>{
        const team=teamFor(t.team_id);
        const pts=String(t.points||'').trim()?`${pointLabel(t.points)} PTS`:'POINTS TBC';
        return `<article class="flag-placing"><span class="flag-place">${escapeHTML(t.position||'–')}</span>${flagHTML(team,'tile-flag')}<div class="flag-placing-name"><strong>${escapeHTML(team?.name||t.team_id)}</strong><small>${escapeHTML(t.reason||t.notes||'Flag judging')}</small></div><span class="flag-award">${escapeHTML(pts)}</span></article>`;
      }));
    }
  }
  if(grouped.size){
    sections.push('<h2 class="results-section-title">MATCH-BY-MATCH RESULTS</h2>');
    sections.push(...[...grouped.values()].map((rows,i)=>matchCard(rows,i)));
  }
  if(adjustments.length){
    sections.push('<h2 class="results-section-title">🏅 INDIVIDUAL AWARDS & BONUSES</h2>');
    sections.push(...adjustments.map(r=>`<div class="result-adjustment"><span>${escapeHTML(personName(r.competitor_id))}<small>${escapeHTML(r.notes||r.reason||'Bonus points')}</small></span><b>${escapeHTML(pointLabel(r.points||0))} PTS</b></div>`));
  }
  const penalties=teams.filter(t=>!isFlags||Number(t.points)<0);
  if(penalties.length && !isFlags){
    sections.push('<h2 class="results-section-title">⚖ TEAM ADJUSTMENTS</h2>');
    sections.push(...penalties.map(r=>`<div class="result-adjustment team-adjustment"><span>${escapeHTML(teamFor(r.team_id)?.name||r.team_id)}<small>${escapeHTML(r.reason||r.notes||'Team-only adjustment')}</small></span><b>${escapeHTML(pointLabel(r.points||0))} PTS</b></div>`));
  }
  $('#match-list').innerHTML=sections.length?sections.join(''):`<div class="matches-empty"><strong>No results recorded yet</strong><p>Please check back later obviously.</p></div>`;
}

$('#event-picker').addEventListener('change',renderMatches);
document.addEventListener('click',e=>{
  const flag=e.target.closest('.flag-trigger');
  if(flag){const d=$('#flag-dialog');$('#flag-dialog-img').src=flag.dataset.flag;$('#flag-dialog-img').alt=`${flag.dataset.flagName} flag`;$('#flag-dialog-caption').textContent=flag.dataset.flagName;if(!d.open)d.showModal()}
  if(e.target.closest('.flag-close'))$('#flag-dialog').close();
});
$('#flag-dialog').addEventListener('click',e=>{if(e.target.id==='flag-dialog')e.currentTarget.close()});
