// ============================================================
// 06-admin-print-settings.js
// พิมพ์ใบเสร็จจากประวัติ และตั้งค่าบัญชีธนาคาร/พร้อมเพย์
// ============================================================

// ---- ADMIN: พิมพ์ใบเสร็จจากประวัติ ----
pageRenderers['print-slip']=function(el){
  var roomOptions='<option value="">— เลือกห้อง —</option>'+DB.rooms.slice().sort(function(a,b){ return (a.id||'').localeCompare(b.id||''); })
    .map(function(r){ return '<option value="'+escapeHtml(r.id)+'"'+(window._printSlipRoom===r.id?' selected':'')+'>ห้อง '+escapeHtml(r.id)+'</option>'; }).join('');
  var roomChosen=!!window._printSlipRoom;
  el.innerHTML=pageHeader('🖨️ พิมพ์ใบเสร็จจากประวัติ',{subtitle:'เลือกห้อง แล้วดูและออกใบเสร็จย้อนหลังให้ผู้เช่า'})
    +'<div class="card">'
    +'<div class="form-group" style="max-width:320px"><label class="form-label">1. เลือกห้องที่จะดูประวัติ</label><select class="form-input" id="printSlipRoom" onchange="changePrintSlipRoom()">'+roomOptions+'</select></div>'
    +'<div id="printSlipTypeWrap" style="display:'+(roomChosen?'block':'none')+'">'
    +'<label class="form-label">2. เลือกประเภทรายการ</label>'
    +'<div class="tab-switch" id="printSlipTabs">'
    +'<button class="tab-btn active" data-type="all" onclick="setPrintSlipType(\'all\')">ทั้งหมด</button>'
    +'<button class="tab-btn" data-type="rent" onclick="setPrintSlipType(\'rent\')">ค่าหอพัก+น้ำ+ไฟ</button>'
    +'<button class="tab-btn" data-type="deposit" onclick="setPrintSlipType(\'deposit\')">ค่ามัดจำ</button>'
    +'</div>'
    +'<div class="form-group"><label class="form-label">ค้นหาชื่อผู้เช่า (ถ้าต้องการ)</label><input class="form-input" id="printSlipSearch" placeholder="🔍 พิมพ์ชื่อผู้เช่า" oninput="renderPrintList()"></div>'
    +'<div style="font-size:16px;color:var(--text-light);margin:-8px 0 12px">💡 แสดงเฉพาะบิลที่สลิปผ่านการตรวจสอบแล้ว หรือจ่ายเป็นเงินสด — '
      +'บิลที่ยังรอตรวจสอบสลิปอยู่จะยังไม่ขึ้นที่นี่ (ไปอนุมัติได้ที่หน้า "ตรวจสอบสลิป")</div>'
    +'</div>'
    +'<div class="print-slip-grid" id="histSlipGrid"></div>'
    +'</div>';
  window.printSlipType='all';
  window.setPrintSlipType=function(type){
    window.printSlipType=type;
    document.querySelectorAll('#printSlipTabs .tab-btn').forEach(function(b){ b.classList.toggle('active',b.dataset.type===type); });
    renderPrintList();
  };
  window.changePrintSlipRoom=function(){
    window._printSlipRoom=document.getElementById('printSlipRoom').value||null;
    document.getElementById('printSlipTypeWrap').style.display=window._printSlipRoom?'block':'none';
    renderPrintList();
  };
  window.renderPrintList=function(){
    var grid=document.getElementById('histSlipGrid');
    var room=window._printSlipRoom;
    if(!room){
      grid.innerHTML='<div class="alert alert-info" style="grid-column:1/-1">กรุณาเลือกห้องก่อนเพื่อดูประวัติการชำระเงิน</div>';
      return;
    }
    var type=window.printSlipType||'all';
    var q=(document.getElementById('printSlipSearch').value||'').trim().toLowerCase();
    var items=[];
    if(type==='all'||type==='rent'){
      // พิมพ์ใบเสร็จได้เฉพาะบิลที่สลิปผ่านการตรวจสอบ/อนุมัติแล้วเท่านั้น (หรือจ่ายเงินสดซึ่งอนุมัติอัตโนมัติ)
      // กันไม่ให้ออกใบเสร็จอย่างเป็นทางการก่อนยืนยันว่าเงินโอนมาจริง
      DB.bills.filter(function(b){ return b.status==='paid'&&b.slip_status==='approved'&&b.room===room; }).forEach(function(b){
        var user=DB.users.find(function(u){ return u.room===b.room&&u.role==='tenant'; });
        items.push({kind:'rent',id:b.id,room:b.room,name:user?user.name:'-',label:thMonthFull(b.month)+' '+b.year,amount:b.total,sortKey:b.year*100+b.month});
      });
    }
    if(type==='all'||type==='deposit'){
      DB.deposits.filter(function(d){ return d.room===room; }).forEach(function(d){
        var user=DB.users.find(function(u){ return u.room===d.room&&u.role==='tenant'; });
        items.push({kind:'deposit',id:d.room,room:d.room,name:user?user.name:'-',label:'ค่ามัดจำ',amount:d.amount,sortKey:-1});
      });
    }
    items.sort(function(a,b){ return b.sortKey-a.sortKey; });
    if(q){
      items=items.filter(function(it){
        return (it.name||'').toLowerCase().indexOf(q)!==-1;
      });
    }
    if(items.length===0){
      grid.innerHTML='<div class="alert alert-info" style="grid-column:1/-1">ไม่พบประวัติการชำระเงินของห้องนี้ที่ตรงกับเงื่อนไข</div>';
      return;
    }
    var html='';
    items.forEach(function(it){
      html+='<div class="receipt-card">'
        +'<div class="receipt-card-top">'
        +'<div class="receipt-card-icon">'+(it.kind==='deposit'?'🔑':'🏠')+'</div>'
        +'<span class="badge badge-success">ชำระแล้ว</span>'
        +'</div>'
        +'<div class="receipt-card-room">ห้อง '+escapeHtml(it.room)+'</div>'
        +'<div class="receipt-card-name">'+escapeHtml(it.name)+'</div>'
        +'<div class="receipt-card-label">'+escapeHtml(it.label)+'</div>'
        +'<div class="receipt-card-amount">'+fmtMoney(it.amount)+' <span>฿</span></div>'
        +'<button class="btn btn-primary btn-sm" style="width:100%;margin-top:10px" onclick="printHistorySlip(\''+it.kind+'\',\''+it.id+'\')">🖨️ พิมพ์ใบเสร็จ</button>'
        +'</div>';
    });
    grid.innerHTML=html;
  };
  window.renderPrintList();
};
window.printHistorySlip=function(type,id){
  var today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  var body='';
  if(type==='rent'){
    var b=DB.bills.find(function(x){ return x.id===id; });
    if(!b) return;
    var user=DB.users.find(function(u){ return u.room===b.room&&u.role==='tenant'; });
    var rd=DB.roomReadings.find(function(x){ return x.room===b.room&&x.month===b.month&&x.year===b.year; });
    var waterRate=b.water_unit>0?round2(b.water_cost/b.water_unit):0;
    var elecRate=b.elec_unit>0?round2(b.elec_cost/b.elec_unit):0;
    var waterDetail=rd
      ?('หน่วยน้ำใหม่ '+rd.curWater+' − เก่า '+rd.prevWater+' = ใช้ '+fmtUnit(b.water_unit)+' หน่วย × '+waterRate+' บาท/หน่วย')
      :(fmtUnit(b.water_unit)+' หน่วย × '+waterRate+' บาท/หน่วย');
    var elecDetail=rd
      ?('หน่วยไฟใหม่ '+rd.curElec+' − เก่า '+rd.prevElec+' = ใช้ '+fmtUnit(b.elec_unit)+' หน่วย × '+elecRate+' บาท/หน่วย')
      :(fmtUnit(b.elec_unit)+' หน่วย × '+elecRate+' บาท/หน่วย');
    var receiptNo='RC-'+String(b.id).slice(-6).toUpperCase();
    body='<div class="slip-preview">'
      +'<div class="slip-header"><div style="font-size:32px">☀️</div>'
      +'<div style="font-family:Prompt,sans-serif;font-size:20px;font-weight:700">บ้านแสงอาทิตย์</div>'
      +'<div style="font-size:15px;opacity:0.75">ใบเสร็จ</div>'
      +'<div style="font-size:16px;opacity:0.6;margin-top:4px">เลขที่ '+receiptNo+'</div></div>'
      +'<div class="slip-row"><span>ผู้เช่า:</span><strong>'+escapeHtml(user?user.name:'-')+'</strong></div>'
      +'<div class="slip-row"><span>ห้อง:</span><strong>'+escapeHtml(b.room)+'</strong></div>'
      +'<div class="slip-row"><span>ประจำเดือน:</span><strong>'+thMonthFull(b.month)+' '+b.year+'</strong></div>'
      +'<div class="slip-divider"></div>'
      +'<div class="slip-row"><span>ค่าหอพัก</span><span>'+fmtMoney(b.rent)+' ฿</span></div>'
      +'<div class="slip-row"><span>ค่าน้ำ</span><span>'+fmtMoney(b.water_cost)+' ฿</span></div>'
      +'<div style="font-size:15px;opacity:0.75;margin:-2px 0 8px">'+waterDetail+'</div>'
      +'<div class="slip-row"><span>ค่าไฟ</span><span>'+fmtMoney(b.elec_cost)+' ฿</span></div>'
      +'<div style="font-size:15px;opacity:0.75;margin:-2px 0 8px">'+elecDetail+'</div>'
      +'<div class="slip-total"><div class="slip-row"><span>รวมทั้งสิ้น</span><span>'+fmtMoney(b.total)+' ฿</span></div></div>'
      +'<div class="slip-footer">'
      +'<div>วันที่พิมพ์: '+today+'</div>'
      +'<div style="margin-top:14px;opacity:.6">ขอบคุณที่ใช้บริการ 🙏</div>'
      +'</div></div>';
  } else {
    var dep=DB.deposits.find(function(x){ return x.room===id; });
    var user2=DB.users.find(function(u){ return u.room===id&&u.role==='tenant'; });
    var amount=dep?dep.amount:7000;
    var receiptNo2='RC-DP-'+String(id).toUpperCase();
    body='<div class="slip-preview">'
      +'<div class="slip-header"><div style="font-size:32px">☀️</div>'
      +'<div style="font-family:Prompt,sans-serif;font-size:20px;font-weight:700">บ้านแสงอาทิตย์</div>'
      +'<div style="font-size:15px;opacity:0.75">ใบเสร็จ</div>'
      +'<div style="font-size:16px;opacity:0.6;margin-top:4px">เลขที่ '+receiptNo2+'</div></div>'
      +'<div class="slip-row"><span>ผู้เช่า:</span><strong>'+escapeHtml(user2?user2.name:'-')+'</strong></div>'
      +'<div class="slip-row"><span>ห้อง:</span><strong>'+escapeHtml(id)+'</strong></div>'
      +'<div class="slip-row"><span>รายการ:</span><strong>ค่ามัดจำห้องพัก</strong></div>'
      +'<div class="slip-total"><div class="slip-row"><span>จำนวนเงิน</span><span>'+fmtMoney(amount)+' ฿</span></div></div>'
      +'<div class="slip-footer">'
      +'<div>วันที่พิมพ์: '+today+'</div>'
      +'<div style="margin-top:14px;opacity:.6">ขอบคุณที่ใช้บริการ 🙏</div>'
      +'</div></div>';
  }
  openModal('🖨️ ตัวอย่างใบเสร็จ',body,'<button class="btn btn-primary" onclick="printHtml(document.getElementById(\'modalBody\').innerHTML)">🖨️ พิมพ์</button><button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
};

// ---- ADMIN: ตั้งค่า ----
pageRenderers['settings']=function(el){
  var ba=DB.bankAccount;
  el.innerHTML=pageHeader('⚙️ ตั้งค่า บัญชีธนาคาร/พร้อมเพย์')
    +'<div class="card"><div class="card-title">🏦 บัญชีธนาคาร/พร้อมเพย์สำหรับรับชำระเงิน</div>'
    +'<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-start">'
    +'<div style="flex:1;min-width:200px">'
    +'<div style="background:linear-gradient(135deg,var(--sky),var(--sky-mid));border-radius:12px;padding:16px;color:white">'
    +'<div style="font-size:16px;opacity:0.7;margin-bottom:4px">ข้อมูลบัญชีปัจจุบัน</div>'
    +'<div style="font-size:18px;font-weight:700;margin-bottom:2px">'+escapeHtml(ba.name)+'</div>'
    +'<div style="font-size:16px;margin-bottom:2px">'+escapeHtml(ba.bank)+'</div>'
    +'<div style="font-size:20px;font-weight:700;letter-spacing:2px;margin:8px 0">'+escapeHtml(ba.number)+'</div>'
    +'<div style="font-size:16px;opacity:0.8">พร้อมเพย์: '+escapeHtml(ba.promptpay)+'</div>'
    +'</div></div>'
    +'<div style="min-width:180px;display:flex;flex-direction:column;align-items:center;gap:6px">'
    +'<div style="background:white;width:150px;height:150px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:2px solid var(--border)" id="settingsQrBox">'
    +'<span style="color:var(--text-light);font-size:16px;text-align:center;padding:8px">กำลังโหลด QR...</span>'
    +'</div>'
    +'<div style="font-size:16px;color:var(--text-light);text-align:center">QR นี้เป็นแบบไม่ระบุยอด ใช้ยืนยันว่าพร้อมเพย์ถูกต้อง<br>'
      +'ยอดจริงจะถูกกำหนดตามบิลของผู้เช่าอัตโนมัติ</div>'
    +'</div>'
    +'</div>'
    +'<div class="divider"></div>'
    +'<div class="card-title" style="margin-bottom:12px">✏️ แก้ไขข้อมูลบัญชี</div>'
    +'<div class="form-row"><div class="form-group"><label class="form-label">ชื่อบัญชี</label><input class="form-input" id="baName" value="'+escapeHtml(ba.name)+'"></div>'
    +'<div class="form-group"><label class="form-label">ธนาคาร</label><select class="form-input" id="baBank">'
      +'<option'+(ba.bank==='กสิกรไทย'?' selected':'')+'>กสิกรไทย</option>'
      +'<option'+(ba.bank==='กรุงเทพ'?' selected':'')+'>กรุงเทพ</option>'
      +'<option'+(ba.bank==='ไทยพาณิชย์'?' selected':'')+'>ไทยพาณิชย์</option>'
      +'<option'+(ba.bank==='กรุงไทย'?' selected':'')+'>กรุงไทย</option>'
      +'<option'+(ba.bank==='ออมสิน'?' selected':'')+'>ออมสิน</option>'
      +'</select></div></div>'
    +'<div class="form-row"><div class="form-group"><label class="form-label">เลขที่บัญชี</label><input class="form-input" id="baNumber" value="'+escapeHtml(ba.number)+'"></div>'
    +'<div class="form-group"><label class="form-label">พร้อมเพย์ (เบอร์โทร 10 หลัก หรือเลขบัตร ปชช. 13 หลัก)</label><input class="form-input" id="baPromptpay" value="'+escapeHtml(ba.promptpay)+'"></div></div>'
    +'<button class="btn btn-primary" onclick="saveBankAccount()">💾 บันทึกข้อมูลบัญชี</button>'
    +'</div>';
  window.refreshSettingsQrPreview();
};
window.refreshSettingsQrPreview=async function(){
  var box=document.getElementById('settingsQrBox');
  if(!box) return;
  var promptpay=(DB.bankAccount&&DB.bankAccount.promptpay)||'';
  if(!promptpay){
    box.innerHTML='<span style="color:var(--text-light);font-size:16px;text-align:center;padding:8px">ยังไม่ได้ตั้งค่าพร้อมเพย์</span>';
    return;
  }
  try{
    var result=await requestJSON('/api/qr/promptpay',{
      method:'POST',
      body:JSON.stringify({promptpay:promptpay})
    });
    if(!box.isConnected) return; // ผู้ใช้ออกจากหน้านี้ไปแล้ว
    if(!result||!result.qr_image_data_url) throw new Error('generate_qr_failed');
    box.innerHTML='<img src="'+result.qr_image_data_url+'" style="width:136px;height:136px;object-fit:contain">';
  }catch(err){
    if(!box.isConnected) return;
    box.innerHTML='<span style="color:var(--danger);font-size:16px;text-align:center;padding:8px">พร้อมเพย์ไม่ถูกต้อง<br>ต้องเป็นเบอร์โทร 10 หลัก<br>หรือเลขบัตร ปชช. 13 หลัก</span>';
  }
};
window.saveBankAccount=function(){
  DB.bankAccount.name=document.getElementById('baName').value||DB.bankAccount.name;
  DB.bankAccount.bank=document.getElementById('baBank').value||DB.bankAccount.bank;
  DB.bankAccount.number=document.getElementById('baNumber').value||DB.bankAccount.number;
  DB.bankAccount.promptpay=document.getElementById('baPromptpay').value||DB.bankAccount.promptpay;
  showToast('บันทึกข้อมูลบัญชีเรียบร้อย');
  showPage('settings');
};
window.saveRates=function(){
  var rentEl=document.getElementById('setRent');
  var waterEl=document.getElementById('setWater');
  var elecEl=document.getElementById('setElec');
  var depositEl=document.getElementById('setDeposit');
  if(rentEl) DB.rates.rent=parseFloat(rentEl.value)||DB.rates.rent;
  if(waterEl) DB.rates.water_unit=parseFloat(waterEl.value)||DB.rates.water_unit;
  if(elecEl) DB.rates.electric_unit=parseFloat(elecEl.value)||DB.rates.electric_unit;
  if(depositEl) DB.rates.deposit=parseFloat(depositEl.value)||DB.rates.deposit;
  showToast('บันทึกอัตราค่าบริการเรียบร้อย');
};

window.togglePasswordCell=function(btn){
  var span=btn.previousElementSibling;
  if(!span) return;
  var real=span.getAttribute('data-pw')||'';
  var isHidden=span.getAttribute('data-hidden')!=='0';
  if(isHidden){
    span.textContent=real||'-';
    span.setAttribute('data-hidden','0');
    btn.textContent='🙈';
  }else{
    span.textContent='•'.repeat(real.length||4);
    span.setAttribute('data-hidden','1');
    btn.textContent='👁️';
  }
};

