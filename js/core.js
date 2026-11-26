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

  let user=null;
  if(client){
    const {data,error}=await client.auth.getUser();
    if(error) console.warn('[BEARN auth]',error.message);
    user=data?.user||null;
  }

  const isLoggedIn=!!user;
  const guestMenu=document.querySelector('[data-guest-only]');
  const memberMenu=document.querySelector('[data-member-only]');
  const balanceWrap=document.getElementById('navBalanceWrap');
  if(guestMenu) guestMenu.hidden=isLoggedIn;
  if(memberMenu) memberMenu.hidden=!isLoggedIn;
  if(balanceWrap) balanceWrap.hidden=!isLoggedIn;

  if(isLoggedIn){
    const balance=document.getElementById('navBalance');
    if(balance&&client){
      const {data:w,error}=await client.from('wallet_accounts')
        .select('topup_balance,earning_balance')
        .eq('user_id',user.id).maybeSingle();
      if(error) console.warn('[BEARN wallet]',error.message);
      balance.textContent=money(Number(w?.topup_balance||0)+Number(w?.earning_balance||0));
    }
  }

  if(document.body.dataset.auth==='required'&&!isLoggedIn
    &&!location.pathname.endsWith('/login.html')
    &&!location.pathname.endsWith('/register.html')){
    location.href='/login.html';
  }
}
export async function logout(){
  if(client) await client.auth.signOut();
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
