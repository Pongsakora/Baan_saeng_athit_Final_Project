// ============================================================
// 02-admin-overview.js
// หน้าจอภาพรวมฝั่งแอดมิน: แดชบอร์ด, จัดการห้องพัก, ติดตามหนี้ค้างชำระ
// ============================================================

// ---- ADMIN: Dashboard ----
pageRenderers['dashboard']=function(el){
  el.innerHTML='<div class="card"><div class="card-title">กำลังโหลดแดชบอร์ด...</div></div>';

  requestJSON('/api/dashboard')
    .then(function(data){
      var summary=data.summary||{};
      var current=data.current_month||{};
      var monthly=data.monthly_current_year||{};
      var yearly=Array.isArray(data.yearly)?data.yearly:[];

      var months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      var incomeArr=Array.isArray(monthly.income)?monthly.income.slice(0,12):[];
      var expenseArr=Array.isArray(monthly.expense)?monthly.expense.slice(0,12):[];
      while(incomeArr.length<12) incomeArr.push(0);
      while(expenseArr.length<12) expenseArr.push(0);

      var maxMV=Math.max.apply(null,incomeArr.concat(expenseArr).concat([1]));
      var monthBarsHtml='';
      for(var mi=0;mi<12;mi++){
        var inc=incomeArr[mi]||0;
        var exp=expenseArr[mi]||0;
        var pf=inc-exp;
        var ih=Math.round((inc/maxMV)*100);
        var eh=Math.round((exp/maxMV)*100);
        var pfColor=pf>=0?'#276749':'#C53030';
        monthBarsHtml+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">'
          +'<div style="width:100%;display:flex;gap:1px;align-items:flex-end;height:100px">'
          +'<div style="flex:1;height:'+ih+'px;background:linear-gradient(180deg,#68D391,#276749);border-radius:3px 3px 0 0;min-height:2px" title="รายรับ '+fmtMoney(inc)+'"></div>'
          +'<div style="flex:1;height:'+eh+'px;background:linear-gradient(180deg,#FC8181,#C53030);border-radius:3px 3px 0 0;min-height:2px" title="รายจ่าย '+fmtMoney(exp)+'"></div>'
          +'</div>'
          +'<div style="font-size:16px;color:var(--text-light);margin-top:2px;text-align:center">'+months[mi]+'</div>'
          +'<div style="font-size:16px;color:'+pfColor+';font-weight:700;text-align:center">'+(pf>=0?'+':'')+fmtMoney(pf)+'</div>'
          +'</div>';
      }

      var yearยอดรวมValues=[];
      yearly.forEach(function(y){ yearยอดรวมValues.push(y.income_total||0); yearยอดรวมValues.push(y.expense_total||0); });
      var maxYV=Math.max.apply(null,yearยอดรวมValues.concat([1]));
      var yearBars='';
      if(yearly.length===0){
        yearBars='<p style="color:var(--text-light);font-size:16px">ยังไม่มีข้อมูลรายปี</p>';
      }else{
        yearly.forEach(function(y){
          yearBars+=buildYearBar(String(y.year),y.income_total||0,y.expense_total||0,maxYV,y.year===monthly.year);
        });
      }

      var curMonth=(current.month&&current.month>=1&&current.month<=12)?current.month:1;
      var curLabel=months[curMonth-1]+' '+(current.year||'');
      var curInc=current.income||0;
      var curExp=current.expense||0;
      var curProfit=current.profit||0;
      var profitColor=curProfit>=0?'#68D391':'#FC8181';

      el.innerHTML=pageHeader('แดชบอร์ด',{subtitle:'สรุปภาพรวมจากระบบฐานข้อมูล'})
        +'<div class="stats-grid">'
        +'<div class="stat-card gold"><div class="stat-icon">รายรับ</div><div class="stat-value">'+fmtMoney(curInc)+'</div><div class="stat-label">เดือนปัจจุบัน</div></div>'
        +'<div class="stat-card blue"><div class="stat-icon">ห้องว่าง</div><div class="stat-value">'+(summary.vacant_rooms||0)+'</div><div class="stat-label">ห้องที่ยังว่าง</div></div>'
        +'<div class="stat-card red"><div class="stat-icon">บิลค้าง</div><div class="stat-value">'+(summary.unpaid_bill_count||0)+'</div><div class="stat-label">จำนวนบิลค้างชำระ</div></div>'
        +'<div class="stat-card green"><div class="stat-icon">ผู้เช่า</div><div class="stat-value">'+(summary.tenant_count||0)+'</div><div class="stat-label">ผู้เช่าปัจจุบัน</div></div>'
        +'</div>'
        +'<div style="background:linear-gradient(135deg,var(--sky),var(--sky-mid));border-radius:var(--radius);padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;box-shadow:var(--shadow)">'
        +'<div><div style="font-size:16px;color:rgba(255,255,255,0.65)">กำไรสุทธิ - '+curLabel+'</div>'
        +'<div style="font-family:Prompt,sans-serif;font-size:30px;font-weight:700;color:'+profitColor+'">'+(curProfit>=0?'+':'')+fmtMoney(curProfit)+'</div></div>'
        +'<div style="text-align:right;font-size:16px;color:rgba(255,255,255,0.75);line-height:2">'
        +'<div>รายรับ <strong style="color:#68D391">'+fmtMoney(curInc)+'</strong></div>'
        +'<div>รายจ่าย <strong style="color:#FC8181">'+fmtMoney(curExp)+'</strong></div></div></div>'
        +'<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">'
        +'<div class="card" style="flex:2;min-width:280px"><div class="card-title">รายรับเทียบรายจ่ายรายเดือน ('+(monthly.year||'-')+')</div>'
        +'<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:16px">'
        +'<span class="legend-dot"><span style="background:#276749"></span>รายรับ</span>'
        +'<span class="legend-dot"><span style="background:#C53030"></span>รายจ่าย</span></div>'
        +'<div style="font-size:16px;color:var(--text-light);margin-bottom:10px">(ตัวเลขใต้กราฟ = กำไร/ขาดทุน)</div>'
        +'<div style="display:flex;align-items:flex-end;gap:3px;height:130px">'+monthBarsHtml+'</div></div>'
        +'<div class="card" style="flex:1;min-width:200px"><div class="card-title">เปรียบเทียบรายปี</div>'
        +'<div style="display:flex;gap:10px 14px;margin-bottom:10px;font-size:16px;flex-wrap:wrap;align-items:center">'
        +'<span class="legend-dot"><span style="background:#276749"></span>รายรับ</span>'
        +'<span class="legend-dot"><span style="background:#C53030"></span>รายจ่าย</span>'
        +'<span class="legend-dot"><span style="background:var(--sun)"></span>กำไร</span></div>'
        +'<div style="display:flex;gap:16px;align-items:flex-start;padding:4px 0">'+yearBars+'</div></div></div>';
    })
    .catch(function(err){
      console.error('Failed to load dashboard', err);
      el.innerHTML='<div class="card"><div class="alert alert-danger">โหลดข้อมูลแดชบอร์ดไม่สำเร็จ</div></div>';
    });
};

