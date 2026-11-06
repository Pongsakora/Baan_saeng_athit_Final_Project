// ============================================================
// 03-admin-reports.js
// หน้าจอตรวจสอบสลิปและเรื่องแจ้งจากผู้เช่า:
// ตรวจสอบสลิป, เรื่องแจ้งจากผู้เช่า, ประวัติการแจ้งเหตุ
// ============================================================

// ---- ADMIN: ตรวจสอบสลิป ----
pageRenderers['verify-slip']=function(el){
  var pending=DB.bills.filter(function(b){ return b.status==='paid'&&(b.slip_status==='pending'||!b.slip_status||b.slip_status==='none'); })
    .sort(function(a,b){ return (b.year-a.year)||(b.month-a.month); });
  var cards='';
  if(pending.length===0) cards='<div class="alert alert-info">ไม่มีสลิปรอการตรวจสอบ</div>';
  else pending.forEach(function(b){
    var user=DB.users.find(function(u){ return u.room===b.room&&u.role==='tenant'; });
    var src=billSlipSourceInfo(b);
    cards+='<div style="border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:16px">'
      +'<div class="flex-between" style="margin-bottom:12px">'
      +'<div><strong style="font-size:22px">ห้อง '+escapeHtml(b.room)+'</strong>'+(user?'<div style="font-size:20px;color:var(--text-light)">'+escapeHtml(user.name)+'</div>':'')+'</div>'
      +'<div style="font-family:Prompt,sans-serif;font-weight:700;font-size:20px;color:var(--sky)">'+fmtMoney(b.total)+' ฿</div>'
      +'</div>'
      +'<div style="background:#F0F7FF;border-radius:10px;padding:12px;margin-bottom:12px;font-size:16px">'
      +'<div style="font-weight:700;color:var(--sky);margin-bottom:6px">📋 รายการที่ชำระ</div>'
      +'<div style="margin-bottom:3px">เดือน: <strong>'+thMonthFull(b.month)+' '+b.year+'</strong></div>'
      +'<div style="display:flex;gap:16px;font-size:16px;color:var(--text-mid)">'
      +'<span>ค่าหอพัก: '+fmtMoney(b.rent)+' ฿</span>'
      +'<span>ค่าน้ำ: '+fmtMoney(b.water_cost)+' ฿</span>'
      +'<span>ค่าไฟ: '+fmtMoney(b.elec_cost)+' ฿</span></div>'
      +'</div>'
      +'<div style="background:#F7F3E8;border-radius:10px;padding:16px;margin-bottom:12px">'
      +(src.image
        ?'<div style="text-align:center"><img src="'+src.image+'" style="max-width:100%;max-height:260px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)" onclick="viewImageFull(this.src)"></div>'
        :'<div style="font-size:28px;margin-bottom:6px;text-align:center">'+src.icon+'</div>')
      +'<div style="font-size:16px;font-weight:700;text-align:center;margin-top:8px">'+escapeHtml(src.text)+'</div>'
      +(src.ref?'<div style="font-size:16px;color:var(--text-light);text-align:center;margin-top:4px">อ้างอิง: '+escapeHtml(src.ref)+'</div>':'')
      +'</div>'
      +'<div class="flex gap-10">'
      +'<button class="btn btn-success" style="flex:1" onclick="verifySlip(\''+b.id+'\')">✅ ยืนยันการรับเงิน</button>'
      +'<button class="btn btn-danger btn-sm" onclick="rejectSlip(\''+b.id+'\')">❌ ปฏิเสธ</button>'
      +'</div></div>';
  });
  el.innerHTML=pageHeader('✅ ตรวจสอบสลิปการโอนเงิน')+cardBox(cards);
};
window.verifySlip=function(id){
  var b=DB.bills.find(function(x){ return x.id===id; });
  if(!b) return;
  b.slip_status='approved';
  var today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  openModal('✅ ยืนยันการรับเงินสำเร็จ',
    '<div class="alert alert-success" style="margin-bottom:16px">✅ ยืนยันการรับเงินเรียบร้อยแล้ว</div>'
    +'<div class="slip-preview">'
    +'<div class="slip-header"><div style="font-size:32px">☀️</div>'
    +'<div style="font-family:Prompt,sans-serif;font-size:20px;font-weight:700">บ้านแสงอาทิตย์</div>'
    +'<div style="font-size:16px;opacity:0.7">ใบเสร็จ</div></div>'
    +'<div class="slip-row"><span>ห้อง:</span><strong>'+b.room+'</strong></div>'
    +'<div class="slip-row"><span>เดือน:</span><strong>'+thMonthFull(b.month)+' '+b.year+'</strong></div>'
    +'<div class="slip-row"><span>ค่าหอพัก:</span><strong>'+fmtMoney(b.rent)+' ฿</strong></div>'
    +'<div class="slip-row"><span>ค่าน้ำ ('+fmtUnit(b.water_unit)+' หน่วย):</span><strong>'+fmtMoney(b.water_cost)+' ฿</strong></div>'
    +'<div class="slip-row"><span>ค่าไฟ ('+fmtUnit(b.elec_unit)+' หน่วย):</span><strong>'+fmtMoney(b.elec_cost)+' ฿</strong></div>'
    +'<div class="slip-total"><div class="slip-row"><span>รวมทั้งสิ้น</span><span>'+fmtMoney(b.total)+' ฿</span></div></div>'
    +'<div style="margin-top:12px;font-size:16px;opacity:0.7;text-align:center">วันที่ออกใบเสร็จ: '+today+'</div></div>'
    +'<div style="margin-top:16px;background:#F7F3E8;border-radius:10px;padding:14px;text-align:center">'
    +'<div style="font-size:16px;font-weight:600;color:var(--sky);margin-bottom:6px">ต้องการปริ้นใบเสร็จเลยไหม?</div>'
    +'<div style="font-size:16px;color:var(--text-light)">ปริ้นทีหลังได้จากเมนูพิมพ์ใบเสร็จจากประวัติ</div></div>',
    '<button class="btn btn-primary" onclick="printHtml(document.getElementById(\'modalBody\').innerHTML);closeModal();showPage(\'verify-slip\')">🖨️ ปริ้นเลย</button>'
    +'<button class="btn btn-outline" onclick="closeModal();showPage(\'verify-slip\')">ยังก่อน</button>');
};
window.rejectSlip=function(id){
  var b=DB.bills.find(function(x){ return x.id===id; });
  if(b){
    b.status='unpaid';
    b.slip=null;
    b.slip_status='rejected';
    // รีเซ็ตวันที่เริ่มนับถอยหลังค้างชำระ (15 วัน) เป็นวันนี้ เพราะผู้เช่าพยายามจ่ายแล้วแต่สลิปถูกปฏิเสธ
    // ไม่ควรถูกนับว่าค้างชำระมานานตั้งแต่วันออกบิลเดิม ต้องให้เวลาชำระใหม่เต็มรอบอีกครั้ง
    b.billDate=new Date().toISOString().slice(0,10);
  }
  showToast('ปฏิเสธสลิปแล้ว ผู้เช่าจะเห็นสถานะ "สลิปถูกปฏิเสธ" และชำระใหม่ได้','error');
  showPage('verify-slip');
};

