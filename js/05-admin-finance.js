// ============================================================
// 05-admin-finance.js
// รายรับรายจ่าย และบันทึกหน่วยน้ำ-ไฟ (ตั้งอัตราค่าบริการ)
// ============================================================

// ---- ADMIN: รายรับรายจ่าย ----
pageRenderers['income-expense']=function(el){
  var months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var thisYear=currentBuddhistYear();
  // คำนวณรายรับ-รายจ่ายสดจากบิล/รายจ่ายจริงของปีปัจจุบัน (พ.ศ.) แทนอาร์เรย์เก่า DB.income2568/DB.expense2568
  // ที่ไม่เคยถูกอัปเดตด้วยข้อมูลจริง (ให้ตรงกับส่วนรายละเอียดด้านล่างที่คำนวณสดอยู่แล้ว)
  // รายรับนับเฉพาะบิลที่จ่ายแล้วและสลิปอนุมัติแล้วเท่านั้น (ไม่นับบิลที่ยังรอตรวจสอบสลิป)
  var incomeThisYear=new Array(12).fill(0), expenseThisYear=new Array(12).fill(0);
  (DB.bills||[]).forEach(function(b){
    if(b.year===thisYear && b.status==='paid' && b.slip_status==='approved'){
      var mi=Number(b.month)-1;
      if(mi>=0&&mi<12) incomeThisYear[mi]+=Number(b.total)||0;
    }
  });
  (DB.expenses||[]).forEach(function(x){
    if(x.year===thisYear){
      var mi=Number(x.month)-1;
      if(mi>=0&&mi<12) expenseThisYear[mi]+=Number(x.amount)||0;
    }
  });
  var totalInc=incomeThisYear.reduce(function(a,b){ return a+b; },0);
  var totalExp=expenseThisYear.reduce(function(a,b){ return a+b; },0);
  var totalPft=totalInc-totalExp;
  // build 3-bar chart (inc/exp/profit) same as dashboard
  var maxMV=Math.max.apply(null,incomeThisYear.concat(expenseThisYear))||1;
  var miniBarHtml='';
  for(var mi2=0;mi2<12;mi2++){
    var inc2=incomeThisYear[mi2], exp2=expenseThisYear[mi2], pf2=inc2-exp2;
    var ih2=Math.round((inc2/maxMV)*65), eh2=Math.round((exp2/maxMV)*65);
    var pfh2=Math.max(Math.round((Math.abs(pf2)/maxMV)*65),2);
    var pfC2=pf2>=0?'linear-gradient(180deg,#FDD882,#D4831A)':'linear-gradient(180deg,#FC8181,#C53030)';
    var pfLabelC=pf2>=0?'#276749':'#C53030';
    miniBarHtml+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px">'
      +'<div style="width:100%;display:flex;gap:1px;align-items:flex-end;height:65px">'
      +'<div style="flex:1;height:'+ih2+'px;background:linear-gradient(180deg,#68D391,#276749);border-radius:2px 2px 0 0;min-height:2px"></div>'
      +'<div style="flex:1;height:'+eh2+'px;background:linear-gradient(180deg,#FC8181,#C53030);border-radius:2px 2px 0 0;min-height:2px"></div>'
      +'<div style="flex:1;height:'+pfh2+'px;background:'+pfC2+';border-radius:2px 2px 0 0;min-height:2px"></div>'
      +'</div>'
      +'<div style="font-size:16px;color:var(--text-light);text-align:center">'+months[mi2]+'</div>'
      +'<div style="font-size:16px;color:'+pfLabelC+';font-weight:700">'+(pf2>=0?'+':'')+Math.round(pf2/1000)+'k</div>'
      +'</div>';
  }
  var monthOpts=''; for(var m=1;m<=12;m++) monthOpts+='<option value="'+m+'"'+(m===currentBuddhistMonth()?' selected':'')+'>'+thMonthFull(m)+'</option>';
  var dayOpts=''; for(var d=1;d<=31;d++) dayOpts+='<option value="'+d+'">'+d+'</option>';
  var monthShOpts=''; for(var ms=1;ms<=12;ms++) monthShOpts+='<option value="'+ms+'">'+thMonth(ms)+'</option>';
  var yearOpts3=[thisYear,thisYear-1,thisYear-2].map(function(y){ return '<option value="'+y+'">'+y+'</option>'; }).join('');
  el.innerHTML=pageHeader('💰 รายรับรายจ่าย',{action:'<button class="btn btn-primary btn-sm" onclick="openAddExpenseModal()">➕ เพิ่มรายจ่าย</button>'})
    +'<div class="card">'
    +'<div class="card-title">📊 สรุปรายรับ-รายจ่าย ปี '+thisYear+'</div>'
    +'<div class="finance-3col" style="gap:12px;margin-bottom:16px">'
    +'<div class="stat-box stat-box-success">'
      +'<div class="stat-box-label">รายรับรวมปีนี้</div>'
      +'<div class="stat-box-value" style="color:var(--success)">'+fmtMoney(totalInc)+'</div>'
      +'<div class="stat-box-label">฿</div></div>'
    +'<div class="stat-box stat-box-danger">'
      +'<div class="stat-box-label">รายจ่ายรวมปีนี้</div>'
      +'<div class="stat-box-value" style="color:var(--danger)">'+fmtMoney(totalExp)+'</div>'
      +'<div class="stat-box-label">฿</div></div>'
    +'<div class="stat-box stat-box-info">'
      +'<div class="stat-box-label">กำไรสุทธิปีนี้</div>'
      +'<div class="stat-box-value" style="color:'+(totalPft>=0?'var(--sky)':'var(--danger)')+'">'+fmtMoney(totalPft)+'</div>'
      +'<div class="stat-box-label">฿</div></div>'
    +'</div>'
    +'<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:16px">'
    +'<span class="legend-dot"><span style="background:#276749"></span>รายรับ</span>'
    +'<span class="legend-dot"><span style="background:#C53030"></span>รายจ่าย</span>'
    +'<span class="legend-dot"><span style="background:var(--sun)"></span>กำไร</span></div>'
    +'<div style="font-size:16px;color:var(--text-light);margin-bottom:8px">(ตัวเลขใต้กราฟ = กำไรเป็น k)</div>'
    +'<div style="display:flex;align-items:flex-end;gap:2px;height:90px">'+miniBarHtml+'</div></div>'
    +'<div style="display:flex;gap:0;margin-bottom:0">'
    +'<button id="tabMonthBtn" onclick="switchIETab(\'month\')" '
      +'style="flex:1;padding:12px;border:2px solid var(--sun);border-right:none;border-radius:10px 0 0 10px;background:var(--sun);color:white;font-family:Sarabun,sans-serif;font-size:16px;font-weight:700;cursor:pointer">'
      +'📅 ดูตามเดือน</button>'
    +'<button id="tabRangeBtn" onclick="switchIETab(\'range\')" '
      +'style="flex:1;padding:12px;border:2px solid var(--sun);border-radius:0 10px 10px 0;background:white;color:var(--sun);font-family:Sarabun,sans-serif;font-size:16px;font-weight:700;cursor:pointer">'
      +'📆 ดูตามช่วงวันที่</button></div>'
    +'<div class="card" id="tabMonth" style="border-radius:0 0 14px 14px;border-top:none;margin-top:0">'
    +'<div class="card-title">📅 ดูรายรับรายจ่ายตามเดือน</div>'
    +'<div class="form-row mb-16"><div class="form-group"><label class="form-label">เดือน</label><select class="form-input" id="viewMonth">'+monthOpts+'</select></div>'
    +'<div class="form-group"><label class="form-label">ปี (พ.ศ.)</label><select class="form-input" id="viewYear">'+yearOpts3+'</select></div></div>'
    +'<button class="btn btn-sky btn-sm" onclick="viewMonthDetail()">🔍 ดูรายละเอียด</button>'
    +'<div id="monthDetail" style="margin-top:16px"></div></div>'
    +'<div class="card" id="tabRange" style="border-radius:0 0 14px 14px;border-top:none;margin-top:0;display:none">'
    +'<div class="card-title">📆 ดูรายรับรายจ่ายตามช่วงวันที่</div>'
    +'<div style="background:linear-gradient(135deg,#FEF3D0,#FFF9EC);border:1px dashed var(--sun);border-radius:12px;padding:16px;margin-bottom:16px">'
    +'<div style="font-size:16px;color:var(--text-mid);margin-bottom:12px">⚠️ ระบุปีเป็น พ.ศ. เช่น '+thisYear+'</div>'
    +'<div class="form-row">'
    +'<div class="form-group"><label class="form-label">📅 วันที่เริ่มต้น</label>'
      +'<div style="display:flex;gap:6px">'
        +'<select class="form-input" id="rangeStartDay" style="flex:1">'+dayOpts+'</select>'
        +'<select class="form-input" id="rangeStartMonth" style="flex:2">'+monthShOpts+'</select>'
        +'<input class="form-input" id="rangeStartYear" type="number" value="'+thisYear+'" min="2560" max="2580" style="flex:2">'
      +'</div></div>'
    +'<div class="form-group"><label class="form-label">📅 วันที่สิ้นสุด</label>'
      +'<div style="display:flex;gap:6px">'
        +'<select class="form-input" id="rangeEndDay" style="flex:1">'+dayOpts+'</select>'
        +'<select class="form-input" id="rangeEndMonth" style="flex:2">'+monthShOpts+'</select>'
        +'<input class="form-input" id="rangeEndYear" type="number" value="'+thisYear+'" min="2560" max="2580" style="flex:2">'
      +'</div></div>'
    +'</div><button class="btn btn-primary" onclick="viewRangeDetail()">🔍 ดูรายละเอียด</button></div>'
    +'<div id="rangeDetail"></div></div>';
  var endDay=document.getElementById('rangeEndDay'); if(endDay) endDay.value=24;
  var startMonthSel=document.getElementById('rangeStartMonth'); if(startMonthSel) startMonthSel.value=currentBuddhistMonth();
  var endMonthSel=document.getElementById('rangeEndMonth'); if(endMonthSel) endMonthSel.value=currentBuddhistMonth();
  var viewMonthDefault=document.getElementById('viewMonth'); if(viewMonthDefault) viewMonthDefault.value=currentBuddhistMonth();
  viewMonthDetail();
};

