import { createEmptyData, removeLegacyDemoData } from './data.js';
import { consumeAuthRedirect, getSession, getUser, loadWorkspace, saveWorkspace, sendPasswordReset, signIn, signOut, signUp, teamRequest, updatePassword } from './supabase.js';
import { pageMeta, renderView as baseRenderView, ui } from './views.js';
import { liveTimes, memberDashboard, ownerTeamPage, ownerLeaveQueue, projectChecks } from './team-ui.js';
import { makeCorrection, makeEntry, makeLeave, makeShift, reviewCorrection, startClock, stopClock, toggleBreak } from './workflows.js';
import { icon, logoMark } from './icons.js';

const app=document.querySelector('#app');
const {safe,person,project,avatar,shortDate,duration,fmt,options}=ui;
const clone=x=>structuredClone(x);
const uid=()=>crypto.randomUUID();
const iso=()=>new Date().toLocaleDateString('en-CA');
const time=()=>new Date().toTimeString().slice(0,5);
const nav=[['dashboard','dashboard','Dashboard'],['today','clock','Today / Time clock'],['timesheets','timesheets','Timesheets'],['schedule','schedule','Schedule'],['leave','leave','Time off'],['corrections','corrections','Corrections'],['team','team','People'],['projects','projects','Projects'],['reports','reports','Reports'],['settings','settings','Settings']];
let user=null,data=null,memberData=null,teamData=null,teamError='',loading=true,loadError='',notice='',authMode='login',selectedMemberProject='',memberTab='overview';
let page=pageMeta[location.hash.slice(1)]?location.hash.slice(1):'dashboard';
let modal=null,filter='All',query='',weekOffset=0,menuOpen=false,busy=false;
const redirect=consumeAuthRedirect();
localStorage.removeItem('clockit_demo_v1');
localStorage.removeItem('clockit_session_v1');
if(redirect?.error) notice=redirect.error;
if(redirect?.type==='recovery') authMode='update-password';

function renderView(currentPage,workspace,ctx){
  if(currentPage==='team')return ownerTeamPage(workspace,teamData,teamError);
  if(currentPage==='leave')return ownerLeaveQueue(teamData,teamError)+baseRenderView(currentPage,workspace,ctx);
  const live=teamData?.sessions?.filter(s=>!s.stopped_at)||[];
  const strip=currentPage==='dashboard'&&live.length?`<div class="team-live-strip"><strong>${live.length} team member${live.length===1?'':'s'} working now</strong>${live.map(s=>`${safe(teamData.members.find(m=>m.user_id===s.user_id)?.name||'Member')} · ${safe(workspace.projects.find(p=>p.id===s.project_id)?.name||'Project')} <span data-live-start="${safe(s.started_at)}"></span>`).join(' &nbsp; ')}</div>`:'';
  return strip+baseRenderView(currentPage,workspace,ctx);
}
async function refreshTeam(){try{teamData=await teamRequest('owner');teamError=''}catch(error){teamData=null;teamError=error.message}}

function toast(message,type='success'){
  document.querySelector('.toast')?.remove();
  const node=document.createElement('div');node.className=`toast ${type}`;node.textContent=message;
  document.body.append(node);setTimeout(()=>node.remove(),4500);
}
function record(text){data.activity.unshift({id:uid(),text,at:new Date().toISOString()});data.activity=data.activity.slice(0,40)}
async function commit(change,success){
  if(busy)return;
  const before=clone(data);busy=true;
  try{change();await saveWorkspace(data);render();if(success)toast(success)}
  catch(error){data=before;render();toast(error.message,'error')}
  finally{busy=false}
}
async function boot(){
  loading=true;loadError='';memberData=null;render();
  try{
    const hadSession=Boolean(getSession());
    user=await getUser();
    if(hadSession&&!user)notice='Please sign in to continue.';
    if(user?.app_metadata?.hoursdesk_role==='member'){
      memberData=await teamRequest('member');
      if(memberData.profile.archived)throw new Error('Your team access has been removed. Ask your workspace owner for help.');
      if(authMode!=='update-password')authMode='login';
      loading=false;render();return;
    }
    if(user){
      data=await loadWorkspace();
      if(!data){data=createEmptyData(user);await saveWorkspace(data)}
      else if(data.version!==2){data=removeLegacyDemoData(data,user);await saveWorkspace(data)}
      data.corrections ||= []; data.activity ||= [];
      data.people ||= []; data.projects ||= []; data.shifts ||= []; data.entries ||= []; data.leave ||= [];
      data.clock ||= {state:'out',since:null,projectId:null,breakStarted:null,breakMinutes:0};
      data.settings ||= createEmptyData(user).settings;
      await refreshTeam();
    }
  }catch(error){
    if(error.status===401||/session_id claim|invalid jwt|jwt expired|session expired/i.test(error.message)){
      await signOut();user=null;data=null;authMode='login';notice='Please sign in to continue.';loadError='';
    }else loadError=error.message;
  }
  loading=false;render();
}

