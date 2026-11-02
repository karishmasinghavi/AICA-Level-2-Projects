export const newId = () => crypto.randomUUID();

export function workedHours(entry) {
  const [startHour,startMinute]=entry.start.split(':').map(Number);
  const [endHour,endMinute]=entry.end.split(':').map(Number);
  let minutes=endHour*60+endMinute-startHour*60-startMinute;
  if(minutes<0)minutes+=1440;
  return Math.max(0,(minutes-Number(entry.breakMinutes||0))/60);
}

export function validateTime(start,end,breakMinutes=0) {
  if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||start===end) throw new Error('Choose different start and end times.');
  const span=((Number(end.slice(0,2))*60+Number(end.slice(3)))-(Number(start.slice(0,2))*60+Number(start.slice(3)))+1440)%1440;
  if(Number(breakMinutes)<0||Number(breakMinutes)>=span) throw new Error('Break must be shorter than the shift.');
}

export function leaveDays(from,to) {
  if(!from||!to||to<from) throw new Error('End date must be after start date.');
  return Math.floor((new Date(`${to}T12:00:00Z`)-new Date(`${from}T12:00:00Z`))/86400000)+1;
}

export function makeEntry(value,approvalRequired=true,existingId=null) {
  validateTime(value.start,value.end,value.breakMinutes);
  return {id:existingId||newId(),personId:value.personId,projectId:value.projectId||null,date:value.date,start:value.start,end:value.end,breakMinutes:Number(value.breakMinutes),status:approvalRequired?'Pending':'Approved'};
}

export function makeShift(value,existingId=null) {
  validateTime(value.start,value.end);
  return {id:existingId||newId(),personId:value.personId,projectId:value.projectId||null,date:value.date,start:value.start,end:value.end};
}

export function makeLeave(value,existingId=null) {
  return {id:existingId||newId(),personId:value.personId,type:value.type,from:value.from,to:value.to,days:leaveDays(value.from,value.to),note:value.note.trim(),status:'Pending'};
}

export function makeCorrection(value) {
  validateTime(value.start,value.end,value.breakMinutes);
  if(!value.reason?.trim()) throw new Error('Add a reason for the correction.');
  return {id:newId(),personId:value.personId,entryId:value.entryId||null,projectId:value.projectId||null,date:value.date,start:value.start,end:value.end,breakMinutes:Number(value.breakMinutes),reason:value.reason.trim(),status:'Pending'};
}

export function reviewCorrection(data,id,status) {
  const correction=data.corrections.find(item=>item.id===id);
  if(!correction||correction.status!=='Pending') throw new Error('This correction is already reviewed.');
  if(!['Approved','Rejected'].includes(status)) throw new Error('Invalid review decision.');
  correction.status=status;
  if(status==='Approved'){
    const values={personId:correction.personId,projectId:correction.projectId,date:correction.date,start:correction.start,end:correction.end,breakMinutes:correction.breakMinutes,status:'Approved'};
    const existing=data.entries.find(entry=>entry.id===correction.entryId);
    if(existing)Object.assign(existing,values);
    else data.entries.unshift({id:newId(),...values});
  }
  return correction;
}

export function startClock(clock,projectId,now=new Date()) {
  if(clock.state!=='out') throw new Error('You are already clocked in.');
  Object.assign(clock,{state:'in',since:now.toISOString(),projectId:projectId||null,breakStarted:null,breakMinutes:0});
}

export function toggleBreak(clock,now=new Date()) {
  if(clock.state==='out') throw new Error('Clock in before taking a break.');
  if(clock.state==='break'){
    clock.breakMinutes=(clock.breakMinutes||0)+(now-new Date(clock.breakStarted))/60000;
    clock.breakStarted=null;clock.state='in';
  }else{clock.breakStarted=now.toISOString();clock.state='break'}
}

export function stopClock(clock,personId,approvalRequired=true,now=new Date()) {
  if(clock.state==='out'||!clock.since) throw new Error('You are not clocked in.');
  const start=new Date(clock.since);
  const extra=clock.breakStarted?(now-new Date(clock.breakStarted))/60000:0;
  const value={personId,projectId:clock.projectId,date:start.toLocaleDateString('en-CA'),start:start.toTimeString().slice(0,5),end:now.toTimeString().slice(0,5),breakMinutes:Math.round((clock.breakMinutes||0)+extra)};
  if(value.start===value.end) throw new Error('Keep the clock running for at least a minute before clocking out.');
  const entry=makeEntry(value,approvalRequired);
  Object.assign(clock,{state:'out',since:null,breakStarted:null,breakMinutes:0});
  return entry;
}
