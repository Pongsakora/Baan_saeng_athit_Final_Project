// ============================================================
// 07-admin-users.js
// จัดการผู้ใช้งาน (เพิ่ม/แก้ไข/ลบผู้เช่า)
// ============================================================

// ---- ADMIN: จัดการผู้ใช้ ----
pageRenderers['manage-users']=function(el){
  var tenants=DB.users.filter(function(u){ return u.role==='tenant'&&u.is_active!==false; }).slice().sort(function(a,b){ return String(a.room||'').localeCompare(String(b.room||''),undefined,{numeric:true}); });
  var rows='';
  tenants.forEach(function(u){
    var displayName=((u.first_name||'')+' '+(u.last_name||'')).trim()||u.name||'-';
    var relation=u.relation_note||'-';
    rows+='<tr><td>'+escapeHtml(u.room)+'</td><td>'+escapeHtml(displayName)+'</td><td>'+escapeHtml(u.username)+'</td>'
      +'<td><span style="display:inline-flex;align-items:center;gap:6px">'
      +'<span class="pw-mask" data-pw="'+escapeHtml(u.password||'')+'">'+'•'.repeat((u.password||'').length||4)+'</span>'
      +'<button type="button" class="btn-eye" title="แสดง/ซ่อนรหัสผ่าน" onclick="togglePasswordCell(this)">👁️</button>'
      +'</span></td>'
      +'<td>'+escapeHtml(relation)+'</td>'
      +'<td class="flex gap-10"><button class="btn btn-outline btn-xs" onclick="editUserModal(\''+u.id+'\')">แก้ไข</button><button class="btn btn-danger btn-xs" onclick="deleteUser(\''+u.id+'\')">ย้ายออก</button></td></tr>';
  });
  el.innerHTML=pageHeader('จัดการผู้ใช้งาน')
    +'<div class="card"><div class="flex-between mb-16"><div class="card-title" style="margin:0">ผู้ใช้ผู้เช่า</div><button class="btn btn-primary btn-sm" onclick="addUserModal()">+ เพิ่มผู้ใช้</button></div>'
    +'<div style="font-size:16px;color:var(--text-light);margin-bottom:10px">กำหนดได้สูงสุด 5 คนต่อ 1 ห้อง</div>'
    +'<div class="table-wrap"><table>'
      +'<thead><tr><th>ห้อง</th><th>ชื่อ-นามสกุล</th><th>ชื่อผู้ใช้</th><th>รหัสผ่าน</th><th>ความเกี่ยวข้องผู้เข้าพัก</th><th></th></tr></thead>'
      +'<tbody>'+(rows||'<tr><td colspan="6" style="text-align:center;color:var(--text-light)">ไม่พบข้อมูล</td></tr>')+'</tbody>'
      +'</table></div></div>';
};
window.mapUserApiError=function(code){
  if(code==='room_capacity_reached') return 'ห้องนี้มีผู้เช่าครบ 5 คนแล้ว';
  if(code==='username_exists') return 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว';
  if(code==='room_not_found') return 'ไม่พบห้องที่เลือก';
  if(code==='invalid_payload') return 'กรุณากรอกข้อมูลให้ครบทุกช่อง';
  if(code==='occupant_not_found') return 'ไม่พบข้อมูลผู้เข้าพักนี้';
  if(code==='occupant_has_account') return 'ผู้เข้าพักคนนี้มีบัญชีผู้ใช้แล้ว กรุณาแก้ไขผ่านแบบฟอร์มบัญชีผู้ใช้แทน';
  return code||'เกิดข้อผิดพลาด';
};
window.getTenantCountByRoom=function(roomId){
  return DB.users.filter(function(u){
    return u.role==='tenant' && u.room===roomId && u.is_active!==false;
  }).length;
};
window.getOccupantCountByRoom=function(roomId){
  if(Array.isArray(DB.roomOccupants) && DB.roomOccupants.length){
    return DB.roomOccupants.filter(function(o){ return o.room===roomId; }).length;
  }
  return window.getTenantCountByRoom(roomId);
};
window.getRoomRemainingCapacity=function(roomId){
  return Math.max(0,5-window.getOccupantCountByRoom(roomId));
};
window.updateAddUserCapacityHint=function(){
  var roomEl=document.getElementById('nuRoom');
  var hint=document.getElementById('nuCapacityInfo');
  if(!roomEl||!hint) return;
  var remain=window.getRoomRemainingCapacity(roomEl.value);
  hint.textContent='เพิ่มได้อีก '+remain+' คน (สูงสุด 5 คน/ห้อง)';
};
window.addOccupantRow=function(){
  var roomEl=document.getElementById('nuRoom');
  var rowsEl=document.getElementById('nuPeopleRows');
  if(!roomEl||!rowsEl) return;
  window._nuRowIds=window._nuRowIds||[];
  var remain=window.getRoomRemainingCapacity(roomEl.value);
  if(window._nuRowIds.length>=remain){
    showToast('ห้องนี้เพิ่มได้สูงสุด '+remain+' คน','error');
    return;
  }
  window._nuRowCounter=(window._nuRowCounter||0)+1;
  var id=window._nuRowCounter;
  window._nuRowIds.push(id);
  var html='<div class="card" style="padding:12px;margin-bottom:10px" data-row-id="'+id+'">'
    +'<div class="flex-between" style="margin-bottom:8px">'
    +'<div class="occ-row-label" style="font-size:16px;color:var(--text-light)">ผู้เข้าพักคนที่ '+window._nuRowIds.length+'</div>'
    +'<button class="btn btn-danger btn-xs" type="button" onclick="removeOccupantRow('+id+')">ลบ</button>'
    +'</div>'
    +'<div class="form-row">'
      +'<div class="form-group"><label class="form-label">ชื่อ</label><input class="form-input" id="nuFirstName_'+id+'" placeholder="ชื่อ"></div>'
      +'<div class="form-group"><label class="form-label">นามสกุล</label><input class="form-input" id="nuLastName_'+id+'" placeholder="นามสกุล"></div></div>'
    +'<div class="form-group"><label class="form-label">ความเกี่ยวข้องผู้เข้าพัก</label><input class="form-input" id="nuRelation_'+id+'" placeholder="เช่น ผู้เช่าหลัก / เพื่อนร่วมห้อง / ญาติ"></div>'
    +'</div>';
  rowsEl.insertAdjacentHTML('beforeend',html);
  window.updateAddUserCapacityHint();
};
// ลบแถว "ผู้เข้าพัก" ที่เพิ่งเพิ่มเข้ามาในฟอร์ม (ก่อนกดบันทึก) ออก แล้วเรียงเลขลำดับใหม่
window.removeOccupantRow=function(id){
  var rowsEl=document.getElementById('nuPeopleRows');
  var row=rowsEl&&rowsEl.querySelector('[data-row-id="'+id+'"]');
  if(row) row.remove();
  window._nuRowIds=(window._nuRowIds||[]).filter(function(x){ return x!==id; });
  window.renumberOccupantRows();
  window.updateAddUserCapacityHint();
};
window.renumberOccupantRows=function(){
  var rowsEl=document.getElementById('nuPeopleRows');
  if(!rowsEl) return;
  (window._nuRowIds||[]).forEach(function(id,idx){
    var row=rowsEl.querySelector('[data-row-id="'+id+'"] .occ-row-label');
    if(row) row.textContent='ผู้เข้าพักคนที่ '+(idx+1);
  });
};
window.addUserModal=function(prefillRoom){
  var roomOpts='';
  DB.rooms.forEach(function(r){
    var isVacant=r.status==='vacant';
    var prefix=isVacant?'🟢':'🔴';
    var statusText=isVacant?'ว่าง':'ไม่ว่าง';
    roomOpts+='<option'+(prefillRoom&&prefillRoom===r.id?' selected':'')+' value="'+r.id+'">'+prefix+' ห้อง '+r.id+' ('+statusText+')</option>';
  });
  if(!roomOpts){
    showToast('ไม่พบข้อมูลห้องพัก','error');
    return;
  }
  window._nuRowIds=[];
  window._nuRowCounter=0;
  openModal('เพิ่มผู้ใช้',
    '<div class="form-group"><label class="form-label">ห้อง</label><select class="form-input" id="nuRoom" onchange="updateAddUserCapacityHint()">'+roomOpts+'</select></div>'
    +'<div style="display:flex;gap:14px;align-items:center;margin:-2px 0 8px 0;font-size:16px;color:var(--text-mid)">'
    +'<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:#38A169;display:inline-block"></span>ห้องว่าง</span>'
    +'<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:#E53E3E;display:inline-block"></span>ห้องไม่ว่าง</span>'
    +'</div>'
    +'<div id="nuCapacityInfo" style="font-size:16px;color:var(--text-light);margin-bottom:8px"></div>'
    +'<div class="card" style="padding:12px;margin-bottom:10px">'
    +'<div style="font-size:16px;color:var(--text-light);margin-bottom:8px">บัญชีผู้ใช้งานหลัก (ล็อกอิน)</div>'
    +'<div class="form-group"><label class="form-label">ชื่อผู้ใช้</label><input class="form-input" id="nuUser" placeholder="ชื่อผู้ใช้"></div>'
    +'<div class="form-group"><label class="form-label">รหัสผ่าน</label><input class="form-input" id="nuPass" type="password" placeholder="รหัสผ่าน"></div>'
    +'</div>'
    +'<div class="form-group"><label class="form-label">ค่ามัดจำ (บาท)</label><input class="form-input" id="nuDeposit" type="number" value="'+(DB.rates.deposit||3000)+'" placeholder="ค่ามัดจำ"></div>'
    +'<div id="nuPeopleRows"></div>'
    +'<button class="btn btn-outline btn-sm" type="button" onclick="addOccupantRow()">+ เพิ่มผู้เข้าพัก</button>',
    '<button class="btn btn-primary" onclick="doAddUser()">บันทึกทั้งหมด</button><button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>');
  window.addOccupantRow();
};
window.doAddUser=async function(){
  var roomEl=document.getElementById('nuRoom');
  if(!roomEl){ showToast('กรุณากรอกข้อมูลให้ครบทุกช่อง','error'); return; }
  var room=roomEl.value;
  var user=(document.getElementById('nuUser')||{}).value||'';
  var pass=(document.getElementById('nuPass')||{}).value||'';
  user=user.trim();
  var rowIds=(window._nuRowIds||[]).slice();
  if(rowIds.length===0){ showToast('กรุณาเพิ่มผู้เข้าพักอย่างน้อย 1 คน','error'); return; }
  if(!user||!pass){ showToast('กรุณากรอกชื่อผู้ใช้และรหัสผ่านของบัญชีหลัก','error'); return; }
  var remain=window.getRoomRemainingCapacity(room);
  if(rowIds.length>remain){ showToast('ห้องนี้เพิ่มได้อีก '+remain+' คน','error'); return; }
  var depositAmount=parseFloat((document.getElementById('nuDeposit')||{}).value)||0;

  var people=[];
  for(var i=0;i<rowIds.length;i++){
    var id=rowIds[i];
    var firstName=(document.getElementById('nuFirstName_'+id)||{}).value||'';
    var lastName=(document.getElementById('nuLastName_'+id)||{}).value||'';
    var relation=(document.getElementById('nuRelation_'+id)||{}).value||'';
    firstName=firstName.trim();
    lastName=lastName.trim();
    relation=relation.trim();
    if(!firstName||!lastName){
      showToast('กรุณากรอกข้อมูลผู้เข้าพักให้ครบทุกช่องที่จำเป็น','error');
      return;
    }
    people.push({ firstName:firstName, lastName:lastName, relation:relation });
  }
  try{
    var primary=people[0];
    var extras=people.slice(1).map(function(p){
      return { firstName:p.firstName, lastName:p.lastName, relation:p.relation };
    });
    await requestJSON('/api/users',{
      method:'POST',
      body:JSON.stringify({
        room:room,
        firstName:primary.firstName,
        lastName:primary.lastName,
        relation:primary.relation,
        name:(primary.firstName+' '+primary.lastName).trim(),
        username:user,
        password:pass,
        occupants:extras,
        depositAmount:depositAmount
      })
    });
    closeModal();
    await loadDBFromServer();
    showToast('เพิ่มข้อมูลผู้เข้าพักเรียบร้อย');
    showPage('manage-users');
  }catch(err){
    await loadDBFromServer();
    showPage('manage-users');
    showToast(mapUserApiError(err.message),'error');
  }
};
// รวมรายชื่อผู้เข้าพักทั้งหมดของห้องนี้ (ทั้งคนที่มีบัญชีผู้ใช้และไม่มี) ไว้เลือกว่าจะแก้ไขข้อมูลของใคร
window.getRoomOccupantList=function(roomId){
  var roomKey=String(roomId||'');
  var list=(Array.isArray(DB.roomOccupants)?DB.roomOccupants:[]).filter(function(o){
    return String(o.room||'')===roomKey;
  });
  if(!list.length){
    list=DB.users
      .filter(function(u){ return u.role==='tenant'&&String(u.room||'')===roomKey&&u.is_active!==false; })
      .map(function(u){
        return { id:null, first_name:u.first_name||'', last_name:u.last_name||'', relation_note:u.relation_note||'', tenant_user_id:u.id };
      });
  }
  return list;
};
// occupantKey: 'u:<userId>' = ผู้เข้าพักที่มีบัญชีผู้ใช้ (ล็อกอินได้), 'o:<occupantId>' = ผู้เข้าพักที่ยังไม่มีบัญชี
window.editUserModal=function(id, occupantKey){
  var u=DB.users.find(function(x){ return x.id===id; });
  if(!u){ showToast('ไม่พบผู้ใช้','error'); return; }

  var occupants=window.getRoomOccupantList(u.room);
  var selectedKey=occupantKey||('u:'+id);
  var selected=null;
  occupants.forEach(function(o){
    var key=o.tenant_user_id?('u:'+o.tenant_user_id):('o:'+o.id);
    if(key===selectedKey) selected=o;
  });
  if(!selected){
    selected={id:null, tenant_user_id:id, first_name:u.first_name||'', last_name:u.last_name||'', relation_note:u.relation_note||''};
    selectedKey='u:'+id;
  }

  var selectorHtml='';
  if(occupants.length>1){
    var opts='';
    occupants.forEach(function(o,idx){
      var key=o.tenant_user_id?('u:'+o.tenant_user_id):('o:'+o.id);
      var full=((o.first_name||'')+' '+(o.last_name||'')).trim()||'-';
      // ผู้เช่าหลัก (มีบัญชีผู้ใช้) ให้ขึ้น "(ผู้เช่า)" ส่วนคนอื่นๆ ให้ขึ้นความสัมพันธ์ที่กรอกไว้แทน
      // "(ยังไม่มีบัญชีผู้ใช้)" เดิม — ถ้าไม่ได้กรอกความสัมพันธ์มา ค่อย fallback ไปใช้ข้อความเดิม
      var tag=o.tenant_user_id?' (ผู้เช่า)':(o.relation_note?' ('+escapeHtml(o.relation_note)+')':' (ยังไม่มีบัญชีผู้ใช้)');
      opts+='<option value="'+key+'"'+(key===selectedKey?' selected':'')+'>'+(idx+1)+'. '+escapeHtml(full)+tag+'</option>';
    });
    selectorHtml='<div class="form-group"><label class="form-label">ห้องนี้มีผู้เข้าพัก '+occupants.length+' คน — เลือกคนที่จะแก้ไขข้อมูล</label>'
      +'<select class="form-input" id="euOccupantSelect" onchange="editUserModal(\''+id+'\', this.value)">'+opts+'</select></div>';
  }

  var isLoginAccount=!!selected.tenant_user_id;
  var editingUserId=isLoginAccount?selected.tenant_user_id:null;
  var editingUser=isLoginAccount?DB.users.find(function(x){ return x.id===editingUserId; }):null;

  var firstName=(selected.first_name||'').trim();
  var lastName=(selected.last_name||'').trim();
  if(editingUser&&!firstName&&!lastName&&editingUser.name){
    var parts=String(editingUser.name).trim().split(/\s+/);
    firstName=parts[0]||'';
    lastName=parts.slice(1).join(' ');
  }

  var roomOpts='';
  DB.rooms.forEach(function(r){ roomOpts+='<option'+(r.id===u.room?' selected':'')+'>'+r.id+'</option>'; });

  var accountFieldsHtml=isLoginAccount
    ?('<div class="form-group"><label class="form-label">ชื่อผู้ใช้</label><input class="form-input" id="euUser" value="'+escapeHtml(editingUser.username)+'"></div>'
      +'<div class="form-group"><label class="form-label">รหัสผ่าน</label><input class="form-input" id="euPass" type="password" value="'+escapeHtml(editingUser.password)+'"></div>')
    :'<div class="alert alert-info" style="font-size:16px">ผู้เข้าพักคนนี้ยังไม่มีบัญชีผู้ใช้ (ล็อกอินไม่ได้) แก้ไขได้เฉพาะชื่อ-นามสกุลและความเกี่ยวข้อง</div>';

  // ปุ่มลบ: ผู้เข้าพักที่มีบัญชีผู้ใช้ ลบผ่าน deleteUser() เดิม (ย้ายออก เก็บประวัติไว้)
  // ส่วนผู้เข้าพักที่ไม่มีบัญชี (เช่นสมาชิกครอบครัว) ลบออกจริงๆ ผ่าน doDeleteOccupant() ที่เพิ่มใหม่
  var deleteBtnHtml=isLoginAccount
    ?'<button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger)" onclick="closeModal();deleteUser(\''+editingUserId+'\')">🗑️ ลบ/ย้ายออก</button>'
    :'<button class="btn btn-outline" style="color:var(--danger);border-color:var(--danger)" onclick="doDeleteOccupant(\''+selected.id+'\',\''+id+'\',\''+selectedKey+'\')">🗑️ ลบผู้เข้าพักคนนี้</button>';

  openModal('แก้ไขผู้เข้าพัก',
    selectorHtml
    +'<div class="form-group"><label class="form-label">ห้อง</label><select class="form-input" id="euRoom"'+(isLoginAccount?'':' disabled')+'>'+roomOpts+'</select>'
      +(isLoginAccount?'':'<div style="font-size:16px;color:var(--text-light);margin-top:4px">ย้ายห้องได้เฉพาะผู้เข้าพักที่มีบัญชีผู้ใช้เท่านั้น</div>')
    +'</div>'
    +'<div class="form-row">'
      +'<div class="form-group"><label class="form-label">ชื่อ</label><input class="form-input" id="euFirstName" value="'+escapeHtml(firstName)+'"></div>'
      +'<div class="form-group"><label class="form-label">นามสกุล</label><input class="form-input" id="euLastName" value="'+escapeHtml(lastName)+'"></div></div>'
    +'<div class="form-group"><label class="form-label">ความเกี่ยวข้องผู้เข้าพัก</label><input class="form-input" id="euRelation" value="'+escapeHtml(selected.relation_note||'')+'"></div>'
    +accountFieldsHtml
    +'<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">'
    +'<button class="btn btn-outline btn-sm" onclick="addOccupantPrompt(\''+escapeHtml(u.room)+'\',\''+id+'\')">➕ เพิ่มผู้เข้าพักคนใหม่ในห้องนี้</button>'
    +'</div>',
    '<button class="btn btn-primary" onclick="'+(isLoginAccount?('doEditUser(\''+editingUserId+'\')'):('doEditOccupant(\''+selected.id+'\')'))+'">บันทึก</button>'
    +deleteBtnHtml
    +'<button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>');
};
// ลบผู้เข้าพักที่ "ไม่มีบัญชีผู้ใช้" ออกจากห้อง (เช่นสมาชิกครอบครัวที่เพิ่มไว้ตอนลงทะเบียน/เพิ่มทีหลัง)
window.doDeleteOccupant=async function(occupantId,fallbackUserId,selectedKey){
  if(!confirm('ต้องการลบผู้เข้าพักคนนี้ออกจากห้องใช่หรือไม่? (ลบถาวร เนื่องจากไม่มีบัญชีผู้ใช้/ไม่มีประวัติการใช้งานผูกอยู่)')) return;
  try{
    await requestJSON('/api/room-occupants/'+encodeURIComponent(occupantId),{ method:'DELETE' });
    await loadDBFromServer();
    showToast('ลบผู้เข้าพักเรียบร้อย');
    closeModal();
    showPage('manage-users');
  }catch(err){
    showToast(mapUserApiError(err.message)||'ลบผู้เข้าพักไม่สำเร็จ','error');
  }
};
// เปิดฟอร์มเล็กๆ ไว้เพิ่มผู้เข้าพักคนใหม่ (ไม่มีบัญชีผู้ใช้) เข้าห้องที่กำลังแก้ไขอยู่
window.addOccupantPrompt=function(room,backUserId){
  openModal('➕ เพิ่มผู้เข้าพักในห้อง '+escapeHtml(room),
    '<div class="form-row">'
      +'<div class="form-group"><label class="form-label">ชื่อ</label><input class="form-input" id="aoFirstName"></div>'
      +'<div class="form-group"><label class="form-label">นามสกุล</label><input class="form-input" id="aoLastName"></div></div>'
    +'<div class="form-group"><label class="form-label">ความเกี่ยวข้องผู้เข้าพัก</label><input class="form-input" id="aoRelation" placeholder="เช่น คู่สมรส, บุตร, เพื่อนร่วมห้อง"></div>'
    +'<div class="alert alert-info" style="font-size:16px">คนที่เพิ่มตรงนี้จะยังไม่มีบัญชีผู้ใช้/ล็อกอินเข้าระบบไม่ได้ เป็นแค่การบันทึกว่ามีใครพักอยู่ในห้องบ้าง</div>',
    '<button class="btn btn-primary" onclick="doAddOccupant(\''+escapeHtml(room)+'\',\''+backUserId+'\')">บันทึก</button>'
    +'<button class="btn btn-outline" onclick="editUserModal(\''+backUserId+'\')">ย้อนกลับ</button>');
};
window.doAddOccupant=async function(room,backUserId){
  var firstName=document.getElementById('aoFirstName').value.trim();
  var lastName=document.getElementById('aoLastName').value.trim();
  var relation=document.getElementById('aoRelation').value.trim();
  if(!firstName||!lastName){ showToast('กรุณากรอกชื่อและนามสกุล','error'); return; }
  try{
    await requestJSON('/api/room-occupants',{
      method:'POST',
      body:JSON.stringify({ room:room, firstName:firstName, lastName:lastName, relation:relation })
    });
    await loadDBFromServer();
    showToast('เพิ่มผู้เข้าพักเรียบร้อย');
    editUserModal(backUserId);
  }catch(err){
    showToast(mapUserApiError(err.message)||'เพิ่มผู้เข้าพักไม่สำเร็จ','error');
  }
};
window.doEditUser=async function(id){
  var room=document.getElementById('euRoom').value;
  var firstName=document.getElementById('euFirstName').value.trim();
  var lastName=document.getElementById('euLastName').value.trim();
  var relation=document.getElementById('euRelation').value.trim();
  var username=document.getElementById('euUser').value.trim();
  var password=document.getElementById('euPass').value;
  if(!room||!firstName||!lastName||!username||!password){ showToast('กรุณากรอกข้อมูลให้ครบทุกช่อง','error'); return; }

  try{
    await requestJSON('/api/users/'+encodeURIComponent(id),{
      method:'PUT',
      body:JSON.stringify({
        room:room,
        firstName:firstName,
        lastName:lastName,
        relation:relation,
        name:(firstName+' '+lastName).trim(),
        username:username,
        password:password
      })
    });
    closeModal();
    await loadDBFromServer();
    showToast('แก้ไขผู้ใช้เรียบร้อย');
    showPage('manage-users');
  }catch(err){
    showToast(mapUserApiError(err.message)||'แก้ไขผู้ใช้ไม่สำเร็จ','error');
  }
};
// บันทึกข้อมูลผู้เข้าพักที่ยังไม่มีบัญชีผู้ใช้ (แก้ได้แค่ชื่อ-นามสกุล/ความเกี่ยวข้อง ผ่าน room_occupants โดยตรง)
window.doEditOccupant=async function(occupantId){
  var firstName=document.getElementById('euFirstName').value.trim();
  var lastName=document.getElementById('euLastName').value.trim();
  var relation=document.getElementById('euRelation').value.trim();
  if(!firstName||!lastName){ showToast('กรุณากรอกชื่อและนามสกุล','error'); return; }

  try{
    await requestJSON('/api/room-occupants/'+encodeURIComponent(occupantId),{
      method:'PUT',
      body:JSON.stringify({ firstName:firstName, lastName:lastName, relation:relation })
    });
    closeModal();
    await loadDBFromServer();
    showToast('แก้ไขข้อมูลผู้เข้าพักเรียบร้อย');
    showPage('manage-users');
  }catch(err){
    showToast(mapUserApiError(err.message)||'แก้ไขข้อมูลไม่สำเร็จ','error');
  }
};
window.deleteUser=async function(id){
  var confirmMsg='ต้องการทำเครื่องหมาย "ย้ายออกจากหอพัก" ให้ผู้เช่านี้ใช่หรือไม่?\n'
    +'(บัญชีจะล็อกอินไม่ได้อีก แต่ประวัติบิล/เรื่องแจ้งยังดูย้อนหลังได้ที่หน้า "ประวัติผู้เช่า")';
  if(!confirm(confirmMsg)) return;

  try{
    await requestJSON('/api/users/'+encodeURIComponent(id),{ method:'DELETE' });
    await loadDBFromServer();
    showToast('บันทึกการย้ายออกเรียบร้อย เก็บประวัติไว้ในหน้า "ประวัติผู้เช่า"');
    showPage('manage-users');
  }catch(err){
    showToast(mapUserApiError(err.message)||'ดำเนินการไม่สำเร็จ','error');
  }
};