function authView(){
  const isLogin=authMode==='login',isSignup=authMode==='signup',isReset=authMode==='reset',isUpdate=authMode==='update-password';
  return `<div class="auth-shell"><div class="auth-aside"><div class="auth-brand">${logoMark} HoursDesk<span style="color:#8bc8fa">.</span></div><div class="auth-feature"><span class="eyebrow">WORKFORCE, IN FOCUS</span><h1>Time well<br>spent starts here.</h1><p>One clear workspace for your team’s time, shifts, requests and projects.</p><div class="auth-visual"><div class="auth-visual-head"><span>Everything in one workday</span>${icon('arrow',18)}</div><div class="auth-feature-list"><div>${icon('clock',18)}<span><strong>Time & attendance</strong><small>Track hours with clarity</small></span></div><div>${icon('schedule',18)}<span><strong>Shift planning</strong><small>See the team week ahead</small></span></div><div>${icon('leave',18)}<span><strong>Leave & approvals</strong><small>Handle requests in one place</small></span></div></div></div></div><small>© ${new Date().getFullYear()} HoursDesk Workspace</small></div><main class="auth-main"><div class="auth-top">New here? <button data-action="auth-mode" data-mode="${isSignup?'login':'signup'}">${isSignup?'Sign in':'Create an account'} ↗</button></div><div class="auth-box"><div class="eyebrow">WELCOME TO HOURSDESK</div><h2>${isLogin?'Welcome back':isSignup?'Create your workspace':isReset?'Reset your password':'Choose a new password'}</h2><p>${isLogin?'Sign in to manage your team and workday.':isSignup?'Start with a secure account and an empty workspace.':isReset?'We’ll email you a password reset link.':'Set a new password for your account.'}</p>${notice?`<div class="auth-notice">${safe(notice)}</div>`:''}<form id="auth-form" class="auth-form" data-mode="${authMode}">${isSignup?`<label>Full name<input name="fullName" type="text" autocomplete="name" required placeholder="Your name"></label><label>Workspace name<input name="company" type="text" required placeholder="Your company or team"></label>`:''}${isUpdate?'':`<label>Email address<input name="email" type="email" autocomplete="email" required placeholder="name@company.com"></label>`}${!isReset?`<label>${isUpdate?'New password':'Password'}<input name="password" type="password" autocomplete="${isSignup?'new-password':'current-password'}" minlength="8" required placeholder="At least 8 characters"></label>`:''}${isSignup||isUpdate?`<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required placeholder="Repeat password"></label>`:''}<button class="auth-submit" type="submit">${isLogin?'Sign in':isSignup?'Create account':isReset?'Send reset link':'Update password'} <span>↗</span></button></form><div class="auth-links">${isLogin?`<button data-action="auth-mode" data-mode="reset">Forgot password?</button>`:`<button data-action="auth-mode" data-mode="login">Back to sign in</button>`}</div></div><div class="auth-bottom"><span>Secure sign-in powered by Supabase</span><span>Private workspace data</span></div></main></div>`;
}

