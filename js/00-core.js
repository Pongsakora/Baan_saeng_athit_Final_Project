// ============================================================
// 00-core.js
// ส่วนกลางของแอป: state (DB), การเชื่อมต่อ API, session/login,
// เมนูนำทาง (nav), modal, toast, ฟังก์ชันช่วยเหลือทั่วไป,
// และระบบแจ้งเตือน (กระดิ่ง) ฝั่งแอดมิน
// ไฟล์นี้ต้องถูกโหลดเป็นไฟล์แรกสุด เพราะไฟล์อื่นทั้งหมดใช้ตัวแปร/ฟังก์ชันจากที่นี่
// ============================================================

// ============================================================
// DATA
// ============================================================
let DB = {
  rooms: [],
  users: [],
  rates: {rent:0, water_unit:0, electric_unit:0, deposit:3000},
  bankAccount: {name:'', bank:'', number:'', promptpay:''},
  chatMessages: {},
  bills: [],
  deposits: [],
  reports: [],
  checkouts: [],
  expenses: [],
  roomReadings: [],
  roomOccupants: []
};

let currentUser = null;
let authToken = null;
let dbReady = false;
let dbLoadError = null;
let dbSyncTimer = null;
let dbSyncRunning = false;
let dbSyncPending = false;
const SESSION_USER_ID_KEY = 'house_sunset_user_id';
const SESSION_TOKEN_KEY = 'house_sunset_token';
function getAuthHeaders(){
  var h={'Content-Type':'application/json'};
  if(authToken) h['Authorization']='Bearer '+authToken;
  return h;
}

function createObservableDB(target, onChange, seen){
  if(!target || typeof target!=='object') return target;
  if(seen.has(target)) return seen.get(target);

  var mutatingArrayMethods = {
    push:true,pop:true,shift:true,unshift:true,splice:true,sort:true,reverse:true,copyWithin:true,fill:true
  };

  var proxy = new Proxy(target,{
    get:function(obj,prop){
      var value=obj[prop];

      if(Array.isArray(obj) && typeof value==='function' && mutatingArrayMethods[prop]){
        return function(){
          var result = Array.prototype[prop].apply(obj, arguments);
          onChange();
          return result;
        };
      }

      if(value && typeof value==='object'){
        return createObservableDB(value,onChange,seen);
      }
      return value;
    },
    set:function(obj,prop,value){
      obj[prop]=value;
      onChange();
      return true;
    },
    deleteProperty:function(obj,prop){
      if(prop in obj){
        delete obj[prop];
        onChange();
      }
      return true;
    }
  });

  seen.set(target,proxy);
  return proxy;
}

function wrapDBWithSync(raw){
  return createObservableDB(raw, scheduleDBSync, new WeakMap());
}

function scheduleDBSync(){
  if(!dbReady) return;
  clearTimeout(dbSyncTimer);
  dbSyncTimer=setTimeout(function(){ flushDBSync(); },450);
}

function getPlainDB(){
  return JSON.parse(JSON.stringify(DB));
}

async function flushDBSync(){
  if(!dbReady) return;
  if(dbSyncRunning){
    dbSyncPending=true;
    return;
  }

  dbSyncRunning=true;
  try{
    var res = await fetch('/api/data',{
      method:'POST',
      headers:getAuthHeaders(),
      body:JSON.stringify(getPlainDB())
    });
    if(!res.ok){
      throw new Error('HTTP '+res.status);
    }
  }catch(err){
    console.error('Failed to save data to backend', err);
    showToast('Failed to save data to database','error');
  }finally{
    dbSyncRunning=false;
    if(dbSyncPending){
      dbSyncPending=false;
      flushDBSync();
    }
  }
}

async function loadDBFromServer(silent){
  try{
    var fetchHeaders={};
    if(authToken) fetchHeaders['Authorization']='Bearer '+authToken;
    var res = await fetch('/api/data',{cache:'no-store',headers:fetchHeaders});
    if(!res.ok){
      if(res.status===401||res.status===403){
        var e401=new Error('unauthorized');
        e401.status=res.status;
        throw e401;
      }
      throw new Error('HTTP '+res.status);
    }
    var data = await res.json();
    DB = wrapDBWithSync(data);
    dbReady = true;
    dbLoadError = null;
  }catch(err){
    dbReady = false;
    dbLoadError = err;
    console.error('Failed to load data from backend', err);
    if(!silent) showToast('Database connection failed','error');
    throw err;
  }
}

