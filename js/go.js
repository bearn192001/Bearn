import { init } from '/js/core.js';
import { param, message } from '/js/flow-common.js';

async function readApiJson(response) {
  const text = await response.text();
  if (!text) throw new Error(`Server mengirim respons kosong (HTTP ${response.status}). Periksa konfigurasi Cloudflare Functions.`);
  try { return JSON.parse(text); } catch { throw new Error(`Respons server bukan JSON yang valid (HTTP ${response.status}). Periksa endpoint API Auto Link.`); }
}

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  const slug=param('slug');
  if(!slug){message('goMessage','Link tidak valid.');return;}
  const passwordCard=document.getElementById('passwordCard');
  const accessCard=document.getElementById('accessCard');
  const passwordForm=document.getElementById('passwordForm');
  const passwordInput=document.getElementById('goPassword');
  let unlocked=false,accessToken='';
  async function unlock(password=''){
    const response=await fetch('/api/auto-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug,password}),cache:'no-store'});
    const result=await readApiJson(response);
    if(!response.ok||!result.ok)throw new Error(result.message||'Tidak dapat membuka Auto Link.');
    document.getElementById('goTitle').textContent=result.title;
    accessToken=result.accessToken;
    passwordCard.hidden=true;accessCard.hidden=true;
    const mode=result.access_mode;
    const show=(id,visible)=>document.getElementById(id).hidden=!visible;
    show('instantOption',mode==='instant');
    show('freeOption',mode==='free_tags'||mode==='choice');
    show('paidOption',mode==='paid_direct'||mode==='choice');
    accessCard.hidden=false;
    if(mode==='instant'){
      const a=document.getElementById('instantStart');a.href=`/api/auto-direct?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(accessToken)}`;
    }
    if(mode==='paid_direct'||mode==='choice')document.getElementById('paidStart').href=`/payment.html?type=auto&slug=${encodeURIComponent(slug)}`;
    if(mode==='free_tags'||mode==='choice'){
      const free=document.getElementById('freeStart');let starting=false;
      free.addEventListener('click',async event=>{
        event.preventDefault();if(starting)return;starting=true;free.setAttribute('aria-disabled','true');free.textContent='Menyiapkan sesi…';
        try{
          const r=await fetch('/api/flow-start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug,accessToken}),cache:'no-store'});
          const payload=await readApiJson(r);if(!r.ok||!payload.ok||!payload.token)throw new Error(payload.message||'Gagal memulai sesi.');
          sessionStorage.setItem(`bearn_flow_token_${slug}`,payload.token);location.href=`/tag-1.html?slug=${encodeURIComponent(slug)}`;
        }catch(err){message('goMessage',err.message||'Gagal memulai sesi.');free.removeAttribute('aria-disabled');free.textContent='Lanjut gratis';starting=false;}
      },{once:true});
    }
    unlocked=true;
  }
  passwordForm.addEventListener('submit',async e=>{
    e.preventDefault();const button=passwordForm.querySelector('button');button.disabled=true;button.textContent='Memeriksa…';
    try{await unlock(passwordInput.value);message('passwordMessage','');}catch(err){message('passwordMessage',err.message||'Password salah.');button.disabled=false;button.textContent='Buka Link';passwordInput.select();}
  });
  try{
    await unlock('');
  }catch(error){
    if(String(error.message).includes('PASSWORD_REQUIRED')){passwordCard.hidden=false;document.getElementById('goSubtitle').textContent='Link ini dilindungi password. Masukkan password untuk melanjutkan.';passwordInput.focus();}
    else message('goMessage',error.message||'Auto Link tidak dapat dibuka.');
  }
});
