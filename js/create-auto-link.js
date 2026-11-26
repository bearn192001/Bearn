import {init} from '/js/core.js';
import {currentUser,slug,message} from '/js/flow-common.js';

const toHex = bytes => [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
async function makePasswordRecord(password){
  const saltBytes=new Uint8Array(16);crypto.getRandomValues(saltBytes);
  const salt=toHex(saltBytes);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:210000,hash:'SHA-256'},key,256);
  return {password_salt:salt,password_hash:toHex(bits)};
}

document.addEventListener('DOMContentLoaded',async()=>{
  await init();
  const f=document.getElementById('autoCreateForm');
  const enabled=document.getElementById('passwordEnabled');
  const fields=document.getElementById('passwordFields');
  const password=document.getElementById('linkPassword');
  const submit=document.getElementById('createAutoButton');
  enabled?.addEventListener('change',()=>{fields.hidden=!enabled.checked;password.required=enabled.checked;if(!enabled.checked)password.value='';});
  f?.addEventListener('submit',async e=>{
    e.preventDefault();
    const u=await currentUser(),c=window.BEARN?.client;
    if(!u||!c){message('autoCreateMessage','Login dan koneksi Supabase diperlukan.');return;}
    const d=new FormData(f),mode=String(d.get('access_mode')||'instant');
    const title=String(d.get('title')||'').trim(),destination=String(d.get('destination_url')||'').trim();
    if(!['instant','free_tags','paid_direct','choice'].includes(mode)){message('autoCreateMessage','Pilihan akses tidak valid.');return;}
    if(enabled.checked&&String(password.value).length<6){message('autoCreateMessage','Password minimal 6 karakter.');password.focus();return;}
    submit.disabled=true;submit.textContent='Membuat link…';
    try{
      const row={user_id:u.id,title,slug:slug(),destination_url:destination,access_mode:mode,price:['paid_direct','choice'].includes(mode)?3500:0,is_published:true,password_enabled:enabled.checked};
      if(enabled.checked)Object.assign(row,await makePasswordRecord(password.value));
      let error=null;
      for(let attempt=0;attempt<8;attempt++){
        const result=await c.from('auto_links').insert(row);error=result.error;
        if(!error)break;
        if(error.code!=='23505')break;
        row.slug=slug();
      }
      if(error)throw error;
      message('autoCreateMessage','Auto Link berhasil dibuat.');
      location.href='/my-link';
    }catch(err){message('autoCreateMessage','Gagal membuat link: '+(err.message||'Terjadi kesalahan.'));submit.disabled=false;submit.textContent='Buat Auto Link';}
  });
});