async function requestJSON(url, options){
  var opts = options || {};
  opts.headers = opts.headers || {};
  if(authToken && !opts.headers['Authorization']){
    opts.headers['Authorization'] = 'Bearer '+authToken;
  }
  if(opts.body && !opts.headers['Content-Type']){
    opts.headers['Content-Type'] = 'application/json';
  }

  var res = await fetch(url, opts);
  var payload = null;
  try{ payload = await res.json(); }catch(_e){}

  if(!res.ok){
    throw new Error(payload && payload.error ? payload.error : ('HTTP ' + res.status));
  }
  return payload;
}

function getSavedUserId(){
  try{
    return localStorage.getItem(SESSION_USER_ID_KEY);
  }catch(_e){
    return null;
  }
}

function saveUserId(userId){
  try{
    localStorage.setItem(SESSION_USER_ID_KEY, userId);
  }catch(_e){}
}

function clearSavedUserId(){
  try{
    localStorage.removeItem(SESSION_USER_ID_KEY);
  }catch(_e){}
}

function openAppForUser(user, saveSession){
  currentUser=user;
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appShell').style.display='block';
  document.getElementById('loginError').style.display='none';
  document.getElementById('userBadge').textContent=user.role==='admin'?'ADMIN':'ROOM '+user.room+' '+user.name;
  if(saveSession!==false){
    saveUserId(user.id);
  }
  buildNav();
  showPage(user.role==='admin'?'dashboard':'my-bills');
  if(user.role==='admin'){
    window.refreshAdminNotifBadge();
    startAdminNotifPolling();
  }else{
    stopAdminNotifPolling();
    var bellEl=document.getElementById('notifBell');
    if(bellEl) bellEl.style.display='none';
  }
}

async function tryRestoreSession(){
  try{ authToken=localStorage.getItem(SESSION_TOKEN_KEY)||null; }catch(_e){}
  var savedId=getSavedUserId();
  if(!savedId||!authToken) return;
  try{
    await loadDBFromServer(true);
  }catch(_err){
    // Token invalid or server unreachable — clear and stay on login screen
    authToken=null;
    clearSavedUserId();
    try{ localStorage.removeItem(SESSION_TOKEN_KEY); }catch(_e2){}
    return;
  }
  var user=DB.users.find(function(x){ return x.id===savedId; });
  if(!user){
    clearSavedUserId();
    authToken=null;
    try{ localStorage.removeItem(SESSION_TOKEN_KEY); }catch(_e3){}
    return;
  }
  openAppForUser(user,false);
}