// ---- ADMIN: เพิ่ม/ลบรายจ่าย ----
window.openAddExpenseModal=function(){
  var thisYear=currentBuddhistYear(), thisMonth=currentBuddhistMonth();
  var monthOpts=''; for(var m=1;m<=12;m++) monthOpts+='<option value="'+m+'"'+(m===thisMonth?' selected':'')+'>'+thMonthFull(m)+'</option>';
  var yearOpts=[thisYear,thisYear-1].map(function(y){ return '<option value="'+y+'">'+y+'</option>'; }).join('');
  openModal('➕ เพิ่มรายจ่าย',
    '<div class="form-row">'
      +'<div class="form-group"><label class="form-label">เดือน</label><select class="form-input" id="expMonth">'+monthOpts+'</select></div>'
      +'<div class="form-group"><label class="form-label">ปี (พ.ศ.)</label><select class="form-input" id="expYear">'+yearOpts+'</select></div>'
    +'</div>'
    +'<div class="form-group"><label class="form-label">ประเภทรายจ่าย</label>'
      +'<input class="form-input" id="expType" placeholder="เช่น ค่าไฟฟ้าส่วนกลาง, ค่าซ่อมบำรุง, เงินเดือนพนักงาน"></div>'
    +'<div class="form-group"><label class="form-label">รายละเอียด</label>'
      +'<input class="form-input" id="expDetail" placeholder="รายละเอียดเพิ่มเติม"></div>'
    +'<div class="form-group"><label class="form-label">จำนวนเงิน (บาท)</label>'
      +'<input class="form-input" type="number" id="expAmount" placeholder="0" onkeydown="if(event.key===\'Enter\') saveNewExpense()"></div>',
    '<button class="btn btn-primary" onclick="saveNewExpense()">บันทึก</button><button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>'
  );
  setTimeout(function(){ var inp=document.getElementById('expType'); if(inp) inp.focus(); },50);
};
window.saveNewExpense=function(){
  var month=parseInt(document.getElementById('expMonth').value);
  var year=parseInt(document.getElementById('expYear').value);
  var type=(document.getElementById('expType').value||'').trim();
  var detail=(document.getElementById('expDetail').value||'').trim();
  var amount=parseFloat(document.getElementById('expAmount').value);
  if(!type){ showToast('กรุณากรอกประเภทรายจ่าย','error'); return; }
  if(!amount||amount<=0){ showToast('กรุณากรอกจำนวนเงินให้ถูกต้อง','error'); return; }
  var id='exp-'+Date.now();
  DB.expenses.push({id:id,month:month,year:year,type:type,detail:detail||type,amount:amount});
  showToast('บันทึกรายจ่ายเรียบร้อย');
  closeModal();
  showPage('income-expense');
};
window.deleteExpenseConfirm=function(id){
  var exp=DB.expenses.find(function(e){ return e.id===id; });
  if(!exp) return;
  if(!confirm('ต้องการลบรายจ่าย "'+exp.detail+'" จำนวน '+fmtMoney(exp.amount)+' บาท ใช่หรือไม่?')) return;
  DB.expenses=DB.expenses.filter(function(e){ return e.id!==id; });
  showToast('ลบรายจ่ายเรียบร้อย');
  showPage('income-expense');
};
window.switchIETab=function(tab){
  var isM=tab==='month';
  document.getElementById('tabMonth').style.display=isM?'block':'none';
  document.getElementById('tabRange').style.display=isM?'none':'block';
  document.getElementById('tabMonthBtn').style.background=isM?'var(--sun)':'white';
  document.getElementById('tabMonthBtn').style.color=isM?'white':'var(--sun)';
  document.getElementById('tabRangeBtn').style.background=isM?'white':'var(--sun)';
  document.getElementById('tabRangeBtn').style.color=isM?'var(--sun)':'white';
};
window.viewMonthDetail=function(){
  var m=parseInt(document.getElementById('viewMonth').value);
  var y=parseInt(document.getElementById('viewYear').value);
  var incBills=DB.bills.filter(function(b){ return b.month===m&&b.year===y&&b.status==='paid'&&b.slip_status==='approved'; });
  var expenses=DB.expenses.filter(function(e){ return e.month===m&&e.year===y; });
  var income=incBills.reduce(function(a,b){ return a+b.total; },0);
  var totalExp=expenses.reduce(function(a,e){ return a+e.amount; },0);
  document.getElementById('monthDetail').innerHTML=buildSummaryHTML(thMonthFull(m)+' '+y,incBills,expenses,income,totalExp,income-totalExp);
};
window.viewRangeDetail=function(){
  var sd=parseInt(document.getElementById('rangeStartDay').value);
  var sm=parseInt(document.getElementById('rangeStartMonth').value);
  var sy=parseInt(document.getElementById('rangeStartYear').value);
  var ed=parseInt(document.getElementById('rangeEndDay').value);
  var em=parseInt(document.getElementById('rangeEndMonth').value);
  var ey=parseInt(document.getElementById('rangeEndYear').value);
  var startDate=new Date(sy-543,sm-1,sd);
  var endDate=new Date(ey-543,em-1,ed,23,59,59);
  if(startDate>endDate){ showToast('วันที่เริ่มต้นต้องมาก่อนวันสิ้นสุด','error'); return; }
  var incBills=DB.bills.filter(function(b){
    if(b.status!=='paid'||b.slip_status!=='approved') return false;
    var bS=new Date(b.year-543,b.month-1,1), bE=new Date(b.year-543,b.month-1,28);
    return bE>=startDate&&bS<=endDate;
  }).sort(function(a,b){ return (b.year-a.year)||(b.month-a.month); });
  var expenses=DB.expenses.filter(function(e){
    var eS=new Date(e.year-543,e.month-1,1), eE=new Date(e.year-543,e.month-1,28);
    return eE>=startDate&&eS<=endDate;
  }).sort(function(a,b){ return (b.year-a.year)||(b.month-a.month); });
  var income=incBills.reduce(function(a,b){ return a+b.total; },0);
  var totalExp=expenses.reduce(function(a,e){ return a+e.amount; },0);
  var label=sd+' '+thMonth(sm)+' '+sy+' — '+ed+' '+thMonth(em)+' '+ey;
  document.getElementById('rangeDetail').innerHTML=buildSummaryHTML(label,incBills,expenses,income,totalExp,income-totalExp);
};
// เก็บข้อมูลของรายงานล่าสุดที่เพิ่งแสดงไว้ (ทั้งแบบดูตามเดือน/ช่วงวันที่) ไว้ใช้ตอนกดพิมพ์
window._lastFinanceReportLabel='';
function printFinanceSummary(btn){
  // หา .finance-print-area ที่ใกล้ปุ่มที่กดที่สุด กันกรณีมีทั้งแท็บ "ดูตามเดือน" และ "ดูตามช่วงวันที่"
  // แสดงอยู่ในหน้าเดียวกัน (คนละ tab) แล้วเผลอพิมพ์ผิดรายงาน
  var area=btn&&btn.closest?btn.closest('.finance-print-area'):document.querySelector('.finance-print-area');
  if(!area) return;
  printHtml(area.outerHTML);
}
function buildSummaryHTML(label,incBills,expenses,income,totalExp,profit){
  window._lastFinanceReportLabel=label;
  var incRows='';
  incBills.forEach(function(b){
    incRows+='<div style="display:flex;justify-content:space-between;padding:8px 12px;background:#F0FFF4;border-radius:8px;margin-bottom:6px;font-size:16px">'
      +'<span>ห้อง '+b.room+' — '+thMonthFull(b.month)+' '+b.year+'</span>'
      +'<strong class="text-success">+'+fmtMoney(b.total)+' ฿</strong></div>';
  });
  var expRows='';
  expenses.forEach(function(e){
    expRows+='<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#FFF5F5;border-radius:8px;margin-bottom:6px;font-size:16px">'
      +'<span>'+escapeHtml(e.detail)+'</span>'
      +'<span style="display:flex;align-items:center;gap:10px">'
        +'<strong class="text-danger">-'+fmtMoney(e.amount)+' ฿</strong>'
        +'<button class="btn btn-outline btn-sm no-print" style="padding:2px 8px;font-size:16px" onclick="deleteExpenseConfirm(\''+e.id+'\')">ลบ</button>'
      +'</span></div>';
  });
  var pc=profit>=0?'var(--success)':'var(--danger)';
  var today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  return '<div class="finance-print-area" style="border-radius:12px;overflow:hidden;border:1px solid var(--border)">'
    +'<div style="background:linear-gradient(135deg,var(--sky),var(--sky-mid));padding:16px 20px;color:white">'
    +'<div class="flex-between" style="align-items:flex-start">'
    +'<div><div style="font-size:16px;opacity:0.7;margin-bottom:2px">📊 สรุปรายรับรายจ่าย</div>'
    +'<div style="font-family:Prompt,sans-serif;font-size:16px;font-weight:700">'+label+'</div></div>'
    +'<button class="btn btn-sm no-print" style="background:white;color:var(--sky)" onclick="printFinanceSummary(this)">🖨️ พิมพ์รายงาน</button>'
    +'</div></div>'
    +'<div class="finance-3col" style="background:#F7F3E8">'
    +'<div style="padding:16px;text-align:center;border-right:1px solid var(--border)">'
      +'<div style="font-size:16px;color:var(--text-light);margin-bottom:4px">รายรับ</div>'
      +'<div style="font-family:Prompt,sans-serif;font-size:18px;font-weight:700;color:var(--success)">'+fmtMoney(income)+'</div>'
      +'<div style="font-size:16px;color:var(--text-light)">฿</div></div>'
    +'<div style="padding:16px;text-align:center;border-right:1px solid var(--border)">'
      +'<div style="font-size:16px;color:var(--text-light);margin-bottom:4px">รายจ่าย</div>'
      +'<div style="font-family:Prompt,sans-serif;font-size:18px;font-weight:700;color:var(--danger)">'+fmtMoney(totalExp)+'</div>'
      +'<div style="font-size:16px;color:var(--text-light)">฿</div></div>'
    +'<div style="padding:16px;text-align:center">'
      +'<div style="font-size:16px;color:var(--text-light);margin-bottom:4px">กำไรสุทธิ</div>'
      +'<div style="font-family:Prompt,sans-serif;font-size:18px;font-weight:700;color:'+pc+'">'+(profit>=0?'':'-')+fmtMoney(Math.abs(profit))+'</div>'
      +'<div style="font-size:16px;color:var(--text-light)">฿</div></div></div>'
    +'<div style="padding:20px">'
    +'<div style="font-weight:700;color:var(--success);margin-bottom:10px;font-size:16px">💚 รายรับ</div>'
    +(incBills.length===0?'<div style="color:var(--text-light);font-size:16px;margin-bottom:16px">ไม่มีรายรับในช่วงนี้</div>':incRows)
    +'<div style="border-top:1px dashed var(--border);margin:14px 0"></div>'
    +'<div style="font-weight:700;color:var(--danger);margin-bottom:10px;font-size:16px">❤️ รายจ่าย</div>'
    +(expenses.length===0?'<div style="color:var(--text-light);font-size:16px">ไม่มีรายจ่ายในช่วงนี้</div>':expRows)
    +'<div style="border-top:2px solid var(--border);margin-top:16px;padding-top:14px;display:flex;justify-content:space-between;align-items:center">'
    +'<span style="font-weight:700;font-size:15px">กำไรสุทธิ</span>'
    +'<span style="font-family:Prompt,sans-serif;font-size:22px;font-weight:700;color:'+pc+'">'+(profit>=0?'+':'')+fmtMoney(profit)+' ฿</span></div>'
    +'<div style="margin-top:14px;font-size:16px;color:var(--text-light);text-align:right">พิมพ์รายงานเมื่อ: '+today+'</div>'
    +'</div></div>';
}