function appView(){
  const pending=data.entries.filter(e=>e.status==='Pending').length+data.leave.filter(l=>l.status==='Pending').length+data.corrections.filter(c=>c.status==='Pending').length+(teamData?.leaves||[]).filter(l=>l.status==='Pending').length;
  const [title,subtitle]=pageMeta[page]||pageMeta.dashboard;
  return `<div class="shell ${menuOpen?'menu-open':''}"><button class="drawer-backdrop" data-action="menu" aria-label="Close menu"></button><aside class="sidebar"><div class="brand">${logoMark} HoursDesk<span style="color:#71bafa">.</span></div><button class="sidebar-close" data-action="menu" aria-label="Close menu">×</button><button class="workspace-switch" data-action="navigate" data-page="settings"><span class="ws-icon">${safe(data.settings.company.slice(0,1).toUpperCase())}</span><span><b>${safe(data.settings.company)}</b><small>Workspace settings</small></span><span style="margin-left:auto">⌄</span></button><div class="sidebar-label">Workspace</div><nav class="nav">${nav.map(([key,iconName,label])=>`<button data-action="navigate" data-page="${key}" class="${page===key?'active':''}"><span class="nav-icon">${icon(iconName,18)}</span>${label}${key==='timesheets'&&pending?`<span class="nav-count">${pending}</span>`:''}</button>`).join('')}</nav><div class="side-divider"></div><div class="section-head">TEAM MEMBERS <button data-action="open-modal" data-modal="person" aria-label="Add team member">${icon('plus',16)}</button></div>${data.people.filter(p=>!p.archived).slice(0,3).map(p=>`<div class="member">${avatar(p)}<span>${safe(p.name)}<small>${safe(p.role)}</small></span></div>`).join('')}<div class="section-head" style="margin-top:23px">PROJECTS <button data-action="open-modal" data-modal="project" aria-label="Add project">${icon('plus',16)}</button></div>${data.projects.filter(p=>!p.archived).slice(0,3).map(p=>`<div class="project-mini"><span class="mini-icon">↗</span>${safe(p.name)}</div>`).join('')}<div class="sidebar-spacer"></div><div class="sidebar-footer">${avatar(data.people.find(p=>p.id===user.id)||{initials:user.email.slice(0,2).toUpperCase()})}<span>${safe(user.email)}<small>Workspace owner</small></span><button class="sidebar-signout" data-action="signout" aria-label="Sign out" title="Sign out">${icon('logout',16)}<span>Sign out</span></button></div></aside><main class="main"><div class="topbar"><button class="round-btn mobile-menu" data-action="menu" aria-label="Open menu">☰</button><label class="search">${icon('search',19)}<input id="global-search" placeholder="Search people, projects and records" value="${safe(query)}" autocomplete="off"></label><button class="round-btn" data-action="navigate" data-page="reports" title="Reports">${icon('reports',19)}</button><button class="top-action" data-action="open-modal" data-modal="quick" aria-label="Quick add"><span>${icon('plus',18)}</span><span class="action-text">Quick add</span></button></div><div class="page-heading"><div><div class="eyebrow">WORKSPACE / ${safe(page)}</div><h1>${safe(title)}</h1><p>${safe(subtitle)}</p></div><div class="heading-tools"><span class="sync-note">Live workspace</span><button class="pill-btn" data-action="navigate" data-page="settings">Settings ↗</button></div></div>${renderView(page,data,{user,filter,query:query.toLowerCase(),weekOffset})}</main></div>${modal?modalView():''}`;
}

