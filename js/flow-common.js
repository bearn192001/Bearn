export async function currentUser(){const c=window.BEARN?.client;if(!c)return null;const {data,error}=await c.auth.getUser();return error?null:data?.user||null;}
export function slug(){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes=new Uint8Array(3);
  if(globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for(let i=0;i<3;i++) bytes[i]=Math.floor(Math.random()*256);
  return [...bytes].map(b=>alphabet[b%alphabet.length]).join('');
}
export function message(id,text){const n=document.getElementById(id);if(n)n.textContent=text;}
export function money(n){return 'Rp'+Number(n||0).toLocaleString('id-ID');}
export function param(k){return new URLSearchParams(location.search).get(k);}
