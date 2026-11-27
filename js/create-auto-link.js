import {init} from '/js/core.js';
import {currentUser,slug,message} from '/js/flow-common.js';

const toHex = bytes => [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
async function makePasswordRecord(password){
  const saltBytes=new Uint8Array(16);crypto.getRandomValues(saltBytes);
  const salt=toHex(saltBytes);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  // Cloudflare Workers WebCrypto membatasi PBKDF2 hingga 100.000 iterasi.
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:100000,hash:'SHA-256'},key,256);
  return {password_salt:salt,password_hash:toHex(bits)};
}
async function copyText(value){
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
  const temp=document.createElement('textarea');temp.value=value;temp.style.position='fixed';temp.style.opacity='0';document.body.append(temp);temp.select();
  const ok=document.execCommand('copy');temp.remove();if(!ok)throw new Error('Tidak dapat menyalin link pada perangkat ini.');
}
function shareUrl(platform,url,title){
  const u=encodeURIComponent(url),t=encodeURIComponent(title+' — '+url);
  const targets={
    facebook:`https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp:`https://api.whatsapp.com/send?text=${t}`,
    telegram:`https://t.me/share/url?url=${u}&text=${encodeURIComponent(title)}`,
    x:`https://twitter.com/intent/tweet?url=${u}&text=${encodeURIComponent(title)}`,
    linkedin:`https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    pinterest:`https://pinterest.com/pin/create/button/?url=${u}&description=${encodeURIComponent(title)}`,
    reddit:`https://www.reddit.com/submit?url=${u}&title=${encodeURIComponent(title)}`,
    email:`mailto:?subject=${encodeURIComponent(title)}&body=${t}`
  };
  return targets[platform]||null;
}

document.addEventListener('DOMContentLoaded',async()=>{
  await init();
  const f=document.getElementById('autoCreateForm');
  const enabled=document.getElementById('passwordEnabled');
  const fields=document.getElementById('passwordFields');
  const password=document.getElementById('linkPassword');
  const submit=document.getElementById('createAutoButton');
  const resultPanel=document.getElementById('createdLinkResult');
  const urlInput=document.getElementById('createdAutoUrl');
  const shareMessage=document.getElementById('shareMessage');
  let createdTitle='Auto Link BEARN';

  enabled?.addEventListener('change',()=>{
    fields.hidden=!enabled.checked;password.required=enabled.checked;
    if(!enabled.checked)password.value='';
  });

  document.getElementById('copyCreatedUrl')?.addEventListener('click',async()=>{
    try{await copyText(urlInput.value);message('shareMessage','Link berhasil disalin.');}
    catch(err){message('shareMessage',err.message||'Gagal menyalin link.');}
  });

  resultPanel?.querySelectorAll('[data-share]')?.forEach(button=>{
    button.addEventListener('click',async()=>{
      const platform=button.dataset.share,url=urlInput.value;
      try{
        if(platform==='native'){
          if(navigator.share){await navigator.share({title:createdTitle,text:createdTitle,url});message('shareMessage','Menu berbagi berhasil dibuka.');}
          else{await copyText(url);message('shareMessage','Link disalin. Kamu bisa membagikannya ke aplikasi pilihanmu.');}
          return;
        }
        if(platform==='instagram'||platform==='youtube'){
          await copyText(url);
          window.open(platform==='instagram'?'https://www.instagram.com/':'https://www.youtube.com/','_blank','noopener,noreferrer');
          message('shareMessage',`Link disalin. Tempelkan link pada ${platform==='instagram'?'bio atau pesan Instagram':'deskripsi atau postingan YouTube'}.`);
          return;
        }
        const target=shareUrl(platform,url,createdTitle);
        if(target){if(platform==='email'){location.href=target;}else window.open(target,'_blank','noopener,noreferrer,width=720,height=640');}
      }catch(err){if(err.name!=='AbortError')message('shareMessage',err.message||'Tidak dapat membuka fitur berbagi.');}
    });
  });

  document.getElementById('createAnotherAuto')?.addEventListener('click',()=>{
    f.reset();f.querySelectorAll('input,textarea,button').forEach(el=>{el.disabled=false;});fields.hidden=true;password.required=false;resultPanel.hidden=true;
    message('autoCreateMessage','');window.scrollTo({top:0,behavior:'smooth'});
  });

  f?.addEventListener('submit',async e=>{
    e.preventDefault();
    const terms=document.getElementById('autoTerms');
    if(!terms?.checked){terms?.focus();message('autoCreateMessage','Kamu harus menyetujui Syarat dan Ketentuan sebelum membuat Auto Link.');return;}
    const u=await currentUser(),c=window.BEARN?.client;
    if(!u||!c){message('autoCreateMessage','Login dan koneksi Supabase diperlukan.');return;}
    const d=new FormData(f),mode=String(d.get('access_mode')||'instant');
    const title=String(d.get('title')||'').trim(),content=String(d.get('content_text')||'').trim();
    const firstUrl=content.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;!?]+$/,'')||null;
    if(!title){message('autoCreateMessage','Judul Auto Link wajib diisi.');return;}
    if(!content){message('autoCreateMessage','Teks atau link tujuan wajib diisi.');return;}
    if(!['instant','free_tags','paid_direct','choice'].includes(mode)){message('autoCreateMessage','Pilihan akses tidak valid.');return;}
    submit.disabled=true;submit.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Membuat link…';
    try{
      const newSlug=slug();
      const row={user_id:u.id,title,slug:newSlug,destination_url:firstUrl,content_text:content,access_mode:mode,price:['paid_direct','choice'].includes(mode)?3500:0,is_published:true,password_enabled:enabled.checked};
      if(enabled.checked)Object.assign(row,await makePasswordRecord(password.value));
      let error=null;
      for(let attempt=0;attempt<8;attempt++){
        const insertResult=await c.from('auto_links').insert(row);error=insertResult.error;
        if(!error)break;
        if(error.code!=='23505')break;
        row.slug=slug();
      }
      if(error)throw error;
      createdTitle=title;
      urlInput.value=`${location.origin}/a/${encodeURIComponent(row.slug)}`;
      resultPanel.hidden=false;
      resultPanel.scrollIntoView({behavior:'smooth',block:'start'});
      message('autoCreateMessage','Auto Link berhasil diterbitkan.');
    }catch(err){
      message('autoCreateMessage','Gagal membuat link: '+(err.message||'Terjadi kesalahan.'));
    }finally{
      submit.disabled=false;submit.innerHTML='<i class="fa-solid fa-sparkles"></i> Buat Auto Link';
    }
  });
});