// ---- ADMIN: เรื่องแจ้ง ----
function buildAdminChatBubbles(msgs){ return buildChatBubblesHTML(msgs,'admin'); }
function renderReportList(reports){
  if(!reports.length) return '<p style="color:var(--text-light)">ไม่มีเรื่องแจ้ง</p>';
  var html='';
  reports.forEach(function(r){
    var msgs=DB.chatMessages[r.id]||[];
    html+='<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px">'
      +'<div style="padding:14px 16px;background:white">'
      +'<div class="flex-between"><div style="font-size:18px"><strong>ห้อง '+escapeHtml(r.room)+'</strong> — '+reportTypeTh(r.type)+' <span style="font-size:15px;color:var(--text-light)">'+escapeHtml(r.date)+'</span></div>'+statusBadge(r.status)+'</div>'
      +'<div style="margin-top:8px;font-size:16px">'+escapeHtml(r.detail)+'</div>'
      +(r.media?'<div style="margin-top:8px;text-align:center"><img src="'+r.media+'" style="max-width:100%;max-height:260px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)" onclick="viewImageFull(this.src)"></div>':'')
      +'<div class="flex gap-10" style="margin-top:10px">'
      +(r.status==='pending'?'<button class="btn btn-sky btn-sm" onclick="receiveReport(\''+r.id+'\')">รับเรื่อง</button>':'')
      +(r.status==='received'?'<button class="btn btn-success btn-sm" onclick="doneReport(\''+r.id+'\')">จัดการเสร็จแล้ว</button>':'')
      +'</div></div>'
      +'<div style="background:#F0F4F8;padding:12px 16px;border-top:1px solid var(--border)">'
      +'<div style="font-size:16px;font-weight:700;color:var(--sky);margin-bottom:8px">💬 แชทกับผู้เช่า</div>'
      +'<div id="achat_'+r.id+'" style="background:white;border-radius:8px;padding:10px;min-height:80px;max-height:260px;overflow-y:auto;margin-bottom:8px">'+buildAdminChatBubbles(msgs)+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<input class="form-input" id="achatInput_'+r.id+'" placeholder="พิมพ์ข้อความ..." style="padding:10px 14px;font-size:16px" onkeypress="if(event.key===\'Enter\') sendAdminChat(\''+r.id+'\')">'
      +'<button class="btn btn-sky btn-sm" onclick="sendAdminChat(\''+r.id+'\')">ส่ง</button>'
      +'</div></div></div>';
  });
  return html;
}
window.sendAdminChat=function(reportId){
  var inp=document.getElementById('achatInput_'+reportId);
  if(!inp||!inp.value.trim()) return;
  var msg=inp.value.trim(); inp.value='';
  if(!DB.chatMessages[reportId]) DB.chatMessages[reportId]=[];
  var now=new Date();
  var time=now.getDate()+'/'+(now.getMonth()+1)+' '+now.getHours()+':'+String(now.getMinutes()).padStart(2,'0');
  DB.chatMessages[reportId].push({from:'admin',text:msg,time:time});
  var chatArea=document.getElementById('achat_'+reportId);
  if(chatArea){
    chatArea.innerHTML=buildAdminChatBubbles(DB.chatMessages[reportId]);
    chatArea.scrollTop=chatArea.scrollHeight;
  }
};
function renderHistoryList(reports){
  if(!reports.length) return '<p style="color:var(--text-light)">ไม่มีประวัติ</p>';
  var html='';
  reports.forEach(function(r){
    html+='<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;background:#F9FBF7">'
      +'<div class="flex-between"><div style="font-size:18px"><strong>ห้อง '+escapeHtml(r.room)+'</strong> - '+reportTypeTh(r.type)+' <span style="font-size:15px;color:var(--text-light)">'+escapeHtml(r.date)+'</span></div>'+statusBadge(r.status)+'</div>'
      +'<div style="margin-top:8px;font-size:16px;color:var(--text-mid)">'+escapeHtml(r.detail)+'</div>'
      +(r.media?'<div style="margin-top:8px;text-align:center"><img src="'+r.media+'" style="max-width:100%;max-height:220px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)" onclick="viewImageFull(this.src)"></div>':'')
      +responseBox(r.response)
      +'</div>';
  });
  return html;
}
pageRenderers['reports-admin']=function(el){
  var active=DB.reports.filter(function(r){ return r.status!=='done'; }).slice().reverse();
  el.innerHTML=pageHeader('📣 เรื่องแจ้งจากผู้เช่า',{subtitle:'แสดงเฉพาะเรื่องที่ยังไม่เสร็จ'})
    +'<div class="card"><div class="flex gap-10 mb-16">'
    +'<button class="btn btn-primary btn-sm" onclick="filterReports(\'all\')">ทั้งหมด</button>'
    +'<button class="btn btn-outline btn-sm" onclick="filterReports(\'repair\')">ซ่อมบำรุง</button>'
    +'<button class="btn btn-outline btn-sm" onclick="filterReports(\'complaint\')">ร้องเรียน</button>'
    +'<button class="btn btn-outline btn-sm" onclick="filterReports(\'other\')">อื่นๆ</button></div>'
    +'<div id="reportList">'+renderReportList(active)+'</div></div>';
};
window.filterReports=function(type){
  var list=type==='all'
    ?DB.reports.filter(function(r){ return r.status!=='done'; })
    :DB.reports.filter(function(r){ return r.type===type&&r.status!=='done'; });
  list=list.slice().reverse();
  document.getElementById('reportList').innerHTML=renderReportList(list);
};
// กดรับเรื่องแล้วตั้งสถานะทันทีโดยไม่ต้องเด้ง modal ถามข้อความตอบกลับอีกต่อไป
// เพราะมีช่องแชทคุยกับผู้เช่าในการ์ดอยู่แล้ว ใช้คุยรายละเอียดตรงนั้นแทน
window.receiveReport=function(id){
  var r=DB.reports.find(function(x){ return x.id===id; });
  if(r){r.status='received';r.response=r.response||'รับเรื่องแล้ว';}
  showToast('รับเรื่องเรียบร้อย'); showPage('reports-admin');
};
window.doneReport=function(id){
  var r=DB.reports.find(function(x){ return x.id===id; });
  if(r) r.status='done';
  showToast('บันทึกว่าจัดการเสร็จแล้ว'); showPage('reports-admin');
};

// ---- ADMIN: ประวัติการแจ้งเหตุ (เฉพาะที่เสร็จแล้ว) ----
pageRenderers['reports-history']=function(el){
  el.innerHTML=pageHeader('📁 ประวัติการแจ้งเหตุ',{subtitle:'แสดงเฉพาะเรื่องที่จัดการเสร็จแล้ว'})
    +'<div class="card"><div class="form-row mb-16">'
    +'<select class="form-input" id="histType" onchange="renderHistory()">'
    +'<option value="all">ทุกประเภท</option><option value="repair">ซ่อมบำรุง</option><option value="complaint">ร้องเรียน</option><option value="other">อื่นๆ</option></select>'
    +'<input type="date" class="form-input" id="histDate" onchange="renderHistory()"></div>'
    +'<div id="histList"></div></div>';
  window.renderHistory=function(){
    var type=document.getElementById('histType').value;
    var done=DB.reports.filter(function(r){ return r.status==='done'; });
    var list=type==='all'?done:done.filter(function(r){ return r.type===type; });
    list=list.slice().reverse();
    document.getElementById('histList').innerHTML=renderHistoryList(list);
  };
  window.renderHistory();
};