// ============================================================
// HELPERS
// ============================================================
// ขนาดตัวอักษรแชทเดิมเล็กเกินไป (อาจารย์ท้วงว่าอ่านยาก) ปรับให้ใหญ่ขึ้นทั้งข้อความและเวลา
function buildChatBubblesHTML(msgs, myRole){
  var html='';
  msgs.forEach(function(m){
    var isMe=m.from===myRole;
    html+='<div style="display:flex;justify-content:'+(isMe?'flex-end':'flex-start')+';margin-bottom:8px">'
      +'<div style="max-width:78%;background:'+(isMe?'var(--sky)':'white')+';color:'+(isMe?'white':'var(--text-dark)')+';padding:10px 14px;border-radius:'+(isMe?'14px 14px 2px 14px':'14px 14px 14px 2px')+';font-size:16px;line-height:1.4;box-shadow:0 1px 4px rgba(0,0,0,0.1)">'
      +escapeHtml(m.text)+'<div style="font-size:16px;opacity:0.65;margin-top:4px;text-align:'+(isMe?'right':'left')+'">'+escapeHtml(m.time)+'</div></div></div>';
  });
  return html||'<div style="text-align:center;color:var(--text-light);font-size:16px;padding:12px">ยังไม่มีข้อความ</div>';
}
function createClientId(prefix){
  var rand=Math.random().toString(36).slice(2,8).toUpperCase();
  return prefix+Date.now().toString(36).toUpperCase()+rand;
}
function escapeHtml(str){
  var s=String(str==null?'':str);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmtMoney(n){ return Number(n).toLocaleString('th-TH'); }
function round2(n){ return Math.round((Number(n)||0)*100)/100; }
// เลขหน่วยน้ำ/ไฟที่ใช้ = ผลลบเลขมิเตอร์ (ทศนิยม) ซึ่งลบกันตรงๆ แบบ floating point จะเพี้ยนได้
// (เช่น 1378.1-1287.9 ได้ 90.19999999999982) ปัดเหลือ 2 ตำแหน่งและโชว์แบบทศนิยม 2 ตำแหน่งเสมอกันงง
// ใช้ร่วมกันทั้งหน้าบันทึกหน่วยน้ำ-ไฟ และทุกที่ที่โชว์หน่วยที่ใช้ (บิล/ใบเสร็จ) ให้ตรงกัน
function fmtUnit(n){ return round2(n).toFixed(2); }
function thMonth(m){ return ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][m-1]||m; }
function thMonthFull(m){
  var names=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return names[m-1]||m;
}
// ปี/เดือนปัจจุบันแบบ พ.ศ. ใช้แทนตัวเลขปีที่ฝังตายตัว (hardcode) ตามหน้าต่างๆ
// เพื่อให้หน้าเว็บยังถูกต้องเมื่อข้ามปีไปแล้วโดยไม่ต้องแก้โค้ด
function currentBuddhistYear(){ return new Date().getFullYear()+543; }
function currentBuddhistMonth(){ return new Date().getMonth()+1; }
function statusBadge(s){
  if(s==='paid') return '<span class="badge badge-success">ชำระแล้ว</span>';
  if(s==='unpaid') return '<span class="badge badge-danger">ค้างชำระ</span>';
  if(s==='pending') return '<span class="badge badge-warning">รอดำเนินการ</span>';
  if(s==='received') return '<span class="badge badge-info">รับเรื่องแล้ว</span>';
  if(s==='done') return '<span class="badge badge-success">เสร็จแล้ว</span>';
  return '<span class="badge badge-gray">'+s+'</span>';
}
// ป้ายสถานะเฉพาะของ "บิล" — ต่างจาก statusBadge() ตรงที่แยกกรณี
// "ชำระแล้ว แต่สลิปยังรอแอดมินตรวจสอบ" ออกจาก "ชำระแล้วและยืนยันแล้วจริง"
// เพื่อไม่ให้ผู้เช่า/แอดมินเข้าใจผิดว่าจ่ายเงินจบแล้วทั้งที่ยังตรวจสลิปไม่เสร็จ
function billStatusBadge(b){
  if(b&&b.status==='paid'){
    if(b.slip_status==='approved') return '<span class="badge badge-success">ชำระแล้ว</span>';
    if(b.slip_status==='rejected') return '<span class="badge badge-danger">สลิปถูกปฏิเสธ</span>';
    return '<span class="badge badge-warning">รอตรวจสอบสลิป</span>';
  }
  // บิลที่ถูกปฏิเสธสลิปจะถูกเซ็ตกลับเป็น status='unpaid' เพื่อให้จ่ายใหม่ได้
  // แต่ยังต้องโชว์ว่า "ถูกปฏิเสธมาก่อน" ไม่ใช่แค่ค้างชำระธรรมดา จนกว่าจะส่งสลิปใหม่ (ซึ่งจะเปลี่ยน slip_status เป็น pending)
  if(b&&b.status==='unpaid'&&b.slip_status==='rejected'){
    return '<span class="badge badge-danger">สลิปถูกปฏิเสธ — กรุณาชำระใหม่</span>';
  }
  return statusBadge(b?b.status:'');
}
function reportTypeTh(t){ return t==='repair'?'แจ้งซ่อมบำรุง':t==='complaint'?'แจ้งร้องเรียน':'แจ้งเรื่องอื่นๆ'; }
// จำนวนวันที่ผ่านมาตั้งแต่วันที่ลงบิล (b.billDate เป็น ISO date เช่น "2026-01-05")
// ใช้นับถอยหลังก่อนบิลจะเกินกำหนดและถูกย้ายไปหน้าติดตามหนี้ค้างชำระ
var BILL_OVERDUE_DAYS=15;
function billDaysOld(b){
  if(!b||!b.billDate) return 0;
  var billDate=new Date(b.billDate+'T00:00:00');
  if(isNaN(billDate.getTime())) return 0;
  var today=new Date(); today.setHours(0,0,0,0);
  return Math.max(0, Math.floor((today-billDate)/86400000));
}
// บิลค้างชำระที่เกินกำหนด 15 วันแล้ว (เงื่อนไขเดียวกับที่ใช้ย้ายไปหน้าติดตามหนี้ค้างชำระ/แจ้งเตือนแอดมิน)
function isBillOverdue(b){
  return !!(b&&b.status==='unpaid'&&billDaysOld(b)>=BILL_OVERDUE_DAYS);
}
// ข้อความนับถอยหลัง/เกินกำหนด แสดงให้ผู้เช่าเห็นในหน้าชำระเงิน ว่าบิลออกมาแล้วกี่วัน
// และยังเหลือเวลาอีกกี่วันก่อนจะเกิน 15 วันแล้วถูกย้ายไปหน้าติดตามหนี้ค้างชำระของแอดมิน
function billCountdownHtml(b){
  if(!b||b.status!=='unpaid'||!b.billDate) return '';
  var daysOld=billDaysOld(b);
  var daysLeft=BILL_OVERDUE_DAYS-daysOld;
  if(daysLeft<=0){
    return '<div style="font-size:16px;color:var(--danger);margin-top:4px">⏰ เกินกำหนดชำระแล้ว '+daysOld+' วัน (ย้ายไปติดตามหนี้ค้างชำระแล้ว)</div>';
  }
  if(daysLeft<=5){
    return '<div style="font-size:16px;color:#C05621;margin-top:4px">⏳ ออกบิลมาแล้ว '+daysOld+' วัน เหลืออีก '+daysLeft+' วันก่อนเกินกำหนด</div>';
  }
  return '<div style="font-size:16px;color:var(--text-light);margin-top:4px">ออกบิลมาแล้ว '+daysOld+' วัน (ครบกำหนดชำระใน '+daysLeft+' วัน)</div>';
}
// สร้างหัวข้อหน้า (page-header) แบบเดียวกันทุกหน้า แทนการพิมพ์ HTML ซ้ำในแต่ละไฟล์
// opts.subtitle = ข้อความบรรทัดรองใต้หัวข้อ, opts.action = ปุ่ม/element เสริมด้านขวา (เช่นปุ่มเพิ่มห้อง)
function pageHeader(title, opts){
  opts = opts || {};
  var subtitleHtml = opts.subtitle ? '<div class="page-subtitle">'+opts.subtitle+'</div>' : '';
  var actionHtml = opts.action || '';
  var headerClass = actionHtml ? 'page-header flex-between' : 'page-header';
  var headerStyle = actionHtml ? ' style="align-items:center"' : '';
  return '<div class="'+headerClass+'"'+headerStyle+'><div class="page-title">'+title+'</div>'
    +subtitleHtml+actionHtml+'</div>';
}
// ห่อเนื้อหาด้วยกล่องการ์ด (.card) แบบเดียวกันทุกหน้า, extraClass ใส่ class เสริมได้ (เช่นสำหรับปรับมุมโค้ง)
function cardBox(innerHtml, extraClass){
  return '<div class="card'+(extraClass?' '+extraClass:'')+'">'+innerHtml+'</div>';
}
// กล่องแสดงผลการดำเนินการของแอดมินต่อเรื่องที่ผู้เช่าแจ้ง (ใช้ซ้ำในหลายหน้า: แจ้งเหตุของผู้เช่า, ตรวจสอบของแอดมิน, ประวัติ)
function responseBox(responseText){
  if(!responseText) return '';
  return '<div class="response-box"><strong>ผลการดำเนินการ:</strong> '+escapeHtml(responseText)+'</div>';
}
function openModal(title,body,actions){
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=body||'';
  document.getElementById('modalActions').innerHTML=actions||'';
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); }
document.getElementById('modalOverlay').addEventListener('click',function(e){ if(e.target===e.currentTarget) closeModal(); });