function input(label,name,type='text',value='',extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" value="${safe(value)}" ${extra}></label>`}
function select(label,name,items,value='',blank=false){return `<label class="field">${label}<select name="${name}">${blank?'<option value="">None</option>':''}${options(items,value)}</select></label>`}
function actions(label,deleteAction='',itemId=''){const removeLabel=['delete-person','delete-project'].includes(deleteAction)?'Archive':'Delete';return `<div class="form-actions">${deleteAction?`<button class="secondary-btn danger-btn" type="button" data-action="${deleteAction}" data-id="${itemId}">${removeLabel}</button>`:''}<button class="primary-btn" type="submit">${label}</button></div>`}
function modalView(){
  const {type,id}=modal,existing=type==='person'?data.people.find(p=>p.id===id):type==='project'?data.projects.find(p=>p.id===id):type==='entry'?data.entries.find(e=>e.id===id):type==='shift'?data.shifts.find(s=>s.id===id):type==='leave'?data.leave.find(l=>l.id===id):null;
  const assignmentProject=type==='assignProject'?data.projects.find(p=>p.id===id&&!p.archived):null;
  const title={quick:'Quick add',person:existing?'Edit member':'Add team member',invite:'Add team member',assign:'Manage member projects',assignProject:'Assign member to project',resetMemberPassword:'Reset member password',reviewMemberLeave:'Reject leave request',project:existing?'Edit project':'New project',entry:existing?'Edit time entry':'Add time entry',shift:existing?'Edit shift':'Create shift',leave:existing?'Edit leave request':'Request time off',correction:'Request time correction',password:'Change password'}[type];
  let body='';
  if(type==='quick')body=`<div class="quick-list">${[['entry','Add time entry','Record worked hours'],['shift','Create shift','Plan coverage'],['leave','Request time off','Submit an absence'],['correction','Time correction','Fix a punch'],['person','Add team member','Create a login and assign projects'],['project','New project','Set a time budget']].map(([t,label,sub])=>`<button data-action="open-modal" data-modal="${t}"><span class="quick-icon">＋</span><span><b>${label}</b><small>${sub}</small></span><span style="margin-left:auto">↗</span></button>`).join('')}</div>`;
  if(type==='person')body=`<form id="record-form" data-kind="person" class="form-grid">${input('Full name','name','text',existing?.name,'required')}${input('Email (directory only)','email','email',existing?.email||'')}${input('Role','role','text',existing?.role,'required')}${input('Department','team','text',existing?.team,'required')}${actions(existing?'Save member':'Add member',existing&&id!==user.id?'delete-person':'',id)}</form>`;
  if(type==='invite')body=`<form id="team-form" data-kind="invite" class="form-grid">${input('Full name','name','text','','required')}${input('Gmail or work email','email','email','','required')}${input('Role','role','text','','required placeholder="Designer, analyst, developer…"')}${input('Department','department','text','','placeholder="Optional"')}${input('Member password','memberPassword','password','','minlength="12" maxlength="128" autocomplete="new-password" required')}${projectChecks(data.projects)}<p class="small muted full">Give the email and password to the member privately. No email is sent, and the password is not saved in HoursDesk.</p>${actions('Create member account')}</form>`;
  if(type==='assign'){const current=teamData?.assignments?.filter(a=>a.user_id===id).map(a=>a.project_id)||[];const member=teamData?.members?.find(m=>m.user_id===id);body=`<form id="team-form" data-kind="assign" class="form-grid"><p class="small muted full">${safe(member?.name||'This member')} can work on every checked project. Check another project to add it without creating a new account.</p>${projectChecks(data.projects,current)}${actions('Save assignments')}</form>`}
  if(type==='assignProject'){
    const assigned=new Set(teamData?.assignments?.filter(a=>a.project_id===id).map(a=>a.user_id)||[]);
    const members=teamData?.members?.filter(m=>!m.archived)||[];
    const available=members.filter(m=>!assigned.has(m.user_id));
    body=assignmentProject?`<div class="assignment-target"><span class="project-dot" style="background:${safe(assignmentProject.color||'#76bafa')}"></span><span><small>PROJECT</small><strong>${safe(assignmentProject.name)}</strong></span></div><div class="assignment-current"><span>Assigned team members</span><strong>${members.filter(m=>assigned.has(m.user_id)).map(m=>safe(m.name)).join(', ')||'None yet'}</strong></div>${available.length?`<form id="project-assignment-form" class="form-grid"><label class="field full">Add an existing member<select name="userId" required>${available.map(m=>`<option value="${safe(m.user_id)}">${safe(m.name)} · ${safe(m.role)}</option>`).join('')}</select></label><p class="small muted full">Their current project assignments will stay in place.</p>${actions('Assign member')}</form>`:`<p class="assignment-empty">${members.length?'Every team member is already assigned to this project.':'Add a team member on the People page first.'}</p>`}`:'<p class="assignment-empty">This project is no longer available.</p>';
  }
  if(type==='resetMemberPassword')body=`<form id="team-form" data-kind="reset-password" class="form-grid"><p class="small muted full">Set a new password and give it to this member privately. No email is sent.</p>${input('New member password','password','password','','minlength="12" maxlength="128" autocomplete="new-password" required')}${actions('Reset password')}</form>`;
  if(type==='reviewMemberLeave')body=`<form id="team-review-form" class="form-grid"><p class="small muted full">The member will see your reason with the rejected request.</p><label class="field full">Reason for rejection<textarea name="reason" maxlength="500" required placeholder="Explain why this request cannot be approved"></textarea></label>${actions('Reject request')}</form>`;
  if(type==='project')body=`<form id="record-form" data-kind="project" class="form-grid">${input('Project name','name','text',existing?.name,'required')}${input('Client','client','text',existing?.client||'')}${input('Budget in hours','budget','number',existing?.budget||80,'min="1" required')}<label class="field full">Description<textarea name="description">${safe(existing?.description||'')}</textarea></label>${actions(existing?'Save project':'Create project',existing?'delete-project':'',id)}</form>`;
  if(type==='entry')body=`<form id="record-form" data-kind="entry" class="form-grid">${select('Team member','personId',data.people.filter(p=>!p.archived),existing?.personId||user.id)}${select('Project','projectId',data.projects.filter(p=>!p.archived),existing?.projectId||'',true)}${input('Date','date','date',existing?.date||iso(),'required')}${input('Start time','start','time',existing?.start||'09:00','required')}${input('End time','end','time',existing?.end||'17:00','required')}${input('Break (minutes)','breakMinutes','number',existing?.breakMinutes??0,'min="0" required')}${actions(existing?'Save entry':'Add entry',existing?'delete-entry':'',id)}</form>`;
  if(type==='shift')body=`<form id="record-form" data-kind="shift" class="form-grid">${select('Team member','personId',data.people.filter(p=>!p.archived),existing?.personId||user.id)}${select('Project','projectId',data.projects.filter(p=>!p.archived),existing?.projectId||'',true)}${input('Date','date','date',existing?.date||iso(),'required')}${input('Start','start','time',existing?.start||'09:00','required')}${input('End','end','time',existing?.end||'17:00','required')}${actions(existing?'Save shift':'Create shift',existing?'delete-shift':'',id)}</form>`;
  if(type==='leave')body=`<form id="record-form" data-kind="leave" class="form-grid">${select('Team member','personId',data.people.filter(p=>!p.archived),existing?.personId||user.id)}<label class="field">Leave type<select name="type">${['Vacation','Sick leave','Personal','Unpaid leave'].map(t=>`<option ${existing?.type===t?'selected':''}>${t}</option>`).join('')}</select></label>${input('From','from','date',existing?.from||iso(),'required')}${input('To','to','date',existing?.to||iso(),'required')}<label class="field full">Reason or note<textarea name="note">${safe(existing?.note||'')}</textarea></label>${actions(existing?'Save request':'Submit request',existing?'delete-leave':'',id)}</form>`;
  if(type==='correction')body=`<form id="record-form" data-kind="correction" class="form-grid">${select('Team member','personId',data.people.filter(p=>!p.archived),user.id)}<label class="field">Entry to correct<select name="entryId"><option value="">Missing punch / new entry</option>${data.entries.map(e=>`<option value="${e.id}">${safe(person(data,e.personId).name)} · ${shortDate(e.date)} · ${safe(e.start)}–${safe(e.end)}</option>`).join('')}</select></label>${select('Project','projectId',data.projects.filter(p=>!p.archived),'',true)}${input('Date','date','date',iso(),'required')}${input('Correct start','start','time','09:00','required')}${input('Correct end','end','time','17:00','required')}${input('Break (minutes)','breakMinutes','number',0,'min="0" required')}<label class="field full">Why is this correction needed?<textarea name="reason" required></textarea></label>${actions('Submit correction')}</form>`;
  if(type==='password')body=`<form id="password-form" class="form-grid">${input('New password','password','password','','minlength="8" required')}${input('Confirm password','confirm','password','','minlength="8" required')}${actions('Update password')}</form>`;
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="${safe(title)}"><div class="modal-head"><div><h2>${safe(title)}</h2><p>${type==='invite'?'Create a private login and assign projects.':'Changes are saved to your private workspace.'}</p></div><button data-action="close-modal" aria-label="Close">×</button></div>${body}</div></div>`;
}

function render(){
  if(loading){app.innerHTML=`<div class="loading-screen">${logoMark}<p>Opening your workspace…</p></div>`;return}
  if(loadError){app.innerHTML=`<div class="loading-screen"><h2>Could not open your workspace</h2><p>${safe(loadError)}</p><button class="primary-btn" data-action="retry">Try again</button><button class="outline-btn signout-button" data-action="signout">Sign out</button></div>`;return}
  app.innerHTML=authMode==='update-password'?authView():user&&memberData?memberDashboard(memberData,logoMark,icon,selectedMemberProject,memberTab):user&&data?appView():authView();
  liveTimes();
}

async function handleRecord(form){
  const v=Object.fromEntries(new FormData(form));const kind=form.dataset.kind,existingId=modal.id;
  let prepared;
  try {
    if(kind==='entry')prepared=makeEntry(v,data.settings.requireApproval,existingId);
    if(kind==='shift')prepared=makeShift(v,existingId);
    if(kind==='leave')prepared=makeLeave(v,existingId);
    if(kind==='correction'){
      const original=v.entryId?data.entries.find(entry=>entry.id===v.entryId):null;
      if(v.entryId&&!original)throw new Error('The selected time entry no longer exists.');
      if(original&&original.personId!==v.personId)throw new Error('Choose the team member on the selected time entry.');
      prepared=makeCorrection(v);
    }
  } catch(error){toast(error.message,'error');return}
  await commit(()=>{
    if(kind==='person'){
      const initials=v.name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
      if(existingId)Object.assign(data.people.find(p=>p.id===existingId),{name:v.name.trim(),email:v.email.trim(),role:v.role.trim(),team:v.team.trim(),initials});
      else data.people.push({id:uid(),name:v.name.trim(),email:v.email.trim(),role:v.role.trim(),team:v.team.trim(),initials,color:'#dbeaf5',status:'Off shift'});
      record(`${v.name.trim()} ${existingId?'updated':'added'} in the team directory`);
    }
    if(kind==='project'){
      const value={name:v.name.trim(),client:v.client.trim(),description:v.description.trim(),budget:Number(v.budget)};
      if(existingId)Object.assign(data.projects.find(p=>p.id===existingId),value);
      else data.projects.push({id:uid(),...value,color:'#dcebf6',archived:false});
      record(`Project ${v.name.trim()} ${existingId?'updated':'created'}`);
    }
    if(kind==='entry'){
      if(existingId)Object.assign(data.entries.find(e=>e.id===existingId),prepared);
      else data.entries.unshift(prepared);
      record(`Time entry ${existingId?'updated':'created'} for ${person(data,v.personId).name}`);
    }
    if(kind==='shift'){
      if(existingId)Object.assign(data.shifts.find(s=>s.id===existingId),prepared);
      else data.shifts.push(prepared);
      record(`Shift ${existingId?'updated':'scheduled'} for ${person(data,v.personId).name}`);
    }
    if(kind==='leave'){
      if(existingId)Object.assign(data.leave.find(l=>l.id===existingId),prepared);
      else data.leave.unshift(prepared);
      record(`Time-off request ${existingId?'updated':'submitted'} for ${person(data,v.personId).name}`);
    }
    if(kind==='correction'){
      data.corrections.unshift(prepared);
      record(`Time correction requested by ${person(data,v.personId).name}`);
    }
    modal=null;
  },`${kind==='correction'?'Correction request':'Record'} saved`);
}

document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el)return;
  const action=el.dataset.action;
  if(action==='close-modal'&&el.classList.contains('modal-backdrop')&&event.target!==el)return;
  if(action==='auth-mode'){authMode=el.dataset.mode;notice='';render();return}
  if(action==='retry'){boot();return}
  if(action==='navigate'){page=el.dataset.page;filter='All';query='';menuOpen=false;modal=null;location.hash=page;render();window.scrollTo(0,0);return}
  if(action==='member-tab'){memberTab=el.dataset.tab==='leave'?'leave':'overview';if(memberTab==='leave'){try{memberData=await teamRequest('member')}catch(error){toast(error.message,'error')}}render();return}
  if(action==='member-project'){selectedMemberProject=el.dataset.id;memberTab='overview';render();return}
  if(action==='member-refresh'){try{memberData=await teamRequest('member');render();toast('Leave status updated')}catch(error){toast(error.message,'error')}return}
  if(action==='member-start'||action==='member-stop'){
    if(busy)return;busy=true;el.disabled=true;
    try{memberData=await teamRequest(action==='member-start'?'start':'stop',action==='member-start'?{projectId:el.dataset.id}:{});render();toast(action==='member-start'?'Work started':'Work stopped and time saved')}
    catch(error){toast(error.message,'error');el.disabled=false}finally{busy=false}return;
  }
  if(action==='team-leave-approve'){
    if(busy)return;busy=true;el.disabled=true;
    try{teamData=await teamRequest('review-leave',{id:el.dataset.id,status:'Approved',reason:''});render();toast('Leave request approved')}
    catch(error){toast(error.message,'error');el.disabled=false}finally{busy=false}return;
  }
  if(action==='team-leave-reject'){modal={type:'reviewMemberLeave',id:el.dataset.id};render();return}
  if(action==='menu'){menuOpen=!menuOpen;render();return}
  if(action==='filter'){filter=el.dataset.filter;render();return}
  if(action==='week'){weekOffset+=Number(el.dataset.delta);render();return}
  if(action==='open-modal'){modal={type:el.dataset.modal==='person'&&!el.dataset.id?'invite':el.dataset.modal,id:el.dataset.id||null};render();return}
  if(action==='close-modal'){modal=null;render();return}
  if(action==='show-password'){modal={type:'password'};render();return}
  if(action==='signout'){await signOut();user=null;data=null;memberData=null;teamData=null;memberTab='overview';authMode='login';loadError='';render();return}
  if(action==='toggle-setting'){await commit(()=>{data.settings[el.dataset.key]=!data.settings[el.dataset.key];record('Workspace time settings updated')},'Settings saved');return}
  if(action==='approve-entry'){await commit(()=>{data.entries.find(e=>e.id===el.dataset.id).status='Approved';record('Time entry approved')},'Entry approved');return}
  if(action==='review-leave'){await commit(()=>{data.leave.find(l=>l.id===el.dataset.id).status=el.dataset.status;record(`Leave request ${el.dataset.status.toLowerCase()}`)},`Request ${el.dataset.status.toLowerCase()}`);return}
  if(action==='review-correction'){await commit(()=>{const c=reviewCorrection(data,el.dataset.id,el.dataset.status);record(`Time correction ${c.status.toLowerCase()}`)},`Correction ${el.dataset.status.toLowerCase()}`);return}
  if(action.startsWith('delete-')){const kind=action.slice(7),collection={entry:'entries',shift:'shifts',leave:'leave',project:'projects',person:'people',correction:'corrections'}[kind];if(!collection)return;const archived=['project','person'].includes(kind);if(!window.confirm(archived?`Archive this ${kind==='person'?'member':kind}? It will be hidden from the active workspace.`:`Delete this ${kind}? This cannot be undone.`))return;await commit(()=>{if(archived){if(kind==='person'&&el.dataset.id===user.id)throw new Error('The workspace owner cannot be archived.');data[collection].find(x=>x.id===el.dataset.id).archived=true}else data[collection]=data[collection].filter(x=>x.id!==el.dataset.id);record(`${kind} ${archived?'archived':'deleted'}`);modal=null},`${archived?'Record archived':'Record deleted'}`);return}
  if(action==='clock-toggle'){
    if(!data.settings.allowSelfClock){toast('Self clock-in is disabled in settings.','error');return}
    await commit(()=>{const clock=data.clock;if(clock.state==='out'){startClock(clock,clock.projectId);record(`${user.email} clocked in`)}else{data.entries.unshift(stopClock(clock,user.id,data.settings.requireApproval));record(`${user.email} clocked out`)}},data.clock.state==='out'?'Clocked in':'Clocked out and time entry saved');return}
  if(action==='clock-break'){await commit(()=>{toggleBreak(data.clock);record(data.clock.state==='break'?'Break started':'Break ended')},data.clock.state==='break'?'Break ended':'Break started');return}
  if(action==='export'){
    const rows=data.entries.map(e=>({member:person(data,e.personId).name,date:e.date,project:project(data,e.projectId).name,start:e.start,end:e.end,break_minutes:e.breakMinutes,hours:duration(e).toFixed(2),status:e.status}));
    const keys=['member','date','project','start','end','break_minutes','hours','status'];const csv=[keys.join(','),...rows.map(r=>keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='hoursdesk-timesheets.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
});

document.addEventListener('change',event=>{
  if(event.target.id==='clock-project'){commit(()=>{data.clock.projectId=event.target.value||null},'Clock project selected');return}
  if(event.target.matches('#record-form[data-kind="correction"] select[name="entryId"]')){
    const entry=data.entries.find(item=>item.id===event.target.value);
    if(!entry)return;
    const form=event.target.form;
    for(const [name,value] of Object.entries({personId:entry.personId,projectId:entry.projectId||'',date:entry.date,start:entry.start,end:entry.end,breakMinutes:entry.breakMinutes})){
      const field=form.elements.namedItem(name);
      if(field)field.value=value;
    }
  }
});
document.addEventListener('input',event=>{if(event.target.id==='global-search'){query=event.target.value;const pos=event.target.selectionStart;render();const field=document.querySelector('#global-search');field.focus();field.setSelectionRange(pos,pos)}});
document.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,v=Object.fromEntries(new FormData(form));
  if(form.id==='auth-form'){
    if((authMode==='signup'||authMode==='update-password')&&v.password!==v.confirm){toast('Passwords do not match.','error');return}
    const button=form.querySelector('button[type=submit]');button.disabled=true;button.textContent='Please wait…';
    try{
      if(authMode==='login'){await signIn(v.email,v.password);notice='';await boot()}
      if(authMode==='signup'){const result=await signUp(v.email,v.password,v.fullName,v.company);if(result.access_token){notice='';await boot()}else{authMode='login';notice='Check your email for a confirmation link, then sign in.';render()}}
      if(authMode==='reset'){await sendPasswordReset(v.email);authMode='login';notice='If that email has an account, a reset link has been sent.';render()}
       if(authMode==='update-password'){
         await updatePassword(v.password);authMode='login';notice='Password updated. You can sign in now.';await signOut();user=null;data=null;render()
       }
    }catch(error){toast(error.message,'error');render()}
    return;
  }
  if(form.id==='record-form'){await handleRecord(form);return}
  if(form.id==='project-assignment-form'){
    if(busy)return;busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{
      const fresh=await teamRequest('owner');
      const member=fresh.members.find(m=>m.user_id===v.userId&&!m.archived);
      const project=data.projects.find(p=>p.id===modal.id&&!p.archived);
      if(!member||!project)throw new Error('This member or project is no longer available.');
      const activeProjectIds=new Set(data.projects.filter(p=>!p.archived).map(p=>p.id));
      const projectIds=[...new Set([...fresh.assignments.filter(a=>a.user_id===member.user_id&&activeProjectIds.has(a.project_id)).map(a=>a.project_id),project.id])];
      teamData=await teamRequest('assign',{userId:member.user_id,projectIds});
      modal=null;render();toast(`${member.name} can now work on ${project.name}`);
    }catch(error){toast(error.message,'error');button.disabled=false}finally{busy=false}return;
  }
  if(form.id==='member-leave-form'){
    if(busy)return;busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{memberData=await teamRequest('request-leave',{type:v.type,from:v.from,to:v.to,note:v.note});render();toast('Leave request sent to your workspace owner')}
    catch(error){toast(error.message,'error');button.disabled=false}finally{busy=false}return;
  }
  if(form.id==='team-review-form'){
    if(busy)return;busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{teamData=await teamRequest('review-leave',{id:modal.id,status:'Rejected',reason:v.reason});modal=null;render();toast('Leave request rejected with your reason')}
    catch(error){toast(error.message,'error');button.disabled=false}finally{busy=false}return;
  }
  if(form.id==='team-form'){
    if(busy)return;
    if(form.dataset.kind==='reset-password'){
      busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
      try{await teamRequest('reset-password',{userId:modal.id,password:v.password});modal=null;render();toast('Password changed. Share the new login details privately.')}
      catch(error){toast(error.message,'error');button.disabled=false}finally{busy=false}return;
    }
    const projectIds=[...new FormData(form).getAll('projectIds')];
    if(v.name!==undefined&&(!v.name.trim()||!v.email?.trim()||!v.role?.trim()||!projectIds.length)){toast('Complete the member details and choose at least one project.','error');return}
    busy=true;const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{
      const isInvite=form.dataset.kind==='invite';
      teamData=await teamRequest(isInvite?'create':'assign',isInvite?{name:v.name,email:v.email,role:v.role,department:v.department,memberPassword:v.memberPassword,projectIds}:{userId:modal.id,projectIds});
      if(isInvite){
        const created=teamData.members.find(m=>m.email.toLowerCase()===v.email.trim().toLowerCase());
        if(created&&!data.people.some(p=>p.id===created.user_id)){
          const previous=clone(data);
          data.people.push({id:created.user_id,name:created.name,email:created.email,role:created.role,team:created.department||'Team',initials:created.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(),color:'#dbeaf5',status:'Off shift'});
          try{await saveWorkspace(data)}catch(error){data=previous;toast('Account created, but the directory could not update: '+error.message,'error')}
        }
      }
      modal=null;render();toast(isInvite?'Member account created. Share the login details privately.':'Project assignments saved');
    }catch(error){toast(error.message,'error');button.disabled=false}finally{busy=false}return;
  }
  if(form.id==='password-form'){if(v.password!==v.confirm){toast('Passwords do not match.','error');return}try{await updatePassword(v.password);modal=null;render();toast('Password updated')}catch(error){toast(error.message,'error')}return}
  if(form.id==='settings-form'){await commit(()=>{Object.assign(data.settings,{company:v.company.trim(),timezone:v.timezone,workday:Number(v.workday),overtime:Number(v.overtime)});record('Workspace profile updated')},'Workspace settings saved')}
});

window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(pageMeta[next]&&next!==page){page=next;render()}});
setInterval(liveTimes,1000);
setInterval(()=>{if(!loading&&user&&page==='today'&&data?.clock.state!=='out')render()},60000);
setInterval(async()=>{if(!loading&&user&&!memberData&&data){await refreshTeam();if(!modal&&(page==='team'||page==='dashboard'||page==='leave'))render()}},30000);
setInterval(async()=>{if(!loading&&user&&memberData){try{memberData=await teamRequest('member');if(memberTab!=='leave')render()}catch(error){toast(error.message,'error')}}},30000);
boot();
