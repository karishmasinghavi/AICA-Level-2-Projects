import assert from 'node:assert/strict';
import { createEmptyData } from '../src/data.js';
import { pageMeta, renderView } from '../src/views.js';
import { leaveDays, makeCorrection, makeEntry, makeLeave, makeShift, reviewCorrection, startClock, stopClock, toggleBreak, validateTime, workedHours } from '../src/workflows.js';

const user={id:'00000000-0000-4000-8000-000000000001',email:'owner@example.invalid',user_metadata:{full_name:'Owner',company:'Example'}};
const data=createEmptyData(user);
assert.equal(data.people.length,1);
assert.deepEqual([data.projects.length,data.shifts.length,data.entries.length,data.leave.length,data.corrections.length,data.activity.length],[0,0,0,0,0,0]);
for(const page of Object.keys(pageMeta))assert.ok(renderView(page,data,{user,filter:'All',query:'',weekOffset:0}).length>0,`${page} renders empty`);

const entry=makeEntry({personId:user.id,projectId:null,date:'2026-11-02',start:'09:00',end:'17:30',breakMinutes:30});
assert.equal(entry.status,'Pending');assert.equal(workedHours(entry),8);
assert.equal(makeEntry({personId:user.id,projectId:null,date:'2026-11-02',start:'09:00',end:'17:00',breakMinutes:0},false).status,'Approved');
assert.equal(workedHours({...entry,start:'22:00',end:'06:00',breakMinutes:30}),7.5);
assert.throws(()=>validateTime('09:00','09:00'),/different/);
assert.throws(()=>validateTime('09:00','10:00',60),/shorter/);
data.entries.push(entry);

const shift=makeShift({personId:user.id,projectId:null,date:'2026-11-03',start:'09:00',end:'17:00'});
assert.equal(shift.date,'2026-11-03');data.shifts.push(shift);
const leave=makeLeave({personId:user.id,type:'Vacation',from:'2026-11-12',to:'2026-11-14',note:'Family'});
assert.equal(leave.days,3);assert.equal(leaveDays('2026-11-12','2026-11-12'),1);
assert.throws(()=>leaveDays('2026-11-14','2026-11-12'),/after/);
data.leave.push(leave);

const correction=makeCorrection({personId:user.id,entryId:entry.id,projectId:null,date:entry.date,start:'09:15',end:'17:00',breakMinutes:45,reason:'Missed punch'});
data.corrections.push(correction);reviewCorrection(data,correction.id,'Approved');
assert.equal(data.entries[0].start,'09:15');assert.equal(data.entries[0].status,'Approved');
assert.throws(()=>reviewCorrection(data,correction.id,'Approved'),/already reviewed/);
const rejected=makeCorrection({personId:user.id,entryId:null,projectId:null,date:'2026-11-03',start:'08:00',end:'16:00',breakMinutes:0,reason:'Incorrect punch'});
data.corrections.push(rejected);
const beforeReject=data.entries.length;
reviewCorrection(data,rejected.id,'Rejected');
assert.equal(data.entries.length,beforeReject);
const missingPunch=makeCorrection({personId:user.id,entryId:null,projectId:null,date:'2026-11-04',start:'08:00',end:'16:30',breakMinutes:30,reason:'Missing punch'});
data.corrections.push(missingPunch);
reviewCorrection(data,missingPunch.id,'Approved');
assert.equal(data.entries[0].status,'Approved');
assert.equal(data.entries[0].date,'2026-11-04');

const clock={state:'out',since:null,projectId:null,breakStarted:null,breakMinutes:0};
startClock(clock,null,new Date('2026-11-02T09:00:00Z'));
assert.throws(()=>startClock(clock,null,new Date('2026-11-02T09:01:00Z')),/already clocked/);
toggleBreak(clock,new Date('2026-11-02T11:00:00Z'));
toggleBreak(clock,new Date('2026-11-02T11:30:00Z'));
const clockEntry=stopClock(clock,user.id,false,new Date('2026-11-02T17:00:00Z'));
assert.equal(clockEntry.breakMinutes,30);assert.equal(clockEntry.status,'Approved');assert.equal(clock.state,'out');
assert.equal(workedHours(clockEntry),7.5);
assert.throws(()=>toggleBreak(clock),/Clock in/);

for(const page of Object.keys(pageMeta))assert.ok(renderView(page,data,{user,filter:'All',query:'',weekOffset:0}).length>0,`${page} renders populated`);
console.log('Verified empty workspace, all views, time, shifts, leave, corrections and clock workflows.');