// ฟังก์ชันพิมพ์กลางของทั้งแอป — ใช้แทน window.print() ตรงๆ ทุกจุดที่มีปุ่ม "พิมพ์"
// ดูรูปแจ้งเหตุแบบเต็มจอในป็อปอัพ — เดิมใช้ window.open(src,'_blank') เปิดแท็บใหม่ แต่รูปที่อัปโหลด
// เก็บเป็น data URL (base64) ฝังในหน้าเดียวกัน พอเปิดแท็บใหม่ด้วย data URL เบราว์เซอร์หลายตัว
// (โดยเฉพาะมือถือ) บล็อก/ไม่ยอมแสดงรูปให้ เลยเจอปัญหาเด้งไปหน้าเปล่าๆ ไม่มีรูป จึงเปลี่ยนมาเปิดเป็น
// modal ในหน้าเดิมแทน ซึ่งไม่มีข้อจำกัดเรื่อง data URL
window.viewImageFull=function(src){
  openModal('🖼️ รูปภาพ','<div style="text-align:center"><img src="'+src+'" style="max-width:100%;max-height:75vh;border-radius:10px"></div>',
    '<button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
};
// (บิลผู้เช่า, ใบแจ้งหนี้ค้างชำระ, ใบเสร็จหลังตรวจสลิป, พิมพ์ใบเสร็จจากประวัติ, รายงานรายรับ-รายจ่าย)
// คัดลอกเฉพาะ HTML ที่จะพิมพ์ไปไว้ใน div ใหม่ที่แปะเป็นลูกตรงของ <body> ก่อนสั่งพิมพ์
// เพื่อไม่ให้ความสูงของเมนู/การ์ดอื่นๆ ในหน้าเดิม (ที่ถูกซ่อนตอนพิมพ์) มาทำให้เอกสารล้นไปหน้า 2 แบบว่างๆ
// ดูกฎ @media print คู่กันใน 00-core.css
window.printHtml=function(html){
  var old=document.getElementById('printRoot');
  if(old) old.remove();
  var div=document.createElement('div');
  div.id='printRoot';
  div.innerHTML=html;
  document.body.appendChild(div);
  window.print();
  // ปกติลบ #printRoot ตอน afterprint แต่บางเบราว์เซอร์/อุปกรณ์ (เช่นมือถือบางรุ่น) ไม่ยิง afterprint
  // ให้เวลาผู้ใช้กด "ยกเลิก" แทนกดพิมพ์จริง เลยตั้งเวลาสำรองลบทิ้งไว้ด้วย กันกล่องค้างอยู่ในหน้าเว็บ
  // (ซ่อนด้วย CSS อยู่แล้วตอนไม่ได้พิมพ์ แต่ลบทิ้งจริงๆ สะอาดกว่าปล่อยค้างไว้ใน DOM)
  var cleaned=false;
  function cleanup(){
    if(cleaned) return;
    cleaned=true;
    var pr=document.getElementById('printRoot');
    if(pr) pr.remove();
    window.removeEventListener('afterprint',cleanup);
  }
  window.addEventListener('afterprint',cleanup);
  setTimeout(cleanup,60000);
};
function showToast(msg,type){
  var t=document.createElement('div');
  t.className='alert alert-'+(type==='error'?'danger':'success');
  t.style.cssText='position:fixed;bottom:24px;right:24px;z-index:9999;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,0.15);animation:fadeUp 0.3s ease';
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); },3000);
}

