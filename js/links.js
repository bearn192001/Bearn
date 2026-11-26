import {client,user,money,toast,el} from '/js/core.js';
const slug=()=>{const a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';const b=new Uint8Array(3);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(b);else for(let i=0;i<3;i++)b[i]=Math.random()*256;return [...b].map(x=>a[x%a.length]).join('');};
export async function bindLinkForm(){const form=el('createLinkForm');if(!form)return;form.addEventListener('submit',async e=>{e.preventDefault();const u=await user();if(!client||!u){toast('Silakan login dan hubungkan database terlebih dahulu.');return;}const fd=new FormData(form),type=fd.get('type'),title=String(fd.get('title')||'').trim();if(type==='auto'){const {error}=await client.from('auto_links').insert({user_id:u.id,title,slug:slug(),destination_url:fd.get('destination_url'),is_published:true});if(error){toast(error.message);return;}toast('Auto Link berhasil dibuat.');}else{const price=Math.max(1000,Number(fd.get('price')||0));const fee=Math.round(price*.10);const {error}=await client.from('payment_links').insert({user_id:u.id,title,slug:slug(),description:fd.get('description')||'',price,is_active:true});if(error){toast(error.message);return;}toast(`Payment Link berhasil dibuat. Biaya BEARN 10% (${money(fee)}); saldo bersih ${money(price-fee)}. Gateway belum aktif.`);}form.reset();});}

export async function loadMyLinks(filter='all'){
 const body=el('myLinksBody'); if(!body)return;
 const u=await user(); if(!client||!u){body.innerHTML='<tr><td colspan="7" class="empty">Hubungkan Supabase dan login untuk memuat link.</td></tr>';return;}
 const [a,p,sales]=await Promise.all([
  client.from('auto_links').select('id,title,slug,created_at,is_published,access_mode,price').eq('user_id',u.id).order('created_at',{ascending:false}),
  client.from('payment_links').select('id,title,slug,price,created_at,is_active').eq('user_id',u.id).order('created_at',{ascending:false}),
  client.rpc('get_my_link_sales')
 ]);
 if(a.error || p.error){
  const issue = a.error || p.error;
  body.innerHTML='<tr><td colspan="7" class="empty">Gagal memuat daftar link: '+escapeHtml(issue.message)+'</td></tr>';
  return;
 }
 // The links remain visible even if the optional sales summary RPC has not been installed yet.
 if(sales.error) console.warn('[BEARN My Link] Sales summary unavailable:', sales.error.message);
 const stats=sales.data||[];
 const allRows=[
  ...(a.data||[]).map(x=>{const st=stats.find(y=>y.link_type==='auto'&&y.link_id===x.id)||{};return {...x,type:'Auto Link',kind:'auto',value:x.access_mode==='paid_direct'?money(x.price||3500):x.access_mode==='choice'?'Gratis / '+money(x.price||3500):x.access_mode==='instant'?'Langsung gratis':'Gratis dengan Tag',sold:Number(st.paid_count||0),revenue:money(st.creator_total||0),status:x.is_published?'Aktif':'Draft'};}),
  ...(p.data||[]).map(x=>{const st=stats.find(y=>y.link_type==='payment'&&y.link_id===x.id)||{};return {...x,type:'Payment Link',kind:'payment',value:money(x.price),sold:Number(st.paid_count||0),revenue:money(st.creator_total||0),status:x.is_active?'Aktif':'Nonaktif'};})
 ];
 const rows = filter==='auto' || filter==='payment' ? allRows.filter(x=>x.kind===filter) : allRows;
 body.innerHTML=rows.length?rows.map(x=>`<tr><td>${x.type}</td><td>${escapeHtml(x.title)}</td><td>${x.value}</td><td>${x.sold}</td><td>${x.revenue}</td><td><span class="pill">${x.status}</span></td><td><a href="${x.type==='Auto Link'?'/a/'+encodeURIComponent(x.slug):'/p/'+encodeURIComponent(x.slug)}" target="_blank" rel="noopener noreferrer">Buka</a></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Belum ada link. Buat link pertamamu.</td></tr>';
}
export async function loadPosts(){const grid=el('postsGrid');if(!grid)return;if(!client){grid.innerHTML='<div class="empty">Daftar link publik akan tampil setelah database dihubungkan.</div>';return;}const [a,p]=await Promise.all([client.from('auto_links').select('title,slug,created_at').eq('is_published',true).limit(30),client.from('payment_links').select('title,slug,price,description,created_at').eq('is_active',true).limit(30)]);const items=[...(a.data||[]).map(x=>({...x,type:'AUTO LINK'})),...(p.data||[]).map(x=>({...x,type:'PAYMENT LINK'}))];grid.innerHTML=items.map(x=>`<article class="card post-card"><span class="post-type">${x.type}</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description||'Link publik dari member BEARN.')}</p><div class="actions"><a class="btn secondary" href="${x.type==='AUTO LINK'?'/a/'+encodeURIComponent(x.slug):'/p/'+encodeURIComponent(x.slug)}">Lihat Link</a>${x.price?`<b>${money(x.price)}</b>`:''}</div></article>`).join('')||'<div class="empty">Belum ada link yang dipublikasikan.</div>'; }
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