// ---- ADMIN: จัดการห้องพัก ----
pageRenderers['rooms']=function(el){
  var cards='';
  DB.rooms.forEach(function(r){
    var user=DB.users.find(function(u){ return u.id===r.tenant; });
    var occ=r.status==='occupied';
    cards+='<div class="room-card '+r.status+'" onclick="viewRoomDetail(\''+r.id+'\')">'
      +'<div class="room-number" style="color:'+(occ?'var(--sky)':'var(--success)')+'">ห้อง '+r.id+'</div>'
      +'<div class="room-status-text" style="color:'+(occ?'var(--sky-light)':'var(--success)')+'">'+( occ?'มีผู้เช่า':'ว่าง')+'</div>'
      +(user?'<div style="font-size:16px;color:var(--text-light);margin-top:4px">'+escapeHtml(user.name.substring(0,8))+'...</div>':'')
      +'</div>';
  });
  el.innerHTML=pageHeader('🏠 จัดการห้องพัก',{action:'<button class="btn btn-primary btn-sm" onclick="openAddRoomModal()">➕ เพิ่มห้องใหม่</button>'})
    +'<div class="card"><div class="flex gap-10 mb-16">'
    +'<span class="badge badge-success" style="padding:6px 14px">● ว่างให้เช่า</span>'
    +'<span class="badge badge-info" style="padding:6px 14px">● มีผู้เช่า</span></div>'
    +(DB.rooms.length===0?'<div class="alert alert-info">ยังไม่มีห้องในระบบ กด "เพิ่มห้องใหม่" เพื่อเริ่มต้น</div>':'')
    +'<div class="room-grid">'+cards+'</div></div>';
};
window.openAddRoomModal=function(){
  openModal('➕ เพิ่มห้องใหม่',
    '<div class="form-group"><label class="form-label">หมายเลขห้อง</label><input class="form-input" id="newRoomId" placeholder="เช่น 101, 102, A1" onkeydown="if(event.key===\'Enter\') addNewRoom()"></div>',
    '<button class="btn btn-primary" onclick="addNewRoom()">บันทึก</button><button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>'
  );
  setTimeout(function(){ var inp=document.getElementById('newRoomId'); if(inp) inp.focus(); },50);
};
window.addNewRoom=function(){
  var input=document.getElementById('newRoomId');
  var val=(input?input.value:'').trim();
  if(!val){ showToast('กรุณากรอกหมายเลขห้อง','error'); return; }
  var exists=DB.rooms.some(function(r){ return r.id===val; });
  if(exists){ showToast('มีห้องหมายเลข '+val+' อยู่แล้ว','error'); return; }
  DB.rooms.push({id:val,status:'vacant',tenant:null});
  showToast('เพิ่มห้อง '+val+' เรียบร้อย');
  closeModal();
  showPage('rooms');
};
window.viewRoomDetail=function(id){
  var room=DB.rooms.find(function(r){ return r.id===id; });
  var user=DB.users.find(function(u){ return u.id===room.tenant; });
  var bills=DB.bills.filter(function(b){ return b.room===id; });
  var unpaidBills=bills.filter(function(b){ return b.status==='unpaid'; });
  var totalDebt=unpaidBills.reduce(function(a,b){ return a+b.total; },0);
  var body='<div class="alert '+(room.status==='occupied'?'alert-info':'alert-success')+'">'+(room.status==='occupied'?'มีผู้เช่า':'ว่างให้เช่า')+'</div>';
  if(user){
    body+='<div class="slip-row"><span>ผู้เช่า:</span><strong>'+escapeHtml(user.name)+'</strong></div>'
      +'<div class="slip-row"><span>ชื่อผู้ใช้:</span><strong>'+escapeHtml(user.username)+'</strong></div>'
      +'<div class="divider"></div>';
    if(unpaidBills.length>0){
      body+='<div class="alert-box-danger">'
        +'<div style="font-size:16px;color:var(--text-light);margin-bottom:4px">ค่าค้างชำระรวม</div>'
        +'<div style="font-family:Prompt,sans-serif;font-size:22px;font-weight:700;color:var(--danger)">'+fmtMoney(totalDebt)+' ฿</div>'
        +'<div style="font-size:16px;color:var(--text-light);margin-top:4px">ค้าง '+unpaidBills.length+' เดือน</div>';
      unpaidBills.slice().sort(function(a,b){ return (b.year-a.year)||(b.month-a.month); }).forEach(function(b){ body+='<div style="font-size:16px;color:var(--text-mid);margin-top:3px">• '+thMonthFull(b.month)+' '+b.year+' = '+fmtMoney(b.total)+' ฿</div>'; });
      body+='</div>';
    } else {
      body+='<div style="background:#F0FFF4;border-radius:10px;padding:10px;margin-bottom:12px"><div style="font-size:16px;color:var(--success)">✅ ไม่มีค่าค้างชำระ</div></div>';
    }
    body+='<div class="card-title">บิลล่าสุด</div>';
    bills.slice(-3).reverse().forEach(function(b){
      body+='<div class="slip-row"><span>'+thMonthFull(b.month)+' '+b.year+'</span><span>'+billStatusBadge(b)+'</span><span>'+fmtMoney(b.total)+' ฿</span></div>';
    });
  } else body+='<p>ห้องว่าง ยังไม่มีผู้เช่า</p>';
  var occupied=room.status==='occupied';
  if(occupied){
    body+='<div style="font-size:16px;color:var(--text-light);margin-top:12px">🔒 ห้องนี้มีผู้เช่าอยู่ ต้องย้ายผู้เช่าออกก่อนจึงจะแก้ไขหมายเลขห้องหรือลบห้องนี้ได้</div>';
  }
  var editDeleteBtns=occupied
    ?'<button class="btn btn-outline btn-sm" disabled title="ต้องย้ายผู้เช่าออกก่อน">✏️ แก้ไขเลขห้อง</button>'
      +'<button class="btn btn-danger btn-sm" disabled title="ต้องย้ายผู้เช่าออกก่อน">🗑️ ลบห้อง</button>'
    :'<button class="btn btn-outline btn-sm" onclick="openEditRoomModal(\''+id+'\')">✏️ แก้ไขเลขห้อง</button>'
      +'<button class="btn btn-danger btn-sm" onclick="deleteRoomConfirm(\''+id+'\')">🗑️ ลบห้อง</button>';
  openModal('ห้อง '+id,body,editDeleteBtns+'<button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
};
window.openEditRoomModal=function(oldId){
  var room=DB.rooms.find(function(r){ return r.id===oldId; });
  if(!room) return;
  if(room.status==='occupied'){
    showToast('ห้องนี้มีผู้เช่าอยู่ ต้องย้ายผู้เช่าออกก่อนจึงจะแก้ไขหมายเลขห้องได้','error');
    return;
  }
  openModal('✏️ แก้ไขหมายเลขห้อง '+oldId,
    '<div class="form-group"><label class="form-label">หมายเลขห้องใหม่</label>'
      +'<input class="form-input" id="editRoomId" value="'+escapeHtml(oldId)+'" onkeydown="if(event.key===\'Enter\') saveEditRoom(\''+oldId+'\')"></div>'
      +'<div style="font-size:16px;color:var(--text-light)">ประวัติบิล/เรื่องแจ้งเก่าของห้องนี้จะถูกย้ายไปอยู่ภายใต้หมายเลขห้องใหม่ให้อัตโนมัติ</div>',
    '<button class="btn btn-primary" onclick="saveEditRoom(\''+oldId+'\')">บันทึก</button><button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>'
  );
  setTimeout(function(){ var inp=document.getElementById('editRoomId'); if(inp){ inp.focus(); inp.select(); } },50);
};
window.saveEditRoom=async function(oldId){
  var room=DB.rooms.find(function(r){ return r.id===oldId; });
  if(!room) return;
  if(room.status==='occupied'){
    showToast('ห้องนี้มีผู้เช่าอยู่ ต้องย้ายผู้เช่าออกก่อนจึงจะแก้ไขหมายเลขห้องได้','error');
    return;
  }
  var input=document.getElementById('editRoomId');
  var newId=(input?input.value:'').trim();
  if(!newId){ showToast('กรุณากรอกหมายเลขห้อง','error'); return; }
  if(newId===oldId){ closeModal(); return; }
  var exists=DB.rooms.some(function(r){ return r.id===newId; });
  if(exists){ showToast('มีห้องหมายเลข '+newId+' อยู่แล้ว','error'); return; }
  // เปลี่ยนเลขห้องผ่าน endpoint เฉพาะฝั่งเซิร์ฟเวอร์ (ไล่อัปเดต room_id ทุกตารางให้ในธุรกรรมเดียว)
  // แทนการแก้ DB.* ในเบราว์เซอร์แล้วหวังให้ระบบบันทึกอัตโนมัติ sync ตามทีหลัง เพื่อไม่ให้ชนกับ
  // ข้อมูล users/room_occupants ที่ตอนนี้บันทึกผ่าน endpoint เฉพาะของตัวเองเท่านั้น
  try{
    await requestJSON('/api/rooms/'+encodeURIComponent(oldId)+'/rename',{
      method:'POST',
      body:JSON.stringify({ newId:newId })
    });
    await loadDBFromServer();
    showToast('เปลี่ยนหมายเลขห้องเป็น '+newId+' เรียบร้อย');
    closeModal();
    showPage('rooms');
  }catch(err){
    var msg=err.message;
    var map={room_not_found:'ไม่พบห้องนี้',room_occupied:'ห้องนี้มีผู้เช่าอยู่ ต้องย้ายผู้เช่าออกก่อน',room_exists:'มีห้องหมายเลขนี้อยู่แล้ว'};
    showToast(map[msg]||'เปลี่ยนหมายเลขห้องไม่สำเร็จ','error');
  }
};
window.deleteRoomConfirm=function(id){
  var room=DB.rooms.find(function(r){ return r.id===id; });
  if(!room) return;
  if(room.status==='occupied'){
    showToast('ห้องนี้มีผู้เช่าอยู่ ต้องย้ายผู้เช่าออกก่อนจึงจะลบห้องนี้ได้','error');
    return;
  }
  if(!confirm('ต้องการลบห้อง '+id+' ใช่หรือไม่?\n(ประวัติบิล/เรื่องแจ้งเก่าของห้องนี้จะยังอยู่ในระบบ แต่จะไม่มีห้องนี้ในรายการห้องอีกต่อไป)')) return;
  DB.rooms=DB.rooms.filter(function(r){ return r.id!==id; });
  showToast('ลบห้อง '+id+' เรียบร้อย');
  closeModal();
  showPage('rooms');
};

// ---- ADMIN: ติดตามหนี้ ----
// แสดงเฉพาะบิลที่ค้างชำระเกิน 15 วันนับจากวันที่ลงบิล (isBillOverdue) — บิลที่ยังไม่ถึงกำหนด
// จะยังไม่ย้ายมาที่หน้านี้ ผู้เช่าจะเห็นแค่ตัวนับถอยหลังในหน้าชำระเงินของตัวเอง
pageRenderers['debts']=function(el){
  var overdue=DB.bills.filter(isBillOverdue)
    .sort(function(a,b){ return billDaysOld(b)-billDaysOld(a); });
  var rows='';
  overdue.forEach(function(b){
    rows+='<tr><td><strong>ห้อง '+b.room+'</strong></td><td>'+thMonthFull(b.month)+' '+b.year+'</td>'
      +'<td><strong class="text-danger">'+fmtMoney(b.total)+' ฿</strong></td>'
      +'<td><span class="badge badge-danger">เกินกำหนด '+billDaysOld(b)+' วัน</span></td>'
      +'<td class="flex gap-10">'
      +'<button class="btn btn-outline btn-sm" onclick="printDebtNotice(\''+b.id+'\')">🖨️ พิมพ์ใบแจ้งหนี้</button>'
      +'<button class="btn btn-success btn-sm" onclick="markCash(\''+b.id+'\')">💵 รับเงินแล้ว</button></td></tr>';
  });
  el.innerHTML=pageHeader('📋 ติดตามหนี้ค้างชำระ',{subtitle:'แสดงบิลที่ค้างชำระเกิน '+BILL_OVERDUE_DAYS+' วันนับจากวันที่ลงบิล'})
    +'<div class="card"><div class="table-wrap"><table><thead><tr><th>ห้อง</th><th>เดือน</th><th>ยอดค้าง</th><th>สถานะ</th><th></th></tr></thead><tbody>'
    +(rows||'<tr><td colspan="5" style="text-align:center;color:var(--text-light)">ไม่มีบิลที่เกินกำหนดชำระ</td></tr>')
    +'</tbody></table></div></div>';
};
window.printDebtNotice=function(id){
  var b=DB.bills.find(function(x){ return x.id===id; });
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
  var today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  var noticeNo='DN-'+String(b.id).slice(-6).toUpperCase();
  var body='<div class="slip-preview">'
    +'<div class="slip-header"><div style="font-size:32px">☀️</div>'
    +'<div style="font-family:Prompt,sans-serif;font-size:20px;font-weight:700">บ้านแสงอาทิตย์</div>'
    +'<div style="font-size:15px;opacity:0.75">ใบแจ้งหนี้</div>'
    +'<div style="font-size:16px;opacity:0.6;margin-top:4px">เลขที่ '+noticeNo+'</div></div>'
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
    +'<div style="margin-top:14px;opacity:.6">กรุณาชำระภายในกำหนด 🙏</div>'
    +'</div></div>';
  openModal('ใบแจ้งหนี้',body,
    '<button class="btn btn-primary" onclick="printHtml(document.getElementById(\'modalBody\').innerHTML)">🖨️ พิมพ์</button><button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
};
window.markCash=function(id){
  var b=DB.bills.find(function(x){ return x.id===id; });
  if(b){b.status='paid';b.slip='cash';b.slip_status='approved';}
  showToast('บันทึกการรับเงินเรียบร้อย');
  showPage('debts');
};