// ============================================================
// ADMIN: กระดิ่งแจ้งเตือน (เรื่องแจ้งเหตุ / คำขอออกจากหอ / ชำระเงิน-ส่งสลิป)
// ============================================================
// รายการที่แอดมินเคยเปิดดูแล้ว (ใช้ตัดกรอบแดง/ไม่นับในเลขที่กระดิ่ง แต่ยังคงแสดงในกล่องแจ้งเตือนต่อไป
// จนกว่าเรื่องนั้นจะถูกจัดการเสร็จจริงๆ ไม่ใช่หายไปทันทีที่เปิดดูครั้งเดียวเหมือนของเดิม)
var NOTIF_SEEN_KEY='hs_admin_seen_notif_keys';
// เวลาที่ตรวจพบการแจ้งเตือนแต่ละรายการครั้งแรก ใช้โชว์ "เวลาที่แจ้งเตือนมา" และเรียงใหม่-เก่า
var NOTIF_FIRST_SEEN_KEY='hs_admin_notif_first_seen';
var notifPollTimer=null;
function getSeenNotifSet(){
  try{
    var raw=localStorage.getItem(NOTIF_SEEN_KEY);
    return raw?new Set(JSON.parse(raw)):new Set();
  }catch(_e){ return new Set(); }
}
function saveSeenNotifSet(set){
  try{ localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(Array.from(set))); }catch(_e){}
}
function getNotifFirstSeenMap(){
  try{
    var raw=localStorage.getItem(NOTIF_FIRST_SEEN_KEY);
    return raw?JSON.parse(raw):{};
  }catch(_e){ return {}; }
}
function saveNotifFirstSeenMap(map){
  try{ localStorage.setItem(NOTIF_FIRST_SEEN_KEY, JSON.stringify(map)); }catch(_e){}
}
// แปลงเวลา ISO เป็นข้อความแสดงแค่เวลา (ชม:นาที) เช่น "19:15 น."
function formatNotifTime(iso){
  if(!iso) return '';
  var d=new Date(iso);
  if(isNaN(d.getTime())) return '';
  var hh=String(d.getHours()).padStart(2,'0');
  var mm=String(d.getMinutes()).padStart(2,'0');
  return hh+':'+mm+' น.';
}
function computeAdminNotifItems(){
  var items=[];
  (DB.reports||[]).forEach(function(r){
    if(r.status==='pending'){
      items.push({key:'report:'+r.id,type:'report',page:'reports-admin',room:r.room,
        title:'แจ้งเหตุ: '+reportTypeTh(r.type),detail:r.detail,date:r.date});
    }
  });
  (DB.checkouts||[]).forEach(function(c){
    if(c.status==='pending'){
      items.push({key:'checkout:'+c.id,type:'checkout',page:'checkout-admin',room:c.room,
        title:(c.urgent?'⚡ คำขอออกจากหอพัก (กะทันหัน)':'คำขอออกจากหอพัก'),detail:'วันที่แจ้งออก: '+(c.date||'-'),date:c.date});
    }
  });
  (DB.bills||[]).forEach(function(b){
    if(b.status==='paid'&&(b.slip_status==='pending'||!b.slip_status||b.slip_status==='none')){
      items.push({key:'bill:'+b.id,type:'payment',page:'verify-slip',room:b.room,
        title:'ส่งสลิป/ชำระเงิน '+thMonthFull(b.month)+' '+b.year,detail:'ยอด '+fmtMoney(b.total)+' ฿',date:''});
    }
  });
  // บิลที่ค้างชำระเกิน 15 วัน (ถูกย้ายไปหน้าติดตามหนี้ค้างชำระแล้ว) แจ้งเตือนแอดมินด้วย
  (DB.bills||[]).forEach(function(b){
    if(isBillOverdue(b)){
      items.push({key:'debt:'+b.id,type:'debt',page:'debts',room:b.room,
        title:'⏰ ค้างชำระเกินกำหนด '+thMonthFull(b.month)+' '+b.year,
        detail:'เกินกำหนด '+billDaysOld(b)+' วัน ยอด '+fmtMoney(b.total)+' ฿',date:''});
    }
  });
  // บันทึก/ดึงเวลาที่พบการแจ้งเตือนนี้ครั้งแรก (ใช้เป็นเวลาที่แสดงให้แอดมินเห็น)
  // และล้าง key เก่าที่ไม่มีในรายการปัจจุบันแล้วออก (เรื่องนั้นถูกจัดการเสร็จไปแล้ว)
  var firstSeen=getNotifFirstSeenMap();
  var nowIsoStr=new Date().toISOString();
  var currentKeys={};
  var changed=false;
  items.forEach(function(it){
    currentKeys[it.key]=true;
    if(!firstSeen[it.key]){ firstSeen[it.key]=nowIsoStr; changed=true; }
    it.arrivedAt=firstSeen[it.key];
  });
  Object.keys(firstSeen).forEach(function(k){
    if(!currentKeys[k]){ delete firstSeen[k]; changed=true; }
  });
  if(changed) saveNotifFirstSeenMap(firstSeen);
  // ล้าง key เก่าที่ไม่มีในรายการปัจจุบันแล้วออกจากรายการที่เคยเปิดดูด้วย กันไม่ให้ค้างโตขึ้นเรื่อยๆ ไม่มีที่สิ้นสุด
  var seen=getSeenNotifSet();
  var seenChanged=false;
  seen.forEach(function(k){ if(!currentKeys[k]){ seen.delete(k); seenChanged=true; } });
  if(seenChanged) saveSeenNotifSet(seen);
  items.sort(function(a,b){ return new Date(b.arrivedAt)-new Date(a.arrivedAt); });
  return items;
}
// รายการที่ยังไม่เคยเปิดดู (ใช้นับเลขสีแดงบนไอคอนกระดิ่งเท่านั้น ไม่ได้ใช้กรองรายการที่แสดงในกล่องแจ้งเตือนอีกต่อไป)
function computeUnseenAdminNotifItems(){
  var seen=getSeenNotifSet();
  return computeAdminNotifItems().filter(function(it){ return !seen.has(it.key); });
}
window.refreshAdminNotifBadge=function(){
  var bell=document.getElementById('notifBell');
  var badge=document.getElementById('notifBadge');
  if(!bell||!badge) return;
  if(!currentUser||currentUser.role!=='admin'){
    bell.style.display='none';
    return;
  }
  bell.style.display='flex';
  var count=computeUnseenAdminNotifItems().length;
  if(count>0){
    badge.style.display='block';
    badge.textContent=count>9?'9+':String(count);
  }else{
    badge.style.display='none';
  }
};
function notifTypeIcon(type){
  if(type==='report') return '🛠️';
  if(type==='checkout') return '🚪';
  if(type==='debt') return '⏰';
  return '💰';
}
window.openNotifPopup=function(){
  // แสดงการแจ้งเตือนทุกรายการที่ยังไม่ถูกจัดการ (ไม่ใช่แค่รายการใหม่) รายการที่ยังไม่เคยเปิดดูจะมีกรอบแดง
  var items=computeAdminNotifItems();
  var seen=getSeenNotifSet();
  var body='';
  if(items.length===0){
    body='<div style="text-align:center;color:var(--text-light);padding:20px 0">🔕 ไม่มีการแจ้งเตือนค้างอยู่</div>';
  }else{
    items.forEach(function(it){
      var isUnseen=!seen.has(it.key);
      body+='<div class="notif-list-item'+(isUnseen?' notif-unseen':'')+'" onclick="closeModal();showPage(\''+it.page+'\')">'
        +'<div style="flex:1">'
        +'<div style="font-weight:700;font-size:16px;color:var(--sky)">'+notifTypeIcon(it.type)+' '+escapeHtml(it.title)+'</div>'
        +'<div style="font-size:16px;color:var(--text-mid);margin-top:2px">ห้อง '+escapeHtml(it.room||'-')+'</div>'
        +'<div style="font-size:16px;color:var(--text-light);margin-top:2px">'+escapeHtml(it.detail||'')+'</div>'
        +'<div class="notif-time">'+formatNotifTime(it.arrivedAt)+'</div>'
        +'</div>'
        +(isUnseen?'<span class="badge badge-warning" style="white-space:nowrap">ใหม่</span>':'')
        +'</div>';
    });
  }
  openModal('🔔 การแจ้งเตือน',body,'<button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
  // ทำเครื่องหมายว่าเปิดดูแล้วทั้งหมด (ตัดกรอบแดง/ไม่นับในเลขที่กระดิ่งอีก) แต่ตัวรายการยังอยู่ในกล่องแจ้งเตือนต่อไป
  // จนกว่าเรื่องนั้นจะถูกจัดการเสร็จจริง (หายไปเองจาก computeAdminNotifItems)
  items.forEach(function(it){ seen.add(it.key); });
  saveSeenNotifSet(seen);
  window.refreshAdminNotifBadge();
};
function startAdminNotifPolling(){
  stopAdminNotifPolling();
  notifPollTimer=setInterval(function(){
    if(!currentUser||currentUser.role!=='admin') return;
    loadDBFromServer(true).then(function(){ window.refreshAdminNotifBadge(); }).catch(function(){});
  },15000);
}
function stopAdminNotifPolling(){
  if(notifPollTimer){ clearInterval(notifPollTimer); notifPollTimer=null; }
}

function buildBarsHTML(incArr, expArr, height, labelArr){
  var maxV = Math.max.apply(null, incArr.concat(expArr));
  var html = '';
  for(var i=0;i<incArr.length;i++){
    var ih = Math.round((incArr[i]/maxV)*height);
    var eh = Math.round((expArr[i]/maxV)*height);
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center">'
      +'<div style="width:100%;display:flex;gap:1px;align-items:flex-end;height:'+height+'px">'
      +'<div style="flex:1;height:'+ih+'px;background:linear-gradient(180deg,#68D391,#276749);border-radius:3px 3px 0 0;min-height:2px"></div>'
      +'<div style="flex:1;height:'+eh+'px;background:linear-gradient(180deg,#FC8181,#C53030);border-radius:3px 3px 0 0;min-height:2px"></div>'
      +'</div>'
      +(labelArr?'<div style="font-size:16px;color:var(--text-light);margin-top:3px">'+labelArr[i]+'</div>':'')
      +'</div>';
  }
  return html;
}
function buildYearBar(label, inc, exp, maxV, isCurrent){
  var ih=Math.round((inc/maxV)*90), eh=Math.round((exp/maxV)*90), ph=Math.max(Math.round(((inc-exp)/maxV)*90),2);
  return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">'
    +'<div style="width:100%;display:flex;gap:3px;align-items:flex-end;height:90px;justify-content:center">'
    +'<div style="flex:1;height:'+ih+'px;background:linear-gradient(180deg,#68D391,#276749);border-radius:4px 4px 0 0"></div>'
    +'<div style="flex:1;height:'+eh+'px;background:linear-gradient(180deg,#FC8181,#C53030);border-radius:4px 4px 0 0"></div>'
    +'<div style="flex:1;height:'+ph+'px;background:linear-gradient(180deg,#FDD882,#D4831A);border-radius:4px 4px 0 0"></div>'
    +'</div>'
    +'<div style="font-size:16px;font-weight:700;color:'+(isCurrent?'var(--sky)':'var(--text-mid)')+'">'+label+(isCurrent?' ★':'')+'</div>'
    +'<div style="font-size:16px;color:var(--text-light);text-align:center;line-height:1.7">'
    +'<div>รายรับ <strong style="color:var(--success)">'+fmtMoney(inc)+'</strong></div>'
    +'<div>รายจ่าย <strong style="color:var(--danger)">'+fmtMoney(exp)+'</strong></div>'
    +'<div style="font-weight:700;color:var(--sky)">กำไร '+fmtMoney(inc-exp)+' ฿</div>'
    +'</div>'
    +'</div>';
}

// ============================================================
// LOGIN
// ============================================================
async function doLogin(){
  var u=document.getElementById('loginUsername').value.trim();
  var p=document.getElementById('loginPassword').value.trim();
  if(!u||!p){ document.getElementById('loginError').style.display='block'; return; }

  try{
    var res = await fetch('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:u,password:p})
    });
    var data = await res.json();
    if(!res.ok||!data.token){
      var errEl=document.getElementById('loginError');
      errEl.textContent=(data&&data.error==='account_archived')
        ?'บัญชีนี้ถูกปิดใช้งานแล้ว (ย้ายออกจากหอพัก) กรุณาติดต่อเจ้าของหอ'
        :'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      errEl.style.display='block';
      return;
    }
    authToken=data.token;
    try{ localStorage.setItem(SESSION_TOKEN_KEY,authToken); }catch(_e){}
    await loadDBFromServer();
    openAppForUser(data.user,true);
  }catch(err){
    console.error('Login failed',err);
    document.getElementById('loginError').style.display='block';
  }
}
function doLogout(){
  if(authToken){
    fetch('/api/logout',{method:'POST',headers:{'Authorization':'Bearer '+authToken}}).catch(function(){});
  }
  stopAdminNotifPolling();
  var bellEl=document.getElementById('notifBell');
  if(bellEl) bellEl.style.display='none';
  currentUser=null;
  authToken=null;
  clearSavedUserId();
  try{ localStorage.removeItem(SESSION_TOKEN_KEY); }catch(_e){}
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('appShell').style.display='none';
  document.getElementById('loginUsername').value='';
  document.getElementById('loginPassword').value='';
}

