import {loadComponents} from '/components/components.js';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from '/js/config.js';
let client=null;

export async function init(){
  await loadComponents();
  if(window.supabase?.createClient&&SUPABASE_URL&&SUPABASE_ANON_KEY){
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  }
  window.BEARN={client,logout};
  document.querySelectorAll('[data-year]').forEach(x=>x.textContent=new Date().getFullYear());

  const {data}=client?await client.auth.getUser():{data:{user:null}};
  const user=data?.user||null;
  const balanceWrap=document.getElementById('navBalanceWrap');
  const balance=document.getElementById('navBalance');

  // Saldo hanya ditampilkan setelah sesi login terverifikasi.
  if(balanceWrap) balanceWrap.hidden=!user;
  document.querySelectorAll('[data-member-link]').forEach(link=>link.hidden=!user);
  document.querySelectorAll('[data-guest-link]').forEach(link=>link.hidden=!!user);

  if(user&&balance&&client){
    const {data:w}=await client.from('wallet_accounts')
      .select('topup_balance,earning_balance')
      .eq('user_id',user.id).maybeSingle();
    balance.textContent=money(Number(w?.topup_balance||0)+Number(w?.earning_balance||0));
  }

  if(document.body.dataset.auth==='required'&&!user&&
    !location.pathname.endsWith('/login.html')&&!location.pathname.endsWith('/register.html')){
    location.href='/login.html';
  }
}
export async function logout(){
  if(client)await client.auth.signOut();
  location.href='/login.html';
}
export const money=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
export const el=id=>document.getElementById(id);
export function toast(msg){
  let t=el('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.append(t);}
  t.textContent=msg;
  setTimeout(()=>t.remove(),3000);
}
export async function user(){
  if(!client)return null;
  const {data}=await client.auth.getUser();
  return data?.user||null;
}
export {client};