// ---- ADMIN: บันทึกหน่วยน้ำ-ไฟ ----
pageRenderers['room-readings']=function(el){
  var occupied=DB.rooms.filter(function(r){ return r.status==='occupied'; })
    .sort(function(a,b){ return (a.id||'').localeCompare(b.id||''); });
  var curM=window._readMonth||currentBuddhistMonth(), curY=window._readYear||currentBuddhistYear();
  var monthOpts=''; for(var m=1;m<=12;m++) monthOpts+='<option value="'+m+'"'+(m===curM?' selected':'')+'>'+thMonthFull(m)+'</option>';
  var yearOpts=[currentBuddhistYear(),currentBuddhistYear()-1].map(function(y){ return '<option value="'+y+'"'+(y===curY?' selected':'')+'>'+y+'</option>'; }).join('');

  var roomOpts='<option value="">— เลือกห้อง —</option>';
  occupied.forEach(function(r){
    var done=DB.bills.some(function(b){
      return b.room===r.id&&b.month===curM&&b.year===curY&&(b.water_cost||b.elec_cost);
    });
    roomOpts+='<option value="'+r.id+'"'+(window._readingRoom===r.id?' selected':'')+'>'+(done?'✅ ':'⏳ ')+'ห้อง '+r.id+'</option>';
  });

  el.innerHTML=pageHeader('💧 บันทึกหน่วยน้ำ-ไฟแยกตามห้อง',{subtitle:'เลือกห้อง แล้วกรอกมิเตอร์เก่า-ใหม่และจำนวนเงินของห้องนั้น'})
    +'<div class="card"><div class="flex-between mb-16">'
    +'<div><label class="form-label">เดือน-ปีที่บันทึก</label>'
      +'<div style="display:flex;gap:8px">'
        +'<select class="form-input" id="readMonth" style="width:150px" onchange="changeReadingMonth()">'+monthOpts+'</select>'
        +'<select class="form-input" id="readYear" style="width:100px" onchange="changeReadingMonth()">'+yearOpts+'</select>'
      +'</div></div>'
    +'</div>'
    +'<div class="card" style="margin-bottom:16px"><div class="card-title">💰 ค่าเช่าห้อง / เดือน และค่ามัดจำ</div>'
    +'<div class="form-row"><div class="form-group"><label class="form-label">ค่าเช่าห้อง (บาท ต่อเดือน ใช้กับทุกห้อง)</label>'
      +'<input class="form-input" type="number" id="setRent" value="'+DB.rates.rent+'"></div>'
    +'<div class="form-group"><label class="form-label">ค่ามัดจำมาตรฐาน (บาท ใช้เป็นค่าเริ่มต้นตอนเพิ่มผู้เช่าใหม่ แก้ไขได้ทีละคน)</label>'
      +'<input class="form-input" type="number" id="setDeposit" value="'+(DB.rates.deposit||3000)+'"></div></div>'
    +'<button class="btn btn-sky btn-sm" onclick="saveRates()">บันทึกค่าเช่า/ค่ามัดจำ</button></div>'
    +'<div class="form-group" style="max-width:320px"><label class="form-label">เลือกห้องที่จะกรอกข้อมูล</label><select class="form-input" id="readingRoomSelect" onchange="selectReadingRoom()">'+roomOpts+'</select></div>'
    +'<div style="font-size:16px;color:var(--text-light);margin:-8px 0 16px">✅ = บันทึกแล้วสำหรับเดือนนี้ &nbsp; ⏳ = ยังไม่ได้บันทึก</div>'
    +'<div id="roomReadingFormArea"></div>'
    +'</div>';
  window._occupiedRoomsList=occupied;
  if(window._readingRoom && occupied.some(function(r){ return r.id===window._readingRoom; })){
    renderRoomReadingForm(window._readingRoom);
  }
};
window.changeReadingMonth=function(){
  window._readMonth=parseInt(document.getElementById('readMonth').value);
  window._readYear=parseInt(document.getElementById('readYear').value);
  showPage('room-readings');
};
window.selectReadingRoom=function(){
  var roomId=document.getElementById('readingRoomSelect').value;
  window._readingRoom=roomId||null;
  if(roomId) renderRoomReadingForm(roomId);
  else document.getElementById('roomReadingFormArea').innerHTML='';
};
var _rrCalcSrc={};
// round2/fmtUnit ย้ายไปไว้ที่ 00-core.js แล้ว (ใช้ร่วมกันหลายไฟล์ ทั้งบิล/ใบเสร็จ/หน้าบันทึกมิเตอร์)
function renderRoomReadingForm(roomId){
  var curM=window._readMonth||currentBuddhistMonth(), curY=window._readYear||currentBuddhistYear();
  var prevM=curM===1?12:curM-1, prevY=curM===1?curY-1:curY;
  var rd=DB.roomReadings.find(function(x){ return x.room===roomId&&x.month===curM&&x.year===curY; });
  var prevRd=DB.roomReadings.find(function(x){ return x.room===roomId&&x.month===prevM&&x.year===prevY; });
  var pw = rd?rd.prevWater:(prevRd?prevRd.curWater:0);
  var cw = rd?rd.curWater:(prevRd?prevRd.curWater:0);
  var pe = rd?rd.prevElec:(prevRd?prevRd.curElec:0);
  var ce = rd?rd.curElec:(prevRd?prevRd.curElec:0);
  var bill=DB.bills.find(function(b){ return b.room===roomId&&b.month===curM&&b.year===curY; });
  var wc=(bill&&bill.water_cost)||0;
  var ec=(bill&&bill.elec_cost)||0;
  var wUnits=round2(Math.max(0,cw-pw)), eUnits=round2(Math.max(0,ce-pe));
  var wRate=wUnits>0?round2(wc/wUnits):'';
  var eRate=eUnits>0?round2(ec/eUnits):'';
  _rrCalcSrc[roomId]={water:'cost',elec:'cost'};
  var total=DB.rates.rent+wc+ec;
  var autoNote=prevRd?' title="ดึงจากเดือนที่แล้วอัตโนมัติ"':'';
  var area=document.getElementById('roomReadingFormArea');
  area.innerHTML='<div style="border:1px solid var(--border);border-radius:12px;padding:18px">'
    +'<div style="font-weight:700;font-size:16px;margin-bottom:14px">ห้อง '+roomId+' — '+thMonthFull(curM)+' '+curY+'</div>'
    +'<div class="alert alert-info" style="margin-bottom:14px;font-size:16px">💡 ช่อง "เก่า" ดึงจากค่า "ใหม่" ของเดือนที่แล้วให้อัตโนมัติถ้ามีข้อมูล (แก้ไขเองได้) '
      +'กรอก "ค่าต่อหน่วย" แล้วระบบคำนวณยอดรวมให้ หรือกรอก "ยอดรวม" โดยตรงแล้วระบบคำนวณค่าต่อหน่วยย้อนกลับให้</div>'
    +'<div class="form-row"><div class="form-group"><label class="form-label">💧 น้ำ-เก่า</label><input class="form-input" type="number" id="pw_'+roomId+'" value="'+pw+'"'+autoNote+' oninput="calcRow(\''+roomId+'\')"></div>'
    +'<div class="form-group"><label class="form-label">💧 น้ำ-ใหม่</label><input class="form-input" type="number" id="cw_'+roomId+'" value="'+cw+'" oninput="calcRow(\''+roomId+'\')"></div></div>'
    +'<div class="form-row-3"><div class="form-group"><label class="form-label">หน่วยน้ำที่ใช้</label><div id="wu_'+roomId+'" style="font-weight:700;color:var(--sky);padding:10px 0">'+fmtUnit(wUnits)+' หน่วย</div></div>'
    +'<div class="form-group"><label class="form-label">ค่าน้ำต่อหน่วย (บาท/หน่วย)</label><input class="form-input" type="number" step="0.01" id="wpu_'+roomId+'" value="'+wRate+'" placeholder="บาท/หน่วย" oninput="onWaterPerUnitInput(\''+roomId+'\')"></div>'
    +'<div class="form-group"><label class="form-label">ค่าน้ำรวม (บาท)</label><input class="form-input" type="number" id="wc_'+roomId+'" value="'+wc+'" placeholder="บาท" oninput="onWaterTotalInput(\''+roomId+'\')"></div></div>'
    +'<div class="divider"></div>'
    +'<div class="form-row"><div class="form-group"><label class="form-label">⚡ ไฟ-เก่า</label><input class="form-input" type="number" id="pe_'+roomId+'" value="'+pe+'"'+autoNote+' oninput="calcRow(\''+roomId+'\')"></div>'
    +'<div class="form-group"><label class="form-label">⚡ ไฟ-ใหม่</label><input class="form-input" type="number" id="ce_'+roomId+'" value="'+ce+'" oninput="calcRow(\''+roomId+'\')"></div></div>'
    +'<div class="form-row-3"><div class="form-group"><label class="form-label">หน่วยไฟที่ใช้</label><div id="eu_'+roomId+'" style="font-weight:700;color:var(--warning);padding:10px 0">'+fmtUnit(eUnits)+' หน่วย</div></div>'
    +'<div class="form-group"><label class="form-label">ค่าไฟต่อหน่วย (บาท/หน่วย)</label><input class="form-input" type="number" step="0.01" id="epu_'+roomId+'" value="'+eRate+'" placeholder="บาท/หน่วย" oninput="onElecPerUnitInput(\''+roomId+'\')"></div>'
    +'<div class="form-group"><label class="form-label">ค่าไฟรวม (บาท)</label><input class="form-input" type="number" id="ec_'+roomId+'" value="'+ec+'" placeholder="บาท" oninput="onElecTotalInput(\''+roomId+'\')"></div></div>'
    +'<div class="divider"></div>'
    +'<div class="flex-between" style="margin-bottom:16px"><span style="font-weight:600">รวมทั้งหมด (ค่าเช่า+น้ำ+ไฟ)</span><span id="tt_'+roomId+'" style="font-size:20px;font-weight:700;color:var(--sun-dark)">'+fmtMoney(total)+' ฿</span></div>'
    +'<button class="btn btn-primary" style="width:100%" onclick="saveRoomReading(\''+roomId+'\')">💾 บันทึกห้องนี้</button>'
    +'</div>';
}
function recalcWaterFromUnits(roomId,units){
  var src=(_rrCalcSrc[roomId]&&_rrCalcSrc[roomId].water)||'cost';
  var wpu=document.getElementById('wpu_'+roomId), wc=document.getElementById('wc_'+roomId);
  if(src==='perunit'){
    var rate=parseFloat(wpu.value)||0;
    wc.value=round2(rate*units);
  } else {
    var total=parseFloat(wc.value)||0;
    wpu.value=units>0?round2(total/units):'';
  }
}
function recalcElecFromUnits(roomId,units){
  var src=(_rrCalcSrc[roomId]&&_rrCalcSrc[roomId].elec)||'cost';
  var epu=document.getElementById('epu_'+roomId), ec=document.getElementById('ec_'+roomId);
  if(src==='perunit'){
    var rate=parseFloat(epu.value)||0;
    ec.value=round2(rate*units);
  } else {
    var total=parseFloat(ec.value)||0;
    epu.value=units>0?round2(total/units):'';
  }
}
window.onWaterPerUnitInput=function(roomId){
  if(!_rrCalcSrc[roomId]) _rrCalcSrc[roomId]={water:'cost',elec:'cost'};
  _rrCalcSrc[roomId].water='perunit';
  calcRow(roomId);
};
window.onWaterTotalInput=function(roomId){
  if(!_rrCalcSrc[roomId]) _rrCalcSrc[roomId]={water:'cost',elec:'cost'};
  _rrCalcSrc[roomId].water='cost';
  calcRow(roomId);
};
window.onElecPerUnitInput=function(roomId){
  if(!_rrCalcSrc[roomId]) _rrCalcSrc[roomId]={water:'cost',elec:'cost'};
  _rrCalcSrc[roomId].elec='perunit';
  calcRow(roomId);
};
window.onElecTotalInput=function(roomId){
  if(!_rrCalcSrc[roomId]) _rrCalcSrc[roomId]={water:'cost',elec:'cost'};
  _rrCalcSrc[roomId].elec='cost';
  calcRow(roomId);
};
window.calcRow=function(roomId){
  var pw=parseFloat(document.getElementById('pw_'+roomId).value)||0;
  var cw=parseFloat(document.getElementById('cw_'+roomId).value)||0;
  var pe=parseFloat(document.getElementById('pe_'+roomId).value)||0;
  var ce=parseFloat(document.getElementById('ce_'+roomId).value)||0;
  var cwInput=document.getElementById('cw_'+roomId), ceInput=document.getElementById('ce_'+roomId);
  var waterInvalid=cw<pw, elecInvalid=ce<pe;
  cwInput.style.borderColor=waterInvalid?'var(--danger)':'';
  ceInput.style.borderColor=elecInvalid?'var(--danger)':'';
  var wUnits=round2(Math.max(0,cw-pw)), eUnits=round2(Math.max(0,ce-pe));
  document.getElementById('wu_'+roomId).innerHTML=waterInvalid
    ?'<span style="color:var(--danger);font-size:16px">⚠️ ค่าน้ำใหม่ต้องไม่น้อยกว่าค่าเก่า</span>'
    :fmtUnit(wUnits)+' หน่วย';
  document.getElementById('eu_'+roomId).innerHTML=elecInvalid
    ?'<span style="color:var(--danger);font-size:16px">⚠️ ค่าไฟใหม่ต้องไม่น้อยกว่าค่าเก่า</span>'
    :fmtUnit(eUnits)+' หน่วย';
  if(!waterInvalid) recalcWaterFromUnits(roomId,wUnits);
  if(!elecInvalid) recalcElecFromUnits(roomId,eUnits);
  var wc=parseFloat(document.getElementById('wc_'+roomId).value)||0;
  var ec=parseFloat(document.getElementById('ec_'+roomId).value)||0;
  var total=DB.rates.rent+wc+ec;
  document.getElementById('tt_'+roomId).textContent=fmtMoney(total)+' ฿';
};
window.saveRoomReading=function(roomId){
  var m=window._readMonth||currentBuddhistMonth(), y=window._readYear||currentBuddhistYear();
  var pw=parseFloat(document.getElementById('pw_'+roomId).value)||0;
  var cw=parseFloat(document.getElementById('cw_'+roomId).value)||0;
  var pe=parseFloat(document.getElementById('pe_'+roomId).value)||0;
  var ce=parseFloat(document.getElementById('ce_'+roomId).value)||0;
  if(cw<pw){ showToast('ค่าน้ำใหม่ต้องไม่น้อยกว่าค่าเก่า','error'); return; }
  if(ce<pe){ showToast('ค่าไฟใหม่ต้องไม่น้อยกว่าค่าเก่า','error'); return; }
  var wu=round2(Math.max(0,cw-pw)), eu=round2(Math.max(0,ce-pe));
  var wc=parseFloat(document.getElementById('wc_'+roomId).value)||0;
  var ec=parseFloat(document.getElementById('ec_'+roomId).value)||0;
  var rd=DB.roomReadings.find(function(x){ return x.room===roomId&&x.month===m&&x.year===y; });
  if(!rd) DB.roomReadings.push({room:roomId,month:m,year:y,prevWater:pw,curWater:cw,prevElec:pe,curElec:ce});
  else{ rd.prevWater=pw;rd.curWater=cw;rd.prevElec=pe;rd.curElec=ce; }
  var activeTenant=DB.users.find(function(u){ return u.role==='tenant'&&u.room===roomId&&u.is_active!==false; });
  var bill=DB.bills.find(function(b){ return b.room===roomId&&b.month===m&&b.year===y; });
  if(bill){ bill.water_unit=wu;bill.water_cost=wc;bill.elec_unit=eu;bill.elec_cost=ec;bill.total=bill.rent+wc+ec;if(activeTenant) bill.tenantUserId=activeTenant.id; }
  else DB.bills.push({id:createClientId('B'),room:roomId,month:m,year:y,rent:DB.rates.rent,water_unit:wu,water_cost:wc,elec_unit:eu,elec_cost:ec,total:DB.rates.rent+wc+ec,status:'unpaid',slip:null,tenantUserId:activeTenant?activeTenant.id:null,billDate:new Date().toISOString().slice(0,10)});
  showToast('บันทึกห้อง '+roomId+' เรียบร้อย');
  showPage('room-readings');
};

