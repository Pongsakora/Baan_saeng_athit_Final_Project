// ============================================================
// 01-tenant.js
// หน้าจอฝั่งผู้เช่า: ประวัติการชำระเงิน, ชำระเงิน (สแกน QR + แนบสลิป),
// แจ้งเหตุ, ขอออกจากหอพัก
// ============================================================

// ---- TENANT: ประวัติการชำระเงิน ----
pageRenderers['my-bills']=function(el){
  var myBills=DB.bills.filter(function(b){ return b.room===currentUser.room; })
    .sort(function(a,b){ return (b.year-a.year)||(b.month-a.month); });
  var filterStatus='all', filterMonth='all';
  function render(){
    var bills=myBills.slice();
    if(filterStatus!=='all') bills=bills.filter(function(b){ return b.status===filterStatus; });
    if(filterMonth!=='all') bills=bills.filter(function(b){ return b.month===parseInt(filterMonth); });
    var rows='';
    if(bills.length===0) rows='<tr><td colspan="7" style="text-align:center;color:var(--text-light)">ไม่พบข้อมูล</td></tr>';
    else bills.forEach(function(b){
      // บิลที่จ่ายแล้วแต่สลิปยังรอแอดมินตรวจสอบ ห้ามดู/พิมพ์ใบเสร็จก่อน กันผู้เช่าเข้าใจผิดว่าชำระเสร็จสมบูรณ์แล้ว
      // บิลที่ยังค้างชำระ (unpaid) ก็ห้ามดู/พิมพ์เช่นกัน ต้องชำระและให้แอดมินตรวจสลิปผ่านก่อน
      var slipPending=b.status==='paid'&&b.slip_status==='pending';
      var isUnpaid=b.status==='unpaid';
      var disabledAttr=slipPending?' disabled title="รอแอดมินตรวจสอบสลิปก่อน จึงจะดู/พิมพ์ได้"'
        :(isUnpaid?' disabled title="ชำระเงินก่อน จึงจะดูรายละเอียดได้"':'');
      var viewBtn=(slipPending||isUnpaid)
        ?'<button class="btn btn-outline btn-sm"'+disabledAttr+'>ดูรายละเอียด</button>'
        :'<button class="btn btn-outline btn-sm" onclick="viewBillDetail(\''+b.id+'\')">ดูรายละเอียด</button>';
      rows+='<tr><td>'+thMonthFull(b.month)+' '+b.year+'</td>'
        +'<td>'+fmtMoney(b.rent)+' ฿</td>'
        +'<td>'+fmtUnit(b.water_unit)+' หน่วย ('+fmtMoney(b.water_cost)+' ฿)</td>'
        +'<td>'+fmtUnit(b.elec_unit)+' หน่วย ('+fmtMoney(b.elec_cost)+' ฿)</td>'
        +'<td><strong>'+fmtMoney(b.total)+' ฿</strong></td>'
        +'<td>'+billStatusBadge(b)+'</td>'
        +'<td><div style="display:flex;gap:6px;flex-wrap:wrap">'+viewBtn+'</div></td></tr>';
    });
    var months='';
    for(var m=1;m<=12;m++) months+='<option value="'+m+'">'+thMonthFull(m)+'</option>';
    el.innerHTML=pageHeader('🧾 ประวัติการชำระเงิน',{subtitle:'ห้อง '+currentUser.room})
      +'<div class="card"><div class="flex gap-10 mb-16">'
      +'<select class="form-input" style="width:150px" id="fStatus" onchange="reRenderBills()">'
      +'<option value="all">ทุกสถานะ</option><option value="unpaid">ค้างชำระ</option><option value="paid">ชำระแล้ว</option></select>'
      +'<select class="form-input" style="width:150px" id="fMonth" onchange="reRenderBills()"><option value="all">ทุกเดือน</option>'+months+'</select>'
      +'</div><div class="table-wrap"><table><thead><tr><th>เดือน</th><th>ค่าหอพัก</th><th>ค่าน้ำ</th><th>ค่าไฟ</th><th>รวม</th><th>สถานะ</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    var fSel=document.getElementById('fStatus'); if(fSel) fSel.value=filterStatus;
    var mSel=document.getElementById('fMonth'); if(mSel) mSel.value=filterMonth;
  }
  window.reRenderBills=function(){
    var fSel=document.getElementById('fStatus'); if(fSel) filterStatus=fSel.value;
    var mSel=document.getElementById('fMonth'); if(mSel) filterMonth=mSel.value;
    render();
  };
  render();
};
function buildBillSlipHTML(b){
  var waterRate=(Number(b.water_unit)>0)?(Number(b.water_cost)/Number(b.water_unit)):Number(DB.rates.water_unit||0);
  var elecRate=(Number(b.elec_unit)>0)?(Number(b.elec_cost)/Number(b.elec_unit)):Number(DB.rates.electric_unit||0);
  var fmtRate=function(n){
    var v=Number(n)||0;
    if(Math.abs(v-Math.round(v))<0.0001) return fmtMoney(v);
    return v.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  var rd=DB.roomReadings.find(function(x){ return x.room===b.room&&x.month===b.month&&x.year===b.year; });
  var waterDetail=(rd?('หน่วยน้ำเก่า '+rd.prevWater+' → ใหม่ '+rd.curWater+' = '):'')+fmtUnit(b.water_unit)+' หน่วย × '+fmtRate(waterRate)+' บาท/หน่วย';
  var elecDetail=(rd?('หน่วยไฟเก่า '+rd.prevElec+' → ใหม่ '+rd.curElec+' = '):'')+fmtUnit(b.elec_unit)+' หน่วย × '+fmtRate(elecRate)+' บาท/หน่วย';
  var today=new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  var receiptNo=(b.status==='paid'?'RC-':'IV-')+String(b.id).slice(-6).toUpperCase();
  return '<div class="slip-preview">'
    +'<div class="slip-header"><div style="font-size:32px">☀️</div>'
    +'<div style="font-family:Prompt,sans-serif;font-size:20px;font-weight:700">บ้านแสงอาทิตย์</div>'
    +'<div style="font-size:15px;opacity:0.75">'+(b.status==='paid'?'ใบเสร็จ':'ใบแจ้งหนี้')+'</div>'
    +'<div style="font-size:16px;opacity:0.6;margin-top:4px">เลขที่ '+receiptNo+'</div></div>'
    +'<div class="slip-row"><span>ผู้เช่า:</span><strong>'+escapeHtml(currentUser.name)+'</strong></div>'
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
}
window.viewBillDetail=function(id){
  var b=DB.bills.find(function(x){ return x.id===id; });
  if(!b) return;
  if(b.status==='paid'&&b.slip_status==='pending'){
    showToast('บิลนี้รอแอดมินตรวจสอบสลิปอยู่ ยังดูรายละเอียดไม่ได้','error');
    return;
  }
  if(b.status==='unpaid'){
    showToast('บิลนี้ยังค้างชำระ ชำระเงินก่อนจึงจะดูรายละเอียดได้','error');
    return;
  }
  // รวมปุ่ม "ดูรายละเอียด" กับ "พิมพ์" เป็นปุ่มเดียว — เปิดดูรายละเอียดบิลแล้วมีปุ่มพิมพ์ให้กดต่อในหน้าต่างเดียวกันเลย
  openModal('รายละเอียดบิล '+thMonthFull(b.month)+' '+b.year, buildBillSlipHTML(b),
    '<button class="btn btn-primary" onclick="printHtml(document.getElementById(\'modalBody\').innerHTML)">🖨️ พิมพ์</button><button class="btn btn-outline" onclick="closeModal()">ปิด</button>');
};

// ---- TENANT: ชำระเงิน ----
pageRenderers['payment']=function(el){
  var unpaid=DB.bills
    .filter(function(b){ return b.room===currentUser.room&&b.status==='unpaid'; })
    .sort(function(a,b){ return (a.year-b.year)||(a.month-b.month); });
  var rows='';
  unpaid.forEach(function(b){
    var billTotal=Number(b.total)||0;
    var disabledAttr=billTotal>0?'':' disabled';
    var rowOpacity=billTotal>0?'':'opacity:0.55;';
    var noteHtml=billTotal>0?'':'<div style="font-size:16px;color:var(--danger);margin-top:4px">ยอดบิลเป็น 0 บาท (ยังไม่พร้อมชำระ)</div>';
    // แจ้งเตือนชัดเจนถ้าสลิปที่เคยส่งไปของบิลนี้ถูกแอดมินปฏิเสธ ต้องแนบสลิปใหม่
    var rejectedHtml=b.slip_status==='rejected'
      ?'<div style="font-size:16px;color:var(--danger);font-weight:700;margin-top:4px">❌ สลิปที่ส่งไปก่อนหน้านี้ถูกปฏิเสธ กรุณาชำระและแนบสลิปใหม่อีกครั้ง</div>'
      :'';
    rows+='<label style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid '+(b.slip_status==='rejected'?'var(--danger)':'var(--border)')+';border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all 0.2s" id="billrow_'+b.id+'">'
      +'<input type="checkbox" value="'+b.id+'" onchange="updatePayTotal()" style="width:18px;height:18px;cursor:pointer"'+disabledAttr+'>'
      +'<div style="flex:1;'+rowOpacity+'">'
      +'<div style="font-weight:700;color:var(--sky)">'+thMonthFull(b.month)+' '+b.year+'</div>'
      +'<div style="font-size:16px;color:var(--text-light)">ค่าห้อง '+fmtMoney(b.rent)+' + ค่าน้ำ '+fmtMoney(b.water_cost)+' + ค่าไฟ '+fmtMoney(b.elec_cost)+'</div>'
      +rejectedHtml
      +billCountdownHtml(b)
      +noteHtml
      +'</div>'
      +'<div style="font-family:Prompt,sans-serif;font-size:16px;font-weight:700;color:var(--sky);'+rowOpacity+'">'+fmtMoney(b.total)+' ฿</div>'
      +'</label>';
  });
  el.innerHTML=pageHeader('ชำระเงิน PromptPay')
    +'<div class="card"><div class="card-title">เลือกรายการบิลที่ต้องการชำระ</div>'
    +(rows||'<div class="alert alert-success">ไม่มียอดค้างชำระ</div>')
    +'<div id="paymentSummaryBox" style="display:none;margin-top:12px;background:#F0FFF4;border-radius:10px;padding:12px"></div>'
    +'</div>'
    +'<div class="card"><div class="card-title">สแกน QR แล้วแนบสลิป</div><div id="paymentIntentArea"><div style="color:var(--text-light);font-size:16px">เลือกบิล แล้วกด "จ่ายเงิน"</div></div></div>';
  window.updatePayTotal();
  window.loadActivePaymentIntent();
};
window.getSelectedPaymentBills=function(){
  var selected=[];
  var checkboxes=document.querySelectorAll('#page-payment input[type="checkbox"]');
  checkboxes.forEach(function(c){
    var row=document.getElementById('billrow_'+c.value);
    if(row) row.style.borderColor=c.checked?'var(--sun)':'var(--border)';
    if(c.checked){
      var bill=DB.bills.find(function(x){ return x.id===c.value; });
      if(bill) selected.push(bill);
    }
  });
  selected=selected.filter(function(b){ return (Number(b.total)||0)>0; });
  return selected;
};
window.updatePayTotal=function(){
  var box=document.getElementById('paymentSummaryBox');
  if(!box) return;
  var selected=window.getSelectedPaymentBills();
  if(selected.length===0){
    box.style.display='none';
    box.innerHTML='';
    return;
  }
  var total=selected.reduce(function(sum,b){ return sum+b.total; },0);
  box.style.display='block';
  box.innerHTML='<div class="flex-between" style="align-items:flex-start;gap:10px;flex-wrap:wrap">'
    +'<div><div style="font-size:16px;color:var(--text-light)">บิลที่เลือก</div><div style="font-weight:700">'+selected.length+' รายการ</div></div>'
    +'<div><div style="font-size:16px;color:var(--text-light)">ยอดรวม</div><div style="font-family:Prompt,sans-serif;font-size:22px;font-weight:700;color:var(--sky)">'+fmtMoney(total)+' ฿</div></div>'
    +'</div>'
    +'<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'
    +'<button class="btn btn-outline btn-sm" onclick="selectAllBills()">เลือกทั้งหมด</button>'
    +'<button class="btn btn-primary btn-sm" onclick="createPaymentIntent()">จ่ายเงิน</button>'
    +'</div>';
};
window.selectAllBills=function(){
  var checkboxes=document.querySelectorAll('#page-payment input[type="checkbox"]');
  checkboxes.forEach(function(c){ c.checked=true; });
  window.updatePayTotal();
};
window.copyActivePromptPay=function(){
  var value=window._activePromptPayNumber||'';
  if(!value) return;
  navigator.clipboard.writeText(value).then(function(){ showToast('คัดลอกพร้อมเพย์แล้ว'); });
};
window.renderPaymentIntentCard=function(intent){
  var area=document.getElementById('paymentIntentArea');
  if(!area||!intent) return;
  window._activePromptPayNumber=intent.promptpay||DB.bankAccount.promptpay||'';
  area.innerHTML='<div class="qr-box">'
    +'<div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">'
    +'<div style="background:white;width:190px;height:190px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:2px solid var(--border);margin:0 auto">'
    +(intent.qr_image_data_url?'<img src="'+intent.qr_image_data_url+'" style="width:176px;height:176px;object-fit:contain">':'<span style="color:var(--text-light);font-size:16px">ไม่พบ QR</span>')
    +'</div>'
    +'<div style="font-size:16px;color:var(--text-light);margin-top:2px">ยอดชำระ</div>'
    +'<div style="font-family:Prompt,sans-serif;font-size:28px;font-weight:700;color:var(--sky);line-height:1.1">'+fmtMoney(intent.amount)+' ฿</div>'
    +'<div style="margin-top:6px"><button class="btn btn-outline btn-sm" onclick="copyActivePromptPay()">คัดลอกพร้อมเพย์</button></div>'
    +'</div>'
    +(intent.status!=='paid'?(
      '<div style="margin-top:14px;border-top:1px dashed var(--border);padding-top:14px">'
      +'<div style="font-size:16px;font-weight:700;margin-bottom:8px">📤 แนบสลิปการโอนเงิน</div>'
      +'<div style="font-size:16px;color:var(--text-light);margin-bottom:8px">สแกน QR ด้านบนเพื่อโอนเงิน แล้วเลือกรูปสลิป '
        +'แล้วกดปุ่ม "ส่งสลิปเพื่อตรวจสอบ" ด้านล่าง</div>'
      +'<input type="file" accept="image/*" capture="environment" id="slipFileInput" class="form-input" style="margin-bottom:8px" onchange="onSlipFileSelected(this,\''+intent.id+'\')">'
      +'<div id="slipPreviewArea" style="margin-bottom:8px"></div>'
      +'<button class="btn btn-primary btn-sm" style="width:100%" id="slipUploadBtn" onclick="uploadPaymentSlip(\''+intent.id+'\')">ส่งสลิปเพื่อตรวจสอบ</button>'
      +'<div id="slipUploadStatus" style="font-size:16px;color:var(--text-light);margin-top:6px"></div>'
      +'</div>'
    ):'')
    +'</div>';
  window._activePaymentIntentId=intent.id;
};
window.createPaymentIntent=async function(){
  var selected=window.getSelectedPaymentBills();
  if(selected.length===0){
    showToast('ยังไม่มีบิลที่มียอดชำระมากกว่า 0 บาท','error');
    return;
  }
  try{
    var payload=await requestJSON('/api/payments/intents',{
      method:'POST',
      body:JSON.stringify({
        room:currentUser.room,
        billIds:selected.map(function(b){ return b.id; })
      })
    });
    if(!payload||!payload.intent) throw new Error('create_intent_failed');
    window.renderPaymentIntentCard(payload.intent);
    showToast('สร้างรายการจ่ายเงินเรียบร้อย กรุณาชำระเงินแล้วแนบสลิป');
  }catch(err){
    showToast(err.message||'สร้างรายการชำระเงินไม่สำเร็จ','error');
  }
};
window.loadActivePaymentIntent=async function(){
  try{
    var payload=await requestJSON('/api/payments/intents/active?room='+encodeURIComponent(currentUser.room));
    if(payload&&payload.intent){
      window.renderPaymentIntentCard(payload.intent);
    }
  }catch(_err){}
};

function resizeImageFileToDataUrl(file, maxDim, quality){
  return new Promise(function(resolve,reject){
    var settled=false;
    var timer=setTimeout(function(){
      if(!settled){ settled=true; reject(new Error('decode_failed')); }
    },15000);
    function done(fn,arg){
      if(settled) return;
      settled=true;
      clearTimeout(timer);
      fn(arg);
    }
    var img=new Image();
    var reader=new FileReader();
    reader.onerror=function(){ done(reject,new Error('read_failed')); };
    reader.onload=function(){
      img.onerror=function(){ done(reject,new Error('decode_failed')); };
      img.onload=function(){
        var scale=Math.min(1, maxDim/Math.max(img.width,img.height));
        var w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        var canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        done(resolve,canvas.toDataURL('image/jpeg',quality));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
window.onSlipFileSelected=function(inputEl,intentId){
  var previewArea=document.getElementById('slipPreviewArea');
  var statusEl=document.getElementById('slipUploadStatus');
  if(!inputEl||!inputEl.files||!inputEl.files[0]){
    window._pendingSlipFile=null;
    if(previewArea) previewArea.innerHTML='';
    return;
  }
  var file=inputEl.files[0];
  window._pendingSlipFile=file;
  // โชว์รูปตัวอย่างทันทีให้เห็นว่าเลือกไฟล์สำเร็จแล้ว
  var reader=new FileReader();
  reader.onload=function(){
    if(previewArea){
      previewArea.innerHTML='<div style="text-align:center"><img src="'+reader.result+'" style="max-width:160px;max-height:160px;border-radius:8px;border:1px solid var(--border)"></div>'
        +'<div style="font-size:16px;color:var(--text-mid);text-align:center;margin-top:4px">✅ เลือกไฟล์แล้ว: '+escapeHtml(file.name)+' — กดปุ่ม "ส่งสลิปเพื่อตรวจสอบ" ด้านล่าง</div>';
    }
  };
  reader.readAsDataURL(file);
  if(statusEl) statusEl.textContent='';
};
window.uploadPaymentSlip=async function(intentId){
  var btn=document.getElementById('slipUploadBtn');
  var statusEl=document.getElementById('slipUploadStatus');
  var input=document.getElementById('slipFileInput');
  // ใช้ไฟล์ที่เก็บไว้ตอนเลือกก่อน (กันปัญหา element เดิมถูกแทนที่แล้วหาไฟล์ไม่เจอ)
  var file=window._pendingSlipFile||(input&&input.files&&input.files[0]);
  if(!file){
    showToast('กรุณาเลือกรูปสลิปก่อน','error');
    return;
  }
  btn.disabled=true;
  btn.textContent='กำลังส่งสลิป...';
  if(statusEl) statusEl.textContent='';
  try{
    var dataUrl=await resizeImageFileToDataUrl(file,1400,0.82);
    var result=await requestJSON('/api/payments/intents/'+encodeURIComponent(intentId)+'/verify-slip',{
      method:'POST',
      body:JSON.stringify({ imageBase64:dataUrl })
    });
    window._pendingSlipFile=null;
    if(result.already_paid){
      showToast('รายการนี้ชำระเงินเรียบร้อยแล้ว');
    }else{
      showToast('ส่งสลิปแล้ว รอแอดมินตรวจสอบ');
    }
    await loadDBFromServer();
    if(document.getElementById('page-payment')) showPage('my-bills');
  }catch(err){
    var errMap={
      invalid_image:'ไฟล์ที่เลือกไม่ใช่รูปภาพที่รองรับ (jpg/png/webp)',
      image_too_large:'ไฟล์รูปใหญ่เกินไป กรุณาเลือกรูปอื่น',
      intent_not_pending:'รายการนี้ไม่ได้อยู่ในสถานะรอชำระแล้ว',
      forbidden:'ไม่มีสิทธิ์แนบสลิปให้รายการนี้',
      read_failed:'อ่านไฟล์รูปไม่ได้ กรุณาลองเลือกรูปใหม่อีกครั้ง',
      decode_failed:'เปิดไฟล์รูปนี้ไม่ได้ (ถ้าถ่ายจาก iPhone ลองแคปหน้าจอสลิปแทน หรือเลือกไฟล์ .jpg/.png)'
    };
    showToast(errMap[err.message]||err.message||'ส่งสลิปไม่สำเร็จ กรุณาลองใหม่','error');
    btn.disabled=false;
    btn.textContent='ส่งสลิปเพื่อตรวจสอบ';
  }
};

// ---- TENANT: แจ้งเหตุ ----
pageRenderers['report']=function(el){
  var myReports=DB.reports.filter(function(r){ return r.room===currentUser.room; }).slice().reverse();
  var activeReports=myReports.filter(function(r){ return r.status!=='done'; });
  var doneReports=myReports.filter(function(r){ return r.status==='done'; });
  function buildChatBubbles(msgs){ return buildChatBubblesHTML(msgs,'tenant'); }
  var activeHtml='';
  activeReports.forEach(function(r){
    var msgs=DB.chatMessages[r.id]||[];
    // สถานะ 'received' (รับเรื่องแล้ว) เปลี่ยนกรอบ/หัวการ์ดเป็นสีฟ้าแทนสีส้ม เพื่อให้เห็นชัดว่าแอดมินรับเรื่องแล้ว
    var isReceived=r.status==='received';
    var cardBorderColor=isReceived?'var(--sea-light)':'var(--sun)';
    var cardHeaderBg=isReceived?'linear-gradient(135deg,var(--sea-mid),var(--sea))':'linear-gradient(135deg,var(--sun),var(--sun-dark))';
    activeHtml+='<div style="border:2px solid '+cardBorderColor+';border-radius:14px;overflow:hidden;margin-bottom:16px">'
      +'<div style="background:'+cardHeaderBg+';padding:10px 16px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="font-size:18px"><strong style="color:white">'+reportTypeTh(r.type)+'</strong> <span style="font-size:15px;color:rgba(255,255,255,0.8)">'+escapeHtml(r.date)+'</span></div>'
      +statusBadge(r.status)+'</div>'
      +'<div style="padding:12px 16px;background:white">'
      +'<div style="font-size:16px;color:var(--text-mid);margin-bottom:10px;padding:8px;background:#F7F3E8;border-radius:8px">'+escapeHtml(r.detail)+'</div>'
      +(r.media?'<div style="margin-bottom:10px;text-align:center"><img src="'+r.media+'" style="max-width:100%;max-height:220px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)" onclick="viewImageFull(this.src)"></div>':'')
      +'<div style="font-size:16px;font-weight:700;color:var(--sky);margin-bottom:8px">💬 แชทกับเจ้าของหอพัก</div>'
      +'<div id="chat_'+r.id+'" style="background:#F0EBE0;border-radius:10px;padding:12px;min-height:100px;max-height:280px;overflow-y:auto;margin-bottom:8px">'+buildChatBubbles(msgs)+'</div>'
      +'<div style="display:flex;gap:8px">'
      +'<input class="form-input" id="chatInput_'+r.id+'" placeholder="พิมพ์ข้อความ..." style="padding:10px 14px;font-size:16px" onkeypress="if(event.key===\'Enter\') sendTenantChat(\''+r.id+'\')">'
      +'<button class="btn btn-primary btn-sm" onclick="sendTenantChat(\''+r.id+'\')">ส่ง</button>'
      +'</div></div></div>';
  });
  if(!activeHtml) activeHtml='<div class="alert alert-success">✅ ไม่มีเรื่องแจ้งที่รอดำเนินการ</div>';
  var histHtml='';
  doneReports.forEach(function(r){
    histHtml+='<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px;background:#F9FBF7">'
      +'<div class="flex-between"><div style="font-size:18px"><strong>'+reportTypeTh(r.type)+'</strong> <span style="font-size:15px;color:var(--text-light)">'+escapeHtml(r.date)+'</span></div>'+statusBadge(r.status)+'</div>'
      +'<div style="margin-top:6px;font-size:16px;color:var(--text-mid)">'+escapeHtml(r.detail)+'</div>'
      +(r.media?'<div style="margin-top:8px;text-align:center"><img src="'+r.media+'" style="max-width:100%;max-height:200px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border)" onclick="viewImageFull(this.src)"></div>':'')
      +responseBox(r.response)
      +'</div>';
  });
  if(!histHtml) histHtml='<p style="color:var(--text-light);font-size:16px">ยังไม่มีเรื่องที่เสร็จสิ้น</p>';
  el.innerHTML=pageHeader('🔔 แจ้งเหตุ')
    +'<div class="card"><div class="card-title">📝 แจ้งเหตุใหม่</div>'
    +'<div class="form-group"><label class="form-label">ประเภทการแจ้ง</label>'
    +'<select class="form-input" id="reportType"><option value="repair">แจ้งซ่อมบำรุง</option><option value="complaint">แจ้งร้องเรียน</option><option value="other">แจ้งเรื่องอื่นๆ</option></select></div>'
    +'<div class="form-group"><label class="form-label">รายละเอียด</label><textarea class="form-input" id="reportDetail" placeholder="ระบุรายละเอียด..." oninput="toggleReportSubmitBtn()"></textarea></div>'
    +'<div class="form-group"><label class="form-label">แนบรูปภาพ (ถ้ามี)</label>'
      +'<input type="file" class="form-input" accept="image/*" id="reportPhotoInput" onchange="onReportPhotoSelected(this)">'
      +'<div id="reportPhotoPreview" style="margin-top:8px"></div></div>'
    +'<button class="btn btn-primary" id="reportSubmitBtn" onclick="submitReport()" disabled>ส่งเรื่อง</button></div>'
    +(activeReports.length>0?'<div class="card"><div class="card-title">🔄 เรื่องที่อยู่ระหว่างดำเนินการ</div>'+activeHtml+'</div>':'')
    +'<div class="card"><div class="card-title">✅ ประวัติที่เสร็จสิ้นแล้ว</div>'+histHtml+'</div>';
};
window.toggleReportSubmitBtn=function(){
  var detail=document.getElementById('reportDetail');
  var btn=document.getElementById('reportSubmitBtn');
  if(!detail||!btn) return;
  btn.disabled=detail.value.trim().length===0;
};
// เลือกไฟล์รูปแนบตอนแจ้งเหตุ (รับเฉพาะรูปภาพ ไม่รับวิดีโอแล้ว) — โชว์ตัวอย่างรูปทันทีเหมือนตอนแนบสลิป
window.onReportPhotoSelected=function(inputEl){
  var previewArea=document.getElementById('reportPhotoPreview');
  if(!inputEl||!inputEl.files||!inputEl.files[0]){
    window._pendingReportPhotoFile=null;
    if(previewArea) previewArea.innerHTML='';
    return;
  }
  var file=inputEl.files[0];
  window._pendingReportPhotoFile=file;
  var reader=new FileReader();
  reader.onload=function(){
    if(previewArea){
      previewArea.innerHTML='<div style="text-align:center"><img src="'+reader.result+'" style="max-width:160px;max-height:160px;border-radius:8px;border:1px solid var(--border)"></div>'
        +'<div style="font-size:16px;color:var(--text-mid);text-align:center;margin-top:4px">✅ เลือกรูปแล้ว: '+escapeHtml(file.name)+'</div>';
    }
  };
  reader.readAsDataURL(file);
};
window.submitReport=async function(){
  var type=document.getElementById('reportType').value;
  var detail=document.getElementById('reportDetail').value.trim();
  if(!detail){ showToast('กรุณาระบุรายละเอียด','error'); return; }
  var btn=document.getElementById('reportSubmitBtn');
  var media='';
  var photoFile=window._pendingReportPhotoFile;
  if(photoFile){
    try{
      if(btn){ btn.disabled=true; btn.textContent='กำลังแนบรูป...'; }
      media=await resizeImageFileToDataUrl(photoFile,1400,0.82);
    }catch(_err){
      showToast('แนบรูปไม่สำเร็จ (ไฟล์อาจเสียหรือไม่ใช่รูปภาพ) กรุณาลองใหม่','error');
      if(btn){ btn.disabled=false; btn.textContent='ส่งเรื่อง'; }
      return;
    }
  }
  var newId=createClientId('R');
  DB.reports.push({id:newId,room:currentUser.room,type:type,detail:detail,media:media,status:'pending',response:'',date:new Date().toLocaleDateString('th-TH'),tenantUserId:currentUser.id});
  DB.chatMessages[newId]=[];
  window._pendingReportPhotoFile=null;
  showToast('ส่งเรื่องแจ้งเรียบร้อย');
  showPage('report');
};
window.sendTenantChat=function(reportId){
  var inp=document.getElementById('chatInput_'+reportId);
  if(!inp||!inp.value.trim()) return;
  var msg=inp.value.trim(); inp.value='';
  if(!DB.chatMessages[reportId]) DB.chatMessages[reportId]=[];
  var now=new Date();
  var time=now.getDate()+'/'+(now.getMonth()+1)+' '+now.getHours()+':'+String(now.getMinutes()).padStart(2,'0');
  DB.chatMessages[reportId].push({from:'tenant',text:msg,time:time});
  var chatArea=document.getElementById('chat_'+reportId);
  if(chatArea){
    chatArea.innerHTML=buildChatBubblesHTML(DB.chatMessages[reportId],'tenant');
    chatArea.scrollTop=chatArea.scrollHeight;
  }
};

// ---- TENANT: ขอออกจากหอพัก ----
pageRenderers['checkout']=function(el){
  var myCheckout=DB.checkouts.find(function(c){ return c.room===currentUser.room; });
  if(myCheckout){
    var rb=myCheckout.refundType==='bank'?'โอนธนาคาร ('+escapeHtml(myCheckout.bank)+' '+escapeHtml(myCheckout.accountNo)+')':'เงินสด';
    el.innerHTML=pageHeader('🚪 ขอออกจากหอพัก')
      +'<div class="card"><div class="alert alert-info">📋 คุณได้ส่งคำขอออกจากหอพักแล้ว</div>'
      +'<div class="slip-row" style="margin-top:8px"><span>วันที่ออก:</span><strong>'+escapeHtml(myCheckout.date)+'</strong></div>'
      +'<div class="slip-row" style="margin-top:8px"><span>รับเงินคืนทาง:</span><strong>'+rb+'</strong></div>'
      +(myCheckout.urgent?'<div class="alert alert-danger" style="margin-top:12px;font-size:16px">⚡ แจ้งออกกะทันหัน (น้อยกว่า 30 วัน)<br>เหตุผล: '+escapeHtml(myCheckout.urgentReason||'-')+'</div>':'')
      +(myCheckout.inspectDate?'<div class="slip-row" style="margin-top:8px"><span>📋 นัดตรวจห้อง:</span><strong>'+fmtThaiDate(myCheckout.inspectDate)+'</strong></div>':'<div class="alert alert-info" style="margin-top:12px;font-size:16px">⏳ ยังไม่มีการนัดวันตรวจห้อง รอเจ้าของหอพักยืนยัน</div>')
      +'<div class="mt-16">'+statusBadge(myCheckout.status==='pending'?'pending':'received')+'</div></div>';
    return;
  }
  var days=''; for(var d=1;d<=31;d++) days+='<option>'+d+'</option>';
  var months=''; for(var m=1;m<=12;m++) months+='<option value="'+m+'">'+thMonthFull(m)+'</option>';
  var minDate=new Date(); minDate.setDate(minDate.getDate()+30);
  var minDateText=minDate.getDate()+' '+thMonthFull(minDate.getMonth()+1)+' '+(minDate.getFullYear()+543);
  el.innerHTML=pageHeader('🚪 ขอออกจากหอพัก')
    +'<div class="card"><div class="card-title">📅 ระบุวันที่จะออก</div>'
    +'<div class="alert alert-info" style="margin-bottom:14px;font-size:16px">⚠️ ต้องแจ้งล่วงหน้าอย่างน้อย 1 เดือน — '
      +'เลือกวันที่ได้ตั้งแต่ <strong>'+minDateText+'</strong> เป็นต้นไป</div>'
    +'<div class="form-row-3"><div class="form-group"><label class="form-label">วัน</label><select class="form-input" id="coDay">'+days+'</select></div>'
    +'<div class="form-group"><label class="form-label">เดือน</label><select class="form-input" id="coMonth">'+months+'</select></div>'
    +'<div class="form-group"><label class="form-label">ปี</label><select class="form-input" id="coYear"><option>'+currentBuddhistYear()+'</option><option>'+(currentBuddhistYear()+1)+'</option></select></div></div>'
    +'<div class="card-title" style="margin-top:8px">💰 รับเงินมัดจำคืนทาง</div>'
    +'<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="refundType" value="bank" checked onchange="toggleRefund(this.value)"> โอนธนาคาร</label></div>'
    +'<div id="bankFields"><div class="form-row">'
    +'<div class="form-group"><label class="form-label">ชื่อธนาคาร</label>'
    +'<select class="form-input" id="coBank"><option>กสิกรไทย</option><option>กรุงเทพ</option><option>ไทยพาณิชย์</option><option>กรุงไทย</option><option>ออมสิน</option></select></div>'
    +'<div class="form-group"><label class="form-label">เลขที่บัญชี</label><input class="form-input" id="coAcc" placeholder="xxx-x-xxxxx-x"></div>'
    +'</div></div>'
    +'<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="refundType" value="cash" onchange="toggleRefund(this.value)"> รับเงินสด</label></div>'
    +'<div class="divider"></div>'
    +'<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="coUrgent" onchange="toggleUrgentCheckout(this.checked)"> ⚡ ต้องการออกกะทันหัน (เร็วกว่า 30 วัน)</label></div>'
    +'<div id="urgentReasonBox" style="display:none">'
    +'<div class="alert alert-danger" style="margin-bottom:10px;font-size:16px">การแจ้งออกกะทันหันไม่เป็นไปตามเงื่อนไขล่วงหน้า 1 เดือน '
      +'เจ้าของหออาจไม่อนุมัติ หรืออาจมีเงื่อนไขเรื่องเงินมัดจำเพิ่มเติม กรุณาระบุเหตุผลให้ชัดเจน</div>'
    +'<div class="form-group"><label class="form-label">เหตุผลที่ต้องออกกะทันหัน (จำเป็นต้องกรอก)</label>'
      +'<textarea class="form-input" id="coUrgentReason" placeholder="เช่น ย้ายที่ทำงานกะทันหัน, เหตุฉุกเฉินทางครอบครัว..."></textarea></div>'
    +'</div>'
    +'<button class="btn btn-primary" onclick="submitCheckout()">ส่งคำขอ</button></div>';
};
window.toggleUrgentCheckout=function(checked){
  document.getElementById('urgentReasonBox').style.display=checked?'block':'none';
};
window.toggleRefund=function(v){ document.getElementById('bankFields').style.display=v==='bank'?'block':'none'; };
window.submitCheckout=function(){
  var d=document.getElementById('coDay').value;
  var m=document.getElementById('coMonth').value;
  var y=document.getElementById('coYear').value;
  var isUrgent=document.getElementById('coUrgent').checked;
  var urgentReason=(document.getElementById('coUrgentReason').value||'').trim();
  var chosenDate=new Date(Number(y)-543, Number(m)-1, Number(d));
  var minDate=new Date(); minDate.setHours(0,0,0,0); minDate.setDate(minDate.getDate()+30);
  if(chosenDate<minDate&&!isUrgent){
    var minDateText=minDate.getDate()+' '+thMonthFull(minDate.getMonth()+1)+' '+(minDate.getFullYear()+543);
    showToast('ต้องแจ้งล่วงหน้าอย่างน้อย 1 เดือน (เลือกได้ตั้งแต่ '+minDateText+' เป็นต้นไป) '
      +'หรือติ๊ก "ต้องการออกกะทันหัน" ถ้าจำเป็นจริงๆ','error');
    return;
  }
  if(isUrgent&&!urgentReason){
    showToast('กรุณาระบุเหตุผลที่ต้องออกกะทันหัน','error');
    return;
  }
  var rt=document.querySelector('input[name="refundType"]:checked').value;
  DB.checkouts.push({
    id:createClientId('C'),
    room:currentUser.room,
    date:d+'/'+m+'/'+y,
    refundType:rt,
    bank:rt==='bank'?document.getElementById('coBank').value:'',
    accountNo:rt==='bank'?document.getElementById('coAcc').value:'',
    status:'pending',
    urgent:isUrgent,
    urgentReason:isUrgent?urgentReason:'',
    tenantUserId:currentUser.id
  });
  showToast('ส่งคำขอออกจากหอพักเรียบร้อย');
  showPage('checkout');
};

