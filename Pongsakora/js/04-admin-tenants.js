// ============================================================
// 04-admin-tenants.js
// คำขอออกจากหอพัก และประวัติผู้เช่าทั้งหมด
// ============================================================

// ---- ADMIN: คำขอออก ----
function checkoutDateToISO(dateStr){
  var parts=(dateStr||'').split('/');
  if(parts.length!==3) return '';
  var d=parseInt(parts[0],10), m=parseInt(parts[1],10), yBE=parseInt(parts[2],10);
  if(!d||!m||!yBE) return '';
  return (yBE-543)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
pageRenderers['checkout-admin']=function(el){
  var cards='';
  var checkoutList=DB.checkouts.slice().reverse();
  var todayISO=new Date().toISOString().slice(0,10);
  if(checkoutList.length===0) cards='<div class="alert alert-info">ไม่มีคำขอ</div>';
  else checkoutList.forEach(function(c){
    var rb=c.refundType==='bank'?'โอน '+escapeHtml(c.bank)+' ('+escapeHtml(c.accountNo)+')':'เงินสด';
    var maxISO=checkoutDateToISO(c.date)||todayISO;
    var minISO=todayISO<maxISO?todayISO:maxISO;
    cards+='<div style="border:1px solid '+(c.urgent?'var(--danger)':'var(--border)')+';border-radius:12px;padding:16px;margin-bottom:12px">'
      +'<div class="flex-between"><div><strong style="font-size:22px">ห้อง '+escapeHtml(c.room)+'</strong>'+(c.urgent?' <span class="badge badge-danger">⚡ กะทันหัน</span>':'')+'</div>'+statusBadge(c.status)+'</div>'
      +'<div class="slip-row" style="margin-top:8px"><span>วันที่ออก:</span><strong>'+escapeHtml(c.date)+'</strong></div>'
      +'<div class="slip-row"><span>รับเงินคืนทาง:</span><strong>'+rb+'</strong></div>'
      +(c.urgent?'<div class="alert alert-danger" style="margin-top:8px;font-size:16px">⚡ แจ้งออกกะทันหัน (น้อยกว่า 30 วันตามเงื่อนไข)<br>เหตุผล: '+escapeHtml(c.urgentReason||'-')+'</div>':'')
      +(c.inspectDate?'<div class="slip-row" style="margin-top:8px"><span>📋 นัดตรวจห้อง:</span><strong>'+fmtThaiDate(c.inspectDate)+'</strong></div>':'')
      +(c.status==='pending'?(
        '<div style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px">'
        +'<div class="form-group"><label class="form-label">เลือกวันที่จะไปตรวจห้อง (ระหว่างวันนี้ถึงวันที่ออก)</label>'
        +'<input class="form-input" type="date" id="inspectDate_'+c.id+'" min="'+minISO+'" max="'+maxISO+'" value="'+maxISO+'"></div>'
        +'<button class="btn btn-primary btn-sm" style="width:100%" onclick="receiveCheckout(\''+c.id+'\')">รับเรื่องแล้ว</button>'
        +'</div>'
      ):'')
      +'</div>';
  });
  el.innerHTML=pageHeader('🚪 คำขอออกจากหอพัก')+cardBox(cards);
};
window.receiveCheckout=function(id){
  var c=DB.checkouts.find(function(x){ return x.id===id; });
  if(!c) return;
  var input=document.getElementById('inspectDate_'+id);
  var inspectDate=input?input.value:'';
  if(!inspectDate){
    showToast('กรุณาเลือกวันที่จะไปตรวจห้อง','error');
    return;
  }
  var todayISO=new Date().toISOString().slice(0,10);
  var maxISO=checkoutDateToISO(c.date)||todayISO;
  var minISO=todayISO<maxISO?todayISO:maxISO;
  if(inspectDate<minISO||inspectDate>maxISO){
    showToast('วันที่ตรวจห้องต้องอยู่ระหว่างวันนี้ถึงวันที่ออก ('+escapeHtml(c.date)+')','error');
    return;
  }
  c.status='received';
  c.inspectDate=inspectDate;
  showToast('รับเรื่องเรียบร้อย นัดตรวจห้องวันที่ '+fmtThaiDate(inspectDate));
  showPage('checkout-admin');
};

// ---- ADMIN: ประวัติผู้เช่า ----
function fmtThaiDate(iso){
  if(!iso) return '-';
  var d=new Date(iso);
  if(Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
}
function billSlipStatusBadge(b){
  if(b.status!=='paid'){
    return '<span class="badge badge-danger">ยังไม่ชำระ</span>';
  }
  if(b.slip_status==='approved'){
    return '<span class="badge badge-success">✅ สลิปผ่านแล้ว</span>';
  }
  if(b.slip_status==='rejected'){
    return '<span class="badge badge-danger">❌ ยังไม่ผ่าน</span>';
  }
  return '<span class="badge badge-warning">🕒 ยังไม่ตรวจ</span>';
}
function billSlipSourceInfo(b){
  var raw=b.slip;
  if(!raw) return {icon:'❔',text:'ไม่มีข้อมูลการชำระเงิน',ref:'',image:''};
  if(raw.indexOf('auto_qr:')===0){
    return {icon:'📱',text:'ชำระผ่าน PromptPay QR อัตโนมัติ',ref:raw.slice('auto_qr:'.length),image:''};
  }
  if(raw.indexOf('upload:')===0){
    var fname=raw.slice('upload:'.length);
    return {icon:'📤',text:'แนบสลิปการโอนเงิน',ref:'',image:'/uploads/slips/'+fname};
  }
  if(raw==='cash'){
    return {icon:'💵',text:'รับชำระเป็นเงินสด (บันทึกโดยแอดมิน)',ref:'',image:''};
  }
  return {icon:'🧾',text:'ชำระโดย: '+raw,ref:'',image:''};
}
function belongsToTenant(record,user){
  // ถ้ามีการผูก tenant_user_id ไว้ (ข้อมูลใหม่) ให้ยึดตามนั้นเป๊ะๆ
  // ถ้าไม่มี (ข้อมูลเก่าก่อนมีระบบเก็บประวัติ) ใช้เลขห้องเป็นตัวช่วยแทน
  if(record.tenantUserId) return record.tenantUserId===user.id;
  return record.room===user.room;
}
// สถานะของผู้เช่าแต่ละคน ใช้ร่วมกันทั้งตอนแสดงป้ายสถานะและตอนกรองรายการ
// 'staying'  = ยังพักอยู่ (รวมกรณีมีคำขอย้ายออกแล้วแต่แอดมินยังไม่ได้กด "รับเรื่อง" ด้วย เพราะยังอยู่จริง)
// 'received' = แอดมินรับเรื่องขอย้ายออกแล้ว (ยังไม่ได้ลบบัญชี/ยังพักอยู่ระหว่างรอวันออกจริง)
// 'moved'    = ย้ายออกแล้ว (ปิดใช้งานบัญชี)
function tenantHistoryStatus(u,checkout){
  if(u.is_active===false) return 'moved';
  if(checkout&&checkout.status==='received') return 'received';
  return 'staying';
}
var tenantHistoryFilter='all';
var tenantHistorySort='desc';
window.setTenantHistoryFilter=function(val){ tenantHistoryFilter=val; showPage('tenant-history'); };
window.setTenantHistorySort=function(val){ tenantHistorySort=val; showPage('tenant-history'); };
pageRenderers['tenant-history']=function(el){
  var tenants=DB.users.filter(function(u){ return u.role==='tenant'; })
    .map(function(u){
      var checkout=DB.checkouts.find(function(c){ return belongsToTenant(c,u); });
      return { u:u, checkout:checkout, status:tenantHistoryStatus(u,checkout) };
    })
    .filter(function(x){ return tenantHistoryFilter==='all'||x.status===tenantHistoryFilter; })
    .sort(function(a,b){
      var diff=new Date(a.u.created_at||0)-new Date(b.u.created_at||0);
      return tenantHistorySort==='asc'?diff:-diff;
    });
  var filterBar='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">'
    +'<div class="form-group" style="margin:0;min-width:220px"><label class="form-label">สถานะผู้เช่า</label>'
      +'<select class="form-input" onchange="setTenantHistoryFilter(this.value)">'
      +'<option value="all"'+(tenantHistoryFilter==='all'?' selected':'')+'>ดูทั้งหมด</option>'
      +'<option value="staying"'+(tenantHistoryFilter==='staying'?' selected':'')+'>พักอยู่</option>'
      +'<option value="received"'+(tenantHistoryFilter==='received'?' selected':'')+'>รับเรื่องการออกจากหอพัก</option>'
      +'<option value="moved"'+(tenantHistoryFilter==='moved'?' selected':'')+'>ย้ายออก</option>'
      +'</select></div>'
    +'<div class="form-group" style="margin:0;min-width:220px"><label class="form-label">เรียงลำดับ (วันที่เข้าพัก)</label>'
      +'<select class="form-input" onchange="setTenantHistorySort(this.value)">'
      +'<option value="desc"'+(tenantHistorySort==='desc'?' selected':'')+'>ใหม่ → เก่า</option>'
      +'<option value="asc"'+(tenantHistorySort==='asc'?' selected':'')+'>เก่า → ใหม่</option>'
      +'</select></div>'
    +'</div>';
  var rows='';
  if(tenants.length===0){
    rows='<div class="alert alert-info">ไม่พบผู้เช่าตามเงื่อนไขที่เลือก</div>';
  }else{
    tenants.forEach(function(item){
      var u=item.u, checkout=item.checkout, isActive=u.is_active!==false;
      var bills=DB.bills.filter(function(b){ return belongsToTenant(b,u); });
      var reports=DB.reports.filter(function(r){ return belongsToTenant(r,u); });
      var pendingReview=bills.filter(function(b){ return b.status==='paid'&&(b.slip_status==='pending'||!b.slip_status||b.slip_status==='none'); }).length;
      // อาจารย์ท้วงว่าตัวอักษรในการ์ดประวัติผู้เช่าเล็กไป ขยายทุกส่วนให้อ่านง่ายขึ้น
      rows+='<div style="border:1px solid '+(isActive?'var(--border)':'var(--text-light)')+';border-radius:12px;padding:20px;margin-bottom:16px'+(isActive?'':';opacity:.85')+'">'
        +'<div class="flex-between" style="flex-wrap:wrap;gap:10px">'
        +'<div><strong style="font-size:22px">ห้อง '+escapeHtml(u.room||'-')+'</strong> — <span style="font-size:20px">'+escapeHtml(u.name)+'</span>'
          +'<div style="font-size:16px;color:var(--text-light);margin-top:5px">เข้าพักเมื่อ: '+fmtThaiDate(u.created_at)
            +(isActive?'':' • ย้ายออกเมื่อ: '+fmtThaiDate(u.archived_at))+'</div></div>'
        +(!isActive?'<span class="badge badge-gray" style="font-size:16px;padding:7px 14px">🚪 ย้ายออกแล้ว</span>':(checkout?statusBadge(checkout.status==='pending'?'pending':'received'):'<span class="badge badge-info" style="font-size:16px;padding:7px 14px">พักอยู่</span>'))
        +'</div>'
        +'<div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:16px;color:var(--text-mid)">'
        +'<span>📄 บิลทั้งหมด '+bills.length+' รายการ</span>'
        +'<span>🕒 รอตรวจสลิป '+pendingReview+' รายการ</span>'
        +'<span>🔔 แจ้งเหตุ '+reports.length+' ครั้ง</span>'
        +'</div>'
        +'<button class="btn btn-outline" style="margin-top:14px;font-size:16px;padding:10px 18px" onclick="openTenantHistoryDetail(\''+u.id+'\')">📋 ดูประวัติทั้งหมด</button>'
        +'</div>';
    });
  }
  el.innerHTML=pageHeader('🗂️ ประวัติผู้เช่า',{subtitle:'ข้อมูลย้อนหลังของผู้เช่าทุกคน (รวมผู้เช่าที่ย้ายออกไปแล้ว)'})
    +cardBox(filterBar+rows);
};
window.openTenantHistoryDetail=function(userId){
  var u=DB.users.find(function(x){ return x.id===userId; });
  if(!u) return;
  var bills=DB.bills.filter(function(b){ return belongsToTenant(b,u); }).sort(function(a,b){ return (b.year-a.year)||(b.month-a.month); });
  var reports=DB.reports.filter(function(r){ return belongsToTenant(r,u); }).slice().reverse();
  var checkout=DB.checkouts.find(function(c){ return belongsToTenant(c,u); });

  var billsHtml=bills.length===0?'<p style="color:var(--text-light);font-size:16px">ยังไม่มีประวัติบิล</p>':'';
  bills.forEach(function(b){
    var src=billSlipSourceInfo(b);
    billsHtml+='<div class="slip-row" style="border-bottom:1px solid var(--border);padding:8px 0;flex-direction:column;align-items:flex-start;gap:4px">'
      +'<div style="display:flex;justify-content:space-between;width:100%">'
      +'<span>'+thMonthFull(b.month)+' '+b.year+' — '+fmtMoney(b.total)+' ฿</span>'
      +'<span>'+billSlipStatusBadge(b)+'</span></div>'
      +(b.status==='paid'?'<div style="font-size:16px;color:var(--text-light)">'+src.icon+' '+escapeHtml(src.text)+(src.ref?' • อ้างอิง '+escapeHtml(src.ref):'')+'</div>':'')
      +'</div>';
  });

  var reportsHtml=reports.length===0?'<p style="color:var(--text-light);font-size:16px">ยังไม่มีประวัติการแจ้งเหตุ</p>':'';
  reports.forEach(function(r){
    reportsHtml+='<div class="notif-list-item" onclick="viewTenantReportChat(\''+userId+'\',\''+r.id+'\')">'
      +'<div style="flex:1">'
      +'<div style="font-weight:700;font-size:16px;color:var(--sky)">'+reportTypeTh(r.type)+' <span style="font-size:15px;color:var(--text-light)">'+escapeHtml(r.date)+'</span></div>'
      +'<div style="font-size:16px;color:var(--text-mid);margin-top:2px">'+escapeHtml(r.detail)+'</div>'
      +'</div>'+statusBadge(r.status)+'</div>';
  });

  var checkoutHtml;
  if(checkout){
    var refundText=checkout.refundType==='bank'
      ?'โอนเข้าบัญชี '+escapeHtml(checkout.bank||'-')+' เลขที่ '+escapeHtml(checkout.accountNo||'-')
      :'รับเป็นเงินสด';
    checkoutHtml='<div class="slip-row"><span>วันที่แจ้งออก:</span><strong>'+escapeHtml(checkout.date||'-')+'</strong></div>'
      +'<div class="slip-row"><span>คืนเงินมัดจำโดย:</span><strong>'+refundText+'</strong></div>'
      +(checkout.urgent?'<div class="alert alert-danger" style="margin-top:8px;font-size:16px">⚡ แจ้งออกกะทันหัน — เหตุผล: '+escapeHtml(checkout.urgentReason||'-')+'</div>':'')
      +'<div style="margin-top:8px">'+statusBadge(checkout.status==='pending'?'pending':'received')+'</div>';
  }else{
    checkoutHtml='<p style="color:var(--text-light);font-size:16px">ยังไม่ได้แจ้งออกจากหอพัก</p>';
  }

  var body='<div style="margin-bottom:14px;background:#F7F3E8;border-radius:10px;padding:12px">'
    +'<div class="slip-row"><span>ห้อง:</span><strong>'+escapeHtml(u.room||'-')+'</strong></div>'
    +'<div class="slip-row"><span>ชื่อผู้เช่า:</span><strong>'+escapeHtml(u.name)+'</strong></div>'
    +'<div class="slip-row"><span>ชื่อผู้ใช้:</span><strong>'+escapeHtml(u.username)+'</strong></div>'
    +'<div class="slip-row"><span>เข้าพักเมื่อ:</span><strong>'+fmtThaiDate(u.created_at)+'</strong></div>'
    +'</div>'
    +'<div class="card-title" style="margin-bottom:8px">💳 ประวัติสลิปการโอน</div>'+billsHtml
    +'<div class="divider"></div>'
    +'<div class="card-title" style="margin:12px 0 8px">🔔 ประวัติการแจ้งเหตุ (คลิกเพื่อดูแชท)</div>'+reportsHtml
    +'<div class="divider"></div>'
    +'<div class="card-title" style="margin:12px 0 8px">🚪 การออกจากหอพัก</div>'+checkoutHtml;

  openModal('📋 ประวัติผู้เช่า — ห้อง '+escapeHtml(u.room||'-'), body,
    '<button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
};
window.viewTenantReportChat=function(userId,reportId){
  var r=DB.reports.find(function(x){ return x.id===reportId; });
  if(!r) return;
  var msgs=DB.chatMessages[reportId]||[];
  var body='<div style="background:#F7F3E8;border-radius:10px;padding:10px;margin-bottom:10px;font-size:16px">'
    +'<div><strong>'+reportTypeTh(r.type)+'</strong> <span style="font-size:16px;color:var(--text-light)">'+escapeHtml(r.date)+'</span> '+statusBadge(r.status)+'</div>'
    +'<div style="margin-top:6px;color:var(--text-mid)">'+escapeHtml(r.detail)+'</div>'
    +(r.media?'<div style="margin-top:8px;text-align:center"><img src="'+r.media+'" style="max-width:100%;max-height:220px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)" onclick="viewImageFull(this.src)"></div>':'')
    +responseBox(r.response)
    +'</div>'
    +'<div class="card-title" style="margin-bottom:8px">💬 ประวัติแชท</div>'
    +'<div style="background:#F0EBE0;border-radius:10px;padding:10px;max-height:280px;overflow-y:auto">'+buildAdminChatBubbles(msgs)+'</div>';
  openModal('💬 แชท: '+reportTypeTh(r.type),body,
    '<button class="btn btn-outline" onclick="openTenantHistoryDetail(\''+userId+'\')">◀️ กลับ</button>'
    +'<button class="btn btn-primary" onclick="closeModal()">ปิด</button>');
};