// ============================================================
// NAV
// ============================================================
const tenantNav=[
  {label:'ประวัติการชำระเงิน',page:'my-bills'},
  {label:'ชำระเงิน',page:'payment'},
  {label:'แจ้งเหตุ',page:'report'},
  {label:'ขอออกจากหอพัก',page:'checkout'}
];
const adminNav=[
  {label:'แดชบอร์ด',page:'dashboard'},
  {label:'จัดการห้องพัก',page:'rooms'},
  {label:'ติดตามหนี้ค้างชำระ',page:'debts'},
  {label:'ตรวจสอบสลิป',page:'verify-slip'},
  {label:'เรื่องแจ้งจากผู้เช่า',page:'reports-admin'},
  {label:'ประวัติการแจ้งเหตุ',page:'reports-history'},
  {label:'คำขอออกจากหอพัก',page:'checkout-admin'},
  {label:'รายรับรายจ่าย',page:'income-expense'},
  {label:'บันทึกหน่วยน้ำ-ไฟ',page:'room-readings'},
  {label:'พิมพ์ใบเสร็จจากประวัติ',page:'print-slip'},
  {label:'ตั้งค่า บัญชีธนาคาร/พร้อมเพย์',page:'settings'},
  {label:'จัดการผู้ใช้งาน',page:'manage-users'},
  {label:'ประวัติผู้เช่า',page:'tenant-history'}
];
function buildNav(){
  var nav=currentUser.role==='admin'?adminNav:tenantNav;
  var sidebar=document.getElementById('sidebarNav');
  sidebar.innerHTML='<div class="nav-section-title">'+(currentUser.role==='admin'?'เมนูจัดการ':'เมนูผู้เช่า')+'</div>';
  nav.forEach(function(item){
    var el=document.createElement('div');
    el.className='nav-item'; el.dataset.page=item.page;
    el.innerHTML='<span>'+item.label+'</span>';
    el.onclick=function(){ showPage(item.page); };
    sidebar.appendChild(el);
  });
}
function showPage(pageId){
  document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.toggle('active',el.dataset.page===pageId); });
  var main=document.getElementById('mainContent');
  main.innerHTML='';
  var page=document.createElement('div');
  page.className='page active'; page.id='page-'+pageId;
  main.appendChild(page);
  var renderer=pageRenderers[pageId];
  if(renderer) renderer(page);
  else page.innerHTML='<div class="card"><p>หน้านี้กำลังพัฒนา</p></div>';
  if(currentUser&&currentUser.role==='admin') window.refreshAdminNotifBadge();
}

// ============================================================
// PAGE RENDERERS
// ============================================================
const pageRenderers={};

